import os
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from dotenv import load_dotenv
from neo4j import GraphDatabase
import requests

from classroom_caption_engine import (
    generate_classroom_caption_from_graph,
    analyze_graph_for_caption,
)

load_dotenv()
logger = logging.getLogger(__name__)


POSITIVE_ACTIONS = {"hand-raising", "raise_head", "upright", "writing", "reading", "discuss"}
NEGATIVE_ACTIONS = {"turn_head", "using_phone", "sleep"}

ACTION_LABEL_MAP = {
    "hand-raising": "giơ tay phát biểu",
    "raise_head": "chú ý nghe giảng",
    "upright": "ngồi học nghiêm túc",
    "reading": "đọc tài liệu",
    "writing": "ghi chép bài",
    "discuss": "thảo luận bài học",
    "turn_head": "mất tập trung do nhìn sang hướng khác",
    "using_phone": "mất tập trung do sử dụng điện thoại",
    "sleep": "không tập trung do buồn ngủ hoặc ngủ gật",
}

POSITIVE_OPENING_MAP = {
    "raise_head": "chú ý nghe giảng",
    "upright": "ngồi học khá nghiêm túc",
    "reading": "đọc tài liệu",
    "writing": "ghi chép bài",
    "hand-raising": "chủ động phát biểu",
    "discuss": "thảo luận bài học",
}

NEGATIVE_OPENING_MAP = {
    "turn_head": "mất tập trung do nhìn sang hướng khác",
    "using_phone": "mất tập trung do sử dụng điện thoại",
    "sleep": "mất tập trung do buồn ngủ hoặc ngủ gật",
}

CONNECTOR_OPTIONS_MAP = {
    "very_focused": ["tuy vậy", "dù vậy", "nhưng vẫn còn", "mặc dù vậy"],
    "focused": ["tuy nhiên", "dù vậy", "nhưng vẫn còn", "mặc dù vậy"],
    "mixed": ["trong khi đó", "đồng thời", "tuy nhiên", "mặt khác"],
    "distracted": ["dù vậy", "nhưng", "tuy nhiên", "mặt khác"],
    "very_distracted": ["dù vậy", "song", "tuy nhiên", "mặt khác"],
    "neutral_unknown": ["dù vậy", "tuy nhiên", "đồng thời"],
}

ACTION_NORMALIZATION_MAP = {
    "hand-raising": "giơ tay phát biểu",
    "raise_head": "chú ý nghe giảng",
    "upright": "ngồi học nghiêm túc",
    "writing": "ghi chép bài",
    "reading": "đọc tài liệu",
    "discuss": "thảo luận",
    "using_phone": "sử dụng điện thoại",
    "sleep": "buồn ngủ hoặc ngủ gật",
    "turn_head": "nhìn sang hướng khác",
    "resting_head_on_hand": "chống cằm, thiếu tập trung",
}

ACTION_GROUP_MAP = {
    "writing": "học tập qua ghi chép",
    "reading": "học tập qua đọc tài liệu",
    "raise_head": "theo dõi bài giảng",
    "hand-raising": "tham gia phát biểu",
    "upright": "duy trì tư thế học tập nghiêm túc",
    "discuss": "trao đổi học tập",
}


def _normalize_activity_name(name: Optional[str]) -> str:
    normalized = (name or "unknown").strip().lower().replace(" ", "_")
    return {
        "usingphone": "using_phone",
        "using_phone": "using_phone",
        "hand_raising": "hand-raising",
        "raisehead": "raise_head",
        "raise_head": "raise_head",
        "turnhead": "turn_head",
        "turn_head": "turn_head",
    }.get(normalized, normalized)


def _join_phrases(phrases: List[str]) -> str:
    phrases = [p for p in phrases if p]
    if not phrases:
        return ""
    if len(phrases) == 1:
        return phrases[0]
    if len(phrases) == 2:
        return f"{phrases[0]} và {phrases[1]}"
    return ", ".join(phrases[:-1]) + f" và {phrases[-1]}"


def _get_ranked_action_phrases(
    counts: Dict[str, int],
    mapping: Dict[str, str],
    allowed: set,
    max_items: Optional[int] = None,
) -> List[str]:
    ranked = sorted(
        [(action, count) for action, count in counts.items() if action in allowed],
        key=lambda item: (-item[1], item[0]),
    )
    phrases: List[str] = []
    selected = ranked if max_items is None else ranked[:max_items]
    for action_name, _ in selected:
        phrase = mapping.get(action_name)
        if phrase and phrase not in phrases:
            phrases.append(phrase)
    return phrases


def _build_focus_assessment(activity_counts: Dict[str, int]) -> Dict[str, Any]:
    positive_total = sum(v for k, v in activity_counts.items() if k in POSITIVE_ACTIONS)
    negative_total = sum(v for k, v in activity_counts.items() if k in NEGATIVE_ACTIONS)
    total_labeled = positive_total + negative_total

    positive_phrase = _join_phrases(_get_ranked_action_phrases(activity_counts, POSITIVE_OPENING_MAP, POSITIVE_ACTIONS))
    negative_phrase = _join_phrases(_get_ranked_action_phrases(activity_counts, NEGATIVE_OPENING_MAP, NEGATIVE_ACTIONS))

    positive_percent = round((positive_total / total_labeled * 100) if total_labeled else 0)
    negative_percent = round((negative_total / total_labeled * 100) if total_labeled else 0)

    if total_labeled == 0:
        return {
            "focus_band": "neutral_unknown",
            "opening_hint": "Học sinh trong lớp chưa thể hiện rõ mức độ tập trung",
            "connector_hint": "dù vậy",
            "connector_options": CONNECTOR_OPTIONS_MAP["neutral_unknown"],
            "dominant_side": "unknown",
            "positive_phrase": positive_phrase,
            "negative_phrase": negative_phrase,
            "positive_percent": positive_percent,
            "negative_percent": negative_percent,
            "positive_total": positive_total,
            "negative_total": negative_total,
        }

    positive_ratio = positive_total / total_labeled
    negative_ratio = negative_total / total_labeled

    if positive_ratio >= 0.85:
        opening_hint = f"Học sinh trong lớp đang rất tập trung, chủ yếu thể hiện qua việc {positive_phrase}" if positive_phrase else "Học sinh trong lớp đang rất tập trung"
        return {
            "focus_band": "very_focused",
            "opening_hint": opening_hint,
            "connector_hint": "tuy nhiên",
            "connector_options": CONNECTOR_OPTIONS_MAP["very_focused"],
            "dominant_side": "positive",
            "positive_phrase": positive_phrase,
            "negative_phrase": negative_phrase,
            "positive_percent": positive_percent,
            "negative_percent": negative_percent,
            "positive_total": positive_total,
            "negative_total": negative_total,
        }

    if positive_ratio >= 0.60:
        opening_hint = f"Học sinh trong lớp đang khá tập trung, thể hiện qua việc {positive_phrase}" if positive_phrase else "Học sinh trong lớp đang tập trung"
        return {
            "focus_band": "focused",
            "opening_hint": opening_hint,
            "connector_hint": "tuy nhiên",
            "connector_options": CONNECTOR_OPTIONS_MAP["focused"],
            "dominant_side": "positive",
            "positive_phrase": positive_phrase,
            "negative_phrase": negative_phrase,
            "positive_percent": positive_percent,
            "negative_percent": negative_percent,
            "positive_total": positive_total,
            "negative_total": negative_total,
        }

    if negative_ratio >= 0.85:
        opening_hint = f"Học sinh trong lớp hiện đang rất mất tập trung, chủ yếu do {negative_phrase}" if negative_phrase else "Học sinh trong lớp hiện đang rất mất tập trung"
        return {
            "focus_band": "very_distracted",
            "opening_hint": opening_hint,
            "connector_hint": "dù vậy",
            "connector_options": CONNECTOR_OPTIONS_MAP["very_distracted"],
            "dominant_side": "negative",
            "positive_phrase": positive_phrase,
            "negative_phrase": negative_phrase,
            "positive_percent": positive_percent,
            "negative_percent": negative_percent,
            "positive_total": positive_total,
            "negative_total": negative_total,
        }

    if negative_ratio >= 0.60:
        opening_hint = f"Học sinh trong lớp hiện đang khá mất tập trung, chủ yếu do {negative_phrase}" if negative_phrase else "Học sinh trong lớp hiện đang khá mất tập trung"
        return {
            "focus_band": "distracted",
            "opening_hint": opening_hint,
            "connector_hint": "dù vậy",
            "connector_options": CONNECTOR_OPTIONS_MAP["distracted"],
            "dominant_side": "negative",
            "positive_phrase": positive_phrase,
            "negative_phrase": negative_phrase,
            "positive_percent": positive_percent,
            "negative_percent": negative_percent,
            "positive_total": positive_total,
            "negative_total": negative_total,
        }

    if positive_phrase and negative_phrase:
        opening_hint = f"Học sinh trong lớp vừa có biểu hiện {positive_phrase}, vừa có dấu hiệu {negative_phrase}"
    else:
        opening_hint = "Học sinh trong lớp có cả biểu hiện tập trung lẫn mất tập trung"
    return {
        "focus_band": "mixed",
        "opening_hint": opening_hint,
        "connector_hint": "tuy nhiên",
        "connector_options": CONNECTOR_OPTIONS_MAP["mixed"],
        "dominant_side": "mixed",
        "positive_phrase": positive_phrase,
        "negative_phrase": negative_phrase,
        "positive_percent": positive_percent,
        "negative_percent": negative_percent,
        "positive_total": positive_total,
        "negative_total": negative_total,
    }


def _unique_actions_by_priority(
    activity_counts: Dict[str, int],
    action_set: set,
    max_items: Optional[int] = None,
) -> List[str]:
    ranked = sorted(
        [(name, count) for name, count in activity_counts.items() if count > 0 and name in action_set],
        key=lambda item: (-item[1], item[0]),
    )
    selected = ranked if max_items is None else ranked[:max_items]
    return [name for name, _ in selected]


def _build_action_count_sentence(actions: List[str], activity_counts: Dict[str, int], phrase_map: Dict[str, str], prefix: str) -> str:
    if not actions:
        return ""
    parts: List[str] = []
    for action in actions:
        count = activity_counts.get(action, 0)
        phrase = phrase_map.get(action, action)
        if count > 0:
            parts.append(f"{count} học sinh {phrase}")
    if not parts:
        return ""
    return f"{prefix} {_join_phrases(parts)}."


def _reduce_repetition(text: str) -> str:
    if not text:
        return text
    normalized = " ".join(text.split())
    normalized = normalized.replace("học sinh học sinh", "các em")
    normalized = normalized.replace("Học sinh học sinh", "Các em")
    normalized = normalized.replace("Học sinh trong lớp học sinh", "Học sinh trong lớp")
    return normalized


def _compress_caption(structured_caption: str, max_sentences: int = 3) -> str:
    if not structured_caption:
        return structured_caption
    sentences = [segment.strip() for segment in structured_caption.split(".") if segment.strip()]
    if not sentences:
        return structured_caption
    kept = sentences[:max_sentences]
    return ". ".join(kept) + "."


def _smart_connector(negative_percent: int) -> Optional[str]:
    if negative_percent <= 0:
        return None
    if negative_percent < 20:
        return "tuy vậy"
    if negative_percent < 40:
        return "tuy nhiên"
    return "mặt khác"


def _build_grouped_positive_phrases(activity_counts: Dict[str, int]) -> List[str]:
    phrases: List[str] = []
    used_actions = set()

    writing_count = activity_counts.get("writing", 0)
    reading_count = activity_counts.get("reading", 0)
    if writing_count > 0 and reading_count > 0:
        phrases.append("học tập qua ghi chép và đọc tài liệu")
        used_actions.update({"writing", "reading"})

    raise_head_count = activity_counts.get("raise_head", 0)
    upright_count = activity_counts.get("upright", 0)
    if raise_head_count > 0 and upright_count > 0:
        phrases.append("chú ý nghe giảng")
        used_actions.update({"raise_head", "upright"})

    ranked = _unique_actions_by_priority(activity_counts, POSITIVE_ACTIONS)
    for action in ranked:
        if action in used_actions:
            continue
        phrases.append(ACTION_GROUP_MAP.get(action, ACTION_NORMALIZATION_MAP.get(action, action)))

    return phrases


def _build_structured_caption_overview(graph_json: Dict[str, Any]) -> str:
    stats = graph_json.get("stats", {})
    activity_counts = graph_json.get("activity_distribution", {})
    persons = graph_json.get("nodes", {}).get("persons", [])

    student_count = len([p for p in persons if str(p.get("role", "")).lower() == "student"])
    total_persons = stats.get("persons", 0)
    total_students = student_count if student_count > 0 else total_persons

    if total_students == 0:
        return "Không phát hiện học sinh trong ảnh, nên chưa có dữ liệu để mô tả mức độ tham gia học tập."

    if not activity_counts:
        return "Có học sinh trong lớp nhưng chưa xác định được hành vi học tập nổi bật từ scene graph."

    focused_total = sum(v for k, v in activity_counts.items() if k in POSITIVE_ACTIONS)
    distracted_total = sum(v for k, v in activity_counts.items() if k in NEGATIVE_ACTIONS)
    total_behavior = focused_total + distracted_total

    if total_behavior == 0:
        return "Học sinh xuất hiện trong lớp nhưng các hành vi quan sát được chưa đủ để kết luận mức độ tham gia học tập."

    focus_ratio = focused_total / total_behavior
    distracted_ratio = distracted_total / total_behavior

    focused_actions = _unique_actions_by_priority(activity_counts, POSITIVE_ACTIONS)
    distracted_actions = _unique_actions_by_priority(activity_counts, NEGATIVE_ACTIONS)

    focused_phrases = _build_grouped_positive_phrases(activity_counts)
    distracted_phrases = [ACTION_NORMALIZATION_MAP.get(action, action) for action in distracted_actions]

    context_sentence = "Bối cảnh là một lớp học đang diễn ra hoạt động học tập."

    if focus_ratio > 0.7:
        engagement_sentence = "Phần lớn học sinh tham gia tích cực vào bài học."
    elif focus_ratio < 0.4:
        engagement_sentence = "Nhiều học sinh có dấu hiệu mất tập trung trong giờ học."
    else:
        engagement_sentence = "Lớp học ghi nhận đồng thời hành vi học tập tích cực và hành vi mất tập trung."

    focused_count_sentence = _build_action_count_sentence(
        actions=focused_actions,
        activity_counts=activity_counts,
        phrase_map=ACTION_NORMALIZATION_MAP,
        prefix="Trong đó có",
    )
    distracted_count_sentence = _build_action_count_sentence(
        actions=distracted_actions,
        activity_counts=activity_counts,
        phrase_map=ACTION_NORMALIZATION_MAP,
        prefix="Các dấu hiệu mất tập trung gồm",
    )

    details: List[str] = []
    if focused_count_sentence:
        details.append(focused_count_sentence)
    elif focused_phrases:
        details.append(f"Các biểu hiện học tập nổi bật gồm {_join_phrases(focused_phrases)}.")

    if distracted_total == 0:
        details.append("Không quan sát thấy hành vi mất tập trung rõ ràng trong lớp.")
    elif distracted_count_sentence:
        details.append(distracted_count_sentence)
    elif distracted_phrases:
        details.append(f"Một số học sinh mất tập trung do {_join_phrases(distracted_phrases)}.")

    structured = f"{context_sentence} {engagement_sentence} {' '.join(details)}"
    return _reduce_repetition(structured)


def _build_scene_text(graph_json: Dict[str, Any]) -> str:
    stats = graph_json.get("stats", {})
    activity_counts = graph_json.get("activity_distribution", {})
    environment = graph_json.get("image", {}).get("status") or "classroom"

    fa = _build_focus_assessment(activity_counts)
    structured_caption = _build_structured_caption_overview(graph_json)

    # Dòng mô tả từng hành vi
    sorted_actions = sorted(activity_counts.items(), key=lambda item: item[1], reverse=True)
    positive_lines = [
        f"- {ACTION_LABEL_MAP.get(name, name)}: {count} học sinh"
        for name, count in sorted_actions if count > 0 and name in POSITIVE_ACTIONS
    ]
    negative_lines = [
        f"- {ACTION_LABEL_MAP.get(name, name)}: {count} học sinh"
        for name, count in sorted_actions if count > 0 and name in NEGATIVE_ACTIONS
    ]

    connector_hint = _smart_connector(fa["negative_percent"]) or "none"
    scene_text = (
        f"Environment: {environment}\n"
        f"Total students/persons: {stats.get('persons', 0)}\n"
        f"Total detected activities: {stats.get('activities', 0)}\n"
        f"Positive behavior instances: {fa['positive_total']}\n"
        f"Negative behavior instances: {fa['negative_total']}\n"
        f"Positive percentage: {fa['positive_percent']}%\n"
        f"Negative percentage: {fa['negative_percent']}%\n"
        f"Focus band: {fa['focus_band']}\n"
        f"Recommended opening: {fa['opening_hint']}\n"
        f"Recommended connector: {connector_hint}\n"
        f"Allowed connectors: {', '.join(fa['connector_options'])}\n"
        f"Dominant positive phrase: {fa['positive_phrase'] or 'none'}\n"
        f"Dominant negative phrase: {fa['negative_phrase'] or 'none'}\n"
        f"Structured caption overview: {structured_caption}\n"
        "Positive behaviors:\n"
        f"{chr(10).join(positive_lines) if positive_lines else '- Không ghi nhận rõ hành vi tích cực'}\n"
        "Negative behaviors:\n"
        f"{chr(10).join(negative_lines) if negative_lines else '- Không quan sát thấy hành vi mất tập trung rõ ràng'}"
    )
    return scene_text


class Neo4jSceneGraphReader:
    def __init__(self):
        uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        user = os.getenv("NEO4J_USER", "neo4j")
        password = os.getenv("NEO4J_PASS") or os.getenv("NEO4J_PASSWORD", "12345678")
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self.driver.close()

    def fetch_graph(self, image_id: str) -> Optional[Dict[str, Any]]:
        with self.driver.session() as session:
            image_query = """
            MATCH (i:Image {mongo_id: $img_id})
            RETURN i.mongo_id AS mongo_id,
                   i.name AS image_name,
                   i.status AS status
            LIMIT 1
            """
            image_record = session.run(image_query, img_id=image_id).single()
            if not image_record:
                return None

            persons_query = """
            MATCH (i:Image {mongo_id: $img_id})
            MATCH (i)<-[:LOCAL_ROOT_OF]-(rp:RootPerson)
            OPTIONAL MATCH (p:Person)-[:MEMBER_OF]->(rp)
            RETURN DISTINCT p.mongo_id AS id,
                            p.track_id AS track_id,
                            p.role AS role
            """
            persons = []
            for record in session.run(persons_query, img_id=image_id):
                person_id = record.get("id")
                if not person_id:
                    continue
                persons.append(
                    {
                        "id": person_id,
                        "track_id": record.get("track_id"),
                        "role": record.get("role") or "student",
                    }
                )

            activities_query = """
            MATCH (i:Image {mongo_id: $img_id})
            MATCH (i)<-[:LOCAL_ROOT_OF]-(ra:RootActivity)
            OPTIONAL MATCH (a:Activity)-[:ACTION_OF]->(ra)
            OPTIONAL MATCH (p:Person)-[:HAS_ACTIVITY]->(a)
            RETURN DISTINCT a.mongo_id AS id,
                            a.activity_name AS name,
                            a.category AS category,
                            p.mongo_id AS person_id
            """
            activities = []
            for record in session.run(activities_query, img_id=image_id):
                activity_id = record.get("id")
                if not activity_id:
                    continue
                activities.append(
                    {
                        "id": activity_id,
                        "name": _normalize_activity_name(record.get("name")),
                        "category": record.get("category"),
                        "person_id": record.get("person_id"),
                    }
                )

            objects_query = """
            MATCH (i:Image {mongo_id: $img_id})
            MATCH (i)<-[:LOCAL_ROOT_OF]-(reo:RootEntityObject)
            OPTIONAL MATCH (o:EntityObject)-[:ITEM_OF]->(reo)
            RETURN DISTINCT o.mongo_id AS id,
                            o.object_name AS name,
                            o.category AS category
            """
            objects = []
            for record in session.run(objects_query, img_id=image_id):
                object_id = record.get("id")
                if not object_id:
                    continue
                objects.append(
                    {
                        "id": object_id,
                        "name": record.get("name") or "object",
                        "category": record.get("category") or "unknown",
                    }
                )

            edges = []
            for activity in activities:
                if activity.get("person_id"):
                    edges.append(
                        {
                            "source": activity["person_id"],
                            "target": activity["id"],
                            "type": "HAS_ACTIVITY",
                        }
                    )

            activity_counts: Dict[str, int] = {}
            for activity in activities:
                action_name = activity.get("name") or "unknown"
                activity_counts[action_name] = activity_counts.get(action_name, 0) + 1

            scene_text = _build_scene_text(
                {
                    "image": {
                        "mongo_id": image_record.get("mongo_id"),
                        "name": image_record.get("image_name"),
                        "status": image_record.get("status"),
                    },
                    "stats": {
                        "persons": len(persons),
                        "activities": len(activities),
                        "objects": len(objects),
                        "edges": len(edges),
                    },
                    "activity_distribution": activity_counts,
                }
            )

            graph_json = {
                "image": {
                    "mongo_id": image_record.get("mongo_id"),
                    "name": image_record.get("image_name"),
                    "status": image_record.get("status"),
                },
                "nodes": {
                    "persons": persons,
                    "activities": activities,
                    "objects": objects,
                },
                "edges": edges,
                "activity_distribution": activity_counts,
                "scene_text": scene_text,
                "stats": {
                    "persons": len(persons),
                    "activities": len(activities),
                    "objects": len(objects),
                    "edges": len(edges),
                },
            }
            return graph_json


def normalize_caption_subject(caption: str) -> str:
    """Đảm bảo caption mở đầu bằng 'Học sinh trong lớp' thay vì 'Lớp học' hoặc các biến thể khác."""
    if not caption:
        return caption
    replacements = [
        ("Lớp học đang ", "Học sinh trong lớp đang "),
        ("Lớp học có ", "Học sinh trong lớp có "),
        ("Lớp học này ", "Học sinh trong lớp "),
        ("Học sinh đang ", "Học sinh trong lớp đang "),
        ("Các học sinh đang ", "Học sinh trong lớp đang "),
        ("Các em học sinh ", "Học sinh trong lớp "),
    ]
    for old, new in replacements:
        if caption.startswith(old):
            caption = new + caption[len(old):]
            break
    return caption


def enforce_caption_consistency(caption: str, fa: Dict[str, Any]) -> str:
    """Kiểm tra Groq output không mâu thuẫn hoàn toàn với dữ liệu thực.
    Nếu Groq nói 'rất tập trung' nhưng dữ liệu là 'very_distracted', fallback về opening_hint."""
    if not caption:
        return caption
    focus_band = fa.get("focus_band", "neutral_unknown")
    dominant = fa.get("dominant_side", "unknown")
    opening_hint = fa.get("opening_hint", "")

    contradiction = False
    if dominant == "positive":
        if any(phrase in caption.lower() for phrase in ["rất mất tập trung", "hoàn toàn mất tập trung"]):
            contradiction = True
    if dominant == "negative":
        if any(phrase in caption.lower() for phrase in ["rất tập trung", "hoàn toàn tập trung"]):
            contradiction = True

    if contradiction:
        logger.warning("[enforce_caption_consistency] Phát hiện mâu thuẫn nội dung, dùng opening_hint làm fallback.")
        return opening_hint + "."

    return caption


def _rule_based_caption_from_neo4j_graph(graph_json: Dict[str, Any]) -> str:
    structured_caption = _build_structured_caption_overview(graph_json)
    if structured_caption:
        return structured_caption

    activity_counts = graph_json.get("activity_distribution", {})
    fa = _build_focus_assessment(activity_counts)

    if not activity_counts:
        return "Không xác định được hành vi rõ ràng trong ảnh này."

    focus_band = fa["focus_band"]
    positive_phrase = fa["positive_phrase"]
    negative_phrase = fa["negative_phrase"]

    if focus_band in {"very_focused", "focused"}:
        if negative_phrase:
            connector = fa["connector_hint"]
            return f"{fa['opening_hint']}, {connector} một số học sinh {negative_phrase}."
        return f"{fa['opening_hint']}."

    if focus_band in {"distracted", "very_distracted"}:
        if positive_phrase:
            connector = fa["connector_hint"]
            return f"{fa['opening_hint']}, {connector} vẫn có một số học sinh {positive_phrase}."
        return f"{fa['opening_hint']}."

    # mixed
    return f"{fa['opening_hint']}."


def _serialize_graph_facts(graph_json: Dict[str, Any], max_facts: int = 60) -> str:
    persons = graph_json.get("nodes", {}).get("persons", [])
    activities = graph_json.get("nodes", {}).get("activities", [])
    objects = graph_json.get("nodes", {}).get("objects", [])
    edges = graph_json.get("edges", [])

    facts: List[str] = []

    for person in persons:
        facts.append(
            f"Person(id={person.get('id')}, track_id={person.get('track_id')}, role={person.get('role')})"
        )
    for activity in activities:
        facts.append(
            f"Activity(id={activity.get('id')}, name={activity.get('name')}, category={activity.get('category')})"
        )
    for obj in objects:
        facts.append(
            f"EntityObject(id={obj.get('id')}, name={obj.get('name')}, category={obj.get('category')})"
        )

    for edge in edges:
        facts.append(f"{edge.get('source')} -[{edge.get('type')}]-> {edge.get('target')}")

    scene_text = graph_json.get("scene_text")
    if scene_text:
        facts.append("--- Scene Summary ---")
        facts.append(scene_text)

    return "\n".join(facts[:max_facts])


def _groq_generate_caption_from_graph(graph_json: Dict[str, Any], fallback_caption: str) -> str:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return fallback_caption

    scene_text = graph_json.get("scene_text") or _build_scene_text(graph_json)
    structured_caption = _build_structured_caption_overview(graph_json)
    structured_caption_for_llm = _compress_caption(_reduce_repetition(structured_caption), max_sentences=3)
    fa = _build_focus_assessment(graph_json.get("activity_distribution", {}))

    try:
        prompt = f"""
Bạn đang phân tích một cảnh lớp học cho hệ thống AI theo dõi hành vi học tập.

Scene data:
{scene_text}

Structured caption draft (rule-based):
{structured_caption_for_llm}

Focus band (must align with final caption):
{fa.get("focus_band", "neutral_unknown")}

Các hành vi có thể xuất hiện:
Using_phone, hand-raising, raise_head, reading, sleep, turn_head, upright, writing

Ý nghĩa trong bối cảnh lớp học:

Positive behaviours:
- hand-raising → tham gia phát biểu
- raise_head → chú ý nghe giảng
- upright → ngồi nghiêm túc
- writing → ghi chép bài
- reading → đọc tài liệu

Negative behaviours:
- turn_head → nhìn sang hướng khác / mất tập trung
- Using_phone → dùng điện thoại
- sleep → buồn ngủ / ngủ gật

Nhiệm vụ:
Viết **1 câu tiếng Việt tự nhiên** mô tả tình hình học tập của lớp.

QUY TẮC BẮT BUỘC

1. Chủ ngữ phải là học sinh
Ví dụ: "Học sinh trong lớp...", "Các học sinh...", "Nhiều học sinh..."

Không được viết kiểu:
"Lớp học đang..."

2. Câu phải dựa trên **Focus band và tỉ lệ hành vi** trong Scene data.

Mapping:
- very_focused → rất tập trung / chăm chú
- focused → đang tập trung / khá tập trung
- mixed → có cả biểu hiện tập trung lẫn mất tập trung
- distracted → khá mất tập trung
- very_distracted → rất mất tập trung

3. Quy tắc mô tả:

- Nếu positive > negative → mô tả tích cực trước.
- Nếu negative ≥ positive → mô tả mất tập trung trước.
- Nếu mixed → mô tả cân bằng, không phóng đại bên nào.

4. Khi có học sinh mất tập trung phải nêu **nguyên nhân bằng "do"**.

Ví dụ dạng:
"mất tập trung do nhìn sang hướng khác và sử dụng điện thoại"

5. Kết nối:

- Hoạt động học tập dùng **"và"**
- Nguyên nhân mất tập trung sau **"do"** cũng dùng **"và"**
- Ưu tiên tránh dùng từ **"hoặc"** nếu không cần thiết

6. Chỉ dùng các từ như
"đa số", "phần lớn", "hầu hết"
khi Focus band là **focused hoặc very_focused**

7. Câu phải phản ánh đúng hành vi:

- raise_head → chú ý nghe giảng
- writing → ghi chép bài
- reading → đọc tài liệu
- turn_head → nhìn sang hướng khác
- Using_phone → sử dụng điện thoại
- sleep → buồn ngủ hoặc ngủ gật
- hand-raising -> giơ tay phát biểu bài
- upright -> tập trung nghe giảng

8. Nếu không có hành vi tích cực hay tiêu cực thì chỉ có câu văn mô tả hành vi đúng với ảnh, không máy móc, mô tả thêm dữ liệu không có thật

9. Ưu tiên mô tả **hành vi học tập** thay vì chuyển động cơ thể.

10. Sử dụng linh hoạt các từ nối:
"tuy nhiên", "dù vậy", "mặc dù vậy", "trong khi đó", "song", "mặt khác"

11. Hạn chế nhắc số lượng học sinh hoặc đồ vật khi không cần thiết cho câu tự nhiên.

Nếu dữ liệu chưa đủ rõ, dùng câu fallback gần với: {fallback_caption}

Ưu tiên mềm:
- Ưu tiên diễn đạt nguyên nhân bằng "do"
- Ưu tiên bám sát focus band đã cho
- Ưu tiên câu ngắn gọn, tự nhiên, không lặp từ
"""

        groq_model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").split(",")[0].strip()
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": groq_model,
                "temperature": 0.2,
                "messages": [
                    {
                        "role": "system",
                        "content": "Bạn là trợ lý tạo caption tiếng Việt chính xác theo dữ liệu scene graph.",
                    },
                    {"role": "user", "content": prompt},
                ],
            },
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        text = ((data.get("choices") or [{}])[0].get("message", {}).get("content") or "").strip()
        return text or fallback_caption
    except Exception as error:
        print(f"⚠️ Groq generation skipped: {error}")
        return fallback_caption


def _groq_generate_segment_caption_from_graph(
    segment_graph_json: Dict[str, Any],
    fallback_caption: str,
    raw_caption: str,
    segment_index: int,
) -> str:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return fallback_caption

    scene_text = segment_graph_json.get("scene_text") or _build_scene_text(segment_graph_json)
    structured_caption = _build_structured_caption_overview(segment_graph_json)
    structured_caption_for_llm = _compress_caption(_reduce_repetition(structured_caption), max_sentences=2)
    fa = _build_focus_assessment(segment_graph_json.get("activity_distribution", {}))

    try:
        prompt = f"""
Bạn đang viết caption cho MỘT ĐOẠN (segment) trong video lớp học.

Segment index: {segment_index + 1}
Scene data:
{scene_text}

Structured draft cho segment (rule-based):
{structured_caption_for_llm}

Raw caption theo số lượng học sinh/hành vi:
{raw_caption}

Fallback caption:
{fallback_caption}

Focus band của segment:
{fa.get("focus_band", "neutral_unknown")}

YÊU CẦU ĐẦU RA:
1. Viết đúng 1 câu tiếng Việt tự nhiên.
2. Câu phải bắt đầu bằng: "Trong đoạn này, "
3. Chủ thể là học sinh trong lớp học.
4. Bám sát dữ liệu segment, không thêm chi tiết không có trong scene data.
5. Nếu có dấu hiệu mất tập trung, ưu tiên nêu nguyên nhân bằng "do".
6. Nếu có cả hai chiều hành vi thì dùng vế đối lập với "tuy nhiên" hoặc "đồng thời".
7. Nếu chỉ có một chiều hành vi thì không thêm vế đối lập.
8. Không liệt kê số lượng kiểu "X học sinh ..." ở caption cuối.
9. Giữ câu ngắn gọn, mạch lạc, không lặp từ.
10. Nếu dữ liệu mơ hồ, bám sát fallback caption.
"""

        groq_model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").split(",")[0].strip()
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": groq_model,
                "temperature": 0.25,
                "messages": [
                    {
                        "role": "system",
                        "content": "Bạn là trợ lý viết caption tiếng Việt cho từng segment video lớp học.",
                    },
                    {"role": "user", "content": prompt},
                ],
            },
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        text = ((data.get("choices") or [{}])[0].get("message", {}).get("content") or "").strip()
        return text or fallback_caption
    except Exception as error:
        print(f"⚠️ Groq segment generation skipped: {error}")
        return fallback_caption


def _groq_generate_video_overall_caption(
    segment_captions: List[str],
    timeline_fallback_caption: str,
) -> str:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return timeline_fallback_caption

    if not segment_captions:
        return timeline_fallback_caption

    compact_segments = "\n".join([f"- {caption}" for caption in segment_captions])
    try:
        prompt = f"""
Bạn đang viết caption TỔNG QUÁT cho một video lớp học dựa trên caption từng segment.

Danh sách caption segment:
{compact_segments}

Timeline fallback:
{timeline_fallback_caption}

YÊU CẦU ĐẦU RA:
1. Viết theo cấu trúc timeline theo mốc thời gian từng đoạn (giây/phút).
2. Mỗi đoạn dùng phong cách: "ở ... đến ..., học sinh ...".
3. Cuối cùng thêm câu tổng quát bắt đầu bằng "Tổng quát, ...".
4. Không bịa thêm hành vi ngoài dữ liệu segment.
5. Nếu dữ liệu chưa đủ rõ, bám sát timeline fallback.
"""

        groq_model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").split(",")[0].strip()
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": groq_model,
                "temperature": 0.3,
                "messages": [
                    {
                        "role": "system",
                        "content": "Bạn là trợ lý tổng hợp caption tổng quát video lớp học.",
                    },
                    {"role": "user", "content": prompt},
                ],
            },
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        text = ((data.get("choices") or [{}])[0].get("message", {}).get("content") or "").strip()
        return text or timeline_fallback_caption
    except Exception as error:
        print(f"⚠️ Groq overall video caption generation skipped: {error}")
        return timeline_fallback_caption


def generate_caption_from_neo4j_graph(mongo_db, image_doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate classroom image caption using new classroom caption engine.
    
    Pipeline: Neo4j Graph → Classify Actions → Raw Caption → OpenAI Refinement → Final Caption
    """
    image_oid = image_doc.get("_id")
    if not image_oid:
        return {"success": False, "message": "Missing image _id"}

    existing_caption = mongo_db["caption"].find_one({"$or": [{"image_id": image_oid}, {"image_id": str(image_oid)}]})
    if existing_caption:
        return {"success": False, "message": "Target image already has caption."}

    reader = Neo4jSceneGraphReader()
    try:
        graph_json = reader.fetch_graph(str(image_oid))
    finally:
        reader.close()

    if not graph_json:
        return {"success": False, "message": "Scene graph not found in Neo4j for target image."}

    # Trường hợp không phát hiện học sinh nào
    graph_stats = graph_json.get("stats", {})
    if graph_stats.get("persons", 0) == 0 and graph_stats.get("activities", 0) == 0:
        no_student_caption = "Lớp học đang trống và không có học sinh"
        caption_doc_ns = {
            "_id": ObjectId(),
            "image_id": image_oid,
            "caption": no_student_caption,
            "raw_caption": no_student_caption,
            "model_used": "classroom_caption_engine",
            "caption_source": "generated_from_neo4j_graph",
            "graph_stats": graph_stats,
            "created_at": datetime.now(timezone.utc),
        }
        mongo_db["caption"].insert_one(caption_doc_ns)
        mongo_db["image"].update_one(
            {"_id": image_oid},
            {
                "$set": {"caption_status": "generated"},
                "$unset": {
                    "caption_generated_at": "",
                    "caption_source": "",
                    "caption_confidence": "",
                    "caption_is_reliable": "",
                    "caption_validation": "",
                    "confidence_score": "",
                    "caption_similarity": "",
                },
            },
        )
        return {
            "success": True,
            "caption": no_student_caption,
            "raw_caption": no_student_caption,
            "fallback_caption": no_student_caption,
            "graph_stats": graph_stats,
        }

    # ========== NEW CLASSROOM CAPTION ENGINE ==========
    # Pipeline: Graph → Action Classification → Raw Structured Caption → OpenAI Refinement
    logger.info("📊 Starting classroom caption generation with new engine...")
    
    # Get caption analysis for debugging
    analysis = analyze_graph_for_caption(graph_json)
    logger.info(f"🔍 Classroom analysis: {analysis}")
    
    # Generate: raw_caption (structured), refined_caption (OpenAI), final_caption (best)
    raw_caption, refined_caption, final_caption = generate_classroom_caption_from_graph(graph_json)
    
    logger.info(f"✅ Caption generation complete:")
    logger.info(f"   Raw: {raw_caption}")
    if refined_caption:
        logger.info(f"   Refined: {refined_caption}")
    logger.info(f"   Final: {final_caption}")

    # Store caption document
    caption_doc = {
        "_id": ObjectId(),
        "image_id": image_oid,
        "caption": final_caption,
        "raw_caption": raw_caption,
        "refined_caption": refined_caption,  # Optional: for auditing
        "model_used": "classroom_caption_engine_openai",
        "caption_source": "generated_from_neo4j_graph",
        "graph_stats": graph_stats,
        "focus_analysis": analysis,  # Optional: for auditing
        "created_at": datetime.now(timezone.utc),
    }

    mongo_db["caption"].insert_one(caption_doc)

    mongo_db["image"].update_one(
        {"_id": image_oid},
        {
            "$set": {
                "caption_status": "generated",
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
        },
    )

    return {
        "success": True,
        "caption": final_caption,
        "raw_caption": raw_caption,
        "refined_caption": refined_caption,
        "fallback_caption": final_caption,
        "graph_stats": graph_stats,
        "focus_analysis": analysis,
    }


class Neo4jVideoGraphReader:
    def __init__(self):
        uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        user = os.getenv("NEO4J_USER", "neo4j")
        password = os.getenv("NEO4J_PASS") or os.getenv("NEO4J_PASSWORD", "12345678")
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self.driver.close()

    def fetch_video_graph(self, video_id: str) -> Optional[Dict[str, Any]]:
        with self.driver.session() as session:
            video_record = session.run(
                """
                MATCH (v:Video {mongo_id: $vid})
                RETURN v.mongo_id AS mongo_id,
                       v.name AS video_name,
                       v.status AS status
                LIMIT 1
                """,
                vid=video_id,
            ).single()
            if not video_record:
                return None

            rows = session.run(
                """
                MATCH (v:Video {mongo_id: $vid})
                OPTIONAL MATCH (rs:RootSegment)-[:LOCAL_ROOT_OF]->(v)
                OPTIONAL MATCH (s:Segment)-[:SEGMENT_OF]->(rs)
                OPTIONAL MATCH (srp:RootPerson)-[:LOCAL_ROOT_OF]->(s)
                OPTIONAL MATCH (p:Person)-[:MEMBER_OF]->(srp)
                OPTIONAL MATCH (sreo:RootEntityObject)-[:LOCAL_ROOT_OF]->(s)
                OPTIONAL MATCH (o:EntityObject)-[:ITEM_OF]->(sreo)
                OPTIONAL MATCH (srcs:RootCaptionSegment)-[:LOCAL_ROOT_OF]->(s)
                OPTIONAL MATCH (cs:CaptionSegment)-[:DESCRIPTION_OF]->(srcs)
                OPTIONAL MATCH (sra:RootActivity)-[:LOCAL_ROOT_OF]->(s)
                OPTIONAL MATCH (a:Activity)-[:ACTION_OF]->(sra)
                RETURN s.mongo_id AS segment_id,
                       s.segment_index AS segment_index,
                       s.start_time AS start_time,
                       s.end_time AS end_time,
                       s.keyframe AS keyframe,
                       cs.text AS caption_text,
                       a.mongo_id AS activity_id,
                       a.activity_name AS activity_name,
                       p.mongo_id AS person_id,
                       p.track_id AS person_track_id,
                       p.role AS person_role,
                       o.mongo_id AS object_id,
                       o.object_name AS object_name,
                       o.category AS object_category
                ORDER BY segment_index ASC
                """,
                vid=video_id,
            )

            segments_by_id: Dict[str, Dict[str, Any]] = {}
            for record in rows:
                segment_id = record.get("segment_id")
                if not segment_id:
                    continue

                if segment_id not in segments_by_id:
                    segments_by_id[segment_id] = {
                        "segment_id": segment_id,
                        "segment_index": record.get("segment_index") or 0,
                        "start_time": record.get("start_time") or 0,
                        "end_time": record.get("end_time") or 0,
                        "keyframe": record.get("keyframe"),
                        "caption_text": record.get("caption_text") or "",
                        "activities": [],
                        "activity_nodes": [],
                        "persons": [],
                        "objects": [],
                        "_seen_activities": set(),
                        "_seen_activity_ids": set(),
                        "_seen_person_ids": set(),
                        "_seen_object_ids": set(),
                    }

                segment_doc = segments_by_id[segment_id]
                activity_name = record.get("activity_name")
                if activity_name:
                    normalized_activity_name = _normalize_activity_name(activity_name)
                    activity_id = record.get("activity_id")

                    # Avoid exploding activity arrays caused by OPTIONAL MATCH cartesian products.
                    activity_key = f"{activity_id}:{normalized_activity_name}" if activity_id else normalized_activity_name
                    if activity_key not in segment_doc["_seen_activities"]:
                        segment_doc["_seen_activities"].add(activity_key)
                        segment_doc["activities"].append(normalized_activity_name)

                    if activity_id and activity_id not in segment_doc["_seen_activity_ids"]:
                        segment_doc["_seen_activity_ids"].add(activity_id)
                        segment_doc["activity_nodes"].append(
                            {
                                "id": activity_id,
                                "name": normalized_activity_name,
                                "category": "student_behavior",
                            }
                        )

                person_id = record.get("person_id")
                if person_id and person_id not in segment_doc["_seen_person_ids"]:
                    segment_doc["_seen_person_ids"].add(person_id)
                    segment_doc["persons"].append(
                        {
                            "id": person_id,
                            "track_id": record.get("person_track_id"),
                            "role": record.get("person_role") or "student",
                        }
                    )

                object_id = record.get("object_id")
                if object_id and object_id not in segment_doc["_seen_object_ids"]:
                    segment_doc["_seen_object_ids"].add(object_id)
                    segment_doc["objects"].append(
                        {
                            "id": object_id,
                            "name": record.get("object_name") or "object",
                            "category": record.get("object_category") or "unknown",
                        }
                    )

            for segment_doc in segments_by_id.values():
                segment_doc.pop("_seen_activities", None)
                segment_doc.pop("_seen_activity_ids", None)
                segment_doc.pop("_seen_person_ids", None)
                segment_doc.pop("_seen_object_ids", None)

            segments = sorted(
                segments_by_id.values(),
                key=lambda item: (int(item.get("segment_index", 0)), item.get("segment_id", "")),
            )

            return {
                "video": {
                    "mongo_id": video_record.get("mongo_id"),
                    "name": video_record.get("video_name"),
                    "status": video_record.get("status"),
                },
                "segments": segments,
                "stats": {
                    "segments": len(segments),
                },
            }


def _build_segment_caption_from_activities(
    activities: List[str],
    segment_index: int,
    existing_caption: str = "",
) -> str:
    activity_counts: Dict[str, int] = {}
    for activity in activities:
        normalized = _normalize_activity_name(activity)
        activity_counts[normalized] = activity_counts.get(normalized, 0) + 1

    if not activity_counts:
        return f"Trong đoạn này, chưa phát hiện rõ hành vi học tập của học sinh."

    focus = _build_focus_assessment(activity_counts)

    positive_counts = {k: v for k, v in activity_counts.items() if k in POSITIVE_ACTIONS and v > 0}
    negative_counts = {k: v for k, v in activity_counts.items() if k in NEGATIVE_ACTIONS and v > 0}

    def _action_label(action_name: str) -> str:
        return ACTION_NORMALIZATION_MAP.get(action_name, ACTION_LABEL_MAP.get(action_name, action_name.replace("_", " ")))

    def _build_action_phrase(action_map: Dict[str, int]) -> str:
        ranked = sorted(action_map.items(), key=lambda item: (-item[1], item[0]))
        phrases: List[str] = []
        for action_name, _ in ranked[:4]:
            phrase = _action_label(action_name)
            if phrase and phrase not in phrases:
                phrases.append(phrase)
        return _join_phrases(phrases)

    positive_phrase = _build_action_phrase(positive_counts)
    negative_phrase = _build_action_phrase(negative_counts)
    focus_band = focus.get("focus_band", "neutral_unknown")

    if focus_band in {"very_focused", "focused"}:
        if positive_phrase and negative_phrase:
            return (
                f"Trong đoạn này, học sinh trong lớp học đang tập trung học tập qua việc {positive_phrase}; "
                f"tuy nhiên vẫn có biểu hiện mất tập trung do {negative_phrase}."
            )
        if positive_phrase:
            return f"Trong đoạn này, học sinh trong lớp học đang tập trung học tập qua việc {positive_phrase}."
        return "Trong đoạn này, học sinh trong lớp học đang tập trung học tập."

    if focus_band in {"distracted", "very_distracted"}:
        if negative_phrase and positive_phrase:
            return (
                f"Trong đoạn này, học sinh trong lớp học đang mất tập trung, chủ yếu do {negative_phrase}; "
                f"tuy nhiên vẫn có biểu hiện tập trung qua việc {positive_phrase}."
            )
        if negative_phrase:
            return f"Trong đoạn này, học sinh trong lớp học đang mất tập trung, chủ yếu do {negative_phrase}."
        return "Trong đoạn này, học sinh trong lớp học đang mất tập trung."

    if positive_phrase and negative_phrase:
        return (
            f"Trong đoạn này, học sinh trong lớp học vừa có biểu hiện tập trung qua {positive_phrase}, "
            f"đồng thời có biểu hiện mất tập trung do {negative_phrase}."
        )
    if positive_phrase:
        return f"Trong đoạn này, học sinh trong lớp học đang tập trung học tập, nổi bật là {positive_phrase}."
    if negative_phrase:
        return f"Trong đoạn này, học sinh trong lớp học có dấu hiệu mất tập trung do {negative_phrase}."

    return "Trong đoạn này, chưa xác định rõ hành vi học tập nổi bật của học sinh."


def _build_segment_raw_caption(
    activities: List[str],
    segment_index: int,
    student_count: int,
) -> str:
    activity_counts: Dict[str, int] = {}
    for activity in activities:
        normalized = _normalize_activity_name(activity)
        activity_counts[normalized] = activity_counts.get(normalized, 0) + 1

    if student_count <= 0:
        return f"Đoạn {segment_index + 1}: Lớp học trống, không ghi nhận học sinh."

    if not activity_counts:
        return f"Đoạn {segment_index + 1}: Có {student_count} học sinh, nhưng chưa ghi nhận rõ hành vi học tập."

    positive_counts = {k: v for k, v in activity_counts.items() if k in POSITIVE_ACTIONS and v > 0}
    negative_counts = {k: v for k, v in activity_counts.items() if k in NEGATIVE_ACTIONS and v > 0}

    def _action_label(action_name: str) -> str:
        return ACTION_NORMALIZATION_MAP.get(action_name, ACTION_LABEL_MAP.get(action_name, action_name.replace("_", " ")))

    def _count_phrase(action_map: Dict[str, int]) -> str:
        ranked = sorted(action_map.items(), key=lambda item: (-item[1], item[0]))
        chunks: List[str] = []
        for action_name, count in ranked[:5]:
            chunks.append(f"{count} học sinh {_action_label(action_name)}")
        return _join_phrases(chunks)

    positive_phrase = _count_phrase(positive_counts)
    negative_phrase = _count_phrase(negative_counts)

    if positive_phrase and negative_phrase:
        positive_total = sum(positive_counts.values())
        negative_total = sum(negative_counts.values())
        if positive_total >= negative_total:
            return (
                f"Đoạn {segment_index + 1}: Có {student_count} học sinh; ghi nhận {positive_phrase}. "
                f"Tuy nhiên cũng ghi nhận {negative_phrase}."
            )
        return (
            f"Đoạn {segment_index + 1}: Có {student_count} học sinh; ghi nhận {negative_phrase}. "
            f"Tuy nhiên vẫn ghi nhận {positive_phrase}."
        )

    if positive_phrase:
        return f"Đoạn {segment_index + 1}: Có {student_count} học sinh; ghi nhận {positive_phrase}."

    return f"Đoạn {segment_index + 1}: Có {student_count} học sinh; ghi nhận {negative_phrase}."


def _format_time_vi(seconds: float) -> str:
    total_seconds = max(0, int(round(float(seconds or 0))))
    minutes = total_seconds // 60
    secs = total_seconds % 60
    if minutes <= 0:
        return f"{secs} giây"
    if secs == 0:
        return f"{minutes} phút"
    return f"{minutes} phút {secs} giây"


def _overall_focus_level_from_percent(positive_percent: int) -> str:
    if positive_percent > 80:
        return "rất tập trung học tập"
    if positive_percent > 60:
        return "tập trung học tập"
    if positive_percent > 40:
        return "xen kẽ giữa tập trung và mất tập trung"
    if positive_percent > 20:
        return "khá mất tập trung"
    return "rất mất tập trung"


def _build_video_timeline_fallback_caption(
    segment_captions: List[str],
    segments: List[Dict[str, Any]],
    overall_focus_label: str,
) -> str:
    if not segment_captions or not segments:
        return f"Trong đoạn video này, học sinh trong lớp học {overall_focus_label}."

    timeline_parts: List[str] = []
    for idx, segment in enumerate(segments):
        start_t = float(segment.get("start_time", 0) or 0)
        end_t = float(segment.get("end_time", 0) or 0)
        start_text = _format_time_vi(start_t)
        end_text = _format_time_vi(end_t)
        segment_caption = segment_captions[idx] if idx < len(segment_captions) else ""
        segment_caption = segment_caption.strip()
        if segment_caption.lower().startswith("trong đoạn này,"):
            segment_caption = segment_caption[len("Trong đoạn này,"):].strip()
        if segment_caption.endswith("."):
            segment_caption = segment_caption[:-1].strip()
        segment_caption = segment_caption[:1].lower() + segment_caption[1:] if segment_caption else ""
        timeline_parts.append(
            f"ở đoạn {start_text} đến {end_text}, {segment_caption}"
        )

    detail_text = ", ".join(timeline_parts).strip()
    return (
        f"Trong video này, {detail_text}. "
        f"Tổng quát, trong đoạn video này học sinh trong lớp học {overall_focus_label}."
    ).replace("..", ".")


def _build_segment_graph_json(video_info: Dict[str, Any], segment: Dict[str, Any]) -> Dict[str, Any]:
    activity_counts: Dict[str, int] = {}
    for activity in segment.get("activities", []):
        normalized = _normalize_activity_name(activity)
        activity_counts[normalized] = activity_counts.get(normalized, 0) + 1

    activities_nodes = segment.get("activity_nodes", [])
    persons_nodes = segment.get("persons", [])
    objects_nodes = segment.get("objects", [])

    edges: List[Dict[str, Any]] = []
    if persons_nodes and activities_nodes:
        first_person_id = persons_nodes[0].get("id")
        for activity in activities_nodes:
            edges.append(
                {
                    "source": first_person_id,
                    "target": activity.get("id"),
                    "type": "HAS_ACTIVITY",
                }
            )

    return {
        "image": {
            "mongo_id": segment.get("segment_id"),
            "name": f"segment_{segment.get('segment_index', 0)}",
            "status": video_info.get("status") or "classroom",
        },
        "nodes": {
            "persons": persons_nodes,
            "activities": activities_nodes,
            "objects": objects_nodes,
        },
        "edges": edges,
        "activity_distribution": activity_counts,
        "stats": {
            "persons": len(persons_nodes),
            "activities": len(activities_nodes),
            "objects": len(objects_nodes),
            "edges": len(edges),
        },
    }


def generate_video_caption_from_neo4j_graph(mongo_db, video_doc: Dict[str, Any]) -> Dict[str, Any]:
    video_oid = video_doc.get("_id")
    if not video_oid:
        return {"success": False, "message": "Missing video _id"}

    reader = Neo4jVideoGraphReader()
    try:
        graph_json = reader.fetch_video_graph(str(video_oid))
    finally:
        reader.close()

    if not graph_json:
        return {"success": False, "message": "Video graph not found in Neo4j."}

    segments = graph_json.get("segments", [])
    if not segments:
        return {"success": False, "message": "No segment nodes found in Neo4j for this video."}

    segment_raw_captions: List[str] = []
    segment_captions: List[str] = []
    used_groq = False
    video_info = graph_json.get("video", {})
    aggregate_activity_counts: Dict[str, int] = {}

    for segment in segments:
        segment_index = int(segment.get("segment_index", 0))
        segment_graph_json = _build_segment_graph_json(video_info, segment)
        persons_nodes = segment_graph_json["nodes"]["persons"]
        segment_activities = segment.get("activities", [])
        activity_counts_for_segment: Dict[str, int] = {}
        for activity in segment_activities:
            normalized = _normalize_activity_name(activity)
            activity_counts_for_segment[normalized] = activity_counts_for_segment.get(normalized, 0) + 1
            aggregate_activity_counts[normalized] = aggregate_activity_counts.get(normalized, 0) + 1
        
        # Case 1: No students detected - empty classroom caption
        if not persons_nodes:
            raw_caption_text = f"Đoạn {segment_index + 1}: Lớp học trống, không ghi nhận học sinh."
            caption_text = "Trong đoạn này, lớp học trống và không có học sinh."
        else:
            # Build segment raw caption first (count-based)
            raw_caption_text = _build_segment_raw_caption(
                activities=segment_activities,
                segment_index=segment_index,
                student_count=len(persons_nodes),
            )

            # Build smooth fallback for refined segment caption
            fallback_caption = _build_segment_caption_from_activities(
                activities=segment_activities,
                segment_index=segment_index,
                existing_caption=segment.get("caption_text", ""),
            )

            # Case 2: Has students but no actions detected - use fallback without Groq
            if not activity_counts_for_segment:
                caption_text = fallback_caption
            else:
                # Case 3: Has students and actions - refine with Groq
                caption_text = _groq_generate_segment_caption_from_graph(
                    segment_graph_json=segment_graph_json,
                    fallback_caption=fallback_caption,
                    raw_caption=raw_caption_text,
                    segment_index=segment_index,
                )
                if caption_text != fallback_caption:
                    used_groq = True

                caption_text = normalize_caption_subject(caption_text)
                fa = _build_focus_assessment(segment_graph_json.get("activity_distribution", {}))
                caption_text = enforce_caption_consistency(caption_text, fa)

        segment_raw_captions.append(raw_caption_text)
        segment_captions.append(caption_text)

    focus_summary = _build_focus_assessment(aggregate_activity_counts)
    overall_focus_label = _overall_focus_level_from_percent(int(focus_summary.get("positive_percent", 0)))

    timeline_video_caption = _build_video_timeline_fallback_caption(
        segment_captions=segment_captions,
        segments=segments,
        overall_focus_label=overall_focus_label,
    )

    # Keep overall video caption deterministic in requested timeline format.
    video_caption = timeline_video_caption

    mongo_db["caption"].delete_many({"video_id": video_oid, "caption_scope": "video"})
    mongo_db["caption"].insert_one(
        {
            "_id": ObjectId(),
            "video_id": video_oid,
            "caption_scope": "video",
            "caption_source": "generated_from_neo4j_video_graph_groq" if used_groq else "generated_from_neo4j_video_graph_rule_based",
            "raw_segment_captions": segment_raw_captions,
            "segment_captions": segment_captions,
            "caption": video_caption,
            # Keep caption docs small; detailed graph is retrievable from Neo4j by video_id.
            "graph_stats": graph_json.get("stats", {}),
            "focus_summary": {
                "positive_percent": focus_summary.get("positive_percent", 0),
                "negative_percent": focus_summary.get("negative_percent", 0),
                "focus_band": focus_summary.get("focus_band", "neutral_unknown"),
                "overall_focus_label": overall_focus_label,
            },
            "created_at": datetime.now(timezone.utc),
        }
    )

    mongo_db["video"].update_one(
        {"_id": video_oid},
        {
            "$set": {
                "caption_status": "generated",
                "caption_generated_at": datetime.now(timezone.utc),
                "caption_source": "generated_from_neo4j_video_graph_groq" if used_groq else "generated_from_neo4j_video_graph_rule_based",
            }
        },
    )

    return {
        "success": True,
        "caption": video_caption,
        "raw_segment_captions": segment_raw_captions,
        "segment_captions": segment_captions,
        "focus_summary": {
            "positive_percent": focus_summary.get("positive_percent", 0),
            "negative_percent": focus_summary.get("negative_percent", 0),
            "focus_band": focus_summary.get("focus_band", "neutral_unknown"),
            "overall_focus_label": overall_focus_label,
        },
        "graph_stats": graph_json.get("stats", {}),
    }


def generate_caption_from_scene_graph(
    mongo_db,
    image_doc: Dict[str, Any],
    persons: Optional[List[Dict[str, Any]]] = None,
    objects: Optional[List[Dict[str, Any]]] = None,
    activities: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    return generate_caption_from_neo4j_graph(mongo_db=mongo_db, image_doc=image_doc)
