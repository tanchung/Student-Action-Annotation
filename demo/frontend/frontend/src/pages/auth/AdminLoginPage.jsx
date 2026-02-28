import React, { useState } from "react";
import axiosClient from "../../api/axiosClient"; // Sửa lại đường dẫn nếu cần
import { Loader2, ShieldCheck, Lock } from "lucide-react"; // Icon khác cho Admin

const AdminLoginPage = () => {
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

      if (!token) {
        throw new Error("Không nhận được token xác thực.");
      }

      const user = res.data?.user || res.data?.result;
      
      // --- QUAN TRỌNG: Kiểm tra quyền Admin ---
      if (user.role !== 'admin') {
        setMessage("⛔ Bạn không có quyền truy cập trang Quản trị!");
        setLoading(false);
        return;
      }

      localStorage.setItem("access_token", token);
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("role", user.role);
      
      axiosClient.defaults.headers.common["Authorization"] = `Bearer ${token}`;

      setMessage("✅ Đăng nhập Admin thành công!");

      setTimeout(() => {
        window.location.href = "/admin/dashboard"; // Chuyển hướng vào trang Admin
      }, 800);

    } catch (error) {
      console.error("Admin Login Error:", error);
      const errMsg = error.response?.data?.message || "Đăng nhập thất bại.";
      setMessage(`❌ ${errMsg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-white shadow-2xl rounded-2xl flex flex-col md:flex-row w-full max-w-4xl overflow-hidden">
        
        {/* Cột trái: Admin Branding (Màu tối) */}
        <div className="w-full md:w-1/2 bg-indigo-900 p-8 text-white flex flex-col justify-center items-center text-center">
          <div className="mb-6 bg-white/10 p-4 rounded-full">
            <ShieldCheck size={64} className="text-indigo-400" />
          </div>
          <h2 className="text-3xl font-bold mb-2">Administrator</h2>
          <p className="text-indigo-200">
            Hệ thống quản trị dữ liệu và phân tích hành vi học tập.
          </p>
        </div>

        {/* Cột phải: Form */}
        <div className="w-full md:w-1/2 p-8 md:p-12 bg-white">
          <h2 className="text-2xl font-bold text-gray-800 text-center mb-6">
            Admin Portal
          </h2>

          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label className="block text-gray-700 font-medium mb-1 text-sm">Username</label>
              <div className="relative">
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg pl-4 pr-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                />
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-gray-700 font-medium mb-1 text-sm">Password</label>
              <div className="relative">
                <input
                  type="password"
                  className="w-full border border-gray-300 rounded-lg pl-4 pr-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  required
                />
                <Lock size={18} className="absolute right-3 top-3.5 text-gray-400" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-lg text-white font-semibold flex items-center justify-center ${
                loading ? "bg-indigo-400" : "bg-indigo-700 hover:bg-indigo-800"
              }`}
            >
              {loading ? <Loader2 className="animate-spin mr-2" /> : "Truy cập hệ thống"}
            </button>
          </form>

          {message && (
            <div className={`mt-6 p-3 rounded text-sm text-center border ${
              message.includes("✅") ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
            }`}>
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminLoginPage;