import argparse
import os
import tempfile
import urllib.request
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
from bson import ObjectId
from pymongo import MongoClient


DEFAULT_MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://127.0.0.1:27017/classroom_kg")
DEFAULT_DB_NAME = os.getenv("MONGODB_DB_NAME", "classroom_kg")


def parse_object_id(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception as exc:
        raise ValueError(f"Invalid ObjectId: {value}") from exc


def load_image_from_path_or_url(path_or_url: str) -> Any:
    if path_or_url.lower().startswith(("http://", "https://")):
        with urllib.request.urlopen(path_or_url, timeout=30) as response:
            data = response.read()
        arr = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
        if arr is None:
            raise RuntimeError(f"Cannot decode image bytes from URL: {path_or_url}")
        return arr

    if not os.path.exists(path_or_url):
        raise FileNotFoundError(f"Media path not found: {path_or_url}")

    image = cv2.imread(path_or_url)
    if image is None:
        raise RuntimeError(f"Cannot read image from: {path_or_url}")
    return image


def resolve_media_path_from_doc(doc: Optional[Dict[str, Any]]) -> Optional[str]:
    if not doc:
        return None

    for key in ["local_path", "file_path", "path", "minio_url", "url"]:
        value = doc.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def collect_image_docs(db: Any, image_oid: ObjectId) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    persons = list(db["person"].find({"image_id": image_oid}))
    activities = list(db["activity"].find({"image_id": image_oid}))
    objects = list(db["entity_object"].find({"image_id": image_oid}))
    return persons, activities, objects


def collect_video_docs_for_frame(
    db: Any,
    video_oid: ObjectId,
    frame_id: int,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    filter_doc = {"video_id": video_oid, "frame_id": frame_id}
    persons = list(db["person"].find(filter_doc))
    activities = list(db["activity"].find(filter_doc))
    objects = list(db["entity_object"].find(filter_doc))

    # Fallback for datasets that keep detections embedded in frame documents.
    if not persons and not activities and not objects:
        frame_doc = db["frame"].find_one({"video_id": video_oid, "frame_id": frame_id})
        if frame_doc:
            persons = []
            for p in frame_doc.get("persons", []):
                persons.append(
                    {
                        "bbox": p.get("bbox", []),
                        "confidence": p.get("confidence", 0.0),
                        "role": p.get("class", "person"),
                        "track_id": p.get("track_id"),
                    }
                )

            activities = []
            for a in frame_doc.get("actions", []):
                activities.append(
                    {
                        "bbox": a.get("bbox", []),
                        "confidence": a.get("confidence", 0.0),
                        "activity_name": a.get("class", "activity"),
                    }
                )

            objects = []
            for o in frame_doc.get("objects", []):
                objects.append(
                    {
                        "bbox": o.get("bbox", []),
                        "confidence": o.get("confidence", 0.0),
                        "object_name": o.get("class", "object"),
                    }
                )

    return persons, activities, objects


def pick_best_frame_id(db: Any, video_oid: ObjectId) -> Optional[int]:
    candidates: List[int] = []
    for col in ["person", "activity", "entity_object"]:
        rows = list(db[col].find({"video_id": video_oid}, {"frame_id": 1, "_id": 0}))
        for row in rows:
            frame = row.get("frame_id")
            if isinstance(frame, int):
                candidates.append(frame)

    if not candidates:
        # Fallback for frame-embedded schema.
        for row in db["frame"].find({"video_id": video_oid}, {"frame_id": 1, "_id": 0}):
            frame = row.get("frame_id")
            if isinstance(frame, int):
                candidates.append(frame)

    if not candidates:
        return None

    count = Counter(candidates)
    return count.most_common(1)[0][0]


def draw_one_box(
    canvas: Any,
    bbox: List[Any],
    label: str,
    color: Tuple[int, int, int],
    thickness: int,
) -> None:
    if not isinstance(bbox, list) or len(bbox) != 4:
        return

    try:
        x, y, w, h = [int(float(v)) for v in bbox]
    except Exception:
        return

    if w <= 0 or h <= 0:
        return

    x2 = x + w
    y2 = y + h

    cv2.rectangle(canvas, (x, y), (x2, y2), color, thickness)

    text = label[:80]
    (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
    cv2.rectangle(canvas, (x, max(0, y - th - 10)), (x + tw + 6, y), color, -1)
    cv2.putText(canvas, text, (x + 3, y - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 2)


def render_boxes(
    image: Any,
    persons: List[Dict[str, Any]],
    activities: List[Dict[str, Any]],
    objects: List[Dict[str, Any]],
    thickness: int,
) -> Any:
    canvas = image.copy()

    for row in persons:
        role = str(row.get("role", "person"))
        track = row.get("track_id")
        track_suffix = f" #{track}" if track is not None else ""
        conf = float(row.get("confidence", 0.0))
        label = f"P:{role}{track_suffix} {conf:.2f}"
        draw_one_box(canvas, row.get("bbox", []), label, (0, 255, 0), thickness)

    for row in activities:
        name = str(row.get("activity_name", row.get("action_name", "activity")))
        conf = float(row.get("confidence", 0.0))
        label = f"A:{name} {conf:.2f}"
        draw_one_box(canvas, row.get("bbox", []), label, (0, 165, 255), thickness)

    for row in objects:
        name = str(row.get("object_name", "object"))
        conf = float(row.get("confidence", 0.0))
        label = f"O:{name} {conf:.2f}"
        draw_one_box(canvas, row.get("bbox", []), label, (255, 215, 0), thickness)

    return canvas


def create_blank_canvas_from_boxes(
    persons: List[Dict[str, Any]],
    activities: List[Dict[str, Any]],
    objects: List[Dict[str, Any]],
    min_w: int = 1280,
    min_h: int = 720,
) -> Any:
    max_x = min_w
    max_y = min_h

    for row in persons + activities + objects:
        bbox = row.get("bbox", [])
        if not isinstance(bbox, list) or len(bbox) != 4:
            continue
        try:
            x, y, w, h = [int(float(v)) for v in bbox]
        except Exception:
            continue
        max_x = max(max_x, x + max(0, w) + 50)
        max_y = max(max_y, y + max(0, h) + 50)

    return np.full((max_y, max_x, 3), 255, dtype=np.uint8)


def extract_frame(video_path: str, frame_id: int) -> Any:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_id)
    ok, frame = cap.read()
    cap.release()
    if not ok or frame is None:
        raise RuntimeError(f"Cannot read frame {frame_id} from video")
    return frame


def ensure_parent_dir(path: str) -> None:
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)


def maybe_download_to_temp(path_or_url: str) -> str:
    if not path_or_url.lower().startswith(("http://", "https://")):
        return path_or_url

    suffix = os.path.splitext(path_or_url.split("?")[0])[1] or ".bin"
    fd, temp_path = tempfile.mkstemp(prefix="bbox_media_", suffix=suffix)
    os.close(fd)
    urllib.request.urlretrieve(path_or_url, temp_path)
    return temp_path


def run_image_mode(db: Any, image_id: str, image_path: Optional[str], output_path: str, thickness: int) -> None:
    image_oid = parse_object_id(image_id)
    persons, activities, objects = collect_image_docs(db, image_oid)

    image_doc = db["image"].find_one({"_id": image_oid})
    resolved_path = image_path or resolve_media_path_from_doc(image_doc)
    if not resolved_path:
        raise RuntimeError("No image path found. Use --media-path explicitly.")

    try:
        image = load_image_from_path_or_url(resolved_path)
    except Exception as exc:
        print(f"Warning: cannot load source image ({exc}). Falling back to blank canvas.")
        image = create_blank_canvas_from_boxes(persons, activities, objects)

    rendered = render_boxes(image, persons, activities, objects, thickness)
    ensure_parent_dir(output_path)
    if not cv2.imwrite(output_path, rendered):
        raise RuntimeError(f"Failed to write output image: {output_path}")

    print(f"Saved image bbox overlay: {output_path}")
    print(f"Counts -> persons={len(persons)}, activities={len(activities)}, objects={len(objects)}")


def run_video_mode(
    db: Any,
    video_id: str,
    video_path: Optional[str],
    output_path: str,
    frame_id: Optional[int],
    thickness: int,
) -> None:
    video_oid = parse_object_id(video_id)
    if frame_id is None:
        frame_id = pick_best_frame_id(db, video_oid)
        if frame_id is None:
            raise RuntimeError("No frame_id found for this video_id in DB.")

    persons, activities, objects = collect_video_docs_for_frame(db, video_oid, frame_id)

    video_doc = db["video"].find_one({"_id": video_oid})
    resolved_path = video_path or resolve_media_path_from_doc(video_doc)
    if not resolved_path:
        raise RuntimeError("No video path found. Use --media-path explicitly.")

    try:
        temp_path = maybe_download_to_temp(resolved_path)
        try:
            frame = extract_frame(temp_path, frame_id)
        finally:
            if temp_path != resolved_path and os.path.exists(temp_path):
                os.remove(temp_path)
    except Exception as exc:
        print(f"Warning: cannot load source video/frame ({exc}). Falling back to blank canvas.")
        frame = create_blank_canvas_from_boxes(persons, activities, objects)

    rendered = render_boxes(frame, persons, activities, objects, thickness)
    ensure_parent_dir(output_path)
    if not cv2.imwrite(output_path, rendered):
        raise RuntimeError(f"Failed to write output image: {output_path}")

    print(f"Saved video frame bbox overlay: {output_path}")
    print(f"frame_id={frame_id}")
    print(f"Counts -> persons={len(persons)}, activities={len(activities)}, objects={len(objects)}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Draw bbox overlays from MongoDB records.")
    parser.add_argument("--mode", required=True, choices=["image", "video"], help="Choose image or video mode")
    parser.add_argument("--id", required=True, help="Mongo ObjectId of image or video document")
    parser.add_argument("--media-path", default=None, help="Optional local path or URL for input media")
    parser.add_argument("--output", required=True, help="Output image path")
    parser.add_argument("--frame-id", type=int, default=None, help="Frame index for video mode")
    parser.add_argument("--mongodb-uri", default=DEFAULT_MONGODB_URI, help="MongoDB URI")
    parser.add_argument("--db", default=DEFAULT_DB_NAME, help="MongoDB database name")
    parser.add_argument("--thickness", type=int, default=2, help="Bounding box thickness")
    return parser


def main() -> None:
    args = build_parser().parse_args()

    client = MongoClient(args.mongodb_uri)
    db = client[args.db]

    if args.mode == "image":
        run_image_mode(db, args.id, args.media_path, args.output, args.thickness)
    else:
        run_video_mode(db, args.id, args.media_path, args.output, args.frame_id, args.thickness)


if __name__ == "__main__":
    main()