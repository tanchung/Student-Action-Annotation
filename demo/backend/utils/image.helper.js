const sharp = require('sharp');
const { minioClient, BUCKET_NAME } = require('../config/minio');
const path = require('path');

/**
 * Extract image metadata (dimensions, format, size)
 */
async function getImageMetadata(buffer) {
  try {
    const metadata = await sharp(buffer).metadata();
    
    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || 'unknown',
      size: buffer.length
    };
  } catch (err) {
    throw new Error(`Failed to extract image metadata: ${err.message}`);
  }
}

/**
 * Generate thumbnail from image buffer
 */
async function generateImageThumbnail(imageBuffer, outputFilename) {
  try {
    // Resize image to thumbnail size (640x360 to match video thumbnails)
    const thumbnailBuffer = await sharp(imageBuffer)
      .resize(640, 360, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 80 })
      .toBuffer();
    
    // Upload to MinIO
    const thumbnailName = outputFilename.replace(/\.(jpg|jpeg|png|webp|gif)$/i, '_thumb.jpg');
    await minioClient.putObject(
      BUCKET_NAME,
      thumbnailName,
      thumbnailBuffer,
      thumbnailBuffer.length,
      { 'Content-Type': 'image/jpeg' }
    );
    
    console.log(`✅ Image thumbnail uploaded: ${thumbnailName}`);
    return thumbnailName;
  } catch (err) {
    throw new Error(`Failed to generate image thumbnail: ${err.message}`);
  }
}

/**
 * Convert image to optimized format (WebP for better compression)
 */
async function optimizeImage(inputBuffer, originalFormat) {
  try {
    console.log('🔄 Optimizing image...');
    
    const sharpInstance = sharp(inputBuffer);
    
    // Check if the image needs optimization
    const metadata = await sharpInstance.metadata();
    
    // Only convert if not already WebP or if file is too large
    if (originalFormat === 'webp' && inputBuffer.length < 5 * 1024 * 1024) {
      console.log('✓ Image already optimized');
      return { buffer: inputBuffer, format: 'webp', optimized: false };
    }
    
    // Convert to WebP for better compression
    const optimizedBuffer = await sharpInstance
      .webp({ quality: 85 })
      .toBuffer();
    
    console.log(`✅ Image optimized: ${inputBuffer.length} -> ${optimizedBuffer.length} bytes`);
    
    return { buffer: optimizedBuffer, format: 'webp', optimized: true };
  } catch (err) {
    console.warn('⚠️ Could not optimize image, using original:', err.message);
    return { buffer: inputBuffer, format: originalFormat, optimized: false };
  }
}

/**
 * Validate if buffer is a valid image
 */
async function validateImage(buffer) {
  try {
    const metadata = await sharp(buffer).metadata();
    return {
      valid: true,
      format: metadata.format,
      width: metadata.width,
      height: metadata.height
    };
  } catch (err) {
    return {
      valid: false,
      error: err.message
    };
  }
}

module.exports = {
  getImageMetadata,
  generateImageThumbnail,
  optimizeImage,
  validateImage
};
