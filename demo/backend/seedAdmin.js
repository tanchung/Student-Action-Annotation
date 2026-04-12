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

        // 2. Tìm xem admin cũ có không
        const existingAdmin = await User.findOne({ username });

        if (existingAdmin) {
            // === NẾU ĐÃ CÓ -> XÓA VÀ TẠO LẠI ===
            console.log(`⚠️ User '${username}' đã tồn tại -> Đang xóa và tạo lại...`);
            await User.deleteOne({ username });
            console.log("🗑️ Đã xóa admin cũ!");
        }
        
        // === TẠO ADMIN MỚI (pre-save hook sẽ tự động hash password) ===
        const newAdmin = new User({
            username,
            password: passwordRaw, // Để password thô, pre-save hook sẽ hash
            full_name: "Super Administrator",
            email: "admin@classroom.kg",
            role: "admin"
        });
        await newAdmin.save();
        console.log("🎉 Đã tạo Admin mới thành công!");

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