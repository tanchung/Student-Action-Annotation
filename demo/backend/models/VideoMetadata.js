const mongoose = require('mongoose');

const VideoSchema = new mongoose.Schema({
  clip_name: { type: String, required: true },
  duration: { type: Number, default: 0 },
  fps: { type: Number, default: 0 },
  minio_url: { type: String, required: true },
  environment_id: { type: mongoose.Schema.Types.ObjectId, default: null },
  created_at: { type: Date, default: Date.now },
  uploader_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  embedding: { type: [Number], default: [] },
  status: { type: String, default: 'uploaded' },
  thumbnail_url: { type: String, default: null },
  error_message: { type: String, default: null },
  is_deleted: { type: Boolean, default: false },
  deleted_at: { type: Date, default: null }
}, { collection: 'video' });

module.exports = mongoose.model('Video', VideoSchema);