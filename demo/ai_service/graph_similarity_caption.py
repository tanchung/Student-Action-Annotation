import os
from datetime import datetime
from typing import Any, Dict, Optional

from bson import ObjectId
from neo4j import GraphDatabase


class GraphSimilarityCaptionService:
    def __init__(self):
        uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        user = os.getenv("NEO4J_USER", "neo4j")
        password = os.getenv("NEO4J_PASS") or os.getenv("NEO4J_PASSWORD", "12345678")
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self.driver.close()

    def _get_caption_from_neo4j(self, image_id: str) -> Optional[Dict[str, Any]]:
        with self.driver.session() as session:
            query = """
            MATCH (i:Image {mongo_id: $img_id})
            MATCH (i)<-[:LOCAL_ROOT_OF]-(rc:RootCaption)
            MATCH (c:Caption)-[:DESCRIPTION_OF]->(rc)
            RETURN c.text AS caption_text,
                   c.model_used AS model_used,
                   c.caption_source AS caption_source
            ORDER BY c.mongo_id DESC
            LIMIT 1
            """
            record = session.run(query, img_id=image_id).single()
            if not record:
                return None

            text = record.get("caption_text")
            if not text:
                return None

            return {
                "caption": text,
                "model_used": record.get("model_used") or "neo4j_caption",
                "caption_source": record.get("caption_source") or "neo4j",
            }

    def find_most_similar_image(self, current_image_id: str, threshold: float = 0.6) -> Optional[Dict[str, Any]]:
        """
        Hybrid score (no APOC):
        - semantic_score: cosine similarity trên phân phối Activity.activity_name
        - scale_score: min(total_actions) / max(total_actions)
        - final_score = 0.8 * semantic_score + 0.2 * scale_score
        """
        with self.driver.session() as session:
            query = """
            MATCH (target:Image {mongo_id: $img_id})
            MATCH (target)<-[:LOCAL_ROOT_OF]-(raTarget:RootActivity)
            OPTIONAL MATCH (aTarget:Activity)-[:ACTION_OF]->(raTarget)
              WITH [x IN collect(aTarget.activity_name) WHERE x IS NOT NULL] AS target_actions
              WITH target_actions, size(target_actions) AS target_total
            WHERE target_total > 0
              UNWIND target_actions AS target_name
              WITH target_total, target_name, count(*) AS target_count
              WITH target_total,
                  collect({name: target_name, pct: toFloat(target_count) / target_total}) AS target_dist
              WITH target_total, target_dist,
                  sqrt(reduce(s = 0.0, item IN target_dist | s + item.pct * item.pct)) AS target_norm

            MATCH (other:Image)
            WHERE other.mongo_id <> $img_id
            MATCH (other)<-[:LOCAL_ROOT_OF]-(raOther:RootActivity)
            OPTIONAL MATCH (aOther:Activity)-[:ACTION_OF]->(raOther)
              WITH other, target_total, target_dist, target_norm,
                 [x IN collect(aOther.activity_name) WHERE x IS NOT NULL] AS other_actions
              WITH other, target_total, target_dist, target_norm, other_actions,
                  size(other_actions) AS other_total
            WHERE other_total > 0
              UNWIND other_actions AS other_name
              WITH other, target_total, other_total, target_dist, target_norm, other_name, count(*) AS other_count
              WITH other, target_total, other_total, target_dist, target_norm,
                  collect({name: other_name, pct: toFloat(other_count) / other_total}) AS other_dist
              WITH other, target_total, other_total, target_dist, target_norm, other_dist,
                  sqrt(reduce(s = 0.0, item IN other_dist | s + item.pct * item.pct)) AS other_norm,
                 (toFloat(CASE WHEN target_total < other_total THEN target_total ELSE other_total END) /
                  CASE WHEN target_total > other_total THEN target_total ELSE other_total END) AS scale_score
              UNWIND target_dist AS t
              UNWIND other_dist AS o
              WITH other, target_total, other_total, target_norm, other_norm, scale_score, t, o
              WHERE t.name = o.name
              WITH other, target_total, other_total, target_norm, other_norm, scale_score,
                  sum(t.pct * o.pct) AS dot

            WITH other,
                 CASE
                    WHEN target_norm = 0 OR other_norm = 0 THEN 0.0
                    ELSE dot / (target_norm * other_norm)
                 END AS semantic_score,
                 scale_score
            WITH other, semantic_score, scale_score,
                 (semantic_score * 0.8 + scale_score * 0.2) AS final_score
            WHERE final_score >= $threshold

            RETURN other.mongo_id AS similar_image_id,
                   semantic_score,
                   scale_score,
                   final_score
            ORDER BY final_score DESC
            LIMIT 1
            """

            try:
                record = session.run(query, img_id=current_image_id, threshold=float(threshold)).single()
                if not record:
                    return None

                return {
                    "similar_image_id": record["similar_image_id"],
                    "semantic_score": round(float(record["semantic_score"]), 4),
                    "scale_score": round(float(record["scale_score"]), 4),
                    "final_score": round(float(record["final_score"]), 4),
                }
            except Exception as error:
                print(f"❌ Neo4j similarity query error: {error}")
                return None

    @staticmethod
    def _extract_caption_text(caption_doc: Dict[str, Any]) -> Optional[str]:
        if not caption_doc:
            return None
        return (
            caption_doc.get("caption")
            or caption_doc.get("caption_text")
            or caption_doc.get("text")
            or caption_doc.get("description")
        )

    def apply_best_caption(self, mongo_db, new_image_id: str, threshold: float = 0.6) -> Dict[str, Any]:
        """
        - Tìm ảnh tương tự nhất từ Neo4j
        - Lấy caption của ảnh nguồn từ MongoDB (collection caption)
        - Gán caption mới cho ảnh đích bằng insert collection caption
        """
        image_oid = ObjectId(new_image_id)

        # Nếu ảnh mới đã có caption thì không overwrite
        existed_caption = mongo_db["caption"].find_one(
            {"$or": [{"image_id": image_oid}, {"image_id": new_image_id}]}
        )
        if existed_caption:
            return {
                "success": False,
                "message": "Target image already has caption.",
            }

        match = self.find_most_similar_image(new_image_id, threshold=threshold)
        if not match:
            return {
                "success": False,
                "message": "No similar graph found above threshold.",
            }

        similar_image_id = match["similar_image_id"]

        source_image_doc = None
        source_image_oid = None
        if ObjectId.is_valid(similar_image_id):
            source_image_oid = ObjectId(similar_image_id)
            source_image_doc = mongo_db["image"].find_one({"_id": source_image_oid})

        candidate_image_ids = [similar_image_id]
        if source_image_oid is not None:
            candidate_image_ids.append(source_image_oid)
        if source_image_doc and source_image_doc.get("image_id") is not None:
            candidate_image_ids.append(source_image_doc.get("image_id"))

        or_conditions = [{"image_id": value} for value in candidate_image_ids]

        source_caption_doc = mongo_db["caption"].find_one(
            {"$or": or_conditions},
            sort=[("created_at", -1)],
        )

        caption_text = self._extract_caption_text(source_caption_doc)

        if not caption_text and source_image_doc:
            caption_text = self._extract_caption_text(source_image_doc)

        if not caption_text:
            neo4j_caption_doc = self._get_caption_from_neo4j(similar_image_id)
            caption_text = self._extract_caption_text(neo4j_caption_doc)

        if not caption_text:
            return {
                "success": False,
                "message": "Similar image found but source caption not found.",
                "similar_image_id": similar_image_id,
                "candidate_image_ids": [str(x) for x in candidate_image_ids],
            }

        model_used = (
            (source_caption_doc or {}).get("model_used")
            or (source_caption_doc or {}).get("generated_by")
            or (source_image_doc or {}).get("model_used")
            or "graph_similarity"
        )

        new_caption_doc = {
            "_id": ObjectId(),
            "image_id": image_oid,
            "caption": caption_text,
            "model_used": model_used,
            "caption_source": "graph_similarity_transfer",
            "similarity_source_image_id": similar_image_id,
            "similarity_score": round(match["final_score"] * 100, 2),
            "semantic_score": round(match["semantic_score"] * 100, 2),
            "scale_score": round(match["scale_score"] * 100, 2),
            "created_at": datetime.utcnow(),
        }

        mongo_db["caption"].insert_one(new_caption_doc)

        mongo_db["image"].update_one(
            {"_id": image_oid},
            {
                "$set": {
                    "caption_status": "generated_by_similarity",
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
            "caption": caption_text,
            "similar_image_id": similar_image_id,
            "score": new_caption_doc["similarity_score"],
        }
