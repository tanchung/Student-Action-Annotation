const Minio = require("minio");

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || "localhost",
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
});

const BUCKET_NAME = process.env.MINIO_BUCKET || "classroom";

async function initBucket() {
  try {
    const exists = await minioClient.bucketExists(BUCKET_NAME);
    if (!exists) {
      await minioClient.makeBucket(BUCKET_NAME);
      console.log(`✅ Created bucket: ${BUCKET_NAME}`);
    } else {
      console.log(`✅ Bucket exists: ${BUCKET_NAME}`);
    }

    // Set bucket policy to public-read
    const policy = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: ["*"] },
          Action: ["s3:GetObject"],
          Resource: [`arn:aws:s3:::${BUCKET_NAME}/*`]
        }
      ]
    };

    await minioClient.setBucketPolicy(BUCKET_NAME, JSON.stringify(policy));
    console.log(`✅ Bucket policy set to public-read`);

    // Set CORS configuration
    const corsConfig = {
      CORSRules: [
        {
          AllowedOrigins: ["*"],
          AllowedMethods: ["GET", "HEAD"],
          AllowedHeaders: ["*"],
          ExposeHeaders: ["ETag", "Content-Length", "Content-Type"],
          MaxAgeSeconds: 3600
        }
      ]
    };

    try {
      // MinIO không support setBucketCors trực tiếp qua SDK
      // Cần config bằng mc client hoặc thông qua MinIO Console
      console.log(`⚠️ CORS cần được config thủ công qua MinIO Console hoặc mc client`);
    } catch (corsError) {
      console.log('⚠️ CORS config skipped');
    }
  } catch (error) {
    console.error('❌ MinIO init error:', error);
  }
}

initBucket();

module.exports = {
  minioClient,
  BUCKET_NAME
};
