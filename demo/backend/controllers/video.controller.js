const Video = require('../models/VideoMetadata'); // Model trỏ vào collection 'video'
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
const neo4jDriver = require('../config/neo4j');
const pgPool = require('../config/postgres');
const { minioClient, BUCKET_NAME } = require('../config/minio');

// ✅ DANH SÁCH COLLECTION PHỤ (Khớp với file CSV import và schema mới)
const RELATED_COLLECTIONS = [
    'environment', 
    'frame',
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

// 1. Lấy danh sách Video (Có phân quyền)
exports.getListVideos = async (req, res) => {
    try {
        const { role, id } = req.user || {};
        const { show_deleted } = req.query; // Thêm query param để xem video đã xóa
        
        let filter = {};

        // Nếu user thường -> chỉ thấy video mình up
        if (role !== 'admin' && id) {
            filter.uploader_id = id;
        }

        // Lọc theo trạng thái deleted
        if (show_deleted === 'true') {
            // Chỉ lấy video đã bị xóa (soft deleted)
            filter.is_deleted = true;
        } else {
            // Mặc định: chỉ lấy video chưa bị xóa
            filter.$or = [
                { is_deleted: { $exists: false } },
                { is_deleted: false }
            ];
        }

        // Lấy các trường cần thiết cho Dashboard
        const videos = await Video.find(filter, { 
            video_id: 1, 
            clip_name: 1, 
            minio_url: 1, 
            duration: 1, 
            thumbnail_url: 1, 
            status: 1,       
            processing_started_at: 1,
            processed_at: 1,
            ai_pipeline_exit_code: 1,
            ai_pipeline_finished_at: 1,
            caption_confidence: 1,
            confidence_score: 1,
            caption_is_reliable: 1,
            caption_regeneration_required: 1,
            caption_review_required: 1,
            caption_regeneration_reason: 1,
            created_at: 1,
            is_deleted: 1,
            deleted_at: 1,
            _id: 1 
        }).sort({ created_at: -1 });
        
        // Tạo pre-signed URLs cho video và thumbnail
        const videosWithUrls = await Promise.all(
            videos.map(async (video) => {
                const videoObj = video.toObject();
                
                // Tạo pre-signed URL cho video
                if (videoObj.minio_url) {
                    try {
                        const filename = videoObj.minio_url.split('/').pop().split('?')[0];
                        videoObj.minio_url = await minioClient.presignedGetObject(
                            BUCKET_NAME, 
                            filename, 
                            24 * 60 * 60
                        );
                    } catch (err) {
                        console.error('⚠️ Pre-signed URL error for video:', err.message);
                    }
                }
                
                // Tạo pre-signed URL cho thumbnail
                if (videoObj.thumbnail_url) {
                    try {
                        const thumbFilename = videoObj.thumbnail_url.split('/').pop().split('?')[0];
                        videoObj.thumbnail_url = await minioClient.presignedGetObject(
                            BUCKET_NAME, 
                            thumbFilename, 
                            24 * 60 * 60
                        );
                    } catch (err) {
                        console.error('⚠️ Pre-signed URL error for thumbnail:', err.message);
                    }
                }
                
                return videoObj;
            })
        );
        
        res.status(200).json({
            success: true,
            count: videosWithUrls.length,
            data: videosWithUrls
        });
    } catch (error) {
        console.error("List Video Error:", error);
        res.status(500).json({ success: false, message: "Lỗi server khi lấy danh sách video" });
    }
};

// 1.5 Lấy thông tin video theo ID
exports.getVideoById = async (req, res) => {
    const { video_id } = req.params;
    let query = {};

    // Tìm theo _id (ObjectId) hoặc video_id (String)
    if (ObjectId.isValid(video_id)) {
        query = { _id: new ObjectId(video_id) };
    } else {
        query = { video_id: video_id };
    }

    try {
        const video = await Video.findOne(query);
        
        if (!video) {
            return res.status(404).json({ 
                success: false, 
                message: "Không tìm thấy video" 
            });
        }

        const videoObj = video.toObject();

        // Tạo pre-signed URL mới cho video (24 giờ)
        if (videoObj.minio_url) {
            try {
                let objectName;
                
                // Extract object name from URL (handle all possible formats)
                const url = videoObj.minio_url;
                
                // Remove all possible prefixes to get just the filename
                if (url.includes('://')) {
                    // Full URL format: http://localhost:9000/classroom/filename.mp4
                    // or http://localhost:9001/classroom/filename.mp4
                    const urlObj = new URL(url);
                    const pathname = urlObj.pathname; // e.g., "/classroom/filename.mp4"
                    const parts = pathname.split('/').filter(p => p); // Remove empty parts
                    objectName = parts[parts.length - 1]; // Get last part = filename
                    console.log('📌 Extracted from full URL:', objectName);
                    console.log('   Original:', url);
                } else if (url.includes('/')) {
                    // Path format: classroom/filename.mp4 or /classroom/filename.mp4
                    const parts = url.split('/').filter(p => p);
                    objectName = parts[parts.length - 1];
                    console.log('📌 Extracted from path:', objectName);
                } else {
                    // Just filename: filename.mp4
                    objectName = url;
                    console.log('📌 Using as filename:', objectName);
                }

                // Validate object name (should not contain http:// or /)
                if (objectName.includes('://') || objectName.startsWith('/')) {
                    throw new Error('Invalid object name extracted: ' + objectName);
                }

                // Tạo pre-signed URL mới
                const presignedUrl = await minioClient.presignedGetObject(
                    BUCKET_NAME, 
                    objectName, 
                    24 * 60 * 60 // 24 giờ
                );
                videoObj.minio_url = presignedUrl;
                console.log('✅ Generated new pre-signed URL for:', videoObj.clip_name);
                console.log('🔗 Clean object name:', objectName);
            } catch (minioError) {
                console.error('❌ MinIO pre-signed URL error:', minioError.message);
                console.error('   URL was:', videoObj.minio_url);
                // Giữ nguyên URL gốc nếu lỗi
            }
        }

        res.status(200).json({
            success: true,
            result: videoObj
        });
    } catch (error) {
        console.error("Get Video By ID Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Lỗi server khi lấy thông tin video" 
        });
    }
};

// 2. Lấy Full Metadata từ MongoDB
exports.getVideoFullMetadata = async (req, res) => {
    // Chấp nhận tìm theo cả _id (ObjectId) hoặc video_id (String tự sinh từ CSV)
    const { video_id } = req.params; 
    let query = {};

    // Logic tìm video gốc
    if (ObjectId.isValid(video_id)) {
        query = { _id: new ObjectId(video_id) };
    } else {
        query = { video_id: video_id };
    }

    try {
        // Bước 1: Lấy info video gốc
        const videoInfo = await Video.findOne(query).lean();

        if (!videoInfo) {
            return res.status(404).json({ success: false, message: "Không tìm thấy video" });
        }

        // Lấy _id thật (ObjectId) để query các bảng con
        const realVideoId = videoInfo._id; 
        const realVideoIdStr = realVideoId.toString(); // Dùng string để so sánh nếu cần

        // Tạo pre-signed URL cho video (có thời hạn 24h)
        if (videoInfo.minio_url) {
            try {
                const objectName = videoInfo.minio_url.split('/').pop();
                const presignedUrl = await minioClient.presignedGetObject(BUCKET_NAME, objectName, 24 * 60 * 60);
                videoInfo.minio_url = presignedUrl;
                console.log('✅ Generated pre-signed URL for metadata:', videoInfo.clip_name);
            } catch (minioError) {
                console.error('❌ MinIO pre-signed URL error:', minioError);
            }
        }

        const fullData = {
            video: videoInfo,
            related_data: {}
        };

        // Bước 2: Query song song các collection con
        const promises = RELATED_COLLECTIONS.map(async (collectionName) => {
            const db = mongoose.connection.db;
            let data = [];

            // -- Logic Query Đặc Biệt cho từng bảng --
            
            if (collectionName === 'environment') {
                // Environment không có video_id, Video trỏ tới Environment
                if (videoInfo.environment_id) {
                    let envId = videoInfo.environment_id;
                    // Cố gắng convert sang ObjectId nếu có thể, hoặc tìm theo chuỗi
                    let envQuery = ObjectId.isValid(envId) ? { _id: new ObjectId(envId) } : { env_id: envId };
                    
                    // Thử tìm bằng _id trước
                    let envData = await db.collection('environment').findOne({ _id: new ObjectId(envId) });
                    // Nếu không thấy, tìm bằng env_id (string)
                    if (!envData) envData = await db.collection('environment').findOne({ env_id: envId });
                    
                    if (envData) data = [envData];
                }
            } 
            else if (collectionName === 'entity_object') {
                // Entity Object liên kết qua Segment, không có video_id trực tiếp (theo CSV cũ)
                // Tuy nhiên, để tiện, ta nên query qua video_id nếu có, hoặc query qua list segments
                
                // Cách 1: Nếu entity_object có video_id (tốt nhất)
                data = await db.collection(collectionName).find({ video_id: realVideoIdStr }).toArray(); // Thử string
                if (data.length === 0) data = await db.collection(collectionName).find({ video_id: realVideoId }).toArray(); // Thử ObjectId

                // Cách 2: Nếu không có video_id, query qua segments
                if (data.length === 0) {
                    const segments = await db.collection('segment').find({ video_id: realVideoId }).toArray(); // Có thể cần sửa thành realVideoIdStr tùy dữ liệu
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
                // Các bảng còn lại (segment, person, activity...) đều có video_id
                // Thử cả 2 dạng ID (String và ObjectId) để chắc chắn tìm thấy
                data = await db.collection(collectionName).find({ 
                    $or: [
                        { video_id: realVideoId },
                        { video_id: realVideoIdStr }
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
        delete updateData._id; // Không cho sửa _id
        let query = {};
        
        // Xử lý ID linh hoạt (ObjectId hoặc String)
        if (idField === '_id' && ObjectId.isValid(idValue)) {
            query['_id'] = new ObjectId(idValue);
        } else {
            query[idField] = idValue;
        }

        if (![...RELATED_COLLECTIONS, 'video'].includes(collectionName)) {
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

// 4. Lấy dữ liệu Postgres (Schema Mới)
exports.getVideoPostgresData = async (req, res) => {
    const { video_id } = req.params; // Đây là mongo_id dạng string
    
    // Mapping query SQL cho schema mới
    const queries = {
        videos: "SELECT * FROM videos WHERE video_id = $1",
        // Lấy Env qua bảng Video
        environments: "SELECT * FROM environments WHERE env_id = (SELECT environment_id FROM videos WHERE video_id = $1)",
        segments: "SELECT * FROM segments WHERE video_id = $1 ORDER BY start_time ASC",
        persons: "SELECT * FROM persons WHERE video_id = $1",
        
        // Entity Object: Tìm qua Segment (vì schema Postgres mới entity nối với segment)
        entity_objects: `
            SELECT eo.* FROM entity_objects eo
            JOIN segments s ON eo.segment_id = s.segment_id
            WHERE s.video_id = $1
        `,
        
        activities: "SELECT * FROM activities WHERE video_id = $1",
        interactions: "SELECT * FROM interactions WHERE video_id = $1",
        captions: "SELECT * FROM captions WHERE video_id = $1"
    };

    try {
        const results = {};
        for (const [tableName, querySQL] of Object.entries(queries)) {
            try {
                // Chỉ chạy query nếu bảng tồn tại
                const checkTable = await pgPool.query("SELECT to_regclass($1::text)", [tableName]);
                if (checkTable.rows[0].to_regclass) {
                    const { rows } = await pgPool.query(querySQL, [video_id]);
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

// 5. Cập nhật Postgres (Giữ nguyên logic dynamic)
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

// 6. Lấy dữ liệu Graph (Cập nhật truy vấn theo mongo_id)
exports.getVideoGraphData = async (req, res) => {
    const { video_id } = req.params; // Đây là mongo_id
    const session = neo4jDriver.session();
    
    try {
        // Query: Tìm Video node có mongo_id này, và lấy các node liên quan (1-hop)
        // Chúng ta lấy cả node cha (:Video) và các node con (:Person, :Segment...)
        const query = `
            MATCH (v:Video {mongo_id: $vid})
            // Traverse deeper but block global roots to avoid pulling other videos.
            OPTIONAL MATCH path = (v)-[*1..8]-(n)
            WHERE NONE(x IN nodes(path) WHERE x:RootImage OR x:RootVideo)
            RETURN v, path
            LIMIT 2000
        `;

        const result = await session.run(query, { vid: video_id });

        const nodesMap = new Map();
        const relsMap = new Map();

        result.records.forEach(record => {
            // Xử lý node Video gốc
            const v = record.get('v');
            const videoNodeId = v ? (v.elementId || v.identity.toString()) : null;
            if (v && videoNodeId && !nodesMap.has(videoNodeId)) {
                nodesMap.set(videoNodeId, {
                    id: videoNodeId,
                    labels: v.labels,
                    properties: cleanProps(v.properties)
                });
            }

            // Xử lý các đường dẫn (Path)
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

// 7. Cập nhật Neo4j Node (Giữ nguyên - Dùng ID nội bộ Neo4j để sửa nhanh)
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

// 8. Cập nhật Neo4j Rel (Giữ nguyên)
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
// 9. XÓA VIDEO
// ==========================================
exports.deleteVideo = async (req, res) => {
    const { video_id } = req.params;
    const { role, id: userId } = req.user || {};
    
    try {
        // Tìm video theo _id hoặc video_id
        let query = {};
        if (ObjectId.isValid(video_id)) {
            query = { _id: new ObjectId(video_id) };
        } else {
            query = { video_id: video_id };
        }

        const video = await Video.findOne(query);
        
        if (!video) {
            return res.status(404).json({ 
                success: false, 
                message: "Không tìm thấy video" 
            });
        }

        // Kiểm tra quyền: User chỉ xóa được video của mình, Admin xóa được tất cả
        if (role !== 'admin' && video.uploader_id.toString() !== userId) {
            return res.status(403).json({ 
                success: false, 
                message: "Bạn không có quyền xóa video này" 
            });
        }

        // Xóa file khỏi MinIO
        if (video.minio_url) {
            try {
                const objectName = video.minio_url.split('/').pop();
                await minioClient.removeObject(BUCKET_NAME, objectName);
                console.log('✅ Đã xóa file khỏi MinIO:', objectName);
            } catch (minioError) {
                console.error('⚠️ Lỗi khi xóa file MinIO:', minioError.message);
                // Tiếp tục xóa database ngay cả khi xóa MinIO lỗi
            }
        }

        // Xóa khỏi MongoDB
        await Video.deleteOne({ _id: video._id });
        
        res.status(200).json({ 
            success: true, 
            message: "Đã xóa video thành công" 
        });

    } catch (error) {
        console.error("Delete Video Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Lỗi server khi xóa video" 
        });
    }
};

// ==========================================
// SOFT DELETE VIDEO (Admin Only)
// ==========================================
exports.softDeleteVideo = async (req, res) => {
    const { video_id } = req.params;

    try {
        // 1. Tìm video trong MongoDB
        let query = {};
        if (ObjectId.isValid(video_id)) {
            query = { _id: new ObjectId(video_id) };
        } else {
            query = { video_id: video_id };
        }

        const video = await Video.findOne(query);
        
        if (!video) {
            return res.status(404).json({ 
                success: false, 
                message: "Không tìm thấy video" 
            });
        }

        // 2. Soft delete trong MongoDB (đánh dấu is_deleted = true)
        await Video.updateOne(
            { _id: video._id },
            { 
                $set: { 
                    is_deleted: true,
                    deleted_at: new Date()
                } 
            }
        );

        // 3. Soft delete trong các collection liên quan (environment, segment, person, etc.)
        const videoIdStr = video._id.toString();
        for (const collectionName of RELATED_COLLECTIONS) {
            const db = mongoose.connection.db;
            await db.collection(collectionName).updateMany(
                { video_id: videoIdStr },
                { 
                    $set: { 
                        is_deleted: true,
                        deleted_at: new Date()
                    } 
                }
            );
        }

        // 4. Soft delete trong PostgreSQL
        try {
            const pgClient = await pgPool.connect();
            try {
                // Update video_metadata table
                await pgClient.query(
                    'UPDATE video_metadata SET is_deleted = true, deleted_at = NOW() WHERE video_id = $1',
                    [videoIdStr]
                );

                // Update video_segments table
                await pgClient.query(
                    'UPDATE video_segments SET is_deleted = true, deleted_at = NOW() WHERE video_id = $1',
                    [videoIdStr]
                );

                // Update activities table
                await pgClient.query(
                    'UPDATE activities SET is_deleted = true, deleted_at = NOW() WHERE video_id = $1',
                    [videoIdStr]
                );

                console.log('✅ Soft deleted in PostgreSQL');
            } finally {
                pgClient.release();
            }
        } catch (pgError) {
            console.warn('⚠️ PostgreSQL soft delete warning:', pgError.message);
        }

        // 5. Soft delete trong Neo4j
        try {
            const neo4jSession = neo4jDriver.session();
            try {
                // Set is_deleted = true cho tất cả nodes liên quan đến video
                await neo4jSession.run(`
                    MATCH (n)
                    WHERE n.video_id = $videoId
                    SET n.is_deleted = true, n.deleted_at = datetime()
                `, { videoId: videoIdStr });

                // Set is_deleted = true cho tất cả relationships
                await neo4jSession.run(`
                    MATCH ()-[r]-()
                    WHERE r.video_id = $videoId
                    SET r.is_deleted = true, r.deleted_at = datetime()
                `, { videoId: videoIdStr });

                console.log('✅ Soft deleted in Neo4j');
            } finally {
                await neo4jSession.close();
            }
        } catch (neo4jError) {
            console.warn('⚠️ Neo4j soft delete warning:', neo4jError.message);
        }

        res.status(200).json({ 
            success: true, 
            message: "Đã đánh dấu xóa video và các dữ liệu liên quan trong MongoDB, PostgreSQL và Neo4j" 
        });

    } catch (error) {
        console.error("Soft Delete Video Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Lỗi server khi soft delete video: " + error.message 
        });
    }
};

// ==========================================
// RESTORE SOFT-DELETED VIDEO (Admin Only)
// ==========================================
exports.restoreVideo = async (req, res) => {
    const { video_id } = req.params;

    try {
        // 1. Tìm video trong MongoDB
        let query = {};
        if (ObjectId.isValid(video_id)) {
            query = { _id: new ObjectId(video_id) };
        } else {
            query = { video_id: video_id };
        }

        const video = await Video.findOne(query);
        
        if (!video) {
            return res.status(404).json({ 
                success: false, 
                message: "Không tìm thấy video" 
            });
        }

        // 2. Restore trong MongoDB (is_deleted = false, deleted_at = null)
        await Video.updateOne(
            { _id: video._id },
            { 
                $set: { 
                    is_deleted: false,
                    deleted_at: null
                } 
            }
        );

        // 3. Restore trong các collection liên quan
        const videoIdStr = video._id.toString();
        for (const collectionName of RELATED_COLLECTIONS) {
            const db = mongoose.connection.db;
            await db.collection(collectionName).updateMany(
                { video_id: videoIdStr },
                { 
                    $set: { 
                        is_deleted: false,
                        deleted_at: null
                    } 
                }
            );
        }

        // 4. Restore trong PostgreSQL
        try {
            const pgClient = await pgPool.connect();
            try {
                // Restore video_metadata table
                await pgClient.query(
                    'UPDATE video_metadata SET is_deleted = false, deleted_at = NULL WHERE video_id = $1',
                    [videoIdStr]
                );

                // Restore video_segments table
                await pgClient.query(
                    'UPDATE video_segments SET is_deleted = false, deleted_at = NULL WHERE video_id = $1',
                    [videoIdStr]
                );

                // Restore activities table
                await pgClient.query(
                    'UPDATE activities SET is_deleted = false, deleted_at = NULL WHERE video_id = $1',
                    [videoIdStr]
                );

                console.log('✅ Restored in PostgreSQL');
            } finally {
                pgClient.release();
            }
        } catch (pgError) {
            console.warn('⚠️ PostgreSQL restore warning:', pgError.message);
        }

        // 5. Restore trong Neo4j
        try {
            const neo4jSession = neo4jDriver.session();
            try {
                // Set is_deleted = false và xóa deleted_at cho tất cả nodes
                await neo4jSession.run(`
                    MATCH (n)
                    WHERE n.video_id = $videoId
                    SET n.is_deleted = false
                    REMOVE n.deleted_at
                `, { videoId: videoIdStr });

                // Set is_deleted = false và xóa deleted_at cho tất cả relationships
                await neo4jSession.run(`
                    MATCH ()-[r]-()
                    WHERE r.video_id = $videoId
                    SET r.is_deleted = false
                    REMOVE r.deleted_at
                `, { videoId: videoIdStr });

                console.log('✅ Restored in Neo4j');
            } finally {
                await neo4jSession.close();
            }
        } catch (neo4jError) {
            console.warn('⚠️ Neo4j restore warning:', neo4jError.message);
        }

        res.status(200).json({ 
            success: true, 
            message: "Đã khôi phục video và các dữ liệu liên quan trong MongoDB, PostgreSQL và Neo4j" 
        });

    } catch (error) {
        console.error("Restore Video Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Lỗi server khi khôi phục video: " + error.message 
        });
    }
};

// ==========================================
// AI ANALYSIS
// ==========================================
exports.analyzeVideo = async (req, res) => {
    try {
        const { video_id } = req.params;
        const { role } = req.user || {};

        if (!video_id || !ObjectId.isValid(video_id)) {
            return res.status(400).json({
                success: false,
                message: "video_id không hợp lệ"
            });
        }

        const video = await Video.findOne({
            _id: new ObjectId(video_id),
            $or: [
                { is_deleted: { $exists: false } },
                { is_deleted: false }
            ]
        });

        if (!video) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy video"
            });
        }

        if (role !== 'admin' && video.uploader_id.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "Bạn không có quyền phân tích video này"
            });
        }

        if (video.status === 'processing') {
            return res.status(400).json({
                success: false,
                message: "Video đang được xử lý, vui lòng đợi"
            });
        }

        const path = require('path');
        const fs = require('fs').promises;
        const os = require('os');
        const { spawn } = require('child_process');

        const tempDir = os.tmpdir();
        const ext = path.extname(video.clip_name || '') || '.mp4';
        const tempFilePath = path.join(tempDir, `${video_id}_${Date.now()}${ext}`);

        try {
            const objectName = video.minio_url.split('/').pop().split('?')[0];
            console.log(`📥 Downloading video from MinIO: bucket=${BUCKET_NAME}, object=${objectName}`);

            const stream = await minioClient.getObject(BUCKET_NAME, objectName);
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }

            const buffer = Buffer.concat(chunks);
            await fs.writeFile(tempFilePath, buffer);
            console.log(`✅ Video downloaded to: ${tempFilePath}`);

            await Video.updateOne(
                { _id: new ObjectId(video_id) },
                {
                    $set: {
                        status: 'processing',
                        processing_started_at: new Date(),
                        error_message: null,
                        ai_pipeline_exit_code: null,
                        ai_pipeline_finished_at: null
                    }
                }
            );

            const pythonScript = path.join(__dirname, '..', '..', 'ai_service', 'process_video.py');

            console.log('🐍 Launching video AI analysis:');
            console.log(`   Script: ${pythonScript}`);
            console.log(`   Video : ${tempFilePath}`);
            console.log(`   ID    : ${video_id}`);

            const pythonProcess = spawn('python', [pythonScript, tempFilePath, video_id], {
                env: { ...process.env, MONGODB_URI: process.env.MONGODB_URI },
                detached: false,
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true
            });

            let pythonOutput = '';
            let pythonError = '';

            pythonProcess.stdout.on('data', (data) => {
                const output = data.toString();
                pythonOutput += output;
                console.log(`[VideoAI stdout]: ${output}`);
            });

            pythonProcess.stderr.on('data', (data) => {
                const error = data.toString();
                pythonError += error;
                console.error(`[VideoAI stderr]: ${error}`);
            });

            pythonProcess.on('exit', async (code) => {
                console.log(`Video AI process exited with code: ${code}`);
                if (code === 0) {
                    try {
                        await Video.updateOne(
                            { _id: new ObjectId(video_id) },
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
                        console.error('Failed to update video status to done:', updateErr.message);
                    }
                } else {
                    console.error(`❌ Video AI failed with code ${code}`);
                    console.error(`Last stdout: ${pythonOutput.slice(-500)}`);
                    console.error(`Last stderr: ${pythonError.slice(-500)}`);

                    try {
                        await Video.updateOne(
                            { _id: new ObjectId(video_id) },
                            {
                                $set: {
                                    status: 'error',
                                    processed_at: new Date(),
                                    error_message: pythonError.slice(-1000) || `Video AI process failed with code ${code}`,
                                    ai_pipeline_exit_code: code,
                                    ai_pipeline_finished_at: new Date()
                                }
                            }
                        );
                    } catch (updateErr) {
                        console.error('Failed to update video status to error:', updateErr.message);
                    }
                }

                setTimeout(async () => {
                    try {
                        await fs.unlink(tempFilePath);
                        console.log(`🗑️ Cleaned temp video: ${tempFilePath}`);
                    } catch (err) {
                        console.error('Error deleting temp video:', err.message);
                    }
                }, 5000);
            });

            pythonProcess.on('error', async (error) => {
                console.error('❌ Failed to start video AI process:', error);
                try {
                    await Video.updateOne(
                        { _id: new ObjectId(video_id) },
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
                    console.error('Failed to update video status after spawn error:', updateErr.message);
                }
            });

            return res.status(200).json({
                success: true,
                message: 'Đã bắt đầu phân tích video theo pipeline AI. Vui lòng đợi vài phút.',
                video_id,
                status: 'processing'
            });
        } catch (downloadError) {
            console.error('❌ Error preparing video AI analysis:', downloadError);

            try {
                await fs.unlink(tempFilePath);
            } catch (cleanupErr) {
                // ignore
            }

            await Video.updateOne(
                { _id: new ObjectId(video_id) },
                {
                    $set: {
                        status: 'error',
                        processed_at: new Date(),
                        error_message: `Không thể tải video từ MinIO: ${downloadError.message}`
                    }
                }
            );

            return res.status(500).json({
                success: false,
                message: 'Lỗi khi chuẩn bị phân tích video',
                error: downloadError.message
            });
        }
    } catch (error) {
        console.error('Analyze Video Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi server khi phân tích video'
        });
    }
};