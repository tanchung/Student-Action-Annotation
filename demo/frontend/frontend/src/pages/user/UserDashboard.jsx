import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  UploadCloud, Video, Clock, Activity, MoreVertical, Search, Filter,
  PlayCircle, CheckCircle2, AlertCircle, FileText, X, Loader
} from "lucide-react";
import Footer from "../../components/Footer";
import Header from "../../components/Header";
import axiosClient from "../../api/axiosClient"; 

const UserDashboard = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalVideos, setTotalVideos] = useState(0); // Tổng số video của user
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [customName, setCustomName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Debug: Log token on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    console.log('🔐 Dashboard mounted - Token:', token ? 'Present ✅' : 'Missing ❌');
    console.log('👤 User:', user);
  }, []);

  useEffect(() => {
      const fetchVideos = async () => {
          try {
              const res = await axiosClient.get("/videos/list");
              if(res.data?.success) {
                  // Lấy tất cả video của user
                  const allVideos = res.data.data || [];
                  
                  // Lưu tổng số video
                  setTotalVideos(allVideos.length);
                  
                  // Chỉ hiển thị 4 video mới nhất trong "Recent Videos"
                  const recentVideos = allVideos
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                    .slice(0, 4);
                  setVideos(recentVideos);
              }
          } catch(err) {
              console.error("Lỗi tải dashboard:", err);
          } finally {
              setLoading(false);
          }
      };
      fetchVideos();
  }, []);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('video/')) {
      setSelectedFile(file);
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      setCustomName(nameWithoutExt);
      setShowUploadModal(true);
    } else {
      alert("Vui lòng chọn file video!");
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("video", selectedFile);
    formData.append("customName", customName);

    try {
      const response = await axiosClient.post("/upload/upload-video", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      });

      if (response.data.success) {
        alert("✅ Upload video thành công!");
        setShowUploadModal(false);
        setSelectedFile(null);
        setCustomName("");
        
        // Refresh danh sách video
        const res = await axiosClient.get("/videos/list");
        if(res.data?.success) {
          const allVideos = res.data.data || [];
          setTotalVideos(allVideos.length); // Update tổng số
          const recentVideos = allVideos
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 4);
          setVideos(recentVideos);
        }
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert(error.response?.data?.message || "❌ Lỗi khi upload video!");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const closeModal = () => {
    if (!uploading) {
      setShowUploadModal(false);
      setSelectedFile(null);
      setCustomName("");
    }
  };

  const renderStatus = (status) => {
    switch(status) {
      case "done":
        return <span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-full"><CheckCircle2 size={12}/> Ready</span>;
      case "processing":
        return <span className="flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded-full animate-pulse"><Activity size={12}/> Analyzing...</span>;
      case "error":
        return <span className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded-full"><AlertCircle size={12}/> Failed</span>;
      default:
        return <span className="text-gray-400 text-xs px-2 py-1 bg-gray-100 rounded-full">Uploaded</span>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 text-gray-800 font-sans flex flex-col">
      
      <Header activePage="dashboard" />

      <main className="max-w-[1400px] mx-auto p-6 md:p-8 pt-28 flex-1 w-full">
        
        <div className="mb-10">
           <h1 className="text-2xl font-bold text-gray-900 mb-6">Welcome back, {user.full_name || "Guest"}! 👋</h1>
           
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div 
                onClick={() => document.getElementById('video-file-input').click()} 
                className="bg-indigo-600 text-white rounded-2xl p-6 shadow-lg shadow-indigo-200 cursor-pointer hover:bg-indigo-700 hover:scale-[1.02] transition-all flex flex-col justify-between h-40 group"
              >
                 <div className="flex justify-between items-start">
                    <div className="p-3 bg-white/20 rounded-xl"><UploadCloud size={24} /></div>
                    <ArrowRightIcon className="opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:translate-x-1" />
                 </div>
                 <div>
                    <h3 className="text-lg font-bold">New Project</h3>
                    <p className="text-indigo-100 text-sm">Upload video to start annotating</p>
                 </div>
              </div>
              <input 
                id="video-file-input" 
                type="file" 
                accept="video/*" 
                className="hidden" 
                onChange={handleFileSelect}
              />
              
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col justify-between h-40">
                 <div className="flex items-center gap-3 text-gray-500 mb-2">
                    <Video size={20} /> <span className="text-sm font-semibold uppercase tracking-wider">Total Videos</span>
                 </div>
                 <div className="text-4xl font-black text-gray-900">
                    {loading ? "..." : totalVideos}
                 </div>
                 <div className="text-sm text-green-600 font-medium flex items-center gap-1">
                    <Activity size={14}/> Live Data
                 </div>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col justify-between h-40">
                 <div className="flex items-center gap-3 text-gray-500 mb-2">
                    <FileText size={20} /> <span className="text-sm font-semibold uppercase tracking-wider">Total Annotations</span>
                 </div>
                 <div className="text-4xl font-black text-gray-900">--</div>
                 <div className="text-sm text-gray-400">Labels generated</div>
              </div>
           </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
           <h2 className="text-xl font-bold text-gray-800">Recent Videos</h2>
           <div className="flex gap-2">
              <button 
                onClick={() => navigate("/my-videos")}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
              >
                View All Videos
              </button>
           </div>
        </div>

        {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-pulse">
                {[1,2,3,4].map(i => <div key={i} className="bg-gray-200 h-64 rounded-xl"></div>)}
            </div>
        ) : videos.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {videos.map((video) => (
              <div 
                key={video._id} 
                onClick={() => {
                  // Navigate to My Videos page to see all actions
                  navigate('/my-videos');
                }}
                className="group bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl hover:border-indigo-300 transition-all duration-300 cursor-pointer"
              >
                 
                 <div className="relative h-44 bg-gray-100 flex items-center justify-center overflow-hidden">
                    {video.thumbnail_url ? (
                       <img 
                          src={video.thumbnail_url} 
                          alt={video.clip_name} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                       />
                    ) : (
                       <div className="flex flex-col items-center text-gray-400">
                          <Video size={32} className="mb-2 opacity-50"/>
                          <span className="text-xs font-medium">No Preview</span>
                       </div>
                    )}
                    
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                       <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-indigo-600 shadow-lg transform scale-75 group-hover:scale-100 transition-transform">
                          <PlayCircle size={24} fill="currentColor" className="text-white"/>
                       </div>
                    </div>

                    {video.duration > 0 && (
                       <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Clock size={10} /> {video.duration}s
                       </div>
                    )}
                 </div>

                 <div className="p-4">
                    <div className="flex justify-between items-start mb-2">
                       <h3 className="font-bold text-gray-800 text-sm line-clamp-1 flex-1 pr-2" title={video.clip_name}>
                          {video.clip_name || "Untitled Video"}
                       </h3>
                       <MoreVertical size={16} className="text-gray-400 hover:text-gray-600"/>
                    </div>
                    
                    <div className="flex items-center justify-between">
                       {renderStatus(video.status)}
                       <span className="text-xs text-gray-400">
                          {new Date(video.created_at).toLocaleDateString()}
                       </span>
                    </div>
                 </div>
              </div>
            ))}
            
          </div>
        ) : (
           <div className="text-center py-20 bg-white rounded-2xl border border-dashed">
              <Video size={48} className="mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 mb-4">No videos yet</p>
              <button
                onClick={() => setShowUploadModal(true)}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Upload Your First Video
              </button>
           </div>
        )}

      </main>

      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-fade-in">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <UploadCloud className="text-indigo-600" size={24} />
                Upload Video
              </h3>
              {!uploading && (
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 transition">
                  <X size={24} />
                </button>
              )}
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-3">
                  <Video className="text-indigo-600" size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 truncate">{selectedFile?.name}</p>
                    <p className="text-sm text-gray-500">
                      {selectedFile && (selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Tên video (tùy chỉnh)
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Nhập tên video..."
                  disabled={uploading}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none disabled:bg-gray-100"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Extension sẽ tự động được thêm vào
                </p>
              </div>

              {uploading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Đang upload...</span>
                    <span className="font-bold text-indigo-600">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-indigo-600 h-full transition-all duration-300 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeModal}
                  disabled={uploading}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  Hủy
                </button>
                <button
                  onClick={handleUpload}
                  disabled={uploading || !customName.trim()}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <Loader className="animate-spin" size={18} />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <UploadCloud size={18} />
                      Upload
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      
    </div>
  );
};

const ArrowRightIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
);
const PlusIcon = () => (
   <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
);

export default UserDashboard;
