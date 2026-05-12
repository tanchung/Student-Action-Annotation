/**
 * PostgreSQL Mirror Service
 * Async non-blocking mirror writes from MongoDB to PostgreSQL
 * Designed to NOT interrupt AI pipeline if PostgreSQL fails
 */

const mongoose = require('mongoose');
const pgPool = require('../config/postgres');
const { ObjectId } = require('mongodb');
const neo4jDriver = require('../config/neo4j');

class PGMirrorService {
  static _getMongoCollection(collectionName) {
    return mongoose.connection?.db?.collection(collectionName) || null;
  }

  static async _updateMongoPgId(collectionName, mongoId, pgId) {
    try {
      const collection = this._getMongoCollection(collectionName);
      if (!collection || !mongoId || !pgId) {
        return false;
      }

      await collection.updateOne(
        { _id: new ObjectId(mongoId) },
        { $set: { pg_id: String(pgId) } }
      );
      return true;
    } catch (err) {
      console.warn(`⚠️ pgMirror: Failed to update Mongo pg_id for ${collectionName}/${mongoId}:`, err.message);
      return false;
    }
  }

  static async _updateNeo4jPgId(label, mongoId, pgId) {
    try {
      if (!label || !mongoId || !pgId) {
        return false;
      }

      const session = neo4jDriver.session();
      try {
        await session.run(
          `MATCH (n:${label} {mongo_id: $mongoId}) SET n.pg_id = $pgId RETURN count(n) AS updated`,
          { mongoId: String(mongoId), pgId: String(pgId) }
        );
      } finally {
        await session.close();
      }

      return true;
    } catch (err) {
      console.warn(`⚠️ pgMirror: Failed to update Neo4j pg_id for ${label}/${mongoId}:`, err.message);
      return false;
    }
  }

  /**
   * Mirror media asset (image or video) to PostgreSQL
   * Called after successful Mongo save in upload controller
   */
  static async mirrorMediaAsset(mongoDoc, type = 'video') {
    try {
      if (!mongoDoc || !mongoDoc._id) {
        console.warn('⚠️ pgMirror: Invalid mediaDoc for mirroring');
        return false;
      }

      const mongoId = mongoDoc._id.toString();
      const name = mongoDoc.clip_name || mongoDoc.image_name || 'Untitled';
      const uploaderId = mongoDoc.uploader_id ? mongoDoc.uploader_id.toString() : null;
      const collectionName = type === 'image' ? 'image' : 'video';
      const neo4jLabel = type === 'image' ? 'Image' : 'Video';

      const query = `
        INSERT INTO media_assets (mongo_id, type, name, uploader_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (mongo_id) DO UPDATE SET
          type = $2,
          name = $3,
          uploader_id = $4
        RETURNING id
      `;

      const result = await pgPool.query(query, [mongoId, type, name, uploaderId]);
      const pgId = result.rows[0]?.id;

      await Promise.all([
        this._updateMongoPgId(collectionName, mongoId, pgId),
        this._updateNeo4jPgId(neo4jLabel, mongoId, pgId),
      ]);

      console.log(`✅ pgMirror: Mirrored media_asset - ${type} (${mongoId})`);
      return true;
    } catch (err) {
      console.error(`❌ pgMirror: Failed to mirror media_asset:`, err.message);
      // Non-blocking error - don't throw
      return false;
    }
  }

  /**
   * Mirror segment from MongoDB to PostgreSQL
   * Called after AI completes and segments are created
   */
  static async mirrorSegment(mongoSegment) {
    try {
      if (!mongoSegment || !mongoSegment._id) {
        console.warn('⚠️ pgMirror: Invalid segment for mirroring');
        return false;
      }

      const mongoId = mongoSegment._id.toString();
      const videoId = mongoSegment.video_id ? mongoSegment.video_id.toString() : null;

      // First find media_id from media_assets
      const mediaResult = await pgPool.query(
        'SELECT id FROM media_assets WHERE mongo_id = $1',
        [videoId]
      );

      if (mediaResult.rows.length === 0) {
        console.warn(`⚠️ pgMirror: Media asset not found for segment ${mongoId}`);
        return false;
      }

      const mediaId = mediaResult.rows[0].id;

      const query = `
        INSERT INTO segments (mongo_id, media_id)
        VALUES ($1, $2)
        ON CONFLICT (mongo_id) DO UPDATE SET
          media_id = $2
        RETURNING id
      `;

      const result = await pgPool.query(query, [mongoId, mediaId]);
      const pgId = result.rows[0]?.id;

      await Promise.all([
        this._updateMongoPgId('segment', mongoId, pgId),
        this._updateNeo4jPgId('Segment', mongoId, pgId),
      ]);

      console.log(`✅ pgMirror: Mirrored segment - ${mongoId}`);
      return true;
    } catch (err) {
      console.error(`❌ pgMirror: Failed to mirror segment:`, err.message);
      return false;
    }
  }

  /**
   * Mirror person from MongoDB to PostgreSQL
   */
  static async mirrorPerson(mongoPerson) {
    try {
      if (!mongoPerson || !mongoPerson._id) {
        console.warn('⚠️ pgMirror: Invalid person for mirroring');
        return false;
      }

      const mongoId = mongoPerson._id.toString();
      const role = mongoPerson.role || 'unknown';

      const query = `
        INSERT INTO persons_catalog (mongo_id, role)
        VALUES ($1, $2)
        ON CONFLICT (mongo_id) DO UPDATE SET
          role = $2
        RETURNING id
      `;

      const result = await pgPool.query(query, [mongoId, role]);
      const pgId = result.rows[0]?.id;

      await Promise.all([
        this._updateMongoPgId('person', mongoId, pgId),
        this._updateNeo4jPgId('Person', mongoId, pgId),
      ]);

      console.log(`✅ pgMirror: Mirrored person - ${mongoId}`);
      return true;
    } catch (err) {
      console.error(`❌ pgMirror: Failed to mirror person:`, err.message);
      return false;
    }
  }

  /**
   * Mirror entity_object from MongoDB to PostgreSQL
   */
  static async mirrorObject(mongoObject) {
    try {
      if (!mongoObject || !mongoObject._id) {
        console.warn('⚠️ pgMirror: Invalid object for mirroring');
        return false;
      }

      const mongoId = mongoObject._id.toString();
      const objectName = mongoObject.object_name || 'unknown';
      const category = mongoObject.category || 'other';

      const query = `
        INSERT INTO objects_catalog (mongo_id, object_name, category)
        VALUES ($1, $2, $3)
        ON CONFLICT (mongo_id) DO UPDATE SET
          object_name = $2,
          category = $3
        RETURNING id
      `;

      const result = await pgPool.query(query, [mongoId, objectName, category]);
      const pgId = result.rows[0]?.id;

      await Promise.all([
        this._updateMongoPgId('entity_object', mongoId, pgId),
        this._updateNeo4jPgId('EntityObject', mongoId, pgId),
      ]);

      console.log(`✅ pgMirror: Mirrored object - ${mongoId}`);
      return true;
    } catch (err) {
      console.error(`❌ pgMirror: Failed to mirror object:`, err.message);
      return false;
    }
  }

  /**
   * Mirror activity from MongoDB to PostgreSQL
   */
  static async mirrorActivity(mongoActivity) {
    try {
      if (!mongoActivity || !mongoActivity._id) {
        console.warn('⚠️ pgMirror: Invalid activity for mirroring');
        return false;
      }

      const mongoId = mongoActivity._id.toString();
      const activityName = mongoActivity.activity_name || 'unknown';
      const category = mongoActivity.category || 'other';

      const query = `
        INSERT INTO activities_catalog (mongo_id, activity_name, category)
        VALUES ($1, $2, $3)
        ON CONFLICT (mongo_id) DO UPDATE SET
          activity_name = $2,
          category = $3
        RETURNING id
      `;

      const result = await pgPool.query(query, [mongoId, activityName, category]);
      const pgId = result.rows[0]?.id;

      await Promise.all([
        this._updateMongoPgId('activity', mongoId, pgId),
        this._updateNeo4jPgId('Activity', mongoId, pgId),
      ]);

      console.log(`✅ pgMirror: Mirrored activity - ${mongoId}`);
      return true;
    } catch (err) {
      console.error(`❌ pgMirror: Failed to mirror activity:`, err.message);
      return false;
    }
  }

  /**
   * Mirror interaction (Person-Activity-Object relationship)
   */
  static async mirrorInteraction(mongoSegment, personId, activityId, objectId, mediaId) {
    try {
      // Find all catalog IDs from PostgreSQL
      const [personResult, activityResult, objectResult, mediaResult] = await Promise.all([
        pgPool.query('SELECT id FROM persons_catalog WHERE mongo_id = $1', [personId]),
        pgPool.query('SELECT id FROM activities_catalog WHERE mongo_id = $1', [activityId]),
        objectId ? pgPool.query('SELECT id FROM objects_catalog WHERE mongo_id = $1', [objectId]) : Promise.resolve({ rows: [] }),
        pgPool.query('SELECT id FROM media_assets WHERE mongo_id = $1', [mediaId])
      ]);

      const pgPersonId = personResult.rows[0]?.id;
      const pgActivityId = activityResult.rows[0]?.id;
      const pgObjectId = objectResult.rows[0]?.id || null;
      const pgMediaId = mediaResult.rows[0]?.id;

      if (!pgPersonId || !pgActivityId || !pgMediaId) {
        console.warn(`⚠️ pgMirror: Missing person/activity/media for interaction`);
        return false;
      }

      const query = `
        INSERT INTO interactions (person_id, activity_id, object_id, media_id)
        VALUES ($1, $2, $3, $4)
      `;

      await pgPool.query(query, [pgPersonId, pgActivityId, pgObjectId, pgMediaId]);
      console.log(`✅ pgMirror: Mirrored interaction - Person-Activity-Object`);
      return true;
    } catch (err) {
      console.error(`❌ pgMirror: Failed to mirror interaction:`, err.message);
      return false;
    }
  }

  /**
   * Mirror caption from MongoDB to PostgreSQL
   */
  static async mirrorCaption(mongoCaption, mediaId) {
    try {
      if (!mongoCaption || !mongoCaption._id) {
        console.warn('⚠️ pgMirror: Invalid caption for mirroring');
        return false;
      }

      const mongoId = mongoCaption._id.toString();
      const content = mongoCaption.caption || mongoCaption.content || '';

      // Find media from PostgreSQL
      const mediaResult = await pgPool.query(
        'SELECT id FROM media_assets WHERE mongo_id = $1',
        [mediaId.toString()]
      );

      if (mediaResult.rows.length === 0) {
        console.warn(`⚠️ pgMirror: Media asset not found for caption ${mongoId}`);
        return false;
      }

      const pgMediaId = mediaResult.rows[0].id;

      const query = `
        INSERT INTO captions (mongo_id, media_id, content)
        VALUES ($1, $2, $3)
        ON CONFLICT (mongo_id) DO UPDATE SET
          content = $3
        RETURNING id
      `;

      const result = await pgPool.query(query, [mongoId, pgMediaId, content]);
      const pgId = result.rows[0]?.id;

      await Promise.all([
        this._updateMongoPgId('caption', mongoId, pgId),
        this._updateNeo4jPgId('Caption', mongoId, pgId),
      ]);

      console.log(`✅ pgMirror: Mirrored caption - ${mongoId}`);
      return true;
    } catch (err) {
      console.error(`❌ pgMirror: Failed to mirror caption:`, err.message);
      return false;
    }
  }

  /**
   * Batch mirror multiple documents asynchronously
   * Non-blocking - runs in background
   */
  static async mirrorBatch(operations) {
    try {
      // Run all operations concurrently (don't await in main thread)
      return Promise.all(operations); // This resolves immediately, actual writes happen in background
    } catch (err) {
      console.error(`❌ pgMirror: Batch operation encountered error:`, err.message);
    }
  }

  /**
   * Mirror video processing results
   * Called after Python AI completes
   */
  static async mirrorVideoProcessingResults(videoId, segments, persons, objects, activities, captions) {
    try {
      const operations = [];

      // Mirror all segments
      if (segments && Array.isArray(segments)) {
        for (const segment of segments) {
          operations.push(this.mirrorSegment(segment));
        }
      }

      // Mirror all persons
      if (persons && Array.isArray(persons)) {
        for (const person of persons) {
          operations.push(this.mirrorPerson(person));
        }
      }

      // Mirror all objects
      if (objects && Array.isArray(objects)) {
        for (const obj of objects) {
          operations.push(this.mirrorObject(obj));
        }
      }

      // Mirror all activities
      if (activities && Array.isArray(activities)) {
        for (const activity of activities) {
          operations.push(this.mirrorActivity(activity));
        }
      }

      // Mirror all captions
      if (captions && Array.isArray(captions)) {
        for (const caption of captions) {
          operations.push(this.mirrorCaption(caption, videoId));
        }
      }

      // Run the queued mirrors before returning so standalone scripts can exit cleanly.
      await this.mirrorBatch(operations);

      console.log(`✅ pgMirror: Queued ${operations.length} mirror operations for video ${videoId}`);
      return true;
    } catch (err) {
      console.error(`❌ pgMirror: Failed to mirror video results:`, err.message);
      return false;
    }
  }

  /**
   * Mirror image processing results
   */
  static async mirrorImageProcessingResults(imageId, persons, objects, activities, triplets, captions) {
    try {
      const operations = [];

      // Mirror all persons
      if (persons && Array.isArray(persons)) {
        for (const person of persons) {
          operations.push(this.mirrorPerson(person));
        }
      }

      // Mirror all objects
      if (objects && Array.isArray(objects)) {
        for (const obj of objects) {
          operations.push(this.mirrorObject(obj));
        }
      }

      // Mirror all activities
      if (activities && Array.isArray(activities)) {
        for (const activity of activities) {
          operations.push(this.mirrorActivity(activity));
        }
      }

      // Mirror all captions
      if (captions && Array.isArray(captions)) {
        for (const caption of captions) {
          operations.push(this.mirrorCaption(caption, imageId));
        }
      }

      // Run the queued mirrors before returning so standalone scripts can exit cleanly.
      await this.mirrorBatch(operations);

      console.log(`✅ pgMirror: Queued ${operations.length} mirror operations for image ${imageId}`);
      return true;
    } catch (err) {
      console.error(`❌ pgMirror: Failed to mirror image results:`, err.message);
      return false;
    }
  }
}

module.exports = PGMirrorService;
