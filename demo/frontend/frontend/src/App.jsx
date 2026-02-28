import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";

// --- 1. IMPORT CÁC TRANG AUTH (ĐĂNG NHẬP/ĐĂNG KÝ) ---
import AdminLoginPage from "./pages/auth/AdminLoginPage";
import UserLoginPage from "./pages/auth/UserLoginPage";
import RegisterPage from "./pages/auth/RegisterPage";

// --- 2. IMPORT LAYOUT VÀ TRANG ADMIN ---
import AdminLayout from "./layouts/AdminLayout";
import Dashboard from "./pages/admin/Dashboard";
import VideoManager from "./pages/admin/VideoManager"; // Đây là file App.tsx cũ của bạn (đổi tên và di chuyển vào đây)
import MetadataManager from "./pages/admin/MetadataManager";
import PostgresManager from "./pages/admin/PostgresManager";
import AdminManager from "./pages/admin/AdminManager";
import StudentManager from "./pages/admin/StudentManager";
import UserDetail from "./pages/admin/UserDetail";
import AddUser from "./pages/admin/AddUser";

// --- 3. IMPORT TRANG USER (HỌC SINH) ---
// Nếu bạn chưa tạo file này, hãy xem code mẫu ở cuối bài để tạo tạm
import StudentHome from "./pages/user/StudentHome"; 
import UserDashboard from "./pages/user/UserDashboard";
import MyVideos from "./pages/user/MyVideos";
import AnnotationStudio from "./pages/user/AnnotationStudio";
import VideoViewer from "./pages/user/VideoViewer";
import TutorialsPage from "./pages/user/TutorialsPage";

// =================================================================
// COMPONENT: PROTECTED ROUTE (BẢO VỆ & PHÂN QUYỀN)
// =================================================================
const ProtectedRoute = ({ allowedRoles }) => {
  const token = localStorage.getItem("token");
  const userStr = localStorage.getItem("user");
  let user = null;

  try {
    user = JSON.parse(userStr);
  } catch {
    // Nếu JSON lỗi -> coi như chưa đăng nhập
    user = null;
  }

  // 1. CHƯA ĐĂNG NHẬP -> Đá về trang Login User
  if (!token || !user) {
    // Xóa sạch để đảm bảo không lỗi
    localStorage.clear(); 
    return <Navigate to="/login" replace />;
  }

  // 2. CHECK QUYỀN (ROLE)
  // Nếu role của user không nằm trong danh sách cho phép (allowedRoles)
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Nếu là Admin đang đi lạc vào trang User -> Về Dashboard
    if (user.role === "admin") {
      return <Navigate to="/admin/dashboard" replace />;
    }
    // Nếu là User đang cố vào trang Admin -> Về Home
    if (user.role === "user") {
      return <Navigate to="/home" replace />;
    }
  }

  // 3. HỢP LỆ -> Cho hiển thị nội dung bên trong (Outlet)
  return <Outlet />;
};

// =================================================================
// MAIN APP COMPONENT
// =================================================================
const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        
        {/* =========================================
            A. PUBLIC ROUTES (AI CŨNG VÀO ĐƯỢC)
           ========================================= */}
        
        {/* Mặc định vào "/" thì chuyển tới trang đăng nhập User */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Đăng nhập Admin */}
        <Route path="/admin/login" element={<AdminLoginPage />} />

        {/* Đăng nhập Học sinh */}
        <Route path="/login" element={<UserLoginPage />} />

        {/* Đăng ký */}
        <Route path="/register" element={<RegisterPage />} />

        {/* Trang Home - Không cần đăng nhập */}
        <Route path="/home" element={<StudentHome />} />

        {/* Trang Tutorials - Không cần đăng nhập */}
        <Route path="/tutorials" element={<TutorialsPage />} />


        {/* =========================================
            B. ADMIN ROUTES (CHỈ ADMIN)
           ========================================= */}
        <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
          
          {/* Áp dụng AdminLayout (Sidebar + Header) */}
          <Route element={<AdminLayout />}>
            
            {/* Vào /admin -> Tự nhảy sang dashboard */}
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            
            {/* Thống kê */}
            <Route path="/admin/dashboard" element={<Dashboard />} />
            
            {/* Quản lý Video (Code cũ của bạn) */}
            <Route path="/admin/videos" element={<VideoManager />} />
            <Route path="/admin/metadata" element={<MetadataManager />} />
            <Route path="/admin/postgres" element={<PostgresManager />} />
            
            {/* Các trang admin khác (Placeholder) */}
            <Route path="/admin/users" element={<div className="p-4">Quản lý người dùng (Coming Soon)</div>} />
            <Route path="/admin/users/admins" element={<AdminManager />} />
            <Route path="/admin/users/students" element={<StudentManager />} />
            <Route path="/admin/users/detail/:id" element={<UserDetail />} />
            <Route path="/admin/create-user" element={<AddUser />} />

          </Route>
        </Route>


        {/* =========================================
            C. USER ROUTES (HỌC SINH + ADMIN CŨNG XEM ĐƯỢC)
           ========================================= */}
        <Route element={<ProtectedRoute allowedRoles={['user', 'admin']} />}>
           
           {/* Các trang cần đăng nhập */}
           <Route path="/dashboard" element={<UserDashboard />} />
           <Route path="/my-videos" element={<MyVideos />} />
           <Route path="/user/dashboard" element={<UserDashboard />} />
           <Route path="/video/:videoId" element={<VideoViewer />} />
           <Route path="/annotation-studio/:videoId" element={<AnnotationStudio />} />

        </Route>


        {/* =========================================
            D. 404 NOT FOUND
           ========================================= */}
        <Route path="*" element={<Navigate to="/login" replace />} />

      </Routes>
    </BrowserRouter>
  );
};

export default App;