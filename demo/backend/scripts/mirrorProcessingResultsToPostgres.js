const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
const connectMongo = require('../config/mongo');
const pgPool = require('../config/postgres');
const neo4jDriver = require('../config/neo4j');
const PGMirrorService = require('../services/pgMirrorService');

function toObjectId(value) {
  return ObjectId.isValid(value) ? new ObjectId(value) : value;
}

async function mirrorImageResults(imageId) {
  const db = mongoose.connection.db;
  const imageObjectId = toObjectId(imageId);

  const [persons, objects, activities, triplets] = await Promise.all([
    db.collection('person').find({ image_id: imageObjectId }).toArray(),
    db.collection('entity_object').find({ image_id: imageObjectId }).toArray(),
    db.collection('activity').find({ image_id: imageObjectId }).toArray(),
    db.collection('scene_graph_triplet').find({ image_id: imageObjectId }).toArray(),
  ]);

  console.log(`📊 PG mirror image payload: ${persons.length} persons, ${objects.length} objects, ${activities.length} activities, ${triplets.length} triplets`);
  await PGMirrorService.mirrorImageProcessingResults(imageId, persons, objects, activities, triplets);
}

async function mirrorVideoResults(videoId) {
  const db = mongoose.connection.db;
  const videoObjectId = toObjectId(videoId);

  const [segments, persons, objects, activities] = await Promise.all([
    db.collection('segment').find({ video_id: videoObjectId }).toArray(),
    db.collection('person').find({ video_id: videoObjectId }).toArray(),
    db.collection('entity_object').find({ video_id: videoObjectId }).toArray(),
    db.collection('activity').find({ video_id: videoObjectId }).toArray(),
  ]);

  console.log(`📊 PG mirror video payload: ${segments.length} segments, ${persons.length} persons, ${objects.length} objects, ${activities.length} activities`);
  await PGMirrorService.mirrorVideoProcessingResults(videoId, segments, persons, objects, activities);
}

async function main() {
  const [typeArg, mediaIdArg] = process.argv.slice(2);
  const type = (typeArg || '').toLowerCase();
  const mediaId = mediaIdArg || '';

  if (!['image', 'video'].includes(type) || !mediaId) {
    console.error('Usage: node mirrorProcessingResultsToPostgres.js <image|video> <mediaId>');
    process.exit(1);
  }

  try {
    await connectMongo();

    if (type === 'image') {
      await mirrorImageResults(mediaId);
    } else {
      await mirrorVideoResults(mediaId);
    }

    console.log(`✅ PG mirror for ${type} ${mediaId} completed`);
  } catch (error) {
    console.error(`❌ PG mirror for ${type} ${mediaId} failed:`, error.message);
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