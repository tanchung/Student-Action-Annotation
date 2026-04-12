import json
import os
import sys
from datetime import datetime, timezone
from math import sqrt
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
from bson import ObjectId
from pymongo import MongoClient
from ultralytics import YOLO

from deepsort_tracker import DeepSORTTracker, Detection
from sync_mongo_to_neo4j import sync_video_to_neo4j

try:
    from scene_graph_captioning import (
        _build_focus_assessment,
        _join_phrases,
        ACTION_LABEL_MAP,
        generate_video_caption_from_neo4j_graph,
    )
except Exception:
    _build_focus_assessment = None
    _join_phrases = None
    ACTION_LABEL_MAP = {}
    generate_video_caption_from_neo4j_graph = None


MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://127.0.0.1:27017/classroom_kg")
client = MongoClient(MONGODB_URI)
db = client["classroom_kg"]

video_col = db["video"]
frame_col = db["frame"]
segment_col = db["segment"]
person_col = db["person"]
activity_col = db["activity"]
object_col = db["entity_object"]
caption_col = db["caption"]

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "models")

classify_model = None
person_model = None
action_model = None
object_model = None
deepsort_tracker = None  # Global DeepSORT tracker

CLASSROOM_CONFIDENCE_THRESHOLD = 0.60
CAPTION_REGEN_THRESHOLD = 70
PERSON_CONF = 0.20
ACTION_CONF = 0.15
OBJECT_CONF = 0.20
COSINE_THRESHOLD = 0.80
SAMPLE_RATE = 2.0

DISTANCE_THRESHOLD = 150
MIN_INTERSECTION_AREA = 10

# Scale-aware matching thresholds (stable across small/large frames)
ACTION_PERSON_MIN_INTERSECTION_RATIO = 0.03
ACTION_PERSON_MAX_DISTANCE_RATIO = 1.25
OBJECT_PERSON_MAX_DISTANCE_RATIO = 1.60

# DeepSORT parameters
DEEPSORT_MAX_AGE = 70
DEEPSORT_MIN_HITS = 3
DEEPSORT_IOU_THRESHOLD = 0.3
DEEPSORT_APPEARANCE_THRESHOLD = 0.5

ACTION_OBJECT_RULES = {
    "reading": ["book", "notebook", "paper"],
    "writing": ["notebook", "paper", "pen"],
    "using_phone": ["phone", "mobile phone"],
}

BEHAVIOR_KEYS = ["writing", "reading", "phone", "sleep", "listening"]

# ========================================================================================
# CAPTION VALIDATION FUNCTIONS (copied from process_image.py)
# ========================================================================================
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


def normalize_action_vid(action_text: str) -> str:
    """Normalize action text to standard form for video validation"""
    action_lower = action_text.lower().strip().replace("-", "_")
    if not action_lower:
        return ""

    action_alias = {
        "raise_head": "listening",
        "listening": "listening",
        "upright": "listening",
        "discuss": "listening",
        "hand_raising": "hand_raising",
        "hand-raising": "hand_raising",
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


def normalize_object_vid(object_text: str) -> str:
    """Normalize object text to standard form for video validation"""
    obj_lower = object_text.lower().strip()
    for standard_form, keywords in OBJECT_KEYWORDS.items():
        if any(kw in obj_lower for kw in keywords):
            return standard_form
    return object_text.lower()


def extract_entities_from_caption_vid(caption_text: str) -> dict:
    """Extract actions and objects mentioned in caption text."""
    caption_lower = caption_text.lower()
    
    entities = {
        "actions": [],
        "objects": []
    }
    
    # Extract actions
    for action, keywords in ACTION_KEYWORDS.items():
        if any(kw in caption_lower for kw in keywords):
            canonical_action = normalize_action_vid(action)
            if canonical_action and canonical_action not in entities["actions"]:
                entities["actions"].append(canonical_action)
    
    # Extract objects
    for obj, keywords in OBJECT_KEYWORDS.items():
        if any(kw in caption_lower for kw in keywords):
            if obj not in entities["objects"]:
                entities["objects"].append(obj)
    
    return entities


def validate_caption_with_video_data(caption_text: str, video_data: dict) -> dict:
    """
    Validate video caption by checking if mentioned entities exist in video_data.
    video_data contains: persons, activities, objects, scene_graph
    """
    if not caption_text or not video_data:
        return {
            "confidence": 0,
            "is_valid": False,
            "matched_actions": [],
            "missing_actions": [],
            "matched_objects": [],
            "missing_objects": [],
            "reason": "Missing caption or video data"
        }
    
    # Extract entities from caption
    caption_entities = extract_entities_from_caption_vid(caption_text)
    caption_actions = caption_entities["actions"]
    caption_objects = caption_entities["objects"]
    
    # Get entities from video data
    video_persons = video_data.get("persons", [])
    video_activities = video_data.get("activities", []) or video_data.get("actions", [])
    video_objects = video_data.get("objects", [])
    video_scene_graph = video_data.get("scene_graph", [])
    
    # Extract action types from video activities
    video_action_types = set()
    for activity in video_activities:
        if isinstance(activity, dict):
            activity_name = activity.get("activity_name", "").lower()
        else:
            activity_name = str(activity).lower()
        normalized_action = normalize_action_vid(activity_name)
        if normalized_action:
            video_action_types.add(normalized_action)
    
    # Extract action types from scene graph
    for triple in video_scene_graph:
        if isinstance(triple, dict):
            predicate = triple.get("predicate", "").lower() or triple.get("relationship", "").lower()
            normalized_action = normalize_action_vid(predicate)
            if normalized_action:
                video_action_types.add(normalized_action)
    
    # Extract object types from video objects
    video_object_types = set()
    for obj in video_objects:
        if isinstance(obj, dict):
            obj_name = obj.get("object_name", "").lower()
        else:
            obj_name = str(obj).lower()
        video_object_types.add(normalize_object_vid(obj_name))
    
    # Extract object types from scene graph (if structure differs from image)
    for triple in video_scene_graph:
        if isinstance(triple, dict):
            obj_name = triple.get("object", "")
            if obj_name:
                obj_name = str(obj_name).lower()
                video_object_types.add(normalize_object_vid(obj_name))
    
    # Calculate matches and misses
    matched_actions = [a for a in caption_actions if a in video_action_types]
    missing_actions = [a for a in caption_actions if a not in video_action_types]
    matched_objects = [o for o in caption_objects if o in video_object_types]
    missing_objects = [o for o in caption_objects if o not in video_object_types]
    
    omitted_actions = sorted([a for a in video_action_types if a not in set(caption_actions)])
    omitted_objects = sorted([o for o in video_object_types if o not in set(caption_objects)])
    
    # Bidirectional F1 scoring
    caption_action_set = set(caption_actions)
    video_action_set = set(video_action_types)
    matched_action_count = len(caption_action_set.intersection(video_action_set))
    
    if not caption_action_set and not video_action_set:
        precision = 1.0
        recall = 1.0
        f1_score = 1.0
        reason = "No actions on both caption and video; treated as full alignment"
    else:
        precision = matched_action_count / max(len(caption_action_set), 1)
        recall = matched_action_count / max(len(video_action_set), 1)
        if precision + recall == 0:
            f1_score = 0.0
        else:
            f1_score = (2 * precision * recall) / (precision + recall)
        
        if f1_score >= 0.80:
            reason = "High action alignment with video data"
        elif f1_score >= 0.50:
            reason = "Partial action alignment (some mismatch/omission)"
        else:
            reason = "Low action alignment"
    
    confidence = int(round(f1_score * 100))
    
    return {
        "confidence": confidence,
        "is_valid": confidence >= 70,
        "matched_actions": matched_actions,
        "missing_actions": missing_actions,
        "matched_objects": matched_objects,
        "missing_objects": missing_objects,
        "omitted_actions": omitted_actions,
        "omitted_objects": omitted_objects,
        "precision_score": int(round(precision * 100)),
        "recall_score": int(round(recall * 100)),
        "video_has_persons": len(video_persons) > 0,
        "video_activity_count": len(video_activities),
        "video_object_count": len(video_objects),
        "reason": reason
    }



def load_models() -> bool:
    global classify_model, person_model, action_model, object_model, deepsort_tracker

    classify_filename = os.getenv("CLASSIFY_CLASSROOM_MODEL", "classify_classroom1.pt")
    classify_path = os.path.join(MODEL_DIR, classify_filename)
    person_path = os.path.join(MODEL_DIR, "detection_person.pt")
    action_path = os.path.join(MODEL_DIR, "detection_action.pt")
    object_path = os.path.join(MODEL_DIR, "detection_object1.pt")

    try:
        for model_name, model_path in [
            ("classify", classify_path),
            ("person", person_path),
            ("action", action_path),
            ("object", object_path),
        ]:
            if not os.path.exists(model_path):
                raise FileNotFoundError(f"Missing model '{model_name}': {model_path}")

        classify_model = YOLO(classify_path)
        person_model = YOLO(person_path)
        action_model = YOLO(action_path)
        object_model = YOLO(object_path)
        
        # Initialize DeepSORT tracker
        device = "cuda" if __import__("torch").cuda.is_available() else "cpu"
        deepsort_tracker = DeepSORTTracker(
            max_age=DEEPSORT_MAX_AGE,
            min_hits=DEEPSORT_MIN_HITS,
            iou_threshold=DEEPSORT_IOU_THRESHOLD,
            appearance_threshold=DEEPSORT_APPEARANCE_THRESHOLD,
            device=device
        )
        print(f"✅ DeepSORT tracker initialized on {device}")
        return True
    except Exception as exc:
        print(f"❌ Failed to load models: {exc}")
        return False



def calculate_intersection_area(bbox1: List[int], bbox2: List[int]) -> int:
    x1, y1, w1, h1 = bbox1
    x2, y2, w2, h2 = bbox2

    left = max(x1, x2)
    top = max(y1, y2)
    right = min(x1 + w1, x2 + w2)
    bottom = min(y1 + h1, y2 + h2)
    
    width = max(0, right - left)
    height = max(0, bottom - top)
    return width * height


def bbox_area(bbox: List[int]) -> int:
    if not bbox:
        return 0
    return max(0, int(bbox[2])) * max(0, int(bbox[3]))


def intersection_ratio(subject_bbox: List[int], candidate_bbox: List[int]) -> float:
    subject_area = max(1, bbox_area(subject_bbox))
    return float(calculate_intersection_area(subject_bbox, candidate_bbox)) / float(subject_area)


def bbox_center(bbox: List[int]) -> tuple:
    x, y, w, h = bbox
    return (x + w / 2, y + h / 2)



def calculate_distance(bbox1: List[int], bbox2: List[int]) -> float:
    c1 = bbox_center(bbox1)
    c2 = bbox_center(bbox2)
    return sqrt((c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2)


def normalized_center_distance(person_bbox: List[int], target_bbox: List[int]) -> float:
    person_scale = max(float(person_bbox[2]), float(person_bbox[3]), 1.0)
    return calculate_distance(person_bbox, target_bbox) / person_scale


# ============================================================================
# OLD TRACKING METHODS DEPRECATED - REPLACED BY DEEPSORT + REID
# ============================================================================
# The following functions have been replaced by DeepSORT tracker:
# - assign_missing_track_ids() → Handled by DeepSORTTracker.update()
# - calculate_iou() → Implemented in DeepSORTTracker._iou()
# ============================================================================



def sample_frames(video_path: str, sample_rate: float = SAMPLE_RATE) -> List[Dict[str, Any]]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0) or 30.0
    interval = max(1, int(round(fps / sample_rate)))

    frames: List[Dict[str, Any]] = []
    frame_id = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_id % interval == 0:
            frames.append(
                {
                    "frame_id": frame_id,
                    "timestamp": frame_id / fps,
                    "frame": frame,
                }
            )
        frame_id += 1

    cap.release()
    return frames



def classify_as_classroom(frame: np.ndarray) -> Dict[str, Any]:
    result = classify_model(frame)[0]
    if not hasattr(result, "probs") or result.probs is None:
        return {"is_classroom": True, "confidence": 1.0, "label": "unknown"}

    top_idx = int(result.probs.top1)
    conf = float(result.probs.top1conf)

    names = classify_model.names
    if isinstance(names, dict):
        label = str(names.get(top_idx, "unknown")).lower()
    else:
        label = str(names[top_idx]).lower()

    is_classroom = ("classroom" in label and "non" not in label) and conf >= CLASSROOM_CONFIDENCE_THRESHOLD
    return {"is_classroom": is_classroom, "confidence": conf, "label": label}



def parse_detections(result, model_names: Any) -> List[Dict[str, Any]]:
    detections: List[Dict[str, Any]] = []
    boxes = getattr(result, "boxes", None)
    if boxes is None:
        return detections

    for box in boxes:
        cls_idx = int(box.cls)
        conf = round(float(box.conf), 4)
        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())

        if isinstance(model_names, dict):
            cls_name = str(model_names.get(cls_idx, "unknown")).lower()
        else:
            cls_name = str(model_names[cls_idx]).lower() if 0 <= cls_idx < len(model_names) else "unknown"

        track_id = None
        if hasattr(box, "id") and box.id is not None:
            try:
                track_id = int(box.id.item()) if hasattr(box.id, "item") else int(box.id)
            except Exception:
                track_id = None

        detections.append(
            {
                "class": cls_name,
                "confidence": conf,
                "bbox": [x1, y1, x2 - x1, y2 - y1],
                "track_id": track_id,
            }
        )

    return detections



def detect_with_tracking(frame: np.ndarray) -> Dict[str, Any]:
    """Detect persons, actions, and objects with DeepSORT tracking
    
    Uses DeepSORT + ReID for person tracking with appearance features.
    """
    global deepsort_tracker
    
    try:
        # Detect persons
        person_result = person_model(frame, conf=PERSON_CONF, verbose=False)[0]
        persons_detections = parse_detections(person_result, person_model.names)
        
        # Convert to Detection objects for DeepSORT
        detection_objects = [
            Detection(
                bbox=np.array(p["bbox"], dtype=np.float32),
                confidence=p["confidence"],
                class_name=p["class"]
            )
            for p in persons_detections
        ]
        
        # Update with DeepSORT tracker
        tracked_detections = deepsort_tracker.update(frame, detection_objects)
        
        # Convert back to detection dictionaries with track IDs
        persons = []
        for det in tracked_detections:
            persons.append({
                "class": det.class_name,
                "confidence": det.confidence,
                "bbox": det.bbox.astype(int).tolist() if isinstance(det.bbox, np.ndarray) else det.bbox,
                "track_id": det.track_id,
            })
    except Exception as e:
        print(f"⚠️ Tracking error: {e}. Falling back to detection only.")
        person_result = person_model(frame, conf=PERSON_CONF, verbose=False)[0]
        persons = parse_detections(person_result, person_model.names)

    # Detect actions and objects (no tracking needed)
    action_result = action_model(frame, conf=ACTION_CONF, verbose=False)[0]
    object_result = object_model(frame, conf=OBJECT_CONF, verbose=False)[0]

    actions = parse_detections(action_result, action_model.names)
    objects = parse_detections(object_result, object_model.names)

    return {"persons": persons, "actions": actions, "objects": objects}



def normalize_action(action_name: str) -> str:
    normalized = (action_name or "unknown").strip().lower().replace(" ", "_")
    alias = {
        "usingphone": "using_phone",
        "hand_raising": "hand-raising",
        "raisehead": "raise_head",
        "turnhead": "turn_head",
    }
    return alias.get(normalized, normalized)



def build_scene_graph(persons: List[Dict[str, Any]], actions: List[Dict[str, Any]], objects: List[Dict[str, Any]]) -> Dict[str, Any]:
    graph: List[Dict[str, Any]] = []

    # Build candidates by matching each action to its best person.
    candidates: List[Dict[str, Any]] = []
    for action in actions:
        action_name = normalize_action(action["class"])
        action_bbox = action["bbox"]

        best_person_idx = None
        best_overlap_ratio = 0.0
        best_norm_dist = float("inf")
        for p_idx, person in enumerate(persons):
            overlap_ratio = intersection_ratio(action_bbox, person["bbox"])
            norm_dist = normalized_center_distance(person["bbox"], action_bbox)
            if overlap_ratio > best_overlap_ratio or (
                overlap_ratio == best_overlap_ratio and norm_dist < best_norm_dist
            ):
                best_overlap_ratio = overlap_ratio
                best_norm_dist = norm_dist
                best_person_idx = p_idx

        if best_person_idx is None:
            continue
        if (
            best_overlap_ratio < ACTION_PERSON_MIN_INTERSECTION_RATIO
            and best_norm_dist > ACTION_PERSON_MAX_DISTANCE_RATIO
        ):
            continue

        candidates.append(
            {
                "action": action,
                "action_name": action_name,
                "action_bbox": action_bbox,
                "person_idx": best_person_idx,
                "person": persons[best_person_idx],
                "overlap_ratio": best_overlap_ratio,
                "norm_dist": best_norm_dist,
            }
        )

    # Enforce one-activity-per-person: keep only highest-confidence activity per person.
    best_by_person: Dict[int, Dict[str, Any]] = {}
    for cand in candidates:
        person_idx = cand["person_idx"]
        prev = best_by_person.get(person_idx)
        if prev is None:
            best_by_person[person_idx] = cand
            continue

        cand_conf = float(cand["action"].get("confidence", 0.0) or 0.0)
        prev_conf = float(prev["action"].get("confidence", 0.0) or 0.0)
        if cand_conf > prev_conf:
            best_by_person[person_idx] = cand
            continue
        if cand_conf == prev_conf:
            if cand["overlap_ratio"] > prev["overlap_ratio"] or (
                cand["overlap_ratio"] == prev["overlap_ratio"] and cand["norm_dist"] < prev["norm_dist"]
            ):
                best_by_person[person_idx] = cand

    selected = sorted(
        best_by_person.values(),
        key=lambda item: float(item["action"].get("confidence", 0.0) or 0.0),
        reverse=True,
    )

    for cand in selected:
        action = cand["action"]
        action_name = cand["action_name"]
        action_bbox = cand["action_bbox"]
        person = cand["person"]
        best_person_idx = cand["person_idx"]

        subject = f"Student_{person.get('track_id') if person.get('track_id') is not None else best_person_idx + 1}"

        chosen_object_name = None
        valid_objects = ACTION_OBJECT_RULES.get(action_name, [])
        if valid_objects:
            best_obj_score = float("inf")
            closest_obj_idx = None
            for o_idx, obj in enumerate(objects):
                if obj["class"] not in valid_objects:
                    continue

                # Composite score: prioritize close-to-person and overlapping action region.
                norm_dist = normalized_center_distance(person["bbox"], obj["bbox"])
                action_obj_overlap = intersection_ratio(action_bbox, obj["bbox"])
                score = norm_dist - 0.25 * action_obj_overlap

                if norm_dist > OBJECT_PERSON_MAX_DISTANCE_RATIO:
                    continue
                if score < best_obj_score:
                    best_obj_score = score
                    closest_obj_idx = o_idx

            if closest_obj_idx is not None:
                chosen_object_name = objects[closest_obj_idx]["class"]
        else:
            # Actions without object semantics keep a neutral scene target for captioning.
            chosen_object_name = "classroom"

        graph.append(
            {
                "subject": subject,
                "predicate": action_name,
                "object": chosen_object_name,
                "confidence": action["confidence"],
            }
        )

    return {
        "scene_graph": graph,
        "matched_action_count": len(graph),
    }



def build_behavior_vector(scene_graph: List[Dict[str, Any]]) -> List[float]:
    counts = {k: 0 for k in BEHAVIOR_KEYS}

    for triplet in scene_graph:
        action = normalize_action(triplet.get("predicate", ""))

        if action == "writing":
            counts["writing"] += 1
        elif action == "reading":
            counts["reading"] += 1
        elif action == "using_phone":
            counts["phone"] += 1
        elif action == "sleep":
            counts["sleep"] += 1
        elif action in {"raise_head", "upright", "hand-raising", "discuss"}:
            counts["listening"] += 1

    total = float(sum(counts.values())) + 1e-6
    return [round(counts[k] / total, 6) for k in BEHAVIOR_KEYS]



def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    a = np.array(v1, dtype=float)
    b = np.array(v2, dtype=float)
    denom = (np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0:
        return 1.0
    return float(np.dot(a, b) / denom)



def temporal_segment(processed_frames: List[Dict[str, Any]], threshold: float = COSINE_THRESHOLD) -> List[List[int]]:
    if not processed_frames:
        return []

    segments: List[List[int]] = []
    current_segment = [0]

    for i in range(1, len(processed_frames)):
        sim = cosine_similarity(processed_frames[i - 1]["behavior_vector"], processed_frames[i]["behavior_vector"])
        if sim < threshold:
            segments.append(current_segment)
            current_segment = []
        current_segment.append(i)

    if current_segment:
        segments.append(current_segment)

    return segments



def frame_information_score(frame_data: Dict[str, Any]) -> int:
    return (
        len(frame_data.get("persons", []))
        + len(frame_data.get("actions", []))
        + len(frame_data.get("objects", []))
        + len(frame_data.get("scene_graph", []))
    )



def select_keyframe_indices(processed_frames: List[Dict[str, Any]], segments: List[List[int]]) -> List[int]:
    keyframe_indices: List[int] = []

    for segment_indices in segments:
        best_idx = segment_indices[0]
        best_score = -1
        for frame_idx in segment_indices:
            score = frame_information_score(processed_frames[frame_idx])
            if score > best_score:
                best_score = score
                best_idx = frame_idx
        keyframe_indices.append(best_idx)

    return keyframe_indices


def aggregate_segment_scene_graph(segment_frames: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Aggregate triplets across all frames in one segment so short-lived actions are not lost."""
    triplet_map: Dict[tuple, Dict[str, Any]] = {}

    for frame in segment_frames:
        for triple in frame.get("scene_graph", []):
            subject = triple.get("subject", "Student")
            predicate = normalize_action(triple.get("predicate", "unknown"))
            obj = triple.get("object")
            confidence = float(triple.get("confidence", 0.0) or 0.0)

            key = (subject, predicate, obj)
            if key not in triplet_map:
                triplet_map[key] = {
                    "subject": subject,
                    "predicate": predicate,
                    "object": obj,
                    "confidence": confidence,
                    "count": 1,
                }
            else:
                triplet_map[key]["count"] += 1
                if confidence > triplet_map[key]["confidence"]:
                    triplet_map[key]["confidence"] = confidence

    aggregated = list(triplet_map.values())
    aggregated.sort(key=lambda item: (-item.get("count", 0), -item.get("confidence", 0.0), item.get("predicate", "")))
    return aggregated



def generate_caption_from_graph(scene_graph: List[Dict[str, Any]], segment_index: int, persons: List[Dict[str, Any]] = None) -> str:
    # Case 1: No persons detected - empty classroom
    if persons is not None and not persons:
        return f"Đoạn {segment_index + 1}: Lớp học đang trống không có học sinh trong lớp."
    
    # Case 2: No activities detected (but persons present or unknown)
    if not scene_graph:
        return f"Đoạn {segment_index + 1}: Không phát hiện rõ hành vi học sinh trong đoạn này."

    activity_counts: Dict[str, int] = {}
    for triple in scene_graph:
        action = normalize_action(triple.get("predicate", "unknown"))
        activity_counts[action] = activity_counts.get(action, 0) + 1

    if _build_focus_assessment is not None and _join_phrases is not None:
        focus = _build_focus_assessment(activity_counts)
        opening = focus.get("opening_hint", "Học sinh trong lớp có các hành vi học tập")

        # Include all actions detected in this segment to avoid dropping any behavior.
        sorted_actions = sorted(activity_counts.items(), key=lambda item: (-item[1], item[0]))
        action_phrases = []
        used_phrases = set()
        for action_name, _ in sorted_actions:
            map_key = action_name.replace("-", "_")
            phrase = ACTION_LABEL_MAP.get(action_name) or ACTION_LABEL_MAP.get(map_key) or action_name.replace("_", " ").replace("-", " ")
            if phrase in used_phrases:
                # Keep the action explicit even if natural-language phrase collides.
                phrase = f"{phrase} ({action_name.replace('_', ' ').replace('-', ' ')})"
            used_phrases.add(phrase)
            action_phrases.append(phrase)

        details = ""
        if action_phrases:
            details = f" Tất cả hành vi ghi nhận: {_join_phrases(action_phrases)}."

        return f"Đoạn {segment_index + 1}: {opening}.{details}".replace("..", ".")

    all_actions = [name.replace("_", " ").replace("-", " ") for name, _ in sorted(activity_counts.items(), key=lambda item: (-item[1], item[0]))]
    return f"Đoạn {segment_index + 1}: Tất cả hành vi ghi nhận gồm {', '.join(all_actions)}."



def aggregate_video_caption(segment_docs: List[Dict[str, Any]]) -> str:
    if not segment_docs:
        return "Không có phân đoạn hợp lệ để tổng hợp caption video."

    parts = []
    previous_end_for_display: Optional[float] = None
    for seg in segment_docs:
        start_t = float(seg.get("start_time", 0) or 0)
        end_t = float(seg.get("end_time", 0) or 0)

        display_start = start_t if previous_end_for_display is None else previous_end_for_display
        display_end = end_t if end_t >= display_start else display_start

        parts.append(
            f"Từ {display_start:.1f}s đến {display_end:.1f}s: {seg.get('caption', '')}".strip()
        )
        previous_end_for_display = display_end
    return " ".join(parts)



def clear_previous_video_results(video_oid: ObjectId) -> None:
    delete_filter = {"video_id": video_oid}
    frame_col.delete_many(delete_filter)
    segment_col.delete_many(delete_filter)
    person_col.delete_many(delete_filter)
    activity_col.delete_many(delete_filter)
    object_col.delete_many(delete_filter)
    caption_col.delete_many({"video_id": video_oid, "caption_scope": "video"})



def process_video(video_path: str, video_id_str: str) -> Dict[str, Any]:
    video_oid = ObjectId(video_id_str)

    if not load_models():
        raise RuntimeError("Không thể load các model YOLO")

    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video file not found: {video_path}")

    sampled = sample_frames(video_path, sample_rate=SAMPLE_RATE)

    processed_frames: List[Dict[str, Any]] = []
    person_docs: List[Dict[str, Any]] = []
    action_docs: List[Dict[str, Any]] = []
    object_docs: List[Dict[str, Any]] = []
    # Note: Previous tracking variables no longer needed - DeepSORT handles this internally

    clear_previous_video_results(video_oid)

    for sampled_index, sampled_item in enumerate(sampled):
        frame = sampled_item["frame"]
        # 1️⃣ Always run detection + tracking first
        det = detect_with_tracking(frame)

        # 2️⃣ Then classify as classroom
        cls = classify_as_classroom(frame)

        frame_data: Dict[str, Any] = {
            "_id": ObjectId(),
            "video_id": video_oid,
            "frame_id": sampled_item["frame_id"],
            "sampled_index": sampled_index,
            "timestamp": sampled_item["timestamp"],
            "is_classroom": cls["is_classroom"],
            "classroom_confidence": round(cls["confidence"], 6),
            "class_label": cls["label"],
            "persons": [],
            "actions": [],
            "objects": [],
            "scene_graph": [],
            "behavior_vector": [0.0] * len(BEHAVIOR_KEYS),
            "score": 0,
            "created_at": datetime.now(timezone.utc),
        }


        # DeepSORT already provides track IDs - no need for manual assignment
        # Just ensure track_ids are present in detections
        for person in det["persons"]:
            if person.get("track_id") is None:
                person["track_id"] = None

        graph_info = build_scene_graph(det["persons"], det["actions"], det["objects"])
        behavior_vector = build_behavior_vector(graph_info["scene_graph"])

        frame_data["persons"] = det["persons"]
        frame_data["actions"] = det["actions"]
        frame_data["objects"] = det["objects"]
        frame_data["scene_graph"] = graph_info["scene_graph"]
        frame_data["behavior_vector"] = behavior_vector
        frame_data["score"] = frame_information_score(frame_data)

        for p in det["persons"]:
                person_docs.append(
                    {
                        "_id": ObjectId(),
                        "video_id": video_oid,
                        "frame_id": sampled_item["frame_id"],
                        "track_id": p.get("track_id"),
                        "role": p.get("class", "student"),
                        "bbox": p["bbox"],
                        "confidence": p["confidence"],
                        "created_at": datetime.now(timezone.utc),
                    }
                )

        for a in det["actions"]:
                action_docs.append(
                    {
                        "_id": ObjectId(),
                        "video_id": video_oid,
                        "frame_id": sampled_item["frame_id"],
                        "activity_name": normalize_action(a.get("class", "unknown")),
                        "bbox": a["bbox"],
                        "confidence": a["confidence"],
                        "created_at": datetime.now(timezone.utc),
                    }
                )

        for o in det["objects"]:
                object_docs.append(
                    {
                        "_id": ObjectId(),
                        "video_id": video_oid,
                        "frame_id": sampled_item["frame_id"],
                        "object_name": o.get("class", "unknown"),
                        "bbox": o["bbox"],
                        "confidence": o["confidence"],
                        "created_at": datetime.now(timezone.utc),
                    }
                )

        processed_frames.append(frame_data)

    if processed_frames:
        frame_col.insert_many(processed_frames)

    if person_docs:
        person_col.insert_many(person_docs)
    if action_docs:
        activity_col.insert_many(action_docs)
    if object_docs:
        object_col.insert_many(object_docs)

    classroom_frames = [f for f in processed_frames if f["is_classroom"]]
    if not classroom_frames:
        video_col.update_one(
            {"_id": video_oid},
            {
                "$set": {
                    "status": "error",
                    "error_message": "Không có frame lớp học hợp lệ sau khi filtering",
                }
            },
        )
        return {
            "success": False,
            "message": "Không có frame lớp học hợp lệ",
            "stats": {
                "sampled_frames": len(sampled),
                "classroom_frames": 0,
                "segments": 0,
            },
        }

    segments_idx = temporal_segment(classroom_frames, threshold=COSINE_THRESHOLD)
    keyframe_indices = select_keyframe_indices(classroom_frames, segments_idx)

    segment_docs = []
    segment_runtime_data: Dict[str, Dict[str, Any]] = {}
    segment_captions = []
    keyframe_frame_ids = {
        classroom_frames[idx]["frame_id"]
        for idx in keyframe_indices
    }

    for seg_no, frame_indices in enumerate(segments_idx):
        start_frame = classroom_frames[frame_indices[0]]
        end_frame = classroom_frames[frame_indices[-1]]
        key_idx = keyframe_indices[seg_no]
        keyframe = classroom_frames[key_idx]

        segment_frames = [classroom_frames[i] for i in frame_indices]
        segment_scene_graph = aggregate_segment_scene_graph(segment_frames)
        segment_persons = [p for f in segment_frames for p in f.get("persons", [])]
        segment_activities = [a for f in segment_frames for a in f.get("actions", [])]
        segment_objects = [o for f in segment_frames for o in f.get("objects", [])]

        segment_doc = {
            "_id": ObjectId(),
            "video_id": video_oid,
            "segment_index": seg_no,
            "start_frame": start_frame["frame_id"],
            "end_frame": end_frame["frame_id"],
            "start_time": round(float(start_frame["timestamp"]), 3),
            "end_time": round(float(end_frame["timestamp"]), 3),
            "frame_ids": [classroom_frames[i]["frame_id"] for i in frame_indices],
            "keyframe": keyframe["frame_id"],
            "keyframe_sampled_index": keyframe["sampled_index"],
            "keyframe_time": round(float(keyframe["timestamp"]), 3),
            "keyframe_scene_graph": keyframe.get("scene_graph", []),
            "segment_scene_graph": segment_scene_graph,
            # Caption will be generated from Neo4j graph after Mongo->Neo4j sync.
            "caption": "",
            "created_at": datetime.now(timezone.utc),
        }
        segment_docs.append(segment_doc)
        segment_runtime_data[str(segment_doc["_id"])] = {
            "persons": segment_persons,
            "activities": segment_activities,
            "objects": segment_objects,
            "scene_graph": segment_scene_graph,
        }


    for frame_data in classroom_frames:
        frame_col.update_one(
            {"_id": frame_data["_id"]},
            {"$set": {"is_keyframe": frame_data["frame_id"] in keyframe_frame_ids}},
        )

    if segment_docs:
        segment_col.insert_many(segment_docs)

    # Sync this processed video from MongoDB to Neo4j before generating captions.
    try:
        neo4j_sync_result = sync_video_to_neo4j(video_id_str)
        print(f"🔗 Neo4j video sync successful before captioning: {neo4j_sync_result}")
    except Exception as sync_error:
        print(f"❌ Neo4j video sync failed before captioning: {sync_error}")
        return {
            "success": False,
            "message": "Neo4j sync failed before caption generation",
            "stats": {
                "sampled_frames": len(sampled),
                "classroom_frames": len(classroom_frames),
                "segments": len(segment_docs),
            },
        }

    if generate_video_caption_from_neo4j_graph is None:
        return {
            "success": False,
            "message": "Neo4j video caption generator is unavailable",
            "stats": {
                "sampled_frames": len(sampled),
                "classroom_frames": len(classroom_frames),
                "segments": len(segment_docs),
            },
        }

    generated_caption_result = generate_video_caption_from_neo4j_graph(
        mongo_db=db,
        video_doc={"_id": video_oid},
    )
    if not generated_caption_result.get("success"):
        return {
            "success": False,
            "message": generated_caption_result.get("message") or "Failed to generate video caption from Neo4j",
            "stats": {
                "sampled_frames": len(sampled),
                "classroom_frames": len(classroom_frames),
                "segments": len(segment_docs),
            },
        }

    merged_caption = generated_caption_result.get("caption", "")
    segment_captions = generated_caption_result.get("segment_captions", []) or []
    segments_need_regeneration: List[Dict[str, Any]] = []

    # Update each segment with generated caption and validation metrics.
    ordered_segments = sorted(segment_docs, key=lambda seg: int(seg.get("segment_index", 0)))
    for idx, seg_doc in enumerate(ordered_segments):
        caption_text = segment_captions[idx] if idx < len(segment_captions) else ""
        runtime_data = segment_runtime_data.get(str(seg_doc["_id"]), {})
        segment_validation = validate_caption_with_video_data(caption_text, runtime_data)
        needs_segment_regeneration = (
            (not segment_validation["is_valid"])
            or (segment_validation.get("confidence", 0) < CAPTION_REGEN_THRESHOLD)
        )
        if needs_segment_regeneration:
            segments_need_regeneration.append(
                {
                    "segment_id": str(seg_doc["_id"]),
                    "segment_index": int(seg_doc.get("segment_index", 0)),
                    "confidence": int(segment_validation.get("confidence", 0)),
                    "reason": segment_validation.get("reason", "low_confidence_or_kg_mismatch"),
                }
            )

        segment_update = {
            "caption": caption_text,
            "caption_validation": {
                "confidence": segment_validation["confidence"],
                "is_valid": segment_validation["is_valid"],
                "matched_actions": segment_validation["matched_actions"],
                "missing_actions": segment_validation["missing_actions"],
                "matched_objects": segment_validation["matched_objects"],
                "missing_objects": segment_validation["missing_objects"],
                "omitted_actions": segment_validation.get("omitted_actions", []),
                "omitted_objects": segment_validation.get("omitted_objects", []),
                "precision_score": segment_validation.get("precision_score", segment_validation["confidence"]),
                "recall_score": segment_validation.get("recall_score", segment_validation["confidence"]),
                "reason": segment_validation["reason"],
            },
            "caption_confidence": segment_validation["confidence"],
            "confidence_score": segment_validation["confidence"],
            "caption_is_reliable": segment_validation["is_valid"],
            "needs_regeneration": needs_segment_regeneration,
            "regeneration_status": "pending" if needs_segment_regeneration else "not_required",
            "regeneration_reason": segment_validation["reason"] if needs_segment_regeneration else "",
            "regeneration_trigger": "kg_validation" if needs_segment_regeneration else "",
        }

        segment_col.update_one({"_id": seg_doc["_id"]}, {"$set": segment_update})
        seg_doc.update(segment_update)

    # Calculate average validation scores from segments
    segment_confidences = [seg.get("caption_confidence", 0) for seg in segment_docs]
    avg_confidence = int(round(sum(segment_confidences) / len(segment_confidences))) if segment_confidences else 0
    
    # Aggregate all matched/missing actions and objects across segments
    all_matched_actions = []
    all_missing_actions = []
    all_omitted_actions = []
    all_matched_objects = []
    all_missing_objects = []
    all_omitted_objects = []
    
    for seg in segment_docs:
        seg_val = seg.get("caption_validation", {})
        all_matched_actions.extend(seg_val.get("matched_actions", []))
        all_missing_actions.extend(seg_val.get("missing_actions", []))
        all_omitted_actions.extend(seg_val.get("omitted_actions", []))
        all_matched_objects.extend(seg_val.get("matched_objects", []))
        all_missing_objects.extend(seg_val.get("missing_objects", []))
        all_omitted_objects.extend(seg_val.get("omitted_objects", []))
    
    # Deduplicate and sort
    all_matched_actions = sorted(list(set(all_matched_actions)))
    all_missing_actions = sorted(list(set(all_missing_actions)))
    all_omitted_actions = sorted(list(set(all_omitted_actions)))
    all_matched_objects = sorted(list(set(all_matched_objects)))
    all_missing_objects = sorted(list(set(all_missing_objects)))
    all_omitted_objects = sorted(list(set(all_omitted_objects)))
    needs_video_regeneration = (avg_confidence < CAPTION_REGEN_THRESHOLD) or (len(segments_need_regeneration) > 0)

    caption_update = {
        "segment_captions": segment_captions,
        "caption": merged_caption,
        "caption_validation": {
            "confidence": avg_confidence,
            "is_valid": avg_confidence >= 70,
            "matched_actions": all_matched_actions,
            "missing_actions": all_missing_actions,
            "matched_objects": all_matched_objects,
            "missing_objects": all_missing_objects,
            "omitted_actions": all_omitted_actions,
            "omitted_objects": all_omitted_objects,
            "avg_segment_precision": int(round(sum([seg.get("caption_validation", {}).get("precision_score", 0) for seg in segment_docs]) / len(segment_docs))) if segment_docs else 0,
            "avg_segment_recall": int(round(sum([seg.get("caption_validation", {}).get("recall_score", 0) for seg in segment_docs]) / len(segment_docs))) if segment_docs else 0,
            "segment_count": len(segment_docs),
            "reason": "Aggregated validation from " + str(len(segment_docs)) + " segments",
        },
        "caption_confidence": avg_confidence,
        "confidence_score": avg_confidence,
        "caption_is_reliable": avg_confidence >= 70,
        "needs_regeneration": needs_video_regeneration,
        "regeneration_status": "pending" if needs_video_regeneration else "not_required",
        "regeneration_reason": "low_confidence_or_segment_mismatch" if needs_video_regeneration else "",
        "regeneration_trigger": "kg_validation" if needs_video_regeneration else "",
        "segments_need_regeneration": segments_need_regeneration,
    }

    caption_doc = caption_col.find_one(
        {"video_id": video_oid, "caption_scope": "video"},
        sort=[("created_at", -1)],
    )
    if caption_doc:
        caption_col.update_one({"_id": caption_doc["_id"]}, {"$set": caption_update})
    else:
        caption_col.insert_one(
            {
                "_id": ObjectId(),
                "video_id": video_oid,
                "caption_scope": "video",
                "caption_source": "generated_from_neo4j_video_graph_rule_based",
                "created_at": datetime.now(timezone.utc),
                **caption_update,
            }
        )

    video_col.update_one(
        {"_id": video_oid},
        {
            "$set": {
                "caption_regeneration_required": needs_video_regeneration,
                "caption_regeneration_reason": "low_confidence_or_segment_mismatch" if needs_video_regeneration else "",
                "caption_review_required": needs_video_regeneration,
                "caption_confidence": avg_confidence,
                "caption_is_reliable": avg_confidence >= CAPTION_REGEN_THRESHOLD,
            }
        },
    )

    # Re-sync to persist updated segment captions and validation-linked caption fields to Neo4j.
    try:
        neo4j_sync_result = sync_video_to_neo4j(video_id_str)
        print(f"🔁 Neo4j video re-sync successful after caption generation: {neo4j_sync_result}")
    except Exception as sync_error:
        print(f"⚠️ Neo4j video re-sync after caption generation failed: {sync_error}")

    # NOTE:
    # Do not mark status="done" here. The Node.js parent process
    # sets final done/error status based on Python exit code.

    return {
        "success": True,
        "message": "Video processed successfully",
        "stats": {
            "sampled_frames": len(sampled),
            "classroom_frames": len(classroom_frames),
            "segments": len(segment_docs),
            "keyframes": len(keyframe_indices),
        },
        "segment_captions": segment_captions,
        "video_caption": merged_caption,
    }


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "message": "Usage: python process_video.py <video_path> <video_id>"}, ensure_ascii=False))
        sys.exit(1)

    video_path_arg = sys.argv[1]
    video_id_arg = sys.argv[2]

    try:
        output = process_video(video_path_arg, video_id_arg)
        print(json.dumps(output, ensure_ascii=False))
        sys.exit(0 if output.get("success") else 1)
    except Exception as e:
        try:
            if ObjectId.is_valid(video_id_arg):
                video_col.update_one(
                    {"_id": ObjectId(video_id_arg)},
                    {
                        "$set": {
                            "status": "error",
                            "error_message": str(e),
                            "processed_at": datetime.now(timezone.utc),
                        }
                    },
                )
        except Exception:
            pass

        print(json.dumps({"success": False, "message": str(e)}, ensure_ascii=False))
        sys.exit(1)
