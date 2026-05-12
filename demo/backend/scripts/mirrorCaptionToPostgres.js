const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
const connectMongo = require('../config/mongo');
const pgPool = require('../config/postgres');
const neo4jDriver = require('../config/neo4j');
const PGMirrorService = require('../services/pgMirrorService');

function toObjectIdOrString(value) {
  if (ObjectId.isValid(value)) {
    return new ObjectId(value);
  }
  return value;
}

async function main() {
  const [mediaTypeArg, mediaIdArg] = process.argv.slice(2);
  const mediaType = (mediaTypeArg || '').toLowerCase();
  const mediaId = mediaIdArg || '';

  if (!['image', 'video'].includes(mediaType) || !mediaId) {
    console.error('Usage: node mirrorCaptionToPostgres.js <image|video> <mediaId>');
    process.exit(1);
  }

  try {
    await connectMongo();

    const db = mongoose.connection.db;
    const idValue = toObjectIdOrString(mediaId);
    const fieldName = mediaType === 'video' ? 'video_id' : 'image_id';
    const query = mediaType === 'video'
      ? {
          $or: [
            { [fieldName]: idValue },
            { [fieldName]: mediaId },
          ],
          caption_scope: 'video',
        }
      : {
          $or: [
            { [fieldName]: idValue },
            { [fieldName]: mediaId },
          ],
        };

    const captionDoc = await db.collection('caption').findOne(query, {
      sort: { created_at: -1 },
    });

    if (!captionDoc) {
      console.warn(`⚠️ No caption document found for ${mediaType} ${mediaId}; skipping PostgreSQL mirror.`);
      return;
    }

    const mirrored = await PGMirrorService.mirrorCaption(captionDoc, mediaId);
    if (mirrored) {
      console.log(`✅ PostgreSQL caption mirror completed for ${mediaType} ${mediaId}`);
    } else {
      console.warn(`⚠️ PostgreSQL caption mirror returned false for ${mediaType} ${mediaId}`);
    }
  } catch (error) {
    console.error(`❌ PostgreSQL caption mirror failed for ${mediaType} ${mediaId}:`, error.message);
    process.exitCode = 1;
  } finally {
    try {
      await mongoose.disconnect();
    } catch {
      // ignore
    }
    try {
      await pgPool.end();
    } catch {
      // ignore
    }
    try {
      await neo4jDriver.close();
    } catch {
      // ignore
    }
  }
}

main();
