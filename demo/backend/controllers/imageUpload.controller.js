const Image = require('../models/ImageMetadata');
const { minioClient, BUCKET_NAME } = require("../config/minio");
const { getImageMetadata, generateImageThumbnail, optimizeImage, validateImage } = require('../utils/image.helper');

exports.uploadImage = async (req, res) => {
  try {
    const file = req.file;
    const customName = req.body.customName; // Tên tùy chỉnh từ client

    // 1. Kiểm tra File
    if (!file) {
      return res.status(400).json({ message: "Không có tệp được upload" });
    }
    if (!file.mimetype.startsWith("image/")) {
      return res.status(400).json({ message: "Tệp upload không phải là hình ảnh" });
    }

    // 2. Validate image
    const validation = await validateImage(file.buffer);
    if (!validation.valid) {
      return res.status(400).json({ message: "Hình ảnh không hợp lệ: " + validation.error });
    }

    // 3. Lấy User ID từ Token (Middleware verifyToken đã gán vào req.user)
    const uploader_id = req.user ? req.user.id : null;
    if (!uploader_id) {
        return res.status(401).json({ message: "Không xác thực được người dùng" });
    }

    // Sử dụng tên tùy chỉnh nếu có, nếu không dùng tên gốc
    const fileExtension = file.originalname.split('.').pop();
    const finalName = customName ? `${customName}.${fileExtension}` : file.originalname;
    const objectName = `${Date.now()}_${finalName}`; // Thêm timestamp để tránh trùng

    // 4. Kiểm tra trùng lặp trên MinIO
    try {
      await minioClient.statObject(BUCKET_NAME, objectName);
      return res.status(409).json({ message: "Hình ảnh đã tồn tại trong hệ thống (MinIO)" });
    } catch (err) {
      if (err.code !== "NotFound") throw err;
    }

    // 5. Extract image metadata (dimensions, format, size)
    console.log('📊 Extracting image metadata...');
    let imageMeta = { width: 0, height: 0, format: 'unknown', size: 0 };
    try {
      imageMeta = await getImageMetadata(file.buffer);
      console.log(`✅ Image metadata: ${imageMeta.width}x${imageMeta.height}, ${imageMeta.format}, ${imageMeta.size} bytes`);
    } catch (metaErr) {
      console.warn('⚠️ Could not extract image metadata:', metaErr.message);
    }

    // 6. Optimize image (convert to WebP if beneficial)
    let imageBuffer = file.buffer;
    let finalObjectName = objectName;
    let finalFormat = imageMeta.format;
    
    try {
      const optimization = await optimizeImage(file.buffer, imageMeta.format);
      
      if (optimization.optimized) {
        console.log(`🔄 Image optimized to ${optimization.format}`);
        imageBuffer = optimization.buffer;
        finalFormat = optimization.format;
        
        // Change filename extension
        finalObjectName = objectName.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '.webp');
        console.log(`✅ Optimized image: ${finalObjectName}`);
      } else {
        console.log('✓ Image already optimized or kept original');
      }
    } catch (optErr) {
      console.warn('⚠️ Could not optimize image, uploading original:', optErr.message);
      // Continue with original image if optimization fails
    }

    // 7. Generate thumbnail
    console.log('🖼️ Generating thumbnail...');
    let thumbnailFilename = null;
    try {
      thumbnailFilename = await generateImageThumbnail(imageBuffer, finalObjectName);
      console.log(`✅ Thumbnail generated: ${thumbnailFilename}`);
    } catch (thumbErr) {
      console.warn('⚠️ Could not generate thumbnail:', thumbErr.message);
    }

    // 8. Upload image to MinIO
    await minioClient.putObject(
      BUCKET_NAME,
      finalObjectName,
      imageBuffer,
      imageBuffer.length,
      { 
        "Content-Type": `image/${finalFormat}`,
        "Cache-Control": "public, max-age=31536000"
      }
    );

    console.log(`✅ Uploaded to MinIO: ${finalObjectName}`);

    // 9. Save to MongoDB with full metadata
    const newImage = new Image({
      image_name: customName || file.originalname.replace(/\.[^/.]+$/, ""),
      minio_url: finalObjectName, // Store filename only
      uploader_id: uploader_id,
      status: "uploaded",
      width: imageMeta.width,
      height: imageMeta.height,
      format: finalFormat,
      file_size: imageBuffer.length
    });

    await newImage.save();

    return res.status(201).json({
      success: true,
      message: "Upload hình ảnh thành công",
      data: newImage
    });

  } catch (err) {
    console.error("❌ Upload error:", err);
    console.error("Error stack:", err.stack);
    console.error("Error details:", {
      name: err.name,
      message: err.message,
      code: err.code
    });
    return res.status(500).json({ 
      success: false,
      message: "Lỗi Server khi upload hình ảnh",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};
