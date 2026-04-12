"""
Classroom Caption Generation Engine

Optimized for classroom scene graphs with:
1. Scene Graph → Raw Structured Caption
2. Focused/Unfocused Action Classification
3. OpenAI Refinement for Natural Vietnamese Description
"""

import os
import logging
from typing import Dict, List, Any, Optional, Set, Tuple
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# ============================================================
# ACTION CLASSIFICATION
# ============================================================

FOCUSED_ACTIONS = {
    "raising_hand",
    "hand-raising",
    "hand_raising",
    "writing",
    "reading",
    "looking_forward",
    "listening",
    "raise_head",
    "upright",
    "discuss",
}

UNFOCUSED_ACTIONS = {
    "using_phone",
    "using_mobile",
    "phone",
    "sleep",
    "turn_head",
    "looking_away",
    "talking",
    "resting_head_on_hand",
}

ACTION_LABEL_MAP = {
    # Focused
    "raising_hand": "giơ tay phát biểu",
    "hand-raising": "giơ tay phát biểu",
    "hand_raising": "giơ tay phát biểu",
    "writing": "viết bài",
    "reading": "đọc tài liệu",
    "looking_forward": "nhìn về phía giáo viên",
    "listening": "nghe giảng",
    "raise_head": "chú ý nghe giảng",
    "upright": "ngồi học nghiêm túc",
    "discuss": "thảo luận bài học",
    # Unfocused
    "using_phone": "sử dụng điện thoại",
    "using_mobile": "sử dụng điện thoại",
    "phone": "sử dụng điện thoại",
    "sleep": "buồn ngủ hoặc ngủ gật",
    "turn_head": "nhìn sang hướng khác",
    "looking_away": "nhìn sang hướng khác",
    "talking": "nói chuyện riêng",
    "resting_head_on_hand": "chống cằm, không tập trung",
}


def normalize_action_name(action: str) -> str:
    """Normalize action name to standard format."""
    normalized = action.strip().lower().replace(" ", "_")
    normalization_map = {
        "usingphone": "using_phone",
        "using_phone": "using_phone",
        "hand_raising": "hand-raising",
        "hand-raising": "hand-raising",
        "raisehead": "raise_head",
        "raise_head": "raise_head",
        "turnhead": "turn_head",
        "turn_head": "turn_head",
        "lookingforward": "looking_forward",
        "looking_forward": "looking_forward",
        "looking_away": "looking_away",
        "sleepy": "sleep",
        "sleep": "sleep",
    }
    return normalization_map.get(normalized, normalized)


def classify_action(action_name: str) -> str:
    """Classify action as 'focused', 'unfocused', or 'unknown'."""
    normalized = normalize_action_name(action_name)
    if normalized in FOCUSED_ACTIONS:
        return "focused"
    elif normalized in UNFOCUSED_ACTIONS:
        return "unfocused"
    return "unknown"


# ============================================================
# SCENE GRAPH EXTRACTION
# ============================================================

def extract_actions_from_graph(graph_json: Dict[str, Any]) -> Dict[str, int]:
    """
    Extract activity counts from scene graph JSON.
    
    Returns: {action_name: count}
    """
    activity_distribution = graph_json.get("activity_distribution", {})
    if activity_distribution:
        return activity_distribution
    
    # Fallback: count from edges
    activities: Dict[str, int] = {}
    edges = graph_json.get("edges", [])
    for edge in edges:
        if edge.get("type") in {"PERFORMS", "EXHIBITS_ACTIVITY"}:
            activity_name = edge.get("target", "").split("_")[-1] if edge.get("target") else ""
            if activity_name:
                activities[activity_name] = activities.get(activity_name, 0) + 1
    
    return activities


def split_actions_by_focus(activity_counts: Dict[str, int]) -> Tuple[Dict[str, int], Dict[str, int]]:
    """
    Classify and split activities into focused and unfocused groups.
    
    Returns: (focused_actions, unfocused_actions)
    """
    focused = {}
    unfocused = {}
    
    for action, count in activity_counts.items():
        normalized = normalize_action_name(action)
        classification = classify_action(normalized)
        
        if classification == "focused":
            focused[normalized] = count
        elif classification == "unfocused":
            unfocused[normalized] = count
    
    return focused, unfocused


def get_action_labels(actions: Dict[str, int]) -> List[str]:
    """Get human-readable labels for actions, sorted by frequency."""
    sorted_actions = sorted(actions.items(), key=lambda x: x[1], reverse=True)
    labels = []
    
    for action, count in sorted_actions:
        normalized = normalize_action_name(action)
        label = ACTION_LABEL_MAP.get(normalized, normalized)
        labels.append(label)
    
    return labels


def join_phrases(phrases: List[str]) -> str:
    """Join phrases with Vietnamese connectors (và)."""
    phrases = [p for p in phrases if p]
    if not phrases:
        return ""
    if len(phrases) == 1:
        return phrases[0]
    if len(phrases) == 2:
        return f"{phrases[0]} và {phrases[1]}"
    return ", ".join(phrases[:-1]) + f" và {phrases[-1]}"


# ============================================================
# RAW CAPTION GENERATION
# ============================================================

def build_raw_caption_from_actions(
    focused_actions: Dict[str, int],
    unfocused_actions: Dict[str, int],
) -> str:
    """
    Build structured raw caption following classroom template.
    
    Template adapts based on focus/unfocus ratio:
    - Base: Khung cảnh là một lớp học với nhiều học sinh đang tham gia hoạt động học tập.
    - If focused dominates: Phần lớn học sinh đang tập trung...
    - If unfocused dominates: Học sinh trong lớp hiện đang mất tập trung do...
    - If mixed: Varies by ratio
    """
    
    focused_labels = get_action_labels(focused_actions)
    unfocused_labels = get_action_labels(unfocused_actions)
    
    focused_phrase = join_phrases(focused_labels)
    unfocused_phrase = join_phrases(unfocused_labels)
    
    total_focused = sum(focused_actions.values())
    total_unfocused = sum(unfocused_actions.values())
    total = total_focused + total_unfocused
    
    parts = ["Khung cảnh là một lớp học với nhiều học sinh đang tham gia hoạt động học tập."]
    
    # Determine dominant behavior
    if total == 0:
        # No behaviors detected
        return " ".join(parts)
    
    focus_ratio = total_focused / total if total > 0 else 0
    unfocus_ratio = total_unfocused / total if total > 0 else 0
    
    # Focus-dominant (>= 60% focused)
    if focus_ratio >= 0.60:
        if focused_phrase:
            parts.append(f"Phần lớn học sinh đang tập trung {focused_phrase}.")
        
        if unfocused_phrase:
            parts.append(f"Tuy nhiên vẫn có một vài học sinh mất tập trung do {unfocused_phrase}.")
        elif focused_phrase:
            parts.append("Các em đều tập trung vào hoạt động học tập.")
    
    # Unfocus-dominant (>= 60% unfocused)
    elif unfocus_ratio >= 0.60:
        if unfocused_phrase:
            parts = [
                f"Khung cảnh là một lớp học với nhiều học sinh đang mất tập trung trong học tập do {unfocused_phrase}."
            ]
        else:
            parts = ["Khung cảnh là một lớp học với nhiều học sinh đang mất tập trung trong học tập."]

        # Chi them ve 'tuy nhien' khi co hanh vi tap trung.
        if focused_phrase:
            parts.append(f"Tuy nhiên vẫn còn một số em đang tập trung {focused_phrase}.")
    
    # Balanced mix (30-60% each side)
    else:
        if focused_phrase and unfocused_phrase:
            parts.append(f"Một số học sinh đang tập trung {focused_phrase}, trong khi đó một số khác mất tập trung do {unfocused_phrase}.")
        elif focused_phrase:
            parts.append(f"Phần lớn học sinh đang tập trung {focused_phrase}.")
        elif unfocused_phrase:
            parts.append(f"Học sinh có dấu hiệu mất tập trung do {unfocused_phrase}.")
    
    return " ".join(parts)


# ============================================================
# OPENAI CAPTION REFINEMENT
# ============================================================

def refine_caption_with_openai(raw_caption: str) -> Optional[str]:
    """
    Refine raw structured caption using OpenAI API for natural Vietnamese.
    
    Args:
        raw_caption: Structured caption from template
    
    Returns:
        Refined caption or None if API fails
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.warning("⚠️ OPENAI_API_KEY not set, skipping refinement")
        return None
    
    prompt = f"""You are analyzing a classroom image.

Below is a structured caption generated from a scene graph.

Your task:
Rewrite the caption so that it becomes a natural Vietnamese description of a classroom scene.

Rules:
- The description must start by describing the classroom environment.
- Most students should be described as studying or focusing.
- If there are unfocused behaviors, they must be described using the structure:
  "tuy nhiên vẫn có một vài học sinh mất tập trung do ..."

- Do NOT use the word "hoặc".
- The sentence must flow naturally.
- Do not invent new actions that are not present in the caption.
- Keep the meaning unchanged.

Structured caption:
{raw_caption}

Return only the final caption."""

    try:
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": os.getenv("OPENAI_MODEL", "gpt-4-turbo"),
                "messages": [
                    {
                        "role": "user",
                        "content": prompt,
                    }
                ],
                "temperature": 0.3,
                "max_tokens": 200,
            },
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        refined = (
            (data.get("choices") or [{}])[0]
            .get("message", {})
            .get("content", "")
            .strip()
        )
        
        if refined:
            logger.info("✨ Caption refined successfully with OpenAI")
            return refined
        else:
            logger.warning("⚠️ OpenAI returned empty response")
            return None
            
    except requests.exceptions.Timeout:
        logger.error("❌ OpenAI API timeout")
        return None
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ OpenAI API error: {e}")
        return None
    except Exception as e:
        logger.error(f"❌ Unexpected error during refinement: {e}")
        return None


# ============================================================
# FULL PIPELINE
# ============================================================

def generate_classroom_caption_from_graph(graph_json: Dict[str, Any]) -> Tuple[str, str, str]:
    """
    Complete pipeline: Scene Graph → Raw Caption → OpenAI Refinement → Final Caption.
    
    Args:
        graph_json: Scene graph from Neo4j
    
    Returns:
        (raw_caption, refined_caption, final_caption)
        - raw_caption: Structured template-based caption
        - refined_caption: OpenAI-refined version (or None)
        - final_caption: Best available caption (refined > raw)
    """
    
    # Step 1: Extract and classify actions
    activity_counts = extract_actions_from_graph(graph_json)
    focused_actions, unfocused_actions = split_actions_by_focus(activity_counts)
    
    # Step 2: Build raw structured caption
    raw_caption = build_raw_caption_from_actions(focused_actions, unfocused_actions)
    logger.info(f"📝 Raw caption: {raw_caption}")
    
    # Step 3: Try OpenAI refinement
    refined_caption = refine_caption_with_openai(raw_caption)
    
    # Step 4: Use refined if available, else raw
    final_caption = refined_caption or raw_caption
    logger.info(f"✅ Final caption: {final_caption}")
    
    return raw_caption, refined_caption, final_caption


# ============================================================
# DEBUGGING & ANALYSIS
# ============================================================

def analyze_graph_for_caption(graph_json: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analyze scene graph for caption generation debugging.
    
    Returns metadata about action distribution and focus assessment.
    """
    activity_counts = extract_actions_from_graph(graph_json)
    focused, unfocused = split_actions_by_focus(activity_counts)
    
    total_focused = sum(focused.values())
    total_unfocused = sum(unfocused.values())
    total = total_focused + total_unfocused
    
    focus_percent = round((total_focused / total * 100) if total else 0)
    unfocus_percent = round((total_unfocused / total * 100) if total else 0)
    
    # Determine focus band based on percentages
    if total == 0:
        focus_band = "neutral"
    elif focus_percent >= 85:
        focus_band = "very_focused"
    elif focus_percent >= 60:
        focus_band = "focused"
    elif unfocus_percent >= 85:
        focus_band = "very_distracted"
    elif unfocus_percent >= 60:
        focus_band = "distracted"
    elif total_focused > 0 and total_unfocused > 0:
        focus_band = "mixed"
    else:
        focus_band = "neutral"
    
    return {
        "activity_counts": activity_counts,
        "focused_actions": focused,
        "unfocused_actions": unfocused,
        "total_focused": total_focused,
        "total_unfocused": total_unfocused,
        "focus_percentage": focus_percent,
        "unfocus_percentage": unfocus_percent,
        "focus_band": focus_band,
    }
