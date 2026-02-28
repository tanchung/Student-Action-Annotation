import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Save, User, Lock, Mail, Shield, AlertCircle } from "lucide-react";
import axiosClient from "../../api/axiosClient";

const AddUser = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Xác định role mặc định dựa trên URL (nếu từ trang AdminManager -> admin, StudentManager -> user)
  // Dùng location.state nếu được truyền, hoặc fallback vào logic path
  const defaultRole = location.state?.role || (location.pathname.includes("admins") ? "admin" : "user");

  const [formData, setFormData] = useState({
    username: "",
    password: "",
    email: "",
    full_name: "",
    role: defaultRole,
    nonLocked: true
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Gọi API tạo user
      const res = await axiosClient.post("/users/create", formData);
      if (res.data.success) {
        alert(`✅ Đã tạo tài khoản ${formData.role === 'admin' ? 'Quản trị viên' : 'Người dùng'} thành công!`);
        navigate(-1); // Quay lại trang trước
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Lỗi khi tạo tài khoản");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 p-6 bg-[#F5F7FB] min-h-screen animate-fade-in flex justify-center items-start pt-10">
      <div className="bg-white shadow-lg rounded-2xl w-full max-w-2xl overflow-hidden border border-gray-100">
        
        {/* Header Form */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-500 p-6 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-xl font-bold">Thêm tài khoản mới</h2>
              <p className="text-indigo-100 text-sm">Điền thông tin để tạo user mới vào hệ thống</p>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg flex items-center gap-2 text-sm border border-red-200">
              <AlertCircle size={16}/> {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Username */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Username <span className="text-red-500">*</span></label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="text" 
                  name="username" 
                  required
                  placeholder="VD: student123"
                  className="w-full pl-10 p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition bg-gray-50 focus:bg-white"
                  value={formData.username}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Mật khẩu <span className="text-red-500">*</span></label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="password" 
                  name="password" 
                  required
                  placeholder="Nhập mật khẩu..."
                  className="w-full pl-10 p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition bg-gray-50 focus:bg-white"
                  value={formData.password}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* Email */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="email" 
                  name="email" 
                  required
                  placeholder="VD: student@example.com"
                  className="w-full pl-10 p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition bg-gray-50 focus:bg-white"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Họ và Tên</label>
              <input 
                type="text" 
                name="full_name" 
                placeholder="VD: Nguyễn Văn A"
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition bg-gray-50 focus:bg-white"
                value={formData.full_name}
                onChange={handleChange}
              />
            </div>

            {/* Role Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Vai trò</label>
              <div className="relative">
                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <select 
                  name="role" 
                  className="w-full pl-10 p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white appearance-none cursor-pointer"
                  value={formData.role}
                  onChange={handleChange}
                >
                  <option value="user">Người dùng (User)</option>
                  <option value="admin">Quản trị viên (Admin)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
            <button 
              type="button"
              onClick={() => navigate(-1)}
              className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition font-medium"
            >
              Hủy bỏ
            </button>
            <button 
              type="submit" 
              disabled={loading}
              className={`px-8 py-2.5 rounded-lg text-white font-medium shadow-md transition flex items-center gap-2 ${
                loading ? "bg-indigo-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg"
              }`}
            >
              {loading ? "Đang tạo..." : <><Save size={18} /> Tạo tài khoản</>}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

// 👇👇👇 DÒNG QUAN TRỌNG NHẤT ĐỂ SỬA LỖI 👇👇👇
export default AddUser;