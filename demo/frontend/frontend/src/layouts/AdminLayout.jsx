import React from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Menu, LogOut, Bell } from "lucide-react";
import Sidebar from "../components/Sidebar";

const AdminLayout = () => {
  const navigate = useNavigate();
  // Lấy thông tin user an toàn (tránh lỗi null)
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const handleLogout = () => {
    // Thêm xác nhận trước khi đăng xuất (Tùy chọn, giúp tránh bấm nhầm)
    if (window.confirm("Bạn có chắc chắn muốn đăng xuất khỏi trang quản trị?")) {
      // 1. Xóa toàn bộ token và thông tin user
      localStorage.clear();
      
      // 2. Chuyển hướng về trang đăng nhập Admin
      navigate("/admin/login");
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      
      {/* --- 1. SIDEBAR --- */}
      <Sidebar />

      {/* --- 2. MAIN CONTENT AREA --- */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Header */}
        <header className="h-16 bg-white shadow-sm flex items-center justify-between px-6 z-10 sticky top-0">
          
          <button className="md:hidden text-gray-500">
            <Menu />
          </button>
          
          <h2 className="hidden md:block text-lg font-semibold text-gray-700">
            Hệ thống quản trị
          </h2>

          {/* User Info & Actions */}
          <div className="flex items-center gap-4">
            <button className="text-gray-400 hover:text-indigo-600 relative">
              <Bell size={20} />
              <span className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full"></span>
            </button>

            <div className="h-8 w-[1px] bg-gray-200"></div>

            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-gray-700">{user.full_name || "Admin"}</p>
                <p className="text-xs text-gray-500 capitalize">{user.role || "Administrator"}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold border border-indigo-200">
                {user.username ? user.username[0].toUpperCase() : "A"}
              </div>
            </div>

            {/* Nút Đăng xuất */}
            <button 
              onClick={handleLogout} 
              title="Đăng xuất"
              className="ml-2 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-6 bg-slate-50 relative">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;