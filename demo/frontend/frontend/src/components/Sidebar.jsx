import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Video,
  FileJson,       
  Network,        
  Database,       
  Search,         
  Users,          
  User,   // <-- ĐÃ THÊM (Sửa lỗi User is not defined)
  Shield, // <-- ĐÃ THÊM (Để dùng cho icon Admin)
  ChevronDown
} from "lucide-react";

const Sidebar = () => {
  const location = useLocation();
  const [openMenu, setOpenMenu] = useState(null);

  const toggleMenu = (name) => {
    setOpenMenu(openMenu === name ? null : name);
  };

  // Cấu trúc Menu
  const menu = [
    { 
      name: "Dashboard", 
      path: "/admin/dashboard", 
      icon: <LayoutDashboard size={20} /> 
    },
    { 
      name: "Quản lý Video", 
      path: "/admin/videos", 
      icon: <Video size={20} /> 
    },
    {
      name: "Quản lý Dữ liệu",
      icon: <Database size={20} />,
      children: [
        { name: "Metadata (Mongo)", path: "/admin/metadata", icon: <FileJson size={18} /> },
        { name: "Dữ liệu (PostgreSQL)", path: "/admin/postgres", icon: <Database size={18} /> },
        { name: "Knowledge Graph (Neo4j)", path: "/admin/kg", icon: <Network size={18} /> },
      ],
    },
    
    {
      name: "Quản lý Người dùng",
      icon: <Users size={20} />,
      children: [
        // Sử dụng icon User và Shield đã import ở trên
        { name: "Người dùng (Users)", path: "/admin/users/students", icon: <User size={18} /> },
        { name: "Quản trị viên (Admins)", path: "/admin/users/admins", icon: <Shield size={18} /> },
      ],
    },
  ];

  return (
    <div className="h-screen w-64 bg-gradient-to-b from-indigo-900 to-slate-900 text-white flex flex-col shadow-2xl flex-shrink-0 transition-all duration-300">
      {/* Header Sidebar */}
      <div className="text-xl font-bold px-6 py-6 border-b border-indigo-700/50 text-center tracking-wide flex items-center justify-center gap-2">
         <span className="bg-white text-indigo-900 rounded p-1"><Video size={20}/></span>
         <span>Annotation Admin</span>
      </div>

      {/* Menu Items */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {menu.map((item) => (
          <div key={item.name}>
            {item.children ? (
              // --- TRƯỜNG HỢP CÓ MENU CON (Dropdown) ---
              <div className="space-y-1">
                <button
                  onClick={() => toggleMenu(item.name)}
                  className={`flex items-center justify-between w-full px-4 py-3 rounded-xl transition-all duration-200 
                    ${
                      openMenu === item.name || item.children.some(child => location.pathname === child.path)
                        ? "bg-indigo-600/50 text-white shadow-lg border border-indigo-500/30"
                        : "text-indigo-200 hover:bg-white/10 hover:text-white"
                    }`}
                >
                  <div className="flex items-center space-x-3">
                    {item.icon}
                    <span className="font-medium text-sm">{item.name}</span>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`transition-transform duration-200 ${
                      openMenu === item.name ? "rotate-180 text-cyan-400" : ""
                    }`}
                  />
                </button>

                {/* Danh sách con */}
                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    openMenu === item.name ? "max-h-40 mt-1" : "max-h-0"
                  }`}
                >
                  {item.children.map((child) => (
                    <Link
                      key={child.path}
                      to={child.path}
                      className={`flex items-center px-5 py-2.5 ml-2 border-l-2 text-sm transition-all duration-200 ${
                        location.pathname === child.path
                          ? "border-cyan-400 text-cyan-400 bg-white/5"
                          : "border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"
                      }`}
                    >
                      <span className="mr-2">{child.icon}</span>
                      {child.name}
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              // --- TRƯỜNG HỢP MENU ĐƠN ---
              <Link
                to={item.path}
                className={`flex items-center w-full px-4 py-3 rounded-xl transition-all duration-200 ${
                  location.pathname === item.path
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/50"
                    : "text-indigo-200 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="mr-3">{item.icon}</span>
                <span className="font-medium text-sm">{item.name}</span>
              </Link>
            )}
          </div>
        ))}
      </nav>

      {/* Footer Sidebar */}
      <div className="p-4 border-t border-indigo-700/50 text-xs text-center text-indigo-400">
        v1.0.0 Student Action Annotation
      </div>
    </div>
  );
};

export default Sidebar;