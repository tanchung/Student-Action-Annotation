const Minio = require("minio");

const minioClient = new Minio.Client({
  endPoint: "localhost",
  port: 9000,
  useSSL: false,
  accessKey: "minioadmin",
  secretKey: "minioadmin",
});

const BUCKET_NAME = "classroom";

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
