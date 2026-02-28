import React from "react";
import { useNavigate } from "react-router-dom";
import { 
  LogOut, 
  Video, 
  ArrowRight, 
  UploadCloud, 
  Activity, 
  CheckCircle2 
} from "lucide-react";
import Footer from "../../components/Footer";

const StudentHome = () => {
  const navigate = useNavigate();
  // Lấy thông tin user (để hiển thị tên)
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const token = localStorage.getItem("token");
  const isLoggedIn = !!token;

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  // Hàm kiểm tra đăng nhập trước khi chuyển trang
  const handleNavigateWithAuth = (path) => {
    if (!isLoggedIn) {
      navigate("/login");
    } else {
      navigate(path);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-gray-900 font-sans selection:bg-indigo-100">
      
      {/* ================= HEADER (NAVBAR) ================= */}
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
          <button onClick={() => handleNavigateWithAuth("/dashboard")} className="hover:text-gray-900 transition">Dashboard</button>
          <button onClick={() => handleNavigateWithAuth("/my-videos")} className="hover:text-gray-900 transition">My Videos</button>
          <button onClick={() => navigate("/tutorials")} className="hover:text-gray-900 transition">Tutorials</button>
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

      {/* ================= HERO SECTION ================= */}
      <main className="pt-32 pb-20 px-6 md:px-12 max-w-[1600px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          
          {/* --- LEFT COLUMN: TEXT CONTENT --- */}
          <div className="flex flex-col items-start space-y-8 animate-fade-in-up">
            
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold uppercase tracking-wide border border-indigo-100">
              <Activity size={14} /> AI-Powered Analysis v1.0
            </div>

            {/* Headline (VEED Style: Big, Bold, Condensed) */}
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-black text-gray-900 leading-[0.9] tracking-tighter uppercase">
              Student <br />
              Action <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">
                Annotation
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-lg md:text-xl text-gray-500 max-w-lg leading-relaxed font-medium">
              Upload classroom videos, annotate student behaviors, and generate insightful analytics instantly. Free for students and researchers.
            </p>

            {/* CTA Button (Pill Shape) */}
            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
              <button 
                onClick={() => handleNavigateWithAuth("/my-videos")}
                className="group relative px-8 py-5 rounded-full bg-[#5D5CDE] text-white text-lg font-bold flex items-center gap-3 hover:bg-[#4b4ac0] transition-all shadow-xl shadow-indigo-200 hover:shadow-2xl hover:-translate-y-1"
              >
                <UploadCloud size={24} />
                <span>Upload Video to Analyze</span>
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {/* Trust Badges */}
            <div className="pt-8 flex items-center gap-6 text-sm text-gray-400 font-semibold">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-500"/> No credit card required
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-500"/> Unlimited uploads
              </div>
            </div>
          </div>

          {/* --- RIGHT COLUMN: VISUAL/IMAGE --- */}
          <div className="relative w-full h-[500px] md:h-[600px] rounded-[3rem] overflow-hidden shadow-2xl animate-fade-in transition-all hover:scale-[1.01] duration-500 group">
            
            {/* Background Card Effect (Blue/Purple) */}
            <div className="absolute inset-0 bg-[#5D5CDE] text-white p-8 flex flex-col justify-end">
              <div className="z-10 relative">
                <h3 className="text-3xl font-bold mb-2">Classroom Analysis</h3>
                <p className="text-indigo-100 mb-6">Detect interactions, engagement, and activities automatically.</p>
                
                {/* Fake UI Elements to look like the app */}
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 flex gap-4 items-center">
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                        <Video size={24} />
                    </div>
                    <div>
                        <div className="h-2 w-32 bg-white/40 rounded mb-2"></div>
                        <div className="h-2 w-20 bg-white/20 rounded"></div>
                    </div>
                    <div className="ml-auto px-3 py-1 bg-green-400 text-green-900 text-xs font-bold rounded-full">
                        Processing...
                    </div>
                </div>
              </div>
            </div>

            {/* Main Image (Overlaying the background card partly) */}
            {/* Bạn có thể thay đổi src ảnh dưới đây bằng ảnh lớp học thật của bạn */}
            <img 
              src="https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=2070&auto=format&fit=crop" 
              alt="Student Annotation" 
              className="absolute inset-0 w-full h-full object-cover opacity-80 mix-blend-overlay group-hover:opacity-60 transition-opacity duration-700"
            />
            
            {/* Decorative Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#5D5CDE] via-transparent to-transparent opacity-90"></div>
          </div>

        </div>
      </main>

      {/* ================= FOOTER / FEATURES STRIP ================= */}
      <div className="border-t border-gray-200 bg-white py-12">
         <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
            {/* Logo các trường đại học hoặc đối tác (Fake) */}
            <div className="flex items-center justify-center font-bold text-xl text-gray-400">UNIVERSITY A</div>
            <div className="flex items-center justify-center font-bold text-xl text-gray-400">EDTECH LAB</div>
            <div className="flex items-center justify-center font-bold text-xl text-gray-400">RESEARCH.IO</div>
            <div className="flex items-center justify-center font-bold text-xl text-gray-400">FUTURE SCHOOL</div>
         </div>
      </div>
      <Footer />

    </div>
  );
};

export default StudentHome;