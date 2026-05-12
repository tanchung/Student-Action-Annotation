const Video = require('../models/VideoMetadata');
const { minioClient, BUCKET_NAME } = require("../config/minio");
const { getVideoMetadata, generateThumbnail, convertToH264, needsH264Conversion } = require('../utils/video.helper');
const PGMirrorService = require('../services/pgMirrorService');

exports.uploadVideo = async (req, res) => {
  try {
    const file = req.file;
    const customName = req.body.customName; // Tên tùy chỉnh từ client

    // 1. Kiểm tra File
    if (!file) {
      return res.status(400).json({ message: "Không có tệp được upload" });
    }
    if (!file.mimetype.startsWith("video/")) {
      return res.status(400).json({ message: "Tệp upload không phải là video" });
    }

    // 2. Lấy User ID từ Token (Middleware verifyToken đã gán vào req.user)
    const uploader_id = req.user ? req.user.id : null;
    if (!uploader_id) {
        return res.status(401).json({ message: "Không xác thực được người dùng" });
    }

    // Sử dụng tên tùy chỉnh nếu có, nếu không dùng tên gốc
    const fileExtension = file.originalname.split('.').pop();
    const finalName = customName ? `${customName}.${fileExtension}` : file.originalname;
    const objectName = `${Date.now()}_${finalName}`; // Thêm timestamp để tránh trùng

    // 3. Kiểm tra trùng lặp trên MinIO
    try {
      await minioClient.statObject(BUCKET_NAME, objectName);
      return res.status(409).json({ message: "Video đã tồn tại trong hệ thống (MinIO)" });
    } catch (err) {
      if (err.code !== "NotFound") throw err;
    }

    // 4. Extract video metadata (duration, fps, resolution)
    console.log('📊 Extracting video metadata...');
    let videoMeta = { duration: 0, fps: 0, width: 0, height: 0 };
    try {
      videoMeta = await getVideoMetadata(file.buffer);
      console.log(`✅ Video metadata: ${videoMeta.duration}s, ${videoMeta.width}x${videoMeta.height}, ${videoMeta.fps}fps`);
    } catch (metaErr) {
      console.warn('⚠️ Could not extract video metadata:', metaErr.message);
    }

    // 5. Convert to H.264 if needed (for browser compatibility)
    let videoBuffer = file.buffer;
    let finalObjectName = objectName;
    
    try {
      const conversionCheck = await needsH264Conversion(file.buffer);
      
      if (conversionCheck.needsConversion) {
        console.log(`🔄 Video codec is ${conversionCheck.codec}, converting to H.264...`);
        videoBuffer = await convertToH264(file.buffer);
        
        // Change filename to *_H264.mp4
        finalObjectName = objectName.replace(/\.(mp4|avi|mov|mkv|webm)$/i, '_H264.mp4');
        console.log(`✅ Converted to H.264: ${finalObjectName}`);
      } else {
        console.log('✓ Video already in H.264, no conversion needed');
      }
    } catch (convErr) {
      console.warn('⚠️ Could not convert video, uploading original:', convErr.message);
      // Continue with original video if conversion fails
    }

    // 6. Generate thumbnail
    console.log('🖼️ Generating thumbnail...');
    let thumbnailFilename = null;
    try {
      thumbnailFilename = await generateThumbnail(videoBuffer, finalObjectName);
      console.log(`✅ Thumbnail generated: ${thumbnailFilename}`);
    } catch (thumbErr) {
      console.warn('⚠️ Could not generate thumbnail:', thumbErr.message);
    }

    // 7. Upload video to MinIO
    await minioClient.putObject(
      BUCKET_NAME,
      finalObjectName,
      videoBuffer,
      videoBuffer.length,
      { 
        "Content-Type": "video/mp4",
        "Cache-Control": "public, max-age=31536000"
      }
    );

    console.log(`✅ Uploaded to MinIO: ${finalObjectName}`);

    // 8. Save to MongoDB with full metadata
    const newVideo = new Video({
      clip_name: customName || file.originalname.replace(/\.[^/.]+$/, ""),
      minio_url: finalObjectName, // Store filename only
      thumbnail_url: thumbnailFilename, // Store thumbnail filename
      uploader_id: uploader_id,
      status: "uploaded",
      duration: videoMeta.duration,
      fps: videoMeta.fps
    });

    await newVideo.save();

    // Mirror to PostgreSQL asynchronously (non-blocking)
    setImmediate(() => {
      PGMirrorService.mirrorMediaAsset(newVideo, 'video').catch(err => {
        console.error('Failed to mirror video to PostgreSQL:', err);
      });
    });

    return res.status(201).json({
      success: true,
      message: "Upload thành công",
      data: newVideo
    });

  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ message: "Lỗi Server khi upload video" });
  }
};