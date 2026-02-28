const express = require("express");
const multer = require("multer");
const { uploadVideo } = require("../controllers/upload.controller");
const { verifyToken } = require("../middlewares/auth.middleware");

const router = express.Router();

// dùng memory để stream thẳng lên MinIO
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 } // Giới hạn 500MB
});

router.post("/upload-video", verifyToken, upload.single("video"), uploadVideo);

module.exports = router;
