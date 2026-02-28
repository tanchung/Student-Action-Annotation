import React, { useState } from "react";
import { Link } from "react-router-dom";
import axiosClient from "../../api/axiosClient";
import { Loader2, GraduationCap, Video, BookOpen } from "lucide-react";

const UserLoginPage = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await axiosClient.post("/auth/login", { username, password });
      
      const token = res.data?.token || res.data?.result?.token;
      const user = res.data?.user || res.data?.result;

      if (!token || !user) throw new Error("Lỗi xác thực.");

      // --- 🛑 KIỂM TRA ROLE NGAY TẠI ĐÂY ---
      if (user.role === 'admin') {
        // Nếu là admin -> Báo lỗi và dừng lại, không lưu token
        setMessage("⛔ Tài khoản Admin không được phép đăng nhập ở đây. Vui lòng dùng trang Admin Login.");
        setLoading(false);
        return; // Dừng hàm
      }

      // --- NẾU LÀ USER THÌ MỚI LƯU ---
      localStorage.setItem("access_token", token);
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("role", user.role);
      
      axiosClient.defaults.headers.common["Authorization"] = `Bearer ${token}`;

      setMessage("✅ Đăng nhập thành công! Đang chuyển hướng...");

      setTimeout(() => {
        window.location.href = "/home"; // Chuyển sang trang User
      }, 800);

    } catch (error) {
      console.error("Login Error:", error);
      const errMsg = error.response?.data?.message || "Tên đăng nhập hoặc mật khẩu không đúng.";
      setMessage(`❌ ${errMsg}`);
    } finally {
      // Chỉ tắt loading nếu chưa redirect (để tránh flicker)
      if (!window.location.href.includes("/home")) {
          setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50">
      {/* ... Phần giao diện giữ nguyên như cũ ... */}
      <div className="bg-white shadow-xl rounded-2xl flex flex-col md:flex-row w-full max-w-4xl overflow-hidden border border-blue-100">
        
        {/* Cột trái */}
        <div className="w-full md:w-1/2 bg-blue-600 p-8 text-white flex flex-col justify-center items-center text-center">
          <div className="mb-6 bg-white/20 p-4 rounded-full animate-bounce-slow">
            <BookOpen size={64} className="text-white" />
          </div>
          <h2 className="text-3xl font-bold mb-2">Student Action Annotation</h2>
          <p className="text-blue-100 mb-6">Nền tảng hỗ trợ tạo chú thích cho hành động học tập.</p>
        </div>

        {/* Cột phải */}
        <div className="w-full md:w-1/2 p-8 md:p-12 bg-white">
          <h2 className="text-2xl font-bold text-gray-800 text-center mb-2">Chào mừng!</h2>
          <p className="text-gray-500 text-center mb-8 text-sm">Dành cho Học sinh & Giáo viên</p>

          <form onSubmit={handleLogin}>
            {/* Input Username */}
            <div className="mb-4">
              <label className="block text-gray-700 font-medium mb-1 text-sm">Tên đăng nhập</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            {/* Input Password */}
            <div className="mb-6">
              <label className="block text-gray-700 font-medium mb-1 text-sm">Mật khẩu</label>
              <input
                type="password"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-lg text-white font-semibold transition shadow-md flex items-center justify-center ${
                loading ? "bg-blue-400" : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {loading ? <Loader2 className="animate-spin mr-2" /> : "Đăng nhập ngay"}
            </button>
          </form>

          {/* Thông báo lỗi/thành công */}
          {message && (
            <div className={`mt-4 p-3 rounded text-sm text-center border ${
              message.includes("✅") 
                ? "bg-green-50 text-green-700 border-green-200" 
                : "bg-red-50 text-red-700 border-red-200"
            }`}>
              {message}
            </div>
          )}

          {/* Link Đăng ký */}
          <div className="mt-8 pt-6 border-t border-gray-100 text-center">
            <p className="text-gray-600 text-sm">
              Bạn chưa có tài khoản?{" "}
              <Link to="/register" className="text-blue-600 font-bold hover:underline">
                Đăng ký tại đây
              </Link>
            </p>
          </div>
          
          {/* Link phụ sang trang Admin (Optional) */}
          <div className="mt-2 text-center">
             <Link to="/admin/login" className="text-xs text-gray-400 hover:text-gray-600">
               Bạn là quản trị viên?
             </Link>
          </div>

        </div>
      </div>
    </div>
  );
};

export default UserLoginPage;