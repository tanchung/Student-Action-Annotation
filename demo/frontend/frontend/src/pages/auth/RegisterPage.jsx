import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axiosClient from "../../api/axiosClient";
import { 
  Loader2, 
  UserPlus, 
  User, 
  Mail, 
  Lock, 
  CheckCircle 
} from "lucide-react";

const RegisterPage = () => {
  const navigate = useNavigate();
  
  // Quản lý state cho form
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    username: "",
    password: "",
    confirmPassword: ""
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Hàm xử lý khi người dùng nhập liệu
  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  // Hàm xử lý đăng ký
  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    // 1. Kiểm tra mật khẩu nhập lại
    if (formData.password !== formData.confirmPassword) {
      setMessage("❌ Mật khẩu xác nhận không khớp!");
      setLoading(false);
      return;
    }

    try {
      // 2. Gọi API đăng ký
      // Backend: authController.register nhận { username, password, full_name, email, role }
      const payload = {
        username: formData.username,
        password: formData.password,
        full_name: formData.full_name,
        email: formData.email,
        role: "user" // Mặc định đăng ký từ ngoài là User thường
      };

      const res = await axiosClient.post("/auth/register", payload);

      if (res.data?.success) {
        setMessage("✅ Đăng ký thành công! Đang chuyển đến trang đăng nhập...");
        
        // Chờ 1.5s rồi chuyển về trang login
        setTimeout(() => {
          navigate("/login");
        }, 1500);
      } else {
        setMessage("⚠️ Đăng ký thất bại. Vui lòng thử lại.");
      }

    } catch (error) {
      console.error("Register Error:", error);
      const errMsg = error.response?.data?.message || "Lỗi kết nối server.";
      setMessage(`❌ ${errMsg}`);
    } finally {
      if (!message.includes("thành công")) {
         setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50 py-10 px-4">
      <div className="bg-white shadow-2xl rounded-2xl flex flex-col md:flex-row w-full max-w-4xl overflow-hidden border border-blue-100">
        
        {/* Cột trái: Branding (Giống trang Login User) */}
        <div className="hidden md:flex w-1/2 bg-blue-600 p-8 text-white flex-col justify-center items-center text-center">
          <div className="mb-6 bg-white/20 p-5 rounded-full animate-pulse">
            <UserPlus size={64} className="text-white" />
          </div>
          <h2 className="text-3xl font-bold mb-3">Đăng ký</h2>
          <p className="text-blue-100 mb-6 px-8">
            Tạo tài khoản ngay để truy cập hệ thống phân tích hành vi học sinh.
          </p>
          <ul className="text-sm text-blue-200 space-y-2 text-left inline-block">
            <li className="flex items-center gap-2"><CheckCircle size={16}/> Xem video bài giảng</li>
            <li className="flex items-center gap-2"><CheckCircle size={16}/> Phân tích hành vi tự động</li>
          </ul>
        </div>

        {/* Cột phải: Form Đăng ký */}
        <div className="w-full md:w-1/2 p-8 md:p-10 bg-white relative">
          <h2 className="text-2xl font-bold text-gray-800 text-center mb-6">
            Đăng ký tài khoản mới
          </h2>

          <form onSubmit={handleRegister} className="space-y-4">
            
            {/* Họ tên */}
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-1">Họ và tên</label>
              <div className="relative">
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Nguyễn Văn A"
                  required
                />
                <User size={18} className="absolute left-3 top-3 text-gray-400" />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-1">Email</label>
              <div className="relative">
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="student@example.com"
                  required
                />
                <Mail size={18} className="absolute left-3 top-3 text-gray-400" />
              </div>
            </div>

            {/* Tên đăng nhập */}
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-1">Tên đăng nhập</label>
              <div className="relative">
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="username123"
                  required
                />
                <User size={18} className="absolute left-3 top-3 text-gray-400" />
              </div>
            </div>

            {/* Mật khẩu & Nhập lại mật khẩu (Layout 2 cột) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-1">Mật khẩu</label>
                <div className="relative">
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    placeholder="******"
                    required
                  />
                  <Lock size={16} className="absolute left-3 top-3 text-gray-400" />
                </div>
              </div>

              <div>
                <label className="block text-gray-700 text-sm font-medium mb-1">Xác nhận</label>
                <div className="relative">
                  <input
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    placeholder="******"
                    required
                  />
                  <Lock size={16} className="absolute left-3 top-3 text-gray-400" />
                </div>
              </div>
            </div>

            {/* Nút đăng ký */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-lg text-white font-bold transition shadow-md flex items-center justify-center mt-6 ${
                loading ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {loading ? <Loader2 className="animate-spin mr-2" /> : "Đăng ký tài khoản"}
            </button>
          </form>

          {/* Thông báo */}
          {message && (
            <div className={`mt-4 p-3 rounded text-sm text-center border ${
              message.includes("✅") ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
            }`}>
              {message}
            </div>
          )}

          {/* Link quay lại đăng nhập */}
          <div className="mt-6 text-center pt-4 border-t border-gray-100">
            <p className="text-gray-600 text-sm">
              Đã có tài khoản?{" "}
              <Link to="/login" className="text-blue-600 font-bold hover:underline">
                Đăng nhập ngay
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;