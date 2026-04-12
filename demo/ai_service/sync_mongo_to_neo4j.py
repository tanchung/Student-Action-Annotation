import csv
import os
import re
from typing import Dict, List, Optional

from bson import ObjectId
from dotenv import load_dotenv
from neo4j import GraphDatabase
from pymongo import MongoClient

load_dotenv()

# ============================================================
# CONFIG
# ============================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASS = os.getenv("NEO4J_PASS") or os.getenv("NEO4J_PASSWORD", "12345678")

MONGO_URI = os.getenv("MONGODB_URI", "mongodb://127.0.0.1:27017/classroom_kg")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "classroom_kg")
CONDITIONAL_RELATIONSHIP_STATS_PATH = os.path.join(
    BASE_DIR,
    "conditional_relationship_stats.csv",
)

ACTION_OBJECT_RULES = {
    "reading": {"book", "notebook", "paper"},
    "writing": {"notebook", "paper", "pen"},
    "using_phone": {"phone", "mobile phone", "cell phone", "smartphone", "mobile"},
}

ACTION_PERSON_MIN_INTERSECTION_RATIO = 0.03
ACTION_PERSON_MAX_DISTANCE_RATIO = 1.25
OBJECT_PERSON_MAX_DISTANCE_RATIO = 2.0
RELATIONSHIP_ACTION_WEIGHT = 10.0
RELATIONSHIP_NO_INTERACTION_WEIGHT = 1.0
INTRANSITIVE_ACTIONS = {"hand-raising", "sleep", "listening", "raise_head", "turn_head"}


class ClassroomGraphSync:
    def __init__(self):
        self.driver = GraphDatabase.driver(
            NEO4J_URI,
            auth=(NEO4J_USER, NEO4J_PASS)
        )

        self.mongo_client = MongoClient(MONGO_URI)
        self.db_mongo = self.mongo_client[MONGO_DB_NAME]
        self.relationship_stats = self._load_conditional_relationship_stats()

    def close(self):
        self.driver.close()
        self.mongo_client.close()

    # ============================================================
    # INIT
    # ============================================================

    def ensure_schema(self):
        with self.driver.session() as session:
            session.run("MERGE (:RootImage)")
            session.run("MERGE (:RootVideo)")

            constraints = [
                "CREATE CONSTRAINT IF NOT EXISTS FOR (n:Image) REQUIRE n.mongo_id IS UNIQUE",
                "CREATE CONSTRAINT IF NOT EXISTS FOR (n:Video) REQUIRE n.mongo_id IS UNIQUE",
                "CREATE CONSTRAINT IF NOT EXISTS FOR (n:Segment) REQUIRE n.mongo_id IS UNIQUE",
                "CREATE CONSTRAINT IF NOT EXISTS FOR (n:Person) REQUIRE n.mongo_id IS UNIQUE",
                "CREATE CONSTRAINT IF NOT EXISTS FOR (n:EntityObject) REQUIRE n.mongo_id IS UNIQUE",
                "CREATE CONSTRAINT IF NOT EXISTS FOR (n:Activity) REQUIRE n.mongo_id IS UNIQUE",
                "CREATE CONSTRAINT IF NOT EXISTS FOR (n:Caption) REQUIRE n.mongo_id IS UNIQUE",
                "CREATE CONSTRAINT IF NOT EXISTS FOR (n:CaptionSegment) REQUIRE n.uid IS UNIQUE"
            ]

            for query in constraints:
                session.run(query)

    def _clear_image_subgraph(self, session, image_id: str):
        for root_label, rel_type in [
            ("RootPerson", "MEMBER_OF"),
            ("RootEntityObject", "ITEM_OF"),
            ("RootActivity", "ACTION_OF"),
            ("RootCaption", "DESCRIPTION_OF"),
        ]:
            session.run(
                f"""
                MATCH (r:{root_label} {{uid: $uid}})
                OPTIONAL MATCH (n)-[:{rel_type}]->(r)
                WITH n WHERE n IS NOT NULL
                DETACH DELETE n
                """,
                uid=f"{self._root_prefix(root_label)}_{image_id}"
            )

    def _clear_video_subgraph(self, session, video_id: str):
        # Remove legacy wrong links where segment-local roots were attached directly to Video.
        session.run(
            """
            MATCH (v:Video {mongo_id: $vid})
            OPTIONAL MATCH (sr)-[:LOCAL_ROOT_OF]->(v)
            WHERE sr.uid STARTS WITH 'SRP_'
               OR sr.uid STARTS WITH 'SREO_'
               OR sr.uid STARTS WITH 'SRA_'
               OR sr.uid STARTS WITH 'SRCS_'
            WITH COLLECT(DISTINCT sr) AS wrong_roots
            FOREACH (x IN wrong_roots | DETACH DELETE x)
            """,
            vid=video_id,
        )

        session.run(
            """
            MATCH (v:Video {mongo_id: $vid})
            OPTIONAL MATCH (rs:RootSegment)-[:LOCAL_ROOT_OF]->(v)
            OPTIONAL MATCH (s:Segment)-[:SEGMENT_OF]->(rs)
            OPTIONAL MATCH (sr)-[:LOCAL_ROOT_OF]->(s)
            OPTIONAL MATCH (n)-[:MEMBER_OF|ITEM_OF|ACTION_OF|DESCRIPTION_OF]->(sr)
            OPTIONAL MATCH (legacy_cs:CaptionSegment)-[:DESCRIPTION_OF]->(s)
            WITH COLLECT(DISTINCT n) AS data_nodes,
                 COLLECT(DISTINCT legacy_cs) AS legacy_caption_nodes,
                 COLLECT(DISTINCT sr) AS segment_roots,
                 COLLECT(DISTINCT s) AS segments
            FOREACH (x IN data_nodes | DETACH DELETE x)
            FOREACH (x IN legacy_caption_nodes | DETACH DELETE x)
            FOREACH (x IN segment_roots | DETACH DELETE x)
            FOREACH (x IN segments | DETACH DELETE x)
            """,
            vid=video_id,
        )

        session.run(
            """
            MATCH (v:Video {mongo_id: $vid})
            OPTIONAL MATCH (c:Caption)-[:DESCRIPTION_OF]->(v)
            WITH c WHERE c IS NOT NULL
            DETACH DELETE c
            """,
            vid=video_id,
        )

    @staticmethod
    def _root_prefix(root_label: str) -> str:
        return {
            "RootPerson": "RP",
            "RootEntityObject": "REO",
            "RootActivity": "RA",
            "RootCaption": "RC",
        }[root_label]

    @staticmethod
    def _intersection_area(bbox1: Optional[List[float]], bbox2: Optional[List[float]]) -> float:
        if not bbox1 or not bbox2:
            return 0.0

        x1, y1, w1, h1 = bbox1
        x2, y2, w2, h2 = bbox2
        left = max(float(x1), float(x2))
        top = max(float(y1), float(y2))
        right = min(float(x1 + w1), float(x2 + w2))
        bottom = min(float(y1 + h1), float(y2 + h2))
        return max(0.0, right - left) * max(0.0, bottom - top)

    @staticmethod
    def _bbox_area(bbox: Optional[List[float]]) -> float:
        if not bbox:
            return 0.0
        return max(0.0, float(bbox[2])) * max(0.0, float(bbox[3]))

    @staticmethod
    def _intersection_ratio(subject_bbox: Optional[List[float]], candidate_bbox: Optional[List[float]]) -> float:
        subject_area = max(1.0, ClassroomGraphSync._bbox_area(subject_bbox))
        return ClassroomGraphSync._intersection_area(subject_bbox, candidate_bbox) / subject_area

    @staticmethod
    def _normalized_center_distance(person_bbox: Optional[List[float]], target_bbox: Optional[List[float]]) -> float:
        if not person_bbox or not target_bbox:
            return float("inf")

        person_cx = float(person_bbox[0]) + float(person_bbox[2]) / 2.0
        person_cy = float(person_bbox[1]) + float(person_bbox[3]) / 2.0
        target_cx = float(target_bbox[0]) + float(target_bbox[2]) / 2.0
        target_cy = float(target_bbox[1]) + float(target_bbox[3]) / 2.0
        center_dist = ((target_cx - person_cx) ** 2 + (target_cy - person_cy) ** 2) ** 0.5
        person_scale = max(float(person_bbox[2]), float(person_bbox[3]), 1.0)
        return center_dist / person_scale

    @staticmethod
    def _normalize_object_label(name: Optional[str]) -> str:
        raw = (name or "").strip().lower().replace("_", " ").replace("-", " ")
        return re.sub(r"\s+", " ", raw)

    @staticmethod
    def _normalize_relationship_label(relationship: Optional[str]) -> str:
        raw = (relationship or "").strip().lower().replace("-", "_")
        return re.sub(r"\s+", "_", raw)

    @staticmethod
    def _distance_bucket(distance_ratio: Optional[float]) -> Optional[float]:
        if distance_ratio is None:
            return None
        try:
            return round(max(0.0, float(distance_ratio)), 1)
        except (TypeError, ValueError):
            return None

    def _load_conditional_relationship_stats(self) -> Dict[str, Dict[str, Dict[float, Dict[str, int]]]]:
        stats: Dict[str, Dict[str, Dict[float, Dict[str, int]]]] = {}

        if not os.path.exists(CONDITIONAL_RELATIONSHIP_STATS_PATH):
            return stats

        try:
            with open(CONDITIONAL_RELATIONSHIP_STATS_PATH, "r", encoding="utf-8", newline="") as handle:
                reader = csv.DictReader(handle)
                for row in reader:
                    person = self._normalize_object_label(row.get("person"))
                    object_name = self._normalize_object_label(row.get("object"))
                    relationship = self._normalize_relationship_label(row.get("relationship"))
                    try:
                        distance_bucket = round(float(row.get("distance_bbox", 0.0)), 1)
                    except (TypeError, ValueError):
                        continue

                    try:
                        quantity = int(float(row.get("quantity", 0)))
                    except (TypeError, ValueError):
                        continue

                    stats.setdefault(person, {}).setdefault(object_name, {}).setdefault(distance_bucket, {})[
                        relationship
                    ] = quantity
        except OSError:
            return {}

        return stats

    def _predict_relationship_from_stats(
        self,
        person_role: Optional[str],
        object_name: Optional[str],
        distance_ratio: Optional[float],
    ) -> Optional[Dict[str, object]]:
        person_key = self._normalize_object_label(person_role)
        object_key = self._normalize_object_label(object_name)
        distance_bucket = self._distance_bucket(distance_ratio)

        if not person_key or not object_key or distance_bucket is None:
            return None

        relationship_table = (
            self.relationship_stats
            .get(person_key, {})
            .get(object_key, {})
            .get(distance_bucket)
        )
        if not relationship_table:
            return None

        weighted_scores: Dict[str, float] = {}
        weighted_total = 0.0

        for relationship, quantity in relationship_table.items():
            if relationship == "no_interaction":
                weight = RELATIONSHIP_NO_INTERACTION_WEIGHT
            else:
                weight = RELATIONSHIP_ACTION_WEIGHT

            weighted_score = float(quantity) * weight
            weighted_scores[relationship] = weighted_score
            weighted_total += weighted_score

        if weighted_total <= 0:
            return None

        best_relationship, best_weighted_score = max(
            weighted_scores.items(),
            key=lambda item: (item[1], 0 if item[0] == "no_interaction" else 1),
        )

        best_raw_quantity = relationship_table.get(best_relationship, 0)

        return {
            "relationship": best_relationship,
            "quantity": best_raw_quantity,
            "weighted_quantity": best_weighted_score,
            "probability": best_weighted_score / weighted_total,
            "raw_probability": best_raw_quantity / max(sum(relationship_table.values()), 1),
            "distance_bucket": distance_bucket,
            "total": sum(relationship_table.values()),
            "weighted_total": weighted_total,
        }

    def _select_relationship_object(
        self,
        activity_name: Optional[str],
        person_doc: Dict,
        objects: List[Dict],
        preferred_frame_id: Optional[int] = None,
        preferred_object_id: Optional[str] = None,
        allowed_labels: Optional[set] = None,
    ) -> Optional[Dict]:
        person_bbox = person_doc.get("bbox")
        person_role = person_doc.get("role")

        if not objects:
            return None

        candidate_objects = list(objects)
        if allowed_labels:
            normalized_allowed = {self._normalize_object_label(label) for label in allowed_labels}
            candidate_objects = [
                obj for obj in candidate_objects
                if self._normalize_object_label(obj.get("object_name")) in normalized_allowed
            ]

        if preferred_object_id:
            preferred_object = next(
                (obj for obj in candidate_objects if str(obj.get("_id")) == str(preferred_object_id)),
                None,
            )
            if preferred_object:
                candidate_objects = [
                    preferred_object,
                    *[
                        obj for obj in candidate_objects
                        if str(obj.get("_id")) != str(preferred_object_id)
                    ],
                ]

        if preferred_frame_id is not None:
            same_frame_objects = [
                obj for obj in candidate_objects if obj.get("frame_id") == preferred_frame_id
            ]
            if same_frame_objects:
                candidate_objects = same_frame_objects + [
                    obj for obj in candidate_objects if obj not in same_frame_objects
                ]

        ranked_candidates: List[Dict[str, object]] = []
        stats_seen = False

        for obj in candidate_objects:
            bbox = obj.get("bbox")
            if not bbox:
                continue

            distance_ratio = self._normalized_center_distance(person_bbox, bbox)
            prediction = self._predict_relationship_from_stats(
                person_role,
                obj.get("object_name"),
                distance_ratio,
            )
            if not prediction:
                continue

            stats_seen = True
            if prediction["relationship"] == "no_interaction":
                continue

            ranked_candidates.append(
                {
                    "object": obj,
                    "relationship": prediction["relationship"],
                    "probability": prediction["probability"],
                    "raw_probability": prediction["raw_probability"],
                    "quantity": prediction["quantity"],
                    "weighted_quantity": prediction["weighted_quantity"],
                    "distance": distance_ratio,
                    "source": "conditional_probability",
                    "activity_name": activity_name,
                }
            )

        if ranked_candidates:
            ranked_candidates.sort(
                key=lambda item: (
                    -float(item["probability"]),
                    float(item["distance"]),
                    -float(item["weighted_quantity"]),
                )
            )
            return ranked_candidates[0]

        return None

    @staticmethod
    def _activity_to_relation(activity_name: Optional[str]) -> str:
        raw = (activity_name or "").strip().lower()
        compact = re.sub(r"[^a-z0-9]", "", raw)

        if "reading" in raw or compact.startswith("reading"):
            return "READING"
        if "writing" in raw or compact.startswith("writing"):
            return "HOLDING"
        if "using_phone" in raw or "phone" in compact:
            return "HOLDING"
        if "sleep" in raw or compact.startswith("sleep"):
            return "SLEEPING"
        if "hand-raising" in raw or "hand_raising" in raw or "handraising" in compact:
            return "HAND_RAISING"
        if "raise_head" in raw or compact.startswith("raisehead"):
            return "LISTENING"
        if "upright" in raw or "listening" in raw:
            return "LISTENING"
        if "turn_head" in raw or compact.startswith("turnhead"):
            return "TURNING_HEAD"
        if "discuss" in raw:
            return "DISCUSSING"

        return "INTERACTS_WITH"

    @staticmethod
    def _normalize_activity_name(activity_name: Optional[str]) -> str:
        raw = (activity_name or "").strip().lower().replace(" ", "_")
        compact = re.sub(r"[^a-z0-9]", "", raw)

        if compact.startswith("reading"):
            return "reading"
        if compact.startswith("writing"):
            return "writing"
        if "usingphone" in compact or "phone" in compact:
            return "using_phone"
        if "handraising" in compact:
            return "hand-raising"
        if compact.startswith("raisehead"):
            return "raise_head"
        if compact.startswith("turnhead"):
            return "turn_head"
        if compact.startswith("sleep"):
            return "sleep"

        return raw

    def _activity_allowed_object_labels(self, activity_name: Optional[str]) -> set:
        normalized = self._normalize_activity_name(activity_name)
        return ACTION_OBJECT_RULES.get(normalized, set())

    def _is_intransitive_action(self, activity_name: Optional[str]) -> bool:
        return self._normalize_activity_name(activity_name) in INTRANSITIVE_ACTIONS

    def _best_object_for_activity(
        self,
        activity_bbox: Optional[List[float]],
        person_bbox: Optional[List[float]],
        allowed_labels: set,
        objects: List[Dict],
        preferred_frame_id: Optional[int] = None,
    ) -> Optional[Dict]:
        if not objects:
            return None

        filtered_objects = list(objects)
        if allowed_labels:
            normalized_allowed = {self._normalize_object_label(label) for label in allowed_labels}
            filtered_objects = [
                obj for obj in filtered_objects
                if self._normalize_object_label(obj.get("object_name")) in normalized_allowed
            ]
        if not filtered_objects:
            return None

        # Prefer same-frame objects when frame_id is available.
        if preferred_frame_id is not None:
            same_frame_objects = [
                obj for obj in filtered_objects if obj.get("frame_id") == preferred_frame_id
            ]
            if same_frame_objects:
                filtered_objects = same_frame_objects

        best_by_overlap = None
        best_overlap = 0.0
        for obj in filtered_objects:
            overlap = self._intersection_area(activity_bbox, obj.get("bbox"))
            if overlap > best_overlap:
                best_overlap = overlap
                best_by_overlap = obj

        if best_by_overlap and best_overlap > 0:
            return best_by_overlap

        if person_bbox:
            best_obj = None
            best_dist = float("inf")
            for obj in filtered_objects:
                bbox = obj.get("bbox")
                if not bbox:
                    continue

                # Reject objects that are too far from the matched person.
                norm_dist = self._normalized_center_distance(person_bbox, bbox)
                if norm_dist > OBJECT_PERSON_MAX_DISTANCE_RATIO:
                    continue

                dist = norm_dist
                if dist < best_dist:
                    best_dist = dist
                    best_obj = obj
            return best_obj

        # No usable person bbox -> avoid arbitrary object assignment.
        return None

    def sync_image(self, image_doc) -> Dict[str, int]:
        image_id = str(image_doc["_id"])
        counters = {
            "persons": 0,
            "objects": 0,
            "activities": 0,
            "captions": 0,
        }

        with self.driver.session() as session:
            self._upsert_image_and_roots(session, image_doc)
            self._clear_image_subgraph(session, image_id)

            persons = list(self.db_mongo.person.find({"image_id": image_doc["_id"]}))
            objects = list(self.db_mongo.entity_object.find({"image_id": image_doc["_id"]}))
            activities = list(self.db_mongo.activity.find({"image_id": image_doc["_id"]}))
            captions = list(self.db_mongo.caption.find({"image_id": image_doc["_id"]}))
            person_by_id = {str(person["_id"]): person for person in persons}

            for person in persons:
                session.run(
                    """
                    MATCH (rp:RootPerson {uid: 'RP_' + $iid})

                    MERGE (n:Person {mongo_id: $pid})
                    SET n.track_id = $track_id,
                        n.role = $role

                    MERGE (n)-[:MEMBER_OF]->(rp)
                    """,
                    iid=image_id,
                    pid=str(person["_id"]),
                    track_id=person.get("track_id"),
                    role=person.get("role")
                )
                counters["persons"] += 1

            for obj in objects:
                session.run(
                    """
                    MATCH (reo:RootEntityObject {uid: 'REO_' + $iid})

                    MERGE (n:EntityObject {mongo_id: $oid})
                    SET n.object_name = $name,
                        n.category = $category

                    MERGE (n)-[:ITEM_OF]->(reo)
                    """,
                    iid=image_id,
                    oid=str(obj["_id"]),
                    name=obj.get("object_name"),
                    category=obj.get("category")
                )
                counters["objects"] += 1

            for activity in activities:
                person_id = activity.get("person_id")
                if not person_id:
                    continue

                person_doc = person_by_id.get(str(person_id))
                if not person_doc:
                    continue

                session.run(
                    """
                    MATCH (ra:RootActivity {uid: 'RA_' + $iid})

                    MERGE (n:Activity {mongo_id: $aid})
                    SET n.activity_name = $activity_name,
                        n.category = $category

                    MERGE (n)-[:ACTION_OF]->(ra)

                    WITH n
                    MATCH (p:Person {mongo_id: $pid})
                    MERGE (p)-[:HAS_ACTIVITY]->(n)
                    """,
                    iid=image_id,
                    aid=str(activity["_id"]),
                    pid=str(person_id),
                    activity_name=activity.get("activity_name"),
                    category=activity.get("category"),
                )
                counters["activities"] += 1

                # Intransitive actions are body-state actions: only keep Person -> HAS_ACTIVITY.
                if self._is_intransitive_action(activity.get("activity_name")):
                    continue

                selected_object = self._select_relationship_object(
                    activity_name=activity.get("activity_name"),
                    person_doc=person_doc,
                    objects=objects,
                    preferred_object_id=str(activity.get("target_object_id")) if activity.get("target_object_id") else None,
                    allowed_labels=self._activity_allowed_object_labels(activity.get("activity_name")),
                )
                if selected_object and selected_object.get("object") and selected_object.get("relationship"):
                    relation_type = str(selected_object["relationship"]).upper()
                    if relation_type != "NO_INTERACTION":
                        session.run(
                            f"""
                            MATCH (p:Person {{mongo_id: $pid}})
                            MATCH (o:EntityObject {{mongo_id: $oid}})
                            MERGE (p)-[r:{relation_type}]->(o)
                            SET r.source = $source,
                                r.activity_name = $activity_name,
                                r.activity_id = $aid,
                                r.probability = $probability,
                                r.distance_bbox = $distance
                            """,
                            pid=str(person_id),
                            oid=str(selected_object["object"]["_id"]),
                            aid=str(activity["_id"]),
                            activity_name=activity.get("activity_name"),
                            source=selected_object.get("source"),
                            probability=selected_object.get("probability"),
                            distance=selected_object.get("distance"),
                        )

            for caption in captions:
                session.run(
                    """
                    MATCH (rc:RootCaption {uid: 'RC_' + $iid})

                    MERGE (n:Caption {mongo_id: $cid})
                    SET n.text = $text,
                        n.model_used = $model_used,
                        n.caption_source = $caption_source

                    MERGE (n)-[:DESCRIPTION_OF]->(rc)
                    """,
                    iid=image_id,
                    cid=str(caption["_id"]),
                    text=caption.get("caption"),
                    model_used=caption.get("model_used"),
                    caption_source=caption.get("caption_source"),
                )
                counters["captions"] += 1

        return counters

    def sync_video(self, video_doc) -> Dict[str, int]:
        video_id = str(video_doc["_id"])
        counters = {
            "segments": 0,
            "persons": 0,
            "objects": 0,
            "activities": 0,
            "segment_captions": 0,
            "video_captions": 0,
        }

        with self.driver.session() as session:
            self._upsert_video_and_roots(session, video_doc)
            self._clear_video_subgraph(session, video_id)

            segments = list(
                self.db_mongo.segment.find({"video_id": video_doc["_id"]}).sort("segment_index", 1)
            )

            for segment in segments:
                segment_id = str(segment["_id"])
                keyframe_id = segment.get("keyframe")
                # Keyframe-only sync: each segment is represented by its keyframe snapshot.
                if keyframe_id is None:
                    continue

                session.run(
                    """
                    MATCH (v:Video {mongo_id: $vid})
                    MATCH (rs:RootSegment {uid: 'RS_' + $vid})
                    MERGE (s:Segment {mongo_id: $sid})
                    SET s.segment_index = $segment_index,
                        s.start_time = $start_time,
                        s.end_time = $end_time,
                        s.keyframe = $keyframe
                    MERGE (s)-[:SEGMENT_OF]->(rs)

                    MERGE (srp:RootPerson {uid: 'SRP_' + $sid})
                    MERGE (sreo:RootEntityObject {uid: 'SREO_' + $sid})
                    MERGE (sra:RootActivity {uid: 'SRA_' + $sid})
                    MERGE (srcs:RootCaptionSegment {uid: 'SRCS_' + $sid})

                    MERGE (srp)-[:LOCAL_ROOT_OF]->(s)
                    MERGE (sreo)-[:LOCAL_ROOT_OF]->(s)
                    MERGE (sra)-[:LOCAL_ROOT_OF]->(s)
                    MERGE (srcs)-[:LOCAL_ROOT_OF]->(s)
                    """,
                    vid=video_id,
                    sid=segment_id,
                    segment_index=segment.get("segment_index"),
                    start_time=segment.get("start_time"),
                    end_time=segment.get("end_time"),
                    keyframe=keyframe_id,
                )
                counters["segments"] += 1

                session.run(
                    """
                    MATCH (s:Segment {mongo_id: $sid})
                    MATCH (srcs:RootCaptionSegment {uid: 'SRCS_' + $sid})
                    MERGE (cs:CaptionSegment {uid: $uid})
                    SET cs.text = $text,
                        cs.segment_index = $segment_index,
                        cs.caption_source = 'segment_doc'
                    MERGE (cs)-[:DESCRIPTION_OF]->(srcs)
                    """,
                    sid=segment_id,
                    uid=f"CS_{segment_id}",
                    text=segment.get("caption", ""),
                    segment_index=segment.get("segment_index"),
                )
                counters["segment_captions"] += 1

                persons = list(
                    self.db_mongo.person.find(
                        {"video_id": video_doc["_id"], "frame_id": keyframe_id}
                    )
                )
                person_by_id = {str(person["_id"]): person for person in persons}
                activities = list(
                    self.db_mongo.activity.find(
                        {"video_id": video_doc["_id"], "frame_id": keyframe_id}
                    )
                )
                objects = list(
                    self.db_mongo.entity_object.find(
                        {"video_id": video_doc["_id"], "frame_id": keyframe_id}
                    )
                )

                for person in persons:
                    pid = str(person["_id"])
                    session.run(
                        """
                        MATCH (srp:RootPerson {uid: 'SRP_' + $sid})
                        MERGE (p:Person {mongo_id: $pid})
                        SET p.track_id = $track_id,
                            p.role = $role
                        MERGE (p)-[:MEMBER_OF]->(srp)
                        """,
                        sid=segment_id,
                        pid=pid,
                        track_id=person.get("track_id"),
                        role=person.get("role"),
                    )
                    counters["persons"] += 1

                for obj in objects:
                    oid = str(obj["_id"])
                    session.run(
                        """
                        MATCH (sreo:RootEntityObject {uid: 'SREO_' + $sid})
                        MERGE (o:EntityObject {mongo_id: $oid})
                        SET o.object_name = $name,
                            o.category = $category
                        MERGE (o)-[:ITEM_OF]->(sreo)
                        """,
                        sid=segment_id,
                        oid=oid,
                        name=obj.get("object_name"),
                        category=obj.get("category"),
                    )
                    counters["objects"] += 1

                # Match each activity to the most plausible person.
                activity_candidates = []
                for activity in activities:
                    best_person_id: Optional[str] = None
                    best_person_bbox: Optional[List[float]] = None
                    best_overlap_ratio = 0.0
                    best_norm_dist = float("inf")
                    activity_bbox = activity.get("bbox")

                    activity_frame_id = activity.get("frame_id")
                    same_frame_persons = [
                        person for person in persons if person.get("frame_id") == activity_frame_id
                    ]
                    candidate_persons = same_frame_persons or persons

                    for person in candidate_persons:
                        overlap_ratio = self._intersection_ratio(activity_bbox, person.get("bbox"))
                        norm_dist = self._normalized_center_distance(person.get("bbox"), activity_bbox)
                        if overlap_ratio > best_overlap_ratio or (
                            overlap_ratio == best_overlap_ratio and norm_dist < best_norm_dist
                        ):
                            best_overlap_ratio = overlap_ratio
                            best_norm_dist = norm_dist
                            best_person_id = str(person["_id"])
                            best_person_bbox = person.get("bbox")

                    if not best_person_id:
                        continue
                    if (
                        best_overlap_ratio < ACTION_PERSON_MIN_INTERSECTION_RATIO
                        and best_norm_dist > ACTION_PERSON_MAX_DISTANCE_RATIO
                    ):
                        continue

                    activity_candidates.append(
                        {
                            "activity": activity,
                            "person_id": best_person_id,
                            "person_bbox": best_person_bbox,
                            "overlap_ratio": best_overlap_ratio,
                            "norm_dist": best_norm_dist,
                            "confidence": float(activity.get("confidence", 0.0) or 0.0),
                        }
                    )

                # Enforce one activity per person in this segment.
                best_candidate_by_person: Dict[str, Dict] = {}
                for cand in activity_candidates:
                    person_id = cand["person_id"]
                    prev = best_candidate_by_person.get(person_id)
                    if prev is None:
                        best_candidate_by_person[person_id] = cand
                        continue

                    if cand["confidence"] > prev["confidence"]:
                        best_candidate_by_person[person_id] = cand
                        continue

                    if cand["confidence"] == prev["confidence"]:
                        if cand["overlap_ratio"] > prev["overlap_ratio"] or (
                            cand["overlap_ratio"] == prev["overlap_ratio"] and cand["norm_dist"] < prev["norm_dist"]
                        ):
                            best_candidate_by_person[person_id] = cand

                selected_candidates = list(best_candidate_by_person.values())

                for cand in selected_candidates:
                    activity = cand["activity"]
                    aid = str(activity["_id"])
                    best_person_id = cand["person_id"]
                    best_person_bbox = cand["person_bbox"]
                    best_person_doc = person_by_id.get(best_person_id)
                    activity_bbox = activity.get("bbox")
                    activity_frame_id = activity.get("frame_id")

                    session.run(
                        """
                        MATCH (sra:RootActivity {uid: 'SRA_' + $sid})
                        MERGE (a:Activity {mongo_id: $aid})
                        SET a.activity_name = $activity_name,
                            a.category = $category
                        MERGE (a)-[:ACTION_OF]->(sra)
                        """,
                        sid=segment_id,
                        aid=aid,
                        activity_name=activity.get("activity_name"),
                        category=activity.get("category") or "student_behavior",
                    )
                    counters["activities"] += 1

                    session.run(
                        """
                        MATCH (p:Person {mongo_id: $pid})
                        MATCH (a:Activity {mongo_id: $aid})
                        MERGE (p)-[:HAS_ACTIVITY]->(a)
                        """,
                        pid=best_person_id,
                        aid=aid,
                    )

                    # Intransitive actions should not create Person -> Object relationships.
                    if self._is_intransitive_action(activity.get("activity_name")):
                        continue

                    selected_object = self._select_relationship_object(
                        activity_name=activity.get("activity_name"),
                        person_doc=best_person_doc or {"bbox": best_person_bbox, "role": None},
                        objects=objects,
                        preferred_frame_id=activity_frame_id,
                        allowed_labels=self._activity_allowed_object_labels(
                            activity.get("activity_name")
                        ),
                    )
                    if not selected_object or not selected_object.get("object"):
                        continue

                    relation_type = str(selected_object["relationship"]).upper()
                    if relation_type == "NO_INTERACTION":
                        continue

                    session.run(
                        f"""
                        MATCH (p:Person {{mongo_id: $pid}})
                        MATCH (o:EntityObject {{mongo_id: $oid}})
                        MERGE (p)-[r:{relation_type}]->(o)
                        SET r.source = $source,
                            r.activity_name = $activity_name,
                            r.activity_id = $aid,
                            r.probability = $probability,
                            r.distance_bbox = $distance
                        """,
                        pid=best_person_id,
                        oid=str(selected_object["object"]["_id"]),
                        aid=aid,
                        activity_name=activity.get("activity_name"),
                        source=selected_object.get("source"),
                        probability=selected_object.get("probability"),
                        distance=selected_object.get("distance"),
                    )

            video_captions = list(
                self.db_mongo.caption.find(
                    {"video_id": video_doc["_id"], "caption_scope": "video"}
                )
            )
            for caption in video_captions:
                session.run(
                    """
                    MATCH (v:Video {mongo_id: $vid})
                    MERGE (c:Caption {mongo_id: $cid})
                    SET c.text = $text,
                        c.model_used = $model_used,
                        c.caption_source = $caption_source,
                        c.caption_scope = 'video'
                    MERGE (c)-[:DESCRIPTION_OF]->(v)
                    """,
                    vid=video_id,
                    cid=str(caption["_id"]),
                    text=caption.get("caption"),
                    model_used=caption.get("model_used"),
                    caption_source=caption.get("caption_source"),
                )
                counters["video_captions"] += 1

        return counters

    def _upsert_image_and_roots(self, session, image_doc):
        image_id = str(image_doc["_id"])

        session.run(
            """
            MATCH (g:RootImage)

            MERGE (i:Image {mongo_id: $mid})
            SET i.name = $name,
                i.minio_url = $url,
                i.status = $status,
                i.processed_at = $processed_at

            MERGE (i)-[:PART_OF]->(g)

            MERGE (rp:RootPerson {uid: 'RP_'+$mid})
            MERGE (reo:RootEntityObject {uid: 'REO_'+$mid})
            MERGE (ra:RootActivity {uid: 'RA_'+$mid})
            MERGE (rc:RootCaption {uid: 'RC_'+$mid})

            MERGE (rp)-[:LOCAL_ROOT_OF]->(i)
            MERGE (reo)-[:LOCAL_ROOT_OF]->(i)
            MERGE (ra)-[:LOCAL_ROOT_OF]->(i)
            MERGE (rc)-[:LOCAL_ROOT_OF]->(i)
            """,
            mid=image_id,
            name=image_doc.get("image_name"),
            url=image_doc.get("minio_url"),
            status=image_doc.get("status"),
            processed_at=image_doc.get("processed_at"),
        )

    def _upsert_video_and_roots(self, session, video_doc):
        video_id = str(video_doc["_id"])

        session.run(
            """
            MATCH (rv:RootVideo)

            MERGE (v:Video {mongo_id: $mid})
            SET v.name = $name,
                v.minio_url = $url,
                v.status = $status,
                v.processed_at = $processed_at

            MERGE (v)-[:PART_OF]->(rv)

            MERGE (rs:RootSegment {uid: 'RS_' + $mid})
            MERGE (rs)-[:LOCAL_ROOT_OF]->(v)
            """,
            mid=video_id,
            name=video_doc.get("video_name") or video_doc.get("name"),
            url=video_doc.get("minio_url"),
            status=video_doc.get("status"),
            processed_at=video_doc.get("processed_at"),
        )


def sync_image_to_neo4j(image_id: str) -> Dict[str, int]:
    syncer = ClassroomGraphSync()
    try:
        syncer.ensure_schema()
        image_doc = syncer.db_mongo.image.find_one({"_id": ObjectId(image_id)})
        if not image_doc:
            raise ValueError(f"Image not found in MongoDB: {image_id}")

        counters = syncer.sync_image(image_doc)
        return counters
    finally:
        syncer.close()


def sync_done_images_to_neo4j(limit: Optional[int] = None) -> Dict[str, int]:
    syncer = ClassroomGraphSync()
    try:
        syncer.ensure_schema()

        query = {"status": "done"}
        cursor = syncer.db_mongo.image.find(query).sort("processed_at", 1)
        if limit and limit > 0:
            cursor = cursor.limit(limit)

        total = {
            "images": 0,
            "persons": 0,
            "objects": 0,
            "activities": 0,
            "captions": 0,
        }

        for image_doc in cursor:
            counters = syncer.sync_image(image_doc)
            total["images"] += 1
            for key, value in counters.items():
                total[key] += value

        return total
    finally:
        syncer.close()


def sync_video_to_neo4j(video_id: str) -> Dict[str, int]:
    syncer = ClassroomGraphSync()
    try:
        syncer.ensure_schema()
        video_doc = syncer.db_mongo.video.find_one({"_id": ObjectId(video_id)})
        if not video_doc:
            raise ValueError(f"Video not found in MongoDB: {video_id}")

        return syncer.sync_video(video_doc)
    finally:
        syncer.close()


def sync_done_videos_to_neo4j(limit: Optional[int] = None) -> Dict[str, int]:
    syncer = ClassroomGraphSync()
    try:
        syncer.ensure_schema()
        query = {"status": "done"}
        cursor = syncer.db_mongo.video.find(query).sort("processed_at", 1)
        if limit and limit > 0:
            cursor = cursor.limit(limit)

        total = {
            "videos": 0,
            "segments": 0,
            "persons": 0,
            "objects": 0,
            "activities": 0,
            "segment_captions": 0,
            "video_captions": 0,
        }

        for video_doc in cursor:
            counters = syncer.sync_video(video_doc)
            total["videos"] += 1
            for key, value in counters.items():
                total[key] += value

        return total
    finally:
        syncer.close()


if __name__ == "__main__":
    import sys

    args = sys.argv[1:]
    target_type = "image"
    target_id = None

    if len(args) == 1:
        if args[0].lower() in {"image", "video"}:
            target_type = args[0].lower()
        else:
            target_type = "image"
            target_id = args[0]
    elif len(args) >= 2:
        target_type = args[0].lower()
        target_id = args[1]

    if target_type.lower() == "video":
        if target_id:
            print(f"🔄 Syncing video {target_id} from MongoDB to Neo4j...")
            result = sync_video_to_neo4j(target_id)
            print(f"✅ Synced video {target_id}: {result}")
        else:
            print("🔄 Syncing processed videos from MongoDB to Neo4j...")
            result = sync_done_videos_to_neo4j()
            print(f"✅ Video sync done: {result}")
    else:
        if target_id:
            print(f"🔄 Syncing image {target_id} from MongoDB to Neo4j...")
            result = sync_image_to_neo4j(target_id)
            print(f"✅ Synced image {target_id}: {result}")
        else:
            print("🔄 Syncing processed images from MongoDB to Neo4j...")
            result = sync_done_images_to_neo4j()
            print(f"✅ Image sync done: {result}")
