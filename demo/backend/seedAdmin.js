const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const User = require('./models/User'); 

dotenv.config(); 

const seedAdmin = async () => {
    try {
        // 1. Kết nối DB
        const MONGO_URI = "mongodb://localhost:27017/classroom_kg"; 
        await mongoose.connect(MONGO_URI);
        console.log(`✅ Connected to: ${MONGO_URI}`);

        const username = "admin"; // Giữ nguyên là admin
        const passwordRaw = "123456";

        // 2. Mã hóa mật khẩu
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(passwordRaw, salt);

        // 3. Tìm xem admin cũ có không
        const existingAdmin = await User.findOne({ username });

        if (existingAdmin) {
            // === NẾU ĐÃ CÓ -> CẬP NHẬT PASS MỚI ===
            console.log(`⚠️ User '${username}' đã tồn tại -> Đang reset mật khẩu...`);
            
            existingAdmin.password = hashedPassword;
            existingAdmin.role = "admin"; // Đảm bảo role chuẩn
            await existingAdmin.save();
            
            console.log("✅ Đã đổi mật khẩu thành công!");
        } else {
            // === NẾU CHƯA CÓ -> TẠO MỚI ===
            const newAdmin = new User({
                username,
                password: hashedPassword,
                full_name: "Super Administrator",
                email: "admin@classroom.kg",
                role: "admin"
            });
            await newAdmin.save();
            console.log("🎉 Đã tạo Admin mới thành công!");
        }

        console.log("-----------------------------------");
        console.log(`👉 Username: ${username}`);
        console.log(`👉 Password: ${passwordRaw}`);
        console.log("-----------------------------------");

    } catch (error) {
        console.error("❌ Lỗi:", error);
    } finally {
        mongoose.connection.close();
    }
};

seedAdmin();