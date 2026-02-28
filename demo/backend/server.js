// backend/server.js
const express = require("express");
const cors = require("cors");
const path = require("path"); // <-- THÊM: Để xử lý đường dẫn thư mục
const dotenv = require("dotenv"); // <-- THÊM: Để đọc file .env

// 1. Cấu hình dotenv ngay đầu file
dotenv.config();

const connectMongo = require("./config/mongo");
const videoRoutes = require("./routes/video.routes");
const uploadRoutes = require("./routes/upload.routes");
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// 2. Cấu hình thư mục tĩnh (QUAN TRỌNG CHO ẢNH/VIDEO)
// Giúp frontend truy cập được link dạng: http://localhost:5000/uploads/ten-anh.jpg
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use("/api/videos", videoRoutes);
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);

const PORT = process.env.PORT || 5000; // Nên dùng process.env.PORT

// --- KHỞI ĐỘNG SERVER ---
const startServer = async () => {
  try {
    await connectMongo(); 
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
  }
};

startServer();