const ffmpeg = require('fluent-ffmpeg');
const { minioClient, BUCKET_NAME } = require('../config/minio');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

const unlinkAsync = promisify(fs.unlink);

/**
 * Extract video metadata (duration, resolution, etc.)
 */
async function getVideoMetadata(buffer) {
  return new Promise((resolve, reject) => {
    // Create temporary file
    const tempFilePath = path.join(__dirname, `temp_${Date.now()}.mp4`);
    
    fs.writeFileSync(tempFilePath, buffer);
    
    ffmpeg.ffprobe(tempFilePath, async (err, metadata) => {
      // Clean up temp file
      try {
        await unlinkAsync(tempFilePath);
      } catch (cleanupErr) {
        console.error('Failed to cleanup temp file:', cleanupErr);
      }
      
      if (err) {
        return reject(err);
      }
      
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      
      resolve({
        duration: Math.round(metadata.format.duration || 0),
        width: videoStream?.width || 0,
        height: videoStream?.height || 0,
        fps: videoStream?.r_frame_rate ? eval(videoStream.r_frame_rate) : 0,
        codec: videoStream?.codec_name || 'unknown'
      });
    });
  });
}

/**
 * Generate thumbnail from video buffer
 */
async function generateThumbnail(videoBuffer, outputFilename) {
  return new Promise((resolve, reject) => {
    const tempVideoPath = path.join(__dirname, `temp_video_${Date.now()}.mp4`);
    const tempThumbPath = path.join(__dirname, `temp_thumb_${Date.now()}.jpg`);
    
    // Write buffer to temp file
    fs.writeFileSync(tempVideoPath, videoBuffer);
    
    ffmpeg(tempVideoPath)
      .screenshots({
        timestamps: ['00:00:01'], // Take screenshot at 1 second
        filename: path.basename(tempThumbPath),
        folder: path.dirname(tempThumbPath),
        size: '640x360' // Thumbnail size
      })
      .on('end', async () => {
        try {
          // Read generated thumbnail
          const thumbnailBuffer = fs.readFileSync(tempThumbPath);
          
          // Upload to MinIO
          const thumbnailName = outputFilename.replace(/\.(mp4|avi|mov|mkv|webm)$/i, '.jpg');
          await minioClient.putObject(
            BUCKET_NAME,
            thumbnailName,
            thumbnailBuffer,
            thumbnailBuffer.length,
            { 'Content-Type': 'image/jpeg' }
          );
          
          console.log(`✅ Thumbnail uploaded: ${thumbnailName}`);
          
          // Clean up temp files
          await unlinkAsync(tempVideoPath);
          await unlinkAsync(tempThumbPath);
          
          resolve(thumbnailName);
        } catch (uploadErr) {
          // Clean up on error
          try {
            await unlinkAsync(tempVideoPath);
            if (fs.existsSync(tempThumbPath)) {
              await unlinkAsync(tempThumbPath);
            }
          } catch (cleanupErr) {
            console.error('Cleanup error:', cleanupErr);
          }
          reject(uploadErr);
        }
      })
      .on('error', async (err) => {
        // Clean up on error
        try {
          await unlinkAsync(tempVideoPath);
          if (fs.existsSync(tempThumbPath)) {
            await unlinkAsync(tempThumbPath);
          }
        } catch (cleanupErr) {
          console.error('Cleanup error:', cleanupErr);
        }
        reject(err);
      });
  });
}

/**
 * Convert video to H.264 codec for browser compatibility
 * Returns converted video buffer
 */
async function convertToH264(inputBuffer) {
  return new Promise((resolve, reject) => {
    const tempInputPath = path.join(__dirname, `temp_input_${Date.now()}.mp4`);
    const tempOutputPath = path.join(__dirname, `temp_output_${Date.now()}.mp4`);
    
    // Write input buffer to temp file
    fs.writeFileSync(tempInputPath, inputBuffer);
    
    console.log('🔄 Converting video to H.264...');
    
    ffmpeg(tempInputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-preset fast',       // Faster encoding
        '-crf 23',           // Good quality
        '-movflags +faststart', // Enable streaming
        '-pix_fmt yuv420p'   // Ensure compatibility
      ])
      .on('start', (cmd) => {
        console.log(`   📝 Starting conversion...`);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          process.stdout.write(`\r   ⏳ Converting: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on('end', async () => {
        console.log('\n   ✅ Conversion completed');
        
        try {
          // Read converted file
          const convertedBuffer = fs.readFileSync(tempOutputPath);
          
          // Clean up temp files
          await unlinkAsync(tempInputPath);
          await unlinkAsync(tempOutputPath);
          
          resolve(convertedBuffer);
        } catch (readErr) {
          reject(readErr);
        }
      })
      .on('error', async (err) => {
        console.log('\n   ❌ Conversion failed:', err.message);
        
        // Clean up on error
        try {
          if (fs.existsSync(tempInputPath)) await unlinkAsync(tempInputPath);
          if (fs.existsSync(tempOutputPath)) await unlinkAsync(tempOutputPath);
        } catch (cleanupErr) {
          console.error('Cleanup error:', cleanupErr);
        }
        
        reject(err);
      })
      .save(tempOutputPath);
  });
}

/**
 * Check if video needs conversion to H.264
 */
async function needsH264Conversion(buffer) {
  return new Promise((resolve, reject) => {
    const tempFilePath = path.join(__dirname, `temp_check_${Date.now()}.mp4`);
    
    fs.writeFileSync(tempFilePath, buffer);
    
    ffmpeg.ffprobe(tempFilePath, async (err, metadata) => {
      try {
        await unlinkAsync(tempFilePath);
      } catch (cleanupErr) {
        console.error('Failed to cleanup temp file:', cleanupErr);
      }
      
      if (err) {
        return reject(err);
      }
      
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      const codec = videoStream?.codec_name || 'unknown';
      
      // Need conversion if not H.264
      const needsConversion = codec !== 'h264';
      
      console.log(`   📊 Current codec: ${codec} ${needsConversion ? '→ Needs conversion' : '✓ Already H.264'}`);
      
      resolve({ needsConversion, codec });
    });
  });
}

module.exports = {
  getVideoMetadata,
  generateThumbnail,
  convertToH264,
  needsH264Conversion
};
