const Image = require('../models/ImageMetadata'); // Model trỏ vào collection 'image'
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
const neo4jDriver = require('../config/neo4j');
const pgPool = require('../config/postgres');
const { minioClient, BUCKET_NAME } = require('../config/minio');

// ✅ DANH SÁCH COLLECTION PHỤ (Tương tự video, nhưng cho image)
const RELATED_COLLECTIONS = [
    'environment', 
    'segment', 
    'person',          
    'entity_object',   
    'activity', 
    'interaction', 
    'caption'          
];

// ==========================================
// A. MONGODB HANDLERS (READ & UPDATE)
// ==========================================

// 1. Lấy danh sách Image (Có phân quyền)
exports.getListImages = async (req, res) => {
    try {
        const { role, id } = req.user || {};
        const { show_deleted } = req.query;

        const conditions = [];

        // Admin: chỉ hiển thị ảnh có thông tin người upload (ẩn ảnh làm giàu)
        if (role === 'admin') {
            conditions.push({
                $or: [
                    { uploader_id: { $exists: true, $ne: null } },
                    { uploaded_id: { $exists: true, $ne: null } }
                ]
            });
        }

        // User thường: chỉ thấy ảnh của chính mình
        if (role !== 'admin' && id) {
            conditions.push({ uploader_id: id });
        }

        // Lọc theo trạng thái deleted
        if (show_deleted === 'true') {
            conditions.push({ is_deleted: true });
        } else {
            conditions.push({
                $or: [
                    { is_deleted: { $exists: false } },
                    { is_deleted: false }
                ]
            });
        }

        const filter = conditions.length > 1 ? { $and: conditions } : (conditions[0] || {});

        // Lấy các trường cần thiết cho Dashboard
        const images = await Image.find(filter, { 
            image_id: 1, 
            image_name: 1, 
            minio_url: 1, 
            width: 1,
            height: 1,
            format: 1,
            file_size: 1,
            status: 1,
            processing_started_at: 1,
            processed_at: 1,
            ai_pipeline_exit_code: 1,
            ai_pipeline_finished_at: 1,
            caption_status: 1,
            caption_confidence: 1,
            confidence_score: 1,
            caption_is_reliable: 1,
            caption_regeneration_required: 1,
            caption_review_required: 1,
            caption_regeneration_reason: 1,
            error_message: 1,
            created_at: 1,
            is_deleted: 1,
            deleted_at: 1,
            _id: 1 
        }).sort({ created_at: -1 });
        
        // Tạo pre-signed URLs cho images
        const imagesWithUrls = await Promise.all(
            images.map(async (image) => {
                const imageObj = image.toObject();
                
                // Tạo pre-signed URL cho image
                if (imageObj.minio_url) {
                    try {
                        const filename = imageObj.minio_url.split('/').pop().split('?')[0];
                        imageObj.minio_url = await minioClient.presignedGetObject(
                            BUCKET_NAME, 
                            filename, 
                            24 * 60 * 60
                        );
                    } catch (err) {
                        console.error('⚠️ Pre-signed URL error for image:', err.message);
                    }
                }
                
                return imageObj;
            })
        );
        
        res.status(200).json({
            success: true,
            count: imagesWithUrls.length,
            data: imagesWithUrls
        });
    } catch (error) {
        console.error("List Image Error:", error);
        res.status(500).json({ success: false, message: "Lỗi server khi lấy danh sách hình ảnh" });
    }
};

// 1.6 Thống kê Dashboard (ảnh uploaded + caption)
exports.getDashboardStats = async (req, res) => {
    try {
        const db = mongoose.connection.db;

        const matchUploadedNotDeleted = {
            $and: [
                {
                    $or: [
                        { uploader_id: { $exists: true, $ne: null } },
                        { uploaded_id: { $exists: true, $ne: null } }
                    ]
                },
                {
                    $or: [
                        { is_deleted: { $exists: false } },
                        { is_deleted: false }
                    ]
                }
            ]
        };

        const [stats] = await db.collection('image').aggregate([
            { $match: matchUploadedNotDeleted },
            { $addFields: { image_id_str: { $toString: '$_id' } } },
            {
                $lookup: {
                    from: 'caption',
                    let: { imageObjId: '$_id', imageIdStr: '$image_id_str' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $or: [
                                        { $eq: ['$image_id', '$$imageObjId'] },
                                        { $eq: ['$image_id', '$$imageIdStr'] }
                                    ]
                                }
                            }
                        },
                        { $limit: 1 }
                    ],
                    as: 'caption_docs'
                }
            },
            {
                $group: {
                    _id: null,
                    totalUploadedImages: { $sum: 1 },
                    captionGeneratedImages: {
                        $sum: {
                            $cond: [{ $gt: [{ $size: '$caption_docs' }, 0] }, 1, 0]
                        }
                    }
                }
            }
        ]).toArray();

        const totalUploadedImages = stats?.totalUploadedImages || 0;
        const captionGeneratedImages = stats?.captionGeneratedImages || 0;
        const pendingCaptionImages = Math.max(totalUploadedImages - captionGeneratedImages, 0);

        res.status(200).json({
            success: true,
            data: {
                totalUploadedImages,
                captionGeneratedImages,
                pendingCaptionImages
            }
        });
    } catch (error) {
        console.error('Dashboard Stats Error:', error);
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy thống kê dashboard' });
    }
};

// 1.5 Lấy thông tin image theo ID
exports.getImageById = async (req, res) => {
    const { image_id } = req.params;
    let query = {};

    // Tìm theo _id (ObjectId) hoặc image_id (String)
    if (ObjectId.isValid(image_id)) {
        query = { _id: new ObjectId(image_id) };
    } else {
        query = { image_id: image_id };
    }

    try {
        const image = await Image.findOne(query);
        
        if (!image) {
            return res.status(404).json({ 
                success: false, 
                message: "Không tìm thấy hình ảnh" 
            });
        }

        const imageObj = image.toObject();

        // Tạo pre-signed URL mới cho image (24 giờ)
        if (imageObj.minio_url) {
            try {
                let objectName;
                const url = imageObj.minio_url;
                
                if (url.includes('://')) {
                    const urlObj = new URL(url);
                    const pathname = urlObj.pathname;
                    const parts = pathname.split('/').filter(p => p);
                    objectName = parts[parts.length - 1];
                } else if (url.includes('/')) {
                    const parts = url.split('/').filter(p => p);
                    objectName = parts[parts.length - 1];
                } else {
                    objectName = url;
                }

                if (objectName.includes('://') || objectName.startsWith('/')) {
                    throw new Error('Invalid object name extracted: ' + objectName);
                }

                const presignedUrl = await minioClient.presignedGetObject(
                    BUCKET_NAME, 
                    objectName, 
                    24 * 60 * 60
                );
                imageObj.minio_url = presignedUrl;
                console.log('✅ Generated new pre-signed URL for:', imageObj.image_name);
            } catch (minioError) {
                console.error('❌ MinIO pre-signed URL error:', minioError.message);
            }
        }

        res.status(200).json({
            success: true,
            result: imageObj
        });
    } catch (error) {
        console.error("Get Image By ID Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Lỗi server khi lấy thông tin hình ảnh" 
        });
    }
};

// 2. Lấy Full Metadata từ MongoDB
exports.getImageFullMetadata = async (req, res) => {
    const { image_id } = req.params; 
    let query = {};

    if (ObjectId.isValid(image_id)) {
        query = { _id: new ObjectId(image_id) };
    } else {
        query = { image_id: image_id };
    }

    try {
        const imageInfo = await Image.findOne(query).lean();

        if (!imageInfo) {
            return res.status(404).json({ success: false, message: "Không tìm thấy hình ảnh" });
        }

        const realImageId = imageInfo._id; 
        const realImageIdStr = realImageId.toString();

        // Tạo pre-signed URL cho image
        if (imageInfo.minio_url) {
            try {
                const objectName = imageInfo.minio_url.split('/').pop();
                const presignedUrl = await minioClient.presignedGetObject(BUCKET_NAME, objectName, 24 * 60 * 60);
                imageInfo.minio_url = presignedUrl;
                console.log('✅ Generated pre-signed URL for metadata:', imageInfo.image_name);
            } catch (minioError) {
                console.error('❌ MinIO pre-signed URL error:', minioError);
            }
        }

        const fullData = {
            image: imageInfo,
            related_data: {}
        };

        // Query các collection liên quan
        const promises = RELATED_COLLECTIONS.map(async (collectionName) => {
            const db = mongoose.connection.db;
            let data = [];

            if (collectionName === 'environment') {
                if (imageInfo.environment_id) {
                    let envId = imageInfo.environment_id;
                    let envData = await db.collection('environment').findOne({ _id: new ObjectId(envId) });
                    if (!envData) envData = await db.collection('environment').findOne({ env_id: envId });
                    if (envData) data = [envData];
                }
            } 
            else if (collectionName === 'entity_object') {
                data = await db.collection(collectionName).find({ image_id: realImageIdStr }).toArray();
                if (data.length === 0) data = await db.collection(collectionName).find({ image_id: realImageId }).toArray();

                if (data.length === 0) {
                    const segments = await db.collection('segment').find({ image_id: realImageId }).toArray();
                    const segmentIds = segments.map(s => s._id);
                    const segmentIdsStr = segments.map(s => s._id.toString());
                    
                    if (segmentIds.length > 0) {
                        data = await db.collection('entity_object')
                            .find({ 
                                $or: [
                                    { segment_id: { $in: segmentIds } },
                                    { segment_id: { $in: segmentIdsStr } }
                                ]
                            })
                            .toArray();
                    }
                }
            } 
            else {
                data = await db.collection(collectionName).find({ 
                    $or: [
                        { image_id: realImageId },
                        { image_id: realImageIdStr }
                    ]
                }).toArray();
            }
            
            return { name: collectionName, data: data };
        });

        const results = await Promise.all(promises);

        results.forEach(item => {
            fullData.related_data[item.name] = item.data;
        });

        res.status(200).json({ success: true, data: fullData });

    } catch (error) {
        console.error("Get Metadata Error:", error);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

// 3. Cập nhật Metadata (MongoDB)
exports.updateCollectionData = async (req, res) => {
    const { collectionName, idField, idValue, updateData } = req.body;

    if (!collectionName || !idField || !idValue || !updateData) {
        return res.status(400).json({ success: false, message: "Thiếu thông tin cập nhật" });
    }

    try {
        delete updateData._id;
        let query = {};
        
        if (idField === '_id' && ObjectId.isValid(idValue)) {
            query['_id'] = new ObjectId(idValue);
        } else {
            query[idField] = idValue;
        }

        if (![...RELATED_COLLECTIONS, 'image'].includes(collectionName)) {
             return res.status(403).json({ success: false, message: "Không được phép sửa collection này" });
        }

        const result = await mongoose.connection.db
            .collection(collectionName)
            .updateOne(query, { $set: updateData });

        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, message: "Không tìm thấy bản ghi" });
        }

        res.status(200).json({ success: true, message: "Cập nhật thành công", result });
    } catch (error) {
        console.error("Update Error:", error);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

// ==========================================
// B. POSTGRESQL HANDLERS (QUERY & UPDATE)
// ==========================================

// 4. Lấy dữ liệu Postgres
exports.getImagePostgresData = async (req, res) => {
    const { image_id } = req.params;
    
    const queries = {
        images: "SELECT * FROM images WHERE image_id = $1",
        environments: "SELECT * FROM environments WHERE env_id = (SELECT environment_id FROM images WHERE image_id = $1)",
        persons: "SELECT * FROM persons WHERE image_id = $1",
        entity_objects: "SELECT * FROM entity_objects WHERE image_id = $1",
        activities: "SELECT * FROM activities WHERE image_id = $1",
        interactions: "SELECT * FROM interactions WHERE image_id = $1",
        captions: "SELECT * FROM captions WHERE image_id = $1",
        interaction_members: `
            SELECT im.* FROM interaction_members im
            JOIN interactions i ON im.interaction_id = i.interaction_id
            WHERE i.image_id = $1
        `
    };

    try {
        const results = {};
        for (const [tableName, querySQL] of Object.entries(queries)) {
            try {
                const checkTable = await pgPool.query("SELECT to_regclass($1::text)", [tableName]);
                if (checkTable.rows[0].to_regclass) {
                    const { rows } = await pgPool.query(querySQL, [image_id]);
                    results[tableName] = rows;
                }
            } catch (err) {
                console.warn(`⚠️ Skip PG table '${tableName}': ${err.message}`);
            }
        }
        res.status(200).json({ success: true, data: results });
    } catch (error) {
        console.error("PG Error:", error);
        res.status(500).json({ success: false, message: "Lỗi Postgres" });
    }
};

// 5. Cập nhật Postgres
exports.updatePostgresData = async (req, res) => {
    const { tableName, idField, idValue, updateData } = req.body;

    if (!tableName || !idField || !idValue || !updateData) {
        return res.status(400).json({ success: false, message: "Thiếu thông tin update PG" });
    }

    try {
        const keys = Object.keys(updateData);
        const values = Object.values(updateData);
        const setClause = keys.map((key, index) => `"${key}" = $${index + 1}`).join(', ');
        values.push(idValue);

        const query = `UPDATE "${tableName}" SET ${setClause} WHERE "${idField}" = $${values.length} RETURNING *`;

        const { rows } = await pgPool.query(query, values);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "Không tìm thấy dòng để sửa" });
        }

        res.status(200).json({ success: true, message: "Cập nhật PG thành công", result: rows[0] });

    } catch (error) {
        console.error("PG Update Error:", error);
        res.status(500).json({ success: false, message: "Lỗi Update PostgreSQL: " + error.message });
    }
};

// ==========================================
// C. NEO4J HANDLERS (GRAPH QUERY & UPDATE)
// ==========================================

const parseNeo4jInt = (val) => (val && typeof val === 'object' && val.low !== undefined) ? val.low : val;
const cleanProps = (props) => {
    const newProps = {};
    for (const key in props) {
        newProps[key] = parseNeo4jInt(props[key]);
    }
    return newProps;
};

// 6. Lấy dữ liệu Graph
exports.getImageGraphData = async (req, res) => {
    const { image_id } = req.params;
    const session = neo4jDriver.session();
    
    try {
        const query = `
            MATCH (i:Image {mongo_id: $iid})
            // Traverse deeper but block global roots to avoid pulling other images.
            OPTIONAL MATCH path = (i)-[*1..6]-(n)
            WHERE NONE(x IN nodes(path) WHERE x:RootImage OR x:RootVideo)
            RETURN i, path
            LIMIT 2000
        `;

        const result = await session.run(query, { iid: image_id });

        const nodesMap = new Map();
        const relsMap = new Map();

        result.records.forEach(record => {
            const i = record.get('i');
            const imageNodeId = i ? (i.elementId || i.identity.toString()) : null;
            if (i && imageNodeId && !nodesMap.has(imageNodeId)) {
                nodesMap.set(imageNodeId, {
                    id: imageNodeId,
                    labels: i.labels,
                    properties: cleanProps(i.properties)
                });
            }

            const path = record.get('path');
            if (path) {
                path.segments.forEach(seg => {
                    const start = seg.start;
                    const end = seg.end;
                    const rel = seg.relationship;

                    [start, end].forEach(node => {
                        const nodeId = node.elementId || node.identity.toString();
                        if (!nodesMap.has(nodeId)) {
                            nodesMap.set(nodeId, {
                                id: nodeId,
                                labels: node.labels,
                                properties: cleanProps(node.properties)
                            });
                        }
                    });

                    if (!relsMap.has(rel.identity.toString())) {
                        relsMap.set(rel.identity.toString(), {
                            id: rel.identity.toString(),
                            type: rel.type,
                            start: rel.startNodeElementId ? rel.startNodeElementId : rel.start.toString(),
                            end: rel.endNodeElementId ? rel.endNodeElementId : rel.end.toString(),
                            properties: cleanProps(rel.properties)
                        });
                    }
                });
            }
        });

        res.status(200).json({
            success: true,
            data: {
                nodes: Array.from(nodesMap.values()),
                relationships: Array.from(relsMap.values())
            }
        });

    } catch (error) {
        console.error("Neo4j Get Error:", error);
        res.status(500).json({ success: false, message: "Lỗi lấy dữ liệu Neo4j" });
    } finally {
        await session.close();
    }
};

// 7. Cập nhật Neo4j Node
exports.updateNeo4jNode = async (req, res) => {
    const { nodeId, properties } = req.body;
    const session = neo4jDriver.session();
    try {
        await session.run(
            `MATCH (n) WHERE id(n) = $id SET n += $props RETURN n`,
            { id: parseInt(nodeId), props: properties }
        );
        res.status(200).json({ success: true, message: "Cập nhật Node thành công" });
    } catch (error) {
        console.error("Neo4j Node Error:", error);
        res.status(500).json({ success: false, message: "Lỗi cập nhật Node" });
    } finally {
        await session.close();
    }
};

// 8. Cập nhật Neo4j Rel
exports.updateNeo4jRel = async (req, res) => {
    const { relId, properties } = req.body;
    const session = neo4jDriver.session();
    try {
        await session.run(
            `MATCH ()-[r]->() WHERE id(r) = $id SET r += $props RETURN r`,
            { id: parseInt(relId), props: properties }
        );
        res.status(200).json({ success: true, message: "Cập nhật Relationship thành công" });
    } catch (error) {
        console.error("Neo4j Rel Error:", error);
        res.status(500).json({ success: false, message: "Lỗi cập nhật Relationship" });
    } finally {
        await session.close();
    }
};

// ==========================================
// 9. XÓA IMAGE (SOFT DELETE)
// ==========================================
exports.softDeleteImage = async (req, res) => {
    const { image_id } = req.params;
    const { role, id: userId } = req.user || {};
    
    try {
        let query = {};
        if (ObjectId.isValid(image_id)) {
            query = { _id: new ObjectId(image_id) };
        } else {
            query = { image_id: image_id };
        }

        const image = await Image.findOne(query);
        
        if (!image) {
            return res.status(404).json({ 
                success: false, 
                message: "Không tìm thấy hình ảnh" 
            });
        }

        if (image.is_deleted) {
            return res.status(400).json({ 
                success: false, 
                message: "Hình ảnh đã bị xóa trước đó" 
            });
        }

        // Kiểm tra quyền: admin hoặc chủ sở hữu ảnh
        const ownerId = image.uploader_id || image.uploaded_id;
        if (role !== 'admin') {
            if (!ownerId || !userId || ownerId.toString() !== userId.toString()) {
                return res.status(403).json({
                    success: false,
                    message: "Bạn không có quyền xóa hình ảnh này"
                });
            }
        }

        // Soft delete
        image.is_deleted = true;
        image.deleted_at = new Date();
        await image.save();

        console.log('✅ Soft deleted image:', image.image_name);

        res.status(200).json({
            success: true,
            message: "Xóa hình ảnh thành công (soft delete)"
        });

    } catch (error) {
        console.error("Delete Image Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Lỗi server khi xóa hình ảnh" 
        });
    }
};

// 10. KHÔI PHỤC IMAGE
exports.restoreImage = async (req, res) => {
    const { image_id } = req.params;
    
    try {
        let query = {};
        if (ObjectId.isValid(image_id)) {
            query = { _id: new ObjectId(image_id) };
        } else {
            query = { image_id: image_id };
        }

        const image = await Image.findOne(query);
        
        if (!image) {
            return res.status(404).json({ 
                success: false, 
                message: "Không tìm thấy hình ảnh" 
            });
        }

        if (!image.is_deleted) {
            return res.status(400).json({ 
                success: false, 
                message: "Hình ảnh chưa bị xóa" 
            });
        }

        // Restore
        image.is_deleted = false;
        image.deleted_at = null;
        await image.save();

        console.log('✅ Restored image:', image.image_name);

        res.status(200).json({
            success: true,
            message: "Khôi phục hình ảnh thành công"
        });

    } catch (error) {
        console.error("Restore Image Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Lỗi server khi khôi phục hình ảnh" 
        });
    }
};

// 11. XÓA IMAGE VĨNHủIỄN (Hard Delete - Admin only)
exports.deleteImagePermanently = async (req, res) => {
    const { image_id } = req.params;
    const { role, id: userId } = req.user || {};
    
    try {
        let query = {};
        if (ObjectId.isValid(image_id)) {
            query = { _id: new ObjectId(image_id) };
        } else {
            query = { image_id: image_id };
        }

        const image = await Image.findOne(query);
        
        if (!image) {
            return res.status(404).json({ 
                success: false, 
                message: "Không tìm thấy hình ảnh" 
            });
        }

        // Kiểm tra quyền
        if (role !== 'admin' && image.uploader_id.toString() !== userId) {
            return res.status(403).json({ 
                success: false, 
                message: "Bạn không có quyền xóa hình ảnh này" 
            });
        }

        // Xóa file khỏi MinIO
        if (image.minio_url) {
            try {
                const objectName = image.minio_url.split('/').pop();
                await minioClient.removeObject(BUCKET_NAME, objectName);
                console.log('✅ Đã xóa file khỏi MinIO:', objectName);
            } catch (minioError) {
                console.error('⚠️ Lỗi khi xóa file MinIO:', minioError.message);
            }
        }

        // Xóa khỏi MongoDB
        await Image.deleteOne(query);

        res.status(200).json({
            success: true,
            message: "Xóa hình ảnh vĩnh viễn thành công"
        });

    } catch (error) {
        console.error("Delete Image Permanently Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Lỗi server khi xóa hình ảnh" 
        });
    }
};

// ==========================================
// AI ANALYSIS
// ==========================================
/**
 * Analyze image with AI models (YOLO)
 * Triggers Python script to process image and save results to MongoDB
 */
exports.analyzeImage = async (req, res) => {
    try {
        const { image_id } = req.params;
        const { role } = req.user || {};

        if (!image_id || !ObjectId.isValid(image_id)) {
            return res.status(400).json({
                success: false,
                message: "image_id không hợp lệ"
            });
        }

        // Find image
        const image = await Image.findOne({ 
            _id: new ObjectId(image_id),
            $or: [
                { is_deleted: { $exists: false } },
                { is_deleted: false }
            ]
        });

        if (!image) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy hình ảnh"
            });
        }

        // Check permission (users can only analyze their own images)
        const ownerId = String(image.uploader_id ?? '');
        const currentUserId = String(req.user?.id ?? '');

        if (role !== 'admin' && ownerId !== currentUserId) {
            return res.status(403).json({
                success: false,
                message: "Bạn không có quyền phân tích hình ảnh này"
            });
        }

        // Check if image is already processing
        if (image.status === 'processing') {
            return res.status(400).json({
                success: false,
                message: "Hình ảnh đang được xử lý, vui lòng đợi"
            });
        }

        // Download image from MinIO to temp location
        const path = require('path');
        const fs = require('fs').promises;
        const os = require('os');
        
        const tempDir = os.tmpdir();
        // Use original file extension from image name or format
        const ext = image.format || path.extname(image.image_name) || '.jpg';
        const tempFilePath = path.join(tempDir, `${image_id}_${Date.now()}${ext.startsWith('.') ? ext : '.' + ext}`);

        try {
            // Download from MinIO
            // Extract object name from minio_url (it stores just the filename)
            const objectName = image.minio_url.split('/').pop().split('?')[0];
            console.log(`📥 Downloading image from MinIO: bucket=${BUCKET_NAME}, object=${objectName}`);
            
            const stream = await minioClient.getObject(BUCKET_NAME, objectName);
            const chunks = [];
            
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            
            const buffer = Buffer.concat(chunks);
            await fs.writeFile(tempFilePath, buffer);
            console.log(`✅ Image downloaded successfully to: ${tempFilePath}`);

            // Update status to processing
            await Image.updateOne(
                { _id: new ObjectId(image_id) },
                { 
                    $set: { 
                        status: 'processing',
                        processing_started_at: new Date(),
                        processed_at: null,
                        error_message: null,
                        ai_pipeline_exit_code: null,
                        ai_pipeline_finished_at: null
                    } 
                }
            );

            // Call Python script asynchronously
            const { spawn } = require('child_process');
            const pythonScript = path.join(__dirname, '..', '..', 'ai_service', 'process_image.py');
            
            console.log(`🐍 Launching Python AI analysis:`);
            console.log(`   Script: ${pythonScript}`);
            console.log(`   Image: ${tempFilePath}`);
            console.log(`   Image ID: ${image_id}`);
            
            // Launch Python process in background with output capture
            const pythonProcess = spawn('python', [pythonScript, tempFilePath, image_id], {
                env: { ...process.env, MONGODB_URI: process.env.MONGODB_URI },
                detached: false,
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true  // Hide console window on Windows
            });

            let pythonOutput = '';
            let pythonError = '';

            // Capture stdout
            pythonProcess.stdout.on('data', (data) => {
                const output = data.toString();
                pythonOutput += output;
                console.log(`[Python stdout]: ${output}`);
            });

            // Capture stderr
            pythonProcess.stderr.on('data', (data) => {
                const error = data.toString();
                pythonError += error;
                console.error(`[Python stderr]: ${error}`);
            });

            // Handle process exit
            pythonProcess.on('exit', async (code) => {
                console.log(`Python process exited with code: ${code}`);

                const sanitizePythonError = (rawError) => {
                    if (!rawError) return '';
                    return rawError
                        .split(/\r?\n/)
                        .filter((line) => {
                            const lower = line.toLowerCase();
                            if (!line.trim()) return false;
                            if (lower.includes('deprecationwarning')) return false;
                            if (lower.includes('datetime.datetime.utcnow')) return false;
                            return true;
                        })
                        .join('\n')
                        .trim();
                };

                const extractPythonJsonMessage = (rawOutput) => {
                    if (!rawOutput) return '';
                    const lines = rawOutput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
                    for (let i = lines.length - 1; i >= 0; i -= 1) {
                        const line = lines[i];
                        if (!line.startsWith('{') || !line.endsWith('}')) continue;
                        try {
                            const parsed = JSON.parse(line);
                            if (parsed && typeof parsed.message === 'string' && parsed.message.trim()) {
                                return parsed.message.trim();
                            }
                        } catch {
                            // Ignore non-JSON log lines.
                        }
                    }
                    return '';
                };

                const isNonClassroomSignal = (rawOutput, rawError) => {
                    const combined = `${rawOutput || ''}\n${rawError || ''}`.toLowerCase();
                    return (
                        combined.includes('không phải là lớp học')
                        || combined.includes('khong phai la lop hoc')
                        || combined.includes('not a classroom')
                        || combined.includes('non_classroom')
                    );
                };

                if (code === 0) {
                    try {
                        await Image.updateOne(
                            { _id: new ObjectId(image_id) },
                            {
                                $set: {
                                    status: 'done',
                                    error_message: null,
                                    processed_at: new Date(),
                                    ai_pipeline_exit_code: 0,
                                    ai_pipeline_finished_at: new Date()
                                }
                            }
                        );
                        
                    } catch (updateErr) {
                        console.error('Failed to update image status to done:', updateErr.message);
                    }
                } else {
                    console.error(`❌ Python process failed with code ${code}`);
                    console.error(`Last output: ${pythonOutput.slice(-500)}`);
                    console.error(`Last error: ${pythonError.slice(-500)}`);

                    try {
                        const cleanError = sanitizePythonError(pythonError);
                        const outputMessage = extractPythonJsonMessage(pythonOutput);
                        const currentImage = await Image.findById(image_id).select('error_message');
                        const existingMessage = (currentImage?.error_message || '').trim();
                        const nonClassroomDetected = isNonClassroomSignal(pythonOutput, pythonError);
                        const fallbackMessage = nonClassroomDetected || code === 1
                            ? 'Ảnh không phải là lớp học. Vui lòng thử ảnh khác.'
                            : `Image AI process failed with code ${code}`;
                        const userFacingMessage = existingMessage || outputMessage || cleanError || fallbackMessage;

                        await Image.updateOne(
                            { _id: new ObjectId(image_id) },
                            {
                                $set: {
                                    status: 'error',
                                    processed_at: new Date(),
                                    error_message: userFacingMessage.slice(0, 1000),
                                    ai_pipeline_exit_code: code,
                                    ai_pipeline_finished_at: new Date()
                                }
                            }
                        );
                    } catch (updateErr) {
                        console.error('Failed to update image status to error:', updateErr.message);
                    }
                }
                
                // Clean up temp file after process completes
                setTimeout(async () => {
                    try {
                        await fs.unlink(tempFilePath);
                        console.log(`🗑️  Cleaned up temp file: ${tempFilePath}`);
                    } catch (err) {
                        console.error("Error deleting temp file:", err);
                    }
                }, 5000);
            });

            pythonProcess.on('error', async (error) => {
                console.error(`❌ Failed to start Python process:`, error);

                try {
                    await Image.updateOne(
                        { _id: new ObjectId(image_id) },
                        {
                            $set: {
                                status: 'error',
                                processed_at: new Date(),
                                error_message: `Failed to start process: ${error.message}`,
                                ai_pipeline_exit_code: -1,
                                ai_pipeline_finished_at: new Date()
                            }
                        }
                    );
                } catch (updateErr) {
                    console.error('Failed to update image status after spawn error:', updateErr.message);
                }
            });

            // Respond immediately
            res.status(200).json({
                success: true,
                message: "Đã bắt đầu phân tích hình ảnh bằng AI. Quá trình sẽ hoàn tất trong vài phút.",
                image_id: image_id,
                status: "processing"
            });

        } catch (downloadError) {
            console.error("❌ Error downloading image from MinIO:", downloadError);
            console.error("   Bucket:", BUCKET_NAME);
            console.error("   Image URL:", image.minio_url);
            
            // Clean up temp file if exists
            try {
                await fs.unlink(tempFilePath);
            } catch (err) {
                // Ignore cleanup errors
            }

            return res.status(500).json({
                success: false,
                message: "Lỗi khi tải hình ảnh từ storage: " + downloadError.message
            });
        }

    } catch (error) {
        console.error("Analyze Image Error:", error);
        res.status(500).json({
            success: false,
            message: "Lỗi server khi phân tích hình ảnh"
        });
    }
};
