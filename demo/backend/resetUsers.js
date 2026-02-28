const mongoose = require('mongoose');
const User = require('./models/User');

const resetUsers = async () => {
    try {
        // 1. Kết nối DB
        const MONGO_URI = "mongodb://localhost:27017/classroom_kg";
        await mongoose.connect(MONGO_URI);
        console.log(`✅ Connected to: ${MONGO_URI}`);

        // 2. Xóa tất cả users cũ (vì password bị hash 2 lần)
        const deleted = await User.deleteMany({});
        console.log(`🗑️  Deleted ${deleted.deletedCount} old users`);

        // 3. Tạo admin mới (password sẽ tự hash đúng 1 lần)
        const admin = new User({
            username: "admin",
            password: "123456",
            email: "admin@classroom.kg",
            full_name: "Super Administrator",
            role: "admin"
        });
        await admin.save();
        console.log("✅ Admin created successfully!");

        // 4. Tạo thêm 1 user test
        const testUser = new User({
            username: "student",
            password: "123456",
            email: "student@test.com",
            full_name: "Test Student",
            role: "user"
        });
        await testUser.save();
        console.log("✅ Test user created successfully!");

        console.log("\n-----------------------------------");
        console.log("📋 Login Credentials:");
        console.log("-----------------------------------");
        console.log("Admin:");
        console.log("  👉 Username: admin");
        console.log("  👉 Password: 123456");
        console.log("\nStudent:");
        console.log("  👉 Username: student");
        console.log("  👉 Password: 123456");
        console.log("-----------------------------------\n");

        process.exit(0);
    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
};

resetUsers();
