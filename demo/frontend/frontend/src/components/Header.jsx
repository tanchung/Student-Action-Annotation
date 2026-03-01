import React from "react";
import { useNavigate } from "react-router-dom";
import { Video, LogOut } from "lucide-react";

const Header = ({ activePage = "" }) => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const token = localStorage.getItem("token");
  const isLoggedIn = !!token;

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  const handleNavigateWithAuth = (path) => {
    if (!isLoggedIn) {
      navigate("/login");
    } else {
      navigate(path);
    }
  };

  return (
    <header className="fixed top-0 w-full bg-[#F8F9FA]/80 backdrop-blur-md z-50 py-4 px-6 md:px-12 flex items-center justify-between border-b border-gray-200/50 transition-all">
      
      {/* Left: Logo */}
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/home")}>
        <div className="bg-gray-900 text-white p-1.5 rounded-lg">
          <Video size={24} strokeWidth={3} />
        </div>
        <span className="text-xl font-extrabold tracking-tight">ANNOTATION.IO</span>
      </div>

      {/* Center: Menu (Hidden on mobile) */}
      <nav className="hidden md:flex items-center gap-8 font-medium text-sm text-gray-500">
        <button 
          onClick={() => handleNavigateWithAuth("/home")} 
          className={`transition ${activePage === "home" ? "text-gray-900 font-semibold" : "hover:text-gray-900"}`}
        >
          Home
        </button>
        <button 
          onClick={() => handleNavigateWithAuth("/dashboard")} 
          className={`transition ${activePage === "dashboard" ? "text-gray-900 font-semibold" : "hover:text-gray-900"}`}
        >
          Dashboard
        </button>
        <button 
          onClick={() => handleNavigateWithAuth("/my-videos")} 
          className={`transition ${activePage === "my-videos" ? "text-gray-900 font-semibold" : "hover:text-gray-900"}`}
        >
          My Videos
        </button>
        <button 
          onClick={() => navigate("/tutorials")} 
          className={`transition ${activePage === "tutorials" ? "text-gray-900 font-semibold" : "hover:text-gray-900"}`}
        >
          Tutorials
        </button>
        <a href="#" className="hover:text-gray-900 transition">Help Center</a>
      </nav>

      {/* Right: User Info & Actions */}
      <div className="flex items-center gap-4">
        {isLoggedIn ? (
          <>
            <div className="hidden sm:block text-right">
              <p className="text-xs font-bold text-gray-900">{user.full_name || "Student"}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Free Plan</p>
            </div>
            
            <button 
              onClick={handleLogout}
              className="px-5 py-2 rounded-full border border-gray-300 text-sm font-semibold hover:bg-gray-200 transition"
            >
              Logout
            </button>
            
            <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold shadow-lg shadow-indigo-200">
              {user.username ? user.username[0].toUpperCase() : "U"}
            </div>
          </>
        ) : (
          <button 
            onClick={() => navigate("/login")}
            className="px-5 py-2 rounded-full bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition"
          >
            Login
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;
