# Classroom Caption Engine - Documentation

## Overview

The classroom caption engine implements a sophisticated multi-stage pipeline for generating natural Vietnamese descriptions of classroom scenes from Neo4j scene graphs.

```
Scene Graph (Neo4j) 
  ↓
Action Extraction & Classification (Focused/Unfocused)
  ↓
Structured Raw Caption Generation (Template-based)
  ↓
OpenAI Refinement (Natural Vietnamese)
  ↓
Final Caption
```

## Architecture

### 1. Action Classification

Actions are classified into two categories based on classroom learning context:

#### Focused Actions (学習行為正)
- `raising_hand` / `hand-raising` → "giơ tay phát biểu"
- `writing` → "viết bài"
- `reading` → "đọc tài liệu"
- `looking_forward` → "nhìn về phía giáo viên"
- `listening` → "nghe giảng"
- `raise_head` → "chú ý nghe giảng"
- `upright` → "ngồi học nghiêm túc"
- `discuss` → "thảo luận bài học"

#### Unfocused Actions (学習行為負)
- `using_phone` / `using_mobile` → "sử dụng điện thoại"
- `sleep` → "buồn ngủ hoặc ngủ gật"
- `turn_head` / `looking_away` → "nhìn sang hướng khác"
- `talking` → "nói chuyện riêng"
- `resting_head_on_hand` → "chống cằm, không tập trung"

### 2. Raw Caption Template

The structured raw caption follows a 3-part template:

```
[PART 1] Khung cảnh là một lớp học với nhiều học sinh đang tham gia hoạt động học tập.

[PART 2] Phần lớn học sinh đang tập trung {focused_actions_joined}.

[PART 3] Tuy nhiên vẫn có một vài học sinh mất tập trung do {unfocused_actions_joined}.
```

**Example:**

Raw Caption Input:
```json
{
  "focused": {"raising_hand": 3, "writing": 5, "looking_forward": 8},
  "unfocused": {"using_phone": 2}
}
```

Generated Raw Caption:
```
Khung cảnh là một lớp học với nhiều học sinh đang tham gia hoạt động học tập.
Phần lớn học sinh đang tập trung giơ tay phát biểu, viết bài và nhìn về phía giáo viên.
Tuy nhiên vẫn có một vài học sinh mất tập trung do sử dụng điện thoại.
```

### 3. OpenAI Refinement

The raw caption is sent to OpenAI API with specific instructions to make it more natural while preserving meaning:

**OpenAI Prompt Includes:**
- Classroom context preservation
- Focused/Unfocused behavior structure requirement
- Natural Vietnamese flow (no unnecessary "hoặc")
- No action invention rule
- Action-based explanation using "do"

**Example Output:**

OpenAI Refined:
```
Hình ảnh ghi lại khung cảnh một lớp học với nhiều học sinh đang tham gia vào các hoạt động học tập. 
Phần lớn các em đang tập trung nghe giảng, viết bài và giơ tay phát biểu. 
Tuy nhiên vẫn có một vài học sinh mất tập trung do sử dụng điện thoại trong giờ học.
```

## Usage

### Basic Integration

```python
from classroom_caption_engine import (
    generate_classroom_caption_from_graph,
    analyze_graph_for_caption,
)

# Fetch scene graph from Neo4j (existing code)
graph_json = reader.fetch_graph(image_id)

# Generate caption with new engine
raw_caption, refined_caption, final_caption = generate_classroom_caption_from_graph(graph_json)

# Get analysis for debugging
analysis = analyze_graph_for_caption(graph_json)
print(f"Focus band: {analysis['focus_band']}")
print(f"Focus: {analysis['focus_percentage']}% | Unfocused: {analysis['unfocus_percentage']}%")
```

### Complete Image Processing

```python
from scene_graph_captioning import generate_caption_from_neo4j_graph

# The updated function now uses classroom caption engine internally
result = generate_caption_from_neo4j_graph(mongo_db, image_doc)

# Result includes both raw and refined captions
print(result['caption'])        # Final caption (refined if available)
print(result['raw_caption'])    # Structured template-based
print(result['refined_caption'])  # OpenAI-refined (if API available)
```

## Configuration

### Environment Variables Required

```bash
# For OpenAI refinement
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4-turbo  # or gpt-4, gpt-3.5-turbo

# For Neo4j connection (existing)
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASS=12345678

# For MongoDB (existing)
MONGO_URI=mongodb://localhost:27017
```

### Optional: Disable OpenAI Refinement

If `OPENAI_API_KEY` is not set, the system will:
1. Generate raw structured caption ✅
2. Skip OpenAI refinement ⚠️
3. Use raw caption as final output

```
Raw caption will be returned as final_caption
refined_caption will be None
```

## Pipeline Flow

### Stage 1: Scene Graph Extraction

Reads Neo4j graph and extracts:
- Activity nodes
- Activity counts by type
- Entity relationships

### Stage 2: Action Classification

For each activity:
1. Normalize activity name (handle variations)
2. Classify as "focused" or "unfocused"
3. Group by classification

### Stage 3: Raw Caption Generation

Using template and action grouping:
1. Extract top actions by frequency
2. Convert to human-readable Vietnamese labels
3. Join using "và" connector
4. Build 3-part template

### Stage 4: OpenAI Refinement

Send to OpenAI with:
1. Raw structured caption
2. Classification rules for Vietnamese naturalness
3. Action-action structure constraints

### Stage 5: Storage

Save to MongoDB with metadata:
- Final caption
- Raw structured caption
- Refined caption (if available)
- Focus analysis data
- Timestamp

## Performance Notes

**Typical Processing Times:**
- Neo4j graph fetch: ~50-100ms
- Action classification: ~10ms
- Raw caption generation: ~5ms
- OpenAI refinement: ~1-3 seconds

**Cost Considerations:**
- OpenAI API: ~0.001 USD per image (gpt-4-turbo)
- Fallback without OpenAI: instant (raw caption)

## Debugging & Analysis

### Get Classroom Analysis

```python
from classroom_caption_engine import analyze_graph_for_caption

analysis = analyze_graph_for_caption(graph_json)

# Returns:
{
    'activity_counts': {...},           # Raw counts from graph
    'focused_actions': {...},           # Classified focused with counts
    'unfocused_actions': {...},         # Classified unfocused with counts
    'total_focused': 25,                # Sum of focused action instances
    'total_unfocused': 3,               # Sum of unfocused action instances
    'focus_percentage': 89,             # Percentage focused
    'unfocus_percentage': 11,           # Percentage unfocused
    'focus_band': 'very_focused'        # Focus classification
}
```

### Focus Bands

- `very_focused`: ≥85% focused actions
- `focused`: 60-84% focused actions
- `mixed`: Both focused and unfocused present
- `distracted`: 60-84% unfocused actions
- `very_distracted`: ≥85% unfocused actions
- `neutral`: No classification data

## Error Handling

### OpenAI API Failures

If OpenAI API is unavailable:
- Timeout (>60s): Returns raw caption, logs warning ⚠️
- Connection error: Returns raw caption, logs error ❌
- Invalid API key: Logs and returns raw caption
- Empty response: Returns raw caption as fallback

### Scene Graph Issues

- Empty graph: Returns "Lớp học đang trống và không có học sinh"
- No activities detected: Returns empty-classroom caption
- Missing fields: Continues with available data

## Quality Assurance

### Validation Rules

Raw caption must:
1. ✅ Start with classroom environment description
2. ✅ Distinguish focused vs unfocused behaviors
3. ✅ Use "và" for action joining
4. ✅ Use "do" for explaining unfocused behavior
5. ✅ Never use "hoặc"

Refined caption must:
1. ✅ Preserve all actions from raw caption
2. ✅ Maintain focus/unfocus distinction
3. ✅ Be natural Vietnamese
4. ✅ Not exceed 200 tokens

## Examples

### Example 1: High Focus Classroom

**Scene Graph Data:**
```json
{
  "activity_distribution": {
    "writing": 12,
    "raise_head": 8,
    "raising_hand": 4,
    "listening": 6
  }
}
```

**Raw Caption:**
```
Khung cảnh là một lớp học với nhiều học sinh đang tham gia hoạt động học tập.
Phần lớn học sinh đang tập trung viết bài, nghe giảng, chú ý nghe giảng và giơ tay phát biểu.
```

**Refined Caption (OpenAI):**
```
Lớp học này theo dõi được rất tập trung với đa số học sinh đang tham gia các hoạt động học tập 
như viết bài, nghe giảng và giơ tay phát biểu một cách chủ động.
```

### Example 2: Mixed Focus Classroom

**Scene Graph Data:**
```json
{
  "activity_distribution": {
    "writing": 8,
    "reading": 5,
    "using_phone": 3,
    "turn_head": 4
  }
}
```

**Raw Caption:**
```
Khung cảnh là một lớp học với nhiều học sinh đang tham gia hoạt động học tập.
Phần lớn học sinh đang tập trung viết bài và đọc tài liệu.
Tuy nhiên vẫn có một vài học sinh mất tập trung do nhìn sang hướng khác và sử dụng điện thoại.
```

**Refined Caption (OpenAI):**
```
Trong lớp học này, phần lớn học sinh đang tập trung vào việc viết bài và đọc tài liệu. 
Tuy nhiên vẫn có một số em mất tập trung do sử dụng điện thoại và nhìn sang hướng khác.
```

### Example 3: Low Focus Classroom

**Scene Graph Data:**
```json
{
  "activity_distribution": {
    "using_phone": 6,
    "sleep": 3,
    "talking": 4,
    "writing": 2
  }
}
```

**Raw Caption:**
```
Khung cảnh là một lớp học với nhiều học sinh đang tham gia hoạt động học tập.
Tuy nhiên các em mất tập trung do sử dụng điện thoại, nói chuyện riêng và buồn ngủ hoặc ngủ gật.
```

**Refined Caption (OpenAI):**
```
Lớp học này hiện đang gặp tình trạng mất tập trung rất lớn, với nhiều học sinh đang sử dụng điện thoại, 
nói chuyện riêng và có dấu hiệu buồn ngủ. Chỉ có một vài em vẫn còn ghi chép.
```

## Migration from Old System

The new system is backward compatible. Existing code using `generate_caption_from_neo4j_graph` will automatically:

1. Switch to new classroom caption engine
2. Return captions with both `raw_caption` and `refined_caption` fields
3. Include `focus_analysis` metadata for debugging
4. Remove `graph_snapshot` to save storage (like video system)

No changes needed in calling code. Results will be better quality immediately.

## Troubleshooting

### Captions are too short

→ This is normal for the new structured approach. Focus is on accuracy over verbosity.

### OpenAI refinement not working

→ Check:
1. `OPENAI_API_KEY` environment variable is set
2. API key is valid and has balance
3. Check logs for timeout/error messages

### Actions not being classified correctly

→ Check:
1. Activity names in Neo4j match expected names (check normalization in classroom_caption_engine.py)
2. If new activity types exist, add to FOCUSED_ACTIONS or UNFOCUSED_ACTIONS set
3. Update ACTION_LABEL_MAP with Vietnamese translation

### Generated captions don't match actual classroom

→ Possible causes:
1. Neo4j scene graph is incomplete (detection/tracking issues)
2. Activity classification is wrong for the domain
3. Raw caption is correct but OpenAI misunderstood

→ Solution: Check `focus_analysis` metadata to understand what actions were detected.
