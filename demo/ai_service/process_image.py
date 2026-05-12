import sys
import json
import cv2
from math import sqrt
from ultralytics import YOLO
from bson import ObjectId
from pymongo import MongoClient
import os
from datetime import datetime, timezone
import subprocess
from sync_mongo_to_neo4j import sync_image_to_neo4j
from graph_similarity_caption import GraphSimilarityCaptionService
from scene_graph_captioning import generate_caption_from_neo4j_graph

# ===============================
# MONGODB CONNECTION
# ===============================
# Read from environment variable or use default
MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://127.0.0.1:27017/classroom_kg')
client = MongoClient(MONGODB_URI)
db = client['classroom_kg']

# Collections
persons_col = db['person']
objects_col = db['entity_object']
activities_col = db['activity']
images_col = db['image']
triplets_col = db['scene_graph_triplet']
environments_col = db['environment']

# ===============================
# LOAD MODELS
# ===============================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, 'models')

# Don't load models at module level to prevent crashes
classify_classroom_model = None
student_model = None
action_model = None
object_model = None

def load_models():
    """Load YOLO models with error handling"""
    global classify_classroom_model, student_model, action_model, object_model
    
    try:
        print("📦 Loading YOLO models...")
        
        classify_model_filename = os.getenv("CLASSIFY_CLASSROOM_MODEL", "classify_classroom1.pt")
        classify_path = os.path.join(MODEL_DIR, classify_model_filename)
        student_path = os.path.join(MODEL_DIR, "detection_person.pt")
        action_path = os.path.join(MODEL_DIR, "detection_action.pt")
        object_path = os.path.join(MODEL_DIR, "detection_object1.pt")
        
        # Check if files exist
        for name, path in [("Classify Classroom", classify_path), ("Student", student_path), ("Action", action_path), ("Object", object_path)]:
            if not os.path.exists(path):
                raise FileNotFoundError(f"{name} model not found at: {path}")
            print(f"   ✓ Found {name} model: {os.path.basename(path)}")
        
        # Load models one by one
        print("   Loading classroom classification model...")
        classify_classroom_model = YOLO(classify_path)
        print(f"   ✓ Classroom classification model loaded ({classify_model_filename})")
        
        print("   Loading student detection model...")
        student_model = YOLO(student_path)
        print("   ✓ Student model loaded")
        
        print("   Loading action detection model...")
        action_model = YOLO(action_path)
        print("   ✓ Action model loaded")
        
        print("   Loading object detection model...")
        object_model = YOLO(object_path)
        print("   ✓ Object model loaded")
        
        print("✅ All models loaded successfully\n")
        return True
        
    except Exception as e:
        print(f"❌ Error loading models: {e}")
        import traceback
        traceback.print_exc()
        return False

# ===============================
# CLASS DEFINITIONS & RULES
# ===============================
action_classes = [
    'Using_phone', 'hand-raising', 'raise_head', 
    'reading', 'sleep', 'turn_head', 'upright', 'writing'
]

ACTION_OBJECT_RULES = {
    "reading": ["book", "notebook", "paper"],
    "writing": ["notebook", "paper", "pen"],
    "using_phone": ["phone", "mobile phone"]
}

DISTANCE_THRESHOLD = 150

# Action detection thresholds
MIN_INTERSECTION_AREA = 10  # Minimum intersection area in pixels (lowered from requiring overlap)
CLASSROOM_CONFIDENCE_THRESHOLD = 0.80
CAPTION_REGEN_THRESHOLD = 70



def _mirror_processing_results_to_postgres(image_id_str: str) -> None:
    script_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "backend", "scripts", "mirrorProcessingResultsToPostgres.js")
    )

    if not os.path.exists(script_path):
        print(f"⚠️ PostgreSQL processing mirror helper not found: {script_path}")
        return

    try:
        creation_flags = 0
        if hasattr(subprocess, "DETACHED_PROCESS"):
            creation_flags |= subprocess.DETACHED_PROCESS
        if hasattr(subprocess, "CREATE_NEW_PROCESS_GROUP"):
            creation_flags |= subprocess.CREATE_NEW_PROCESS_GROUP

        subprocess.Popen(
            ["node", script_path, "image", image_id_str],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            cwd=os.path.dirname(script_path),
            creationflags=creation_flags,
        )
        print(f"✅ PostgreSQL processing mirror queued for image {image_id_str}")
    except Exception as error:
        print(f"⚠️ PostgreSQL processing mirror failed for image {image_id_str}: {error}")

# Scale-aware matching thresholds (work across small and large images)
ACTION_PERSON_MIN_INTERSECTION_RATIO = 0.03
ACTION_PERSON_MAX_DISTANCE_RATIO = 1.25
OBJECT_PERSON_MAX_DISTANCE_RATIO = 1.60

# ===============================
# HELPERS
# ===============================
def calculate_intersection_area(bbox1, bbox2):
    if not bbox1 or not bbox2: return 0
    x1, y1, w1, h1 = bbox1
    x2, y2, w2, h2 = bbox2
    
    left, top = max(x1, x2), max(y1, y2)
    right, bottom = min(x1 + w1, x2 + w2), min(y1 + h1, y2 + h2)

    width, height = max(0, right - left), max(0, bottom - top)
    return width * height


def bbox_area(bbox):
    if not bbox:
        return 0
    return max(0, bbox[2]) * max(0, bbox[3])


def intersection_ratio(subject_bbox, candidate_bbox):
    """Intersection ratio relative to the subject bbox area."""
    subject_area = max(1, bbox_area(subject_bbox))
    inter = calculate_intersection_area(subject_bbox, candidate_bbox)
    return inter / subject_area

def bbox_center(bbox):
    return (bbox[0] + bbox[2] / 2, bbox[1] + bbox[3] / 2)

def calculate_distance(bbox1, bbox2):
    c1, c2 = bbox_center(bbox1), bbox_center(bbox2)
    return sqrt((c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2)


def normalized_center_distance(person_bbox, target_bbox):
    """Normalize distance by person size so threshold is resolution-independent."""
    person_scale = max(float(person_bbox[2]), float(person_bbox[3]), 1.0)
    return calculate_distance(person_bbox, target_bbox) / person_scale

# ========================================================================================
# CAPTION VALIDATION FUNCTIONS
# ========================================================================================
"""
Caption validation checks if generated captions align with actual detected entities 
in the Knowledge Graph (MongoDB image data).

Process:
1. Extract entities from caption text (actions, objects)
2. Verify against image data: persons, activities, objects, scene_graph
3. Calculate confidence score (0-100%)
4. Return validation result with matched/missing entities
"""

ACTION_KEYWORDS = {
    "reading": ["reading", "read", "đọc"],
    "writing": ["writing", "write", "viết", "ghi chép", "ghi chép bài", "chép bài"],
    "using_phone": ["phone", "using phone", "use phone", "điện thoại"],
    "sleep": ["sleep", "sleeping", "ngủ"],
    "listening": ["listening", "listen", "nghe", "nghe giảng", "chú ý nghe giảng", "chú ý", "raise_head", "upright"],
    "hand_raising": ["hand raising", "raise hand", "hand-raising", "tay", "giơ tay", "giơ tay phát biểu", "phát biểu", "chủ động phát biểu"],
    "turn_head": ["turn head", "turning head", "quay đầu"],
    "upright": ["upright", "sitting", "ngồi"],
}

OBJECT_KEYWORDS = {
    "book": ["book", "textbook", "sách"],
    "notebook": ["notebook", "sổ", "vở"],
    "paper": ["paper", "giấy"],
    "pen": ["pen", "bút"],
    "phone": ["phone", "mobile", "điện thoại"],
}


def normalize_action_img(action_text: str) -> str:
    """Normalize action text to standard form"""
    action_lower = action_text.lower().strip().replace("-", "_")
    if not action_lower:
        return ""

    action_alias = {
        "raise_head": "listening",
        "listening": "listening",
        "upright": "listening",
        "discuss": "listening",
        "hand_raising": "hand_raising",
        "usingphone": "using_phone",
        "using_phone": "using_phone",
        "turnhead": "turn_head",
        "turn_head": "turn_head",
    }
    if action_lower in action_alias:
        return action_alias[action_lower]

    for standard_form, keywords in ACTION_KEYWORDS.items():
        if any(kw in action_lower for kw in keywords):
            return standard_form
    return action_lower


def normalize_object_img(object_text: str) -> str:
    """Normalize object text to standard form"""
    obj_lower = object_text.lower().strip()
    for standard_form, keywords in OBJECT_KEYWORDS.items():
        if any(kw in obj_lower for kw in keywords):
            return standard_form
    return object_text.lower()


def extract_entities_from_caption_img(caption_text: str) -> dict:
    """
    Extract actions and objects mentioned in caption text.
    Returns: {"actions": [...], "objects": [...]}
    """
    caption_lower = caption_text.lower()
    
    entities = {
        "actions": [],
        "objects": []
    }
    
    # Extract actions
    for action, keywords in ACTION_KEYWORDS.items():
        if any(kw in caption_lower for kw in keywords):
            canonical_action = normalize_action_img(action)
            if canonical_action and canonical_action not in entities["actions"]:
                entities["actions"].append(canonical_action)
    
    # Extract objects
    for obj, keywords in OBJECT_KEYWORDS.items():
        if any(kw in caption_lower for kw in keywords):
            if obj not in entities["objects"]:
                entities["objects"].append(obj)
    
    return entities


def validate_caption_with_image_data(
    caption_text: str,
    image_data: dict
) -> dict:
    """
    Validate caption by checking if mentioned entities exist in image_data.
    
    Args:
        caption_text: Generated caption string
        image_data: Image dict containing persons, activities, objects, scene_graph
    
    Returns:
        {
            "confidence": 0-100,
            "is_valid": bool,
            "matched_actions": [...],
            "missing_actions": [...],
            "matched_objects": [...],
            "missing_objects": [...],
            "reason": "explanation"
        }
    """
    if not caption_text or not image_data:
        return {
            "confidence": 0,
            "is_valid": False,
            "matched_actions": [],
            "missing_actions": [],
            "matched_objects": [],
            "missing_objects": [],
            "reason": "Missing caption or image data"
        }
    
    # Extract entities from caption
    caption_entities = extract_entities_from_caption_img(caption_text)
    caption_actions = caption_entities["actions"]
    caption_objects = caption_entities["objects"]
    
    # Get entities from image data
    image_persons = image_data.get("persons", [])
    image_activities = image_data.get("activities", []) or image_data.get("actions", [])
    image_objects = image_data.get("objects", [])
    image_scene_graph = image_data.get("scene_graph", [])
    
    # Extract action types from image activities
    image_action_types = set()
    for activity in image_activities:
        if isinstance(activity, dict):
            activity_name = activity.get("activity_name", "").lower()
        else:
            activity_name = str(activity).lower()
        normalized_action = normalize_action_img(activity_name)
        if normalized_action:
            image_action_types.add(normalized_action)
    
    # Extract action types from scene graph predicates
    for triple in image_scene_graph:
        if isinstance(triple, dict):
            predicate = triple.get("predicate", "").lower()
            normalized_action = normalize_action_img(predicate)
            if normalized_action:
                image_action_types.add(normalized_action)
    
    # Extract object types from image objects
    image_object_types = set()
    for obj in image_objects:
        if isinstance(obj, dict):
            obj_name = obj.get("object_name", "").lower()
        else:
            obj_name = str(obj).lower()
        image_object_types.add(normalize_object_img(obj_name))
    
    # Extract object types from scene graph
    for triple in image_scene_graph:
        if isinstance(triple, dict):
            obj_name = (triple.get("object") or "")
            if obj_name:
                obj_name = str(obj_name).lower()
                image_object_types.add(normalize_object_img(obj_name))
    
    # Calculate matches from caption -> image (hallucination penalty)
    matched_actions = [a for a in caption_actions if a in image_action_types]
    missing_actions = [a for a in caption_actions if a not in image_action_types]
    matched_objects = [o for o in caption_objects if o in image_object_types]
    missing_objects = [o for o in caption_objects if o not in image_object_types]

    # Calculate omissions from image -> caption (missing-mention penalty)
    omitted_actions = sorted([a for a in image_action_types if a not in set(caption_actions)])
    omitted_objects = sorted([o for o in image_object_types if o not in set(caption_objects)])

    # Bi-directional scoring by ACTION TYPE PRESENCE (not count-based)
    caption_action_set = set(caption_actions)
    image_action_set = set(image_action_types)
    matched_action_count = len(caption_action_set.intersection(image_action_set))

    if not caption_action_set and not image_action_set:
        precision = 1.0
        recall = 1.0
        f1_score = 1.0
        reason = "No actions on both caption and image; treated as full alignment"
    else:
        precision = matched_action_count / max(len(caption_action_set), 1)
        recall = matched_action_count / max(len(image_action_set), 1)
        if precision + recall == 0:
            f1_score = 0.0
        else:
            f1_score = (2 * precision * recall) / (precision + recall)

        if f1_score >= 0.80:
            reason = "High action alignment with image data"
        elif f1_score >= 0.50:
            reason = "Partial action alignment (some mismatch/omission)"
        else:
            reason = "Low action alignment"

    confidence = int(round(f1_score * 100))
    
    return {
        "confidence": confidence,
        "is_valid": confidence >= 70,  # Threshold: 70%
        "matched_actions": matched_actions,
        "missing_actions": missing_actions,
        "matched_objects": matched_objects,
        "missing_objects": missing_objects,
        "omitted_actions": omitted_actions,
        "omitted_objects": omitted_objects,
        "precision_score": int(round(precision * 100)),
        "recall_score": int(round(recall * 100)),
        "image_has_persons": len(image_persons) > 0,
        "image_activity_count": len(image_activities),
        "image_object_count": len(image_objects),
        "reason": reason
    }

# ===============================
# EXTRACT TRIPLETS/PAIRS
# ===============================
def extract_triplets(persons, activities, objects, image_oid):
    """
    Lắp ráp Scene Graph Triplets/Pairs từ persons, activities, objects
    Logic: 1 Person - 1 Action - (0 hoặc 1) Object
    """
    # Tạo dictionary để tra cứu nhanh objects by ID
    object_dict = {}
    for obj in objects:
        obj_id = obj["_id"]
        object_dict[obj_id] = {
            "id": obj_id,
            "name": obj.get("object_name"),
            "bbox": obj.get("bbox"),
            "confidence": obj.get("confidence")
        }

    triplets = []

    # Duyệt qua từng person
    for p in persons:
        person_id = p["_id"]
        person_info = {
            "id": person_id,
            "track_id": p.get("track_id"),
            "bbox": p.get("bbox"),
            "confidence": p.get("confidence")
        }

        # Kiểm tra xem person này có ACTIVITY CÁ NHÂN không?
        for act in activities:
            act_person_id = act.get("person_id")
            
            if act_person_id == person_id:
                # Tìm thấy hành động của person này!
                activity_info = {
                    "id": act["_id"],
                    "name": act.get("activity_name"),
                    "confidence": act.get("confidence"),
                    "bbox": act.get("bbox")
                }
                
                # Kiểm tra có target_object_id không
                target_obj_id = act.get("target_object_id")
                
                object_info = None
                triplet_type = "pair"  # Default: Person -> Activity
                
                if target_obj_id and target_obj_id in object_dict:
                    object_info = object_dict[target_obj_id]
                    triplet_type = "triplet"  # Person -> Activity -> Object

                triplet_doc = {
                    "_id": ObjectId(),
                    "image_id": image_oid,
                    "type": triplet_type,
                    "person": person_info,
                    "activity": activity_info,
                    "object": object_info,
                    "created_at": datetime.now(timezone.utc)
                }
                triplets.append(triplet_doc)
                break  # 1 person chỉ 1 action

    return triplets

# ===============================
# MAIN PROCESSING FUNCTION
# ===============================
def process_image(image_path, image_id_str):
    """
    Process image with YOLO models and save results to MongoDB
    """
    try:
        print(f"\n{'='*60}")
        print(f"🖼️  Processing Image: {os.path.basename(image_path)}")
        print(f"📝 Image ID: {image_id_str}")
        print(f"{'='*60}\n")
        
        # Load models if not already loaded
        if classify_classroom_model is None or student_model is None or action_model is None or object_model is None:
            print("⚠️  Models not loaded, loading now...")
            if not load_models():
                raise RuntimeError("Failed to load YOLO models")
        
        # Read image
        print(f"📖 Reading image from: {image_path}")
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image file not found: {image_path}")
            
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError(f"Cannot read image from {image_path}")
        
        print(f"✓ Image loaded: {image.shape[1]}x{image.shape[0]} pixels\n")
        
        # Convert image_id_str to ObjectId
        image_oid = ObjectId(image_id_str)
        
        # ===============================
        # 0. CLASSROOM CLASSIFICATION
        # ===============================
        print("🏫 Running classroom classification...")
        classify_results = classify_classroom_model(image)
        
        is_classroom = False
        classroom_confidence = 0.0
        classroom_probabilities = {}
        predicted_class = None
        
        # Get classification result
        for r in classify_results:
            if hasattr(r, 'probs') and r.probs is not None:
                # Classification model returns probabilities
                top1_idx = int(r.probs.top1)
                top1_conf = float(r.probs.top1conf)
                class_name = str(classify_classroom_model.names[top1_idx]).lower()

                probs_data = r.probs.data.tolist() if hasattr(r.probs, 'data') else []
                class_prob_lines = []
                for idx, prob in enumerate(probs_data):
                    cls_name = str(classify_classroom_model.names.get(idx, idx)) if isinstance(classify_classroom_model.names, dict) else str(classify_classroom_model.names[idx])
                    classroom_probabilities[cls_name.lower()] = float(prob)
                    class_prob_lines.append(f"{cls_name}={float(prob):.6f}")
                if class_prob_lines:
                    print(f"   Class probabilities: {', '.join(class_prob_lines)}")
                
                print(
                    f"✓ Classification: {class_name} (confidence: {top1_conf:.6f}, "
                    f"threshold: {CLASSROOM_CONFIDENCE_THRESHOLD:.2f})"
                )
                
                # Check if it's a classroom
                # Model has 2 classes: "classroom" and "non_classroom"
                # Chỉ chấp nhận classroom khi confidence >= 80%
                predicted_class = class_name
                if class_name == "classroom" and top1_conf >= CLASSROOM_CONFIDENCE_THRESHOLD:
                    is_classroom = True
                    classroom_confidence = top1_conf
                else:
                    is_classroom = False
                    classroom_confidence = top1_conf
                break
        
        # If not a classroom, return early
        if not is_classroom:
            print(f"\n{'='*60}")
            print(f"⚠️  Ảnh này không phải là lớp học!")
            print(f"    Xin vui lòng thử lại với ảnh khác.")
            print(f"{'='*60}\n")
            
            # Update image status to 'error'
            images_col.update_one(
                {"_id": image_oid},
                {
                    "$set": {
                        "status": "error",
                        "processed_at": datetime.now(timezone.utc),
                        "error_message": "Ảnh không phải là lớp học. Vui lòng thử ảnh khác."
                    }
                }
            )
            
            return {
                "success": False,
                "message": "Ảnh không phải là lớp học. Vui lòng thử ảnh khác.",
                "is_classroom": False
            }
        
        # Save classroom environment to MongoDB
        print(f"✓ Đây là lớp học! Đang lưu vào collection environment...")
        environment_doc = {
            "_id": ObjectId(),
            "image_id": image_oid,
            "scene_type": "classroom",
            "description": "Môi trường lớp học được phát hiện tự động",
            "confidence": float(f"{classroom_confidence:.6f}"),
            "predicted_class": predicted_class,
            "class_probabilities": {k: float(f"{v:.6f}") for k, v in classroom_probabilities.items()},
            "created_at": datetime.now(timezone.utc)
        }
        environments_col.insert_one(environment_doc)
        print(f"✓ Đã lưu environment (ID: {environment_doc['_id']})\n")
        
        # Output collections
        persons = []
        objects = []
        activities = []

        # ===============================
        # 1. PERSON DETECTION (student/teacher)
        # ===============================
        print("🎓 Running person detection...")
        student_results = student_model(image, conf=0.2, verbose=False)
        person_track_id = 1
        role_counts = {"student": 0, "teacher": 0, "unknown": 0}

        for r in student_results:
            for box in r.boxes:
                cls_idx = int(box.cls)
                model_names = student_model.names
                if isinstance(model_names, dict):
                    class_name = str(model_names.get(cls_idx, "unknown")).lower()
                elif isinstance(model_names, list) and 0 <= cls_idx < len(model_names):
                    class_name = str(model_names[cls_idx]).lower()
                else:
                    class_name = "unknown"

                if class_name not in {"student", "teacher"}:
                    class_name = "unknown"

                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                person_doc = {
                    "_id": ObjectId(),
                    "image_id": image_oid,
                    "track_id": person_track_id,
                    "role": class_name,
                    "bbox": [x1, y1, x2 - x1, y2 - y1],
                    "confidence": round(float(box.conf), 3),
                    "created_at": datetime.now(timezone.utc)
                }
                persons.append(person_doc)
                role_counts[class_name] = role_counts.get(class_name, 0) + 1
                person_track_id += 1

        print(
            f"✓ Detected {len(persons)} persons "
            f"(students: {role_counts.get('student', 0)}, "
            f"teachers: {role_counts.get('teacher', 0)}, "
            f"unknown: {role_counts.get('unknown', 0)})\n"
        )

        # ===============================
        # 2. OBJECT DETECTION
        # ===============================
        print("📦 Running object detection...")
        object_results = object_model(image, conf=0.2, verbose=False)
        for r in object_results:
            for box in r.boxes:
                cls = int(box.cls)
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                object_doc = {
                    "_id": ObjectId(),
                    "image_id": image_oid,
                    "object_name": object_model.names[cls].lower(),
                    "category": "device",
                    "bbox": [x1, y1, x2 - x1, y2 - y1],
                    "confidence": round(float(box.conf), 3),
                    "created_at": datetime.now(timezone.utc)
                }
                objects.append(object_doc)
        print(f"✓ Detected {len(objects)} objects\n")

        # ===============================
        # 3. ACTION DETECTION (1-1 EXCLUSIVE)
        # ===============================
        print("🎬 Running action detection...")
        # Lower confidence threshold to detect more actions (default is 0.25)
        action_results = action_model(image, conf=0.15, verbose=False)

        # Collect all detected actions and sort by confidence
        detected_actions = []
        for r in action_results:
            for box in r.boxes:
                cls = int(box.cls)
                conf = float(box.conf)
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                action_label = action_classes[cls]
                
                print(f"   🎯 Detected: {action_label} (conf: {conf:.3f})")
                
                detected_actions.append({
                    "label": action_label.lower(),
                    "bbox": [x1, y1, x2 - x1, y2 - y1],
                    "confidence": round(conf, 3)
                })

        print(f"✓ Total actions detected by model: {len(detected_actions)}")
        detected_actions.sort(key=lambda x: x["confidence"], reverse=True)

        print(f"\n🔄 Matching {len(detected_actions)} actions with {len(persons)} students...")

        # 1) Build candidates: each action matched to the best person.
        action_candidates = []
        weak_match_count = 0
        for act in detected_actions:
            label = act["label"]
            action_bbox = act["bbox"]
            conf = act["confidence"]

            best_person = None
            best_intersection_ratio = 0.0
            best_normalized_distance = float("inf")

            for p in persons:
                inter_ratio = intersection_ratio(action_bbox, p["bbox"])
                norm_dist = normalized_center_distance(p["bbox"], action_bbox)
                if inter_ratio > best_intersection_ratio or (
                    inter_ratio == best_intersection_ratio and norm_dist < best_normalized_distance
                ):
                    best_intersection_ratio = inter_ratio
                    best_normalized_distance = norm_dist
                    best_person = p

            if not best_person or not (
                best_intersection_ratio >= ACTION_PERSON_MIN_INTERSECTION_RATIO
                or best_normalized_distance <= ACTION_PERSON_MAX_DISTANCE_RATIO
            ):
                weak_match_count += 1
                print(
                    f"   ✗ Skipped '{label}' (conf: {conf:.3f}) - weak person match "
                    f"(overlap_ratio: {best_intersection_ratio:.3f}, norm_dist: {best_normalized_distance:.3f})"
                )
                continue

            action_candidates.append(
                {
                    "label": label,
                    "bbox": action_bbox,
                    "confidence": conf,
                    "person": best_person,
                    "overlap_ratio": best_intersection_ratio,
                    "norm_dist": best_normalized_distance,
                }
            )

        # 2) Enforce one activity per person: keep highest-confidence candidate per person.
        best_by_person = {}
        for cand in action_candidates:
            person_id = cand["person"]["_id"]
            prev = best_by_person.get(person_id)
            if prev is None:
                best_by_person[person_id] = cand
                continue

            if cand["confidence"] > prev["confidence"]:
                best_by_person[person_id] = cand
                continue

            if cand["confidence"] == prev["confidence"]:
                if cand["overlap_ratio"] > prev["overlap_ratio"] or (
                    cand["overlap_ratio"] == prev["overlap_ratio"] and cand["norm_dist"] < prev["norm_dist"]
                ):
                    best_by_person[person_id] = cand

        selected_candidates = sorted(
            best_by_person.values(),
            key=lambda x: x["confidence"],
            reverse=True,
        )

        # 3) Assign at most one nearby suitable object for selected activity.
        used_object_ids = set()
        matched_count = 0
        no_object_count = 0

        for cand in selected_candidates:
            label = cand["label"]
            action_bbox = cand["bbox"]
            conf = cand["confidence"]
            best_person = cand["person"]
            best_person_id = best_person["_id"]

            target_object_id = None
            valid_labels = ACTION_OBJECT_RULES.get(label, [])

            if valid_labels:
                min_norm_dist = OBJECT_PERSON_MAX_DISTANCE_RATIO
                closest_obj = None

                for obj in objects:
                    obj_id = obj["_id"]
                    if obj_id in used_object_ids:
                        continue

                    if obj["object_name"] in valid_labels:
                        norm_dist = normalized_center_distance(best_person["bbox"], obj["bbox"])
                        if norm_dist < min_norm_dist:
                            min_norm_dist = norm_dist
                            closest_obj = obj

                if closest_obj:
                    target_object_id = closest_obj["_id"]
                    used_object_ids.add(target_object_id)
                else:
                    # Keep person-activity even when no suitable object is found.
                    no_object_count += 1
                    print(
                        f"   ! Kept '{label}' for person {best_person_id} without object (no nearby valid object)"
                    )

            activity_doc = {
                "_id": ObjectId(),
                "image_id": image_oid,
                "person_id": best_person_id,
                "activity_name": label,
                "category": "student_behavior",
                "bbox": action_bbox,
                "confidence": conf,
                "created_at": datetime.now(timezone.utc)
            }
            if target_object_id:
                activity_doc["target_object_id"] = target_object_id

            activities.append(activity_doc)
            matched_count += 1
            print(
                f"   ✓ Matched '{label}' with person {best_person_id} "
                f"(conf: {conf:.3f}, overlap_ratio: {cand['overlap_ratio']:.3f}, norm_dist: {cand['norm_dist']:.3f})"
            )
        
        print(f"\n📊 Matching Summary:")
        print(f"   ✓ Matched: {matched_count} actions")
        print(f"   ✗ Skipped (weak person match): {weak_match_count} actions")
        print(f"   ! Kept without object (no valid object): {no_object_count} actions")
        print(f"✓ Processed actions: {len(activities)} activities\n")

        # ===============================
        # 4. SAVE TO MONGODB
        # ===============================
        print("💾 Saving results to MongoDB...")
        results = {
            "persons": 0,
            "objects": 0,
            "activities": 0,
            "triplets": 0
        }

        if persons:
            persons_col.insert_many(persons)
            results["persons"] = len(persons)
        
        if objects:
            objects_col.insert_many(objects)
            results["objects"] = len(objects)
        
        if activities:
            activities_col.insert_many(activities)
            results["activities"] = len(activities)

        # ===============================
        # 5. GENERATE SCENE GRAPH TRIPLETS
        # ===============================
        triplets = extract_triplets(persons, activities, objects, image_oid)
        
        if triplets:
            triplets_col.insert_many(triplets)
            results["triplets"] = len(triplets)
            print(f"✅ Created {len(triplets)} scene graph triplets/pairs")

        # NOTE:
        # Do not mark status="done" here. The Node.js parent process sets
        # final done/error status based on Python exit code.
        images_col.update_one(
            {"_id": image_oid},
            {
                "$set": {
                    "ai_results": results
                }
            }
        )

        # Sync this processed image from MongoDB to Neo4j (incremental)
        neo4j_synced_ok = False
        try:
            _mirror_processing_results_to_postgres(image_id_str)
            neo4j_sync_result = sync_image_to_neo4j(image_id_str)
            print(f"🔗 Neo4j sync successful: {neo4j_sync_result}")
            neo4j_synced_ok = True
        except Exception as sync_error:
            print(f"⚠️ Neo4j sync failed (MongoDB data is still saved): {sync_error}")

        # Primary: Generate caption from refined scene graph + optional OpenAI polish
        generated_caption_ok = False
        if neo4j_synced_ok:
            try:
                current_image_doc = images_col.find_one({"_id": image_oid}) or {
                    "_id": image_oid,
                    "image_name": os.path.basename(image_path),
                    "status": "done",
                }
                generated_result = generate_caption_from_neo4j_graph(
                    mongo_db=db,
                    image_doc=current_image_doc,
                )
                if generated_result.get("success"):
                    generated_caption_ok = True
                    print(f"📝 Generated caption: {generated_result.get('caption')}")
                    try:
                        sync_image_to_neo4j(image_id_str)
                        print("🔁 Neo4j re-sync successful after generated caption")
                    except Exception as generated_resync_error:
                        print(f"⚠️ Neo4j re-sync after generated caption failed: {generated_resync_error}")
                else:
                    print(f"ℹ️ Generated caption skipped: {generated_result.get('message')}")
            except Exception as generated_caption_error:
                print(f"⚠️ Generated caption failed: {generated_caption_error}")

        # Secondary (fallback): Generate caption by graph similarity (only when primary not available)
        if neo4j_synced_ok and not generated_caption_ok:
            similarity_service = GraphSimilarityCaptionService()
            try:
                similarity_result = similarity_service.apply_best_caption(db, image_id_str, threshold=0.6)
                if similarity_result.get("success"):
                    print(
                        f"🧠 Similarity caption assigned from image {similarity_result.get('similar_image_id')} "
                        f"(score: {similarity_result.get('score')}%)"
                    )
                    try:
                        sync_image_to_neo4j(image_id_str)
                        print("🔁 Neo4j re-sync successful after caption transfer")
                    except Exception as resync_error:
                        print(f"⚠️ Neo4j re-sync after caption transfer failed: {resync_error}")
                else:
                    print(f"ℹ️ Similarity caption skipped: {similarity_result.get('message')}")
            except Exception as caption_error:
                print(f"⚠️ Similarity caption failed: {caption_error}")
            finally:
                similarity_service.close()

        # 🔍 VALIDATE CAPTION AGAINST IMAGE DATA
        try:
            print(f"\n🔍 Starting caption validation process...")
            
            # Find caption(s) for this image in caption collection
            caption_docs = list(db.caption.find({"image_id": image_oid}))
            print(f"   Found {len(caption_docs)} caption document(s) for this image")
            
            if caption_docs:
                regeneration_required_for_image = False
                for cap_doc in caption_docs:
                    caption_text = cap_doc.get("caption", "")
                    if not caption_text:
                        print(f"   ⚠️ Caption text not found in document {cap_doc['_id']}")
                        continue
                        
                    print(f"   Caption text: {caption_text[:80]}...")
                    
                    # Prepare image data for validation
                    image_data = {
                        "persons": persons,
                        "activities": activities,
                        "objects": objects,
                        "scene_graph": triplets,
                    }
                    print(f"   Image data: {len(image_data['persons'])} persons, {len(image_data['activities'])} activities, {len(image_data['objects'])} objects")
                    
                    # Validate caption
                    caption_validation = validate_caption_with_image_data(caption_text, image_data)
                    print(f"   Validation result: confidence={caption_validation['confidence']}%, is_valid={caption_validation['is_valid']}")

                    needs_regeneration = (
                        (not caption_validation["is_valid"])
                        or (caption_validation.get("confidence", 0) < CAPTION_REGEN_THRESHOLD)
                    )
                    if needs_regeneration:
                        regeneration_required_for_image = True
                    
                    # Update caption document with validation results
                    db.caption.update_one(
                        {"_id": cap_doc["_id"]},
                        {
                            "$set": {
                                "caption_validation": {
                                    "confidence": caption_validation["confidence"],
                                    "is_valid": caption_validation["is_valid"],
                                    "matched_actions": caption_validation["matched_actions"],
                                    "missing_actions": caption_validation["missing_actions"],
                                    "matched_objects": caption_validation["matched_objects"],
                                    "missing_objects": caption_validation["missing_objects"],
                                    "omitted_actions": caption_validation.get("omitted_actions", []),
                                    "omitted_objects": caption_validation.get("omitted_objects", []),
                                    "precision_score": caption_validation.get("precision_score", caption_validation["confidence"]),
                                    "recall_score": caption_validation.get("recall_score", caption_validation["confidence"]),
                                    "reason": caption_validation["reason"],
                                },
                                "caption_confidence": caption_validation["confidence"],
                                "confidence_score": caption_validation["confidence"],
                                "caption_is_reliable": caption_validation["is_valid"],
                                "validated_at": datetime.now().isoformat(),
                                "needs_regeneration": needs_regeneration,
                                "regeneration_status": "pending" if needs_regeneration else "not_required",
                                "regeneration_reason": caption_validation["reason"] if needs_regeneration else "",
                                "regeneration_trigger": "kg_validation" if needs_regeneration else "",
                            }
                        }
                    )
                    print(f"   ✅ Caption document {cap_doc['_id']} UPDATED with validation fields")
                    
                    if not caption_validation["is_valid"]:
                        print(f"   ⚠️ Note: {caption_validation['reason']}")
                        if caption_validation["missing_actions"]:
                            print(f"      Missing actions: {', '.join(caption_validation['missing_actions'])}")
                        if caption_validation["missing_objects"]:
                            print(f"      Missing objects: {', '.join(caption_validation['missing_objects'])}")
                    
                    # Keep image document lean: store only status and remove duplicated caption metadata.
                    images_col.update_one(
                        {"_id": image_oid},
                        {
                            "$set": {
                                "caption_status": "generated",
                                "caption_regeneration_required": regeneration_required_for_image,
                                "caption_regeneration_reason": "low_confidence_or_kg_mismatch" if regeneration_required_for_image else "",
                                "caption_review_required": regeneration_required_for_image,
                            },
                            "$unset": {
                                "caption_generated_at": "",
                                "caption_source": "",
                                "caption_confidence": "",
                                "caption_is_reliable": "",
                                "caption_validation": "",
                                "confidence_score": "",
                                "caption_similarity": "",
                            },
                        }
                    )
            else:
                print(f"   ⚠️ No caption documents found for image {image_oid}")
        except Exception as validation_error:
            print(f"⚠️ Caption validation failed: {validation_error}")
            import traceback
            traceback.print_exc()

        print(f"\n{'='*60}")
        print(f"✅ SUCCESS! Image processed successfully")
        print(f"   Persons: {results['persons']}")
        print(f"   Objects: {results['objects']}")
        print(f"   Activities: {results['activities']}")
        print(f"   Triplets: {results['triplets']}")
        print(f"{'='*60}\n")

        return {
            "success": True,
            "message": "Image processed successfully",
            "results": results
        }

    except Exception as e:
        print(f"\n{'='*60}")
        print(f"❌ ERROR: {str(e)}")
        print(f"{'='*60}\n")
        
        import traceback
        traceback.print_exc()
        
        # Update image status to 'error' on failure
        try:
            images_col.update_one(
                {"_id": ObjectId(image_id_str)},
                {
                    "$set": {
                        "status": "error",
                        "error_message": str(e),
                        "processed_at": datetime.now(timezone.utc)
                    }
                }
            )
        except:
            pass
        
        return {
            "success": False,
            "message": f"Error processing image: {str(e)}"
        }

# ===============================
# CLI ENTRY POINT
# ===============================
if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({
            "success": False,
            "message": "Usage: python process_image.py <image_path> <image_id>"
        }))
        sys.exit(1)
    
    image_path = sys.argv[1]
    image_id = sys.argv[2]
    
    result = process_image(image_path, image_id)
    print(json.dumps(result))
    
    if result["success"]:
        sys.exit(0)
    else:
        sys.exit(1)
