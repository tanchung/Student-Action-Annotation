import React, { useState, useEffect } from "react";
import axiosClient from "../../api/axiosClient";
import { 
  Play, ArrowLeft, FileVideo, Clock, Activity, Layers, MonitorPlay, Hash, Search 
} from "lucide-react";

const VideoManager = () => {
  const [videos, setVideos] = useState([]); 
  const [selectedVideo, setSelectedVideo] = useState(null); 
  const [loading, setLoading] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const getFileNameFromUrl = (url) => {
    if (!url) return "Unknown File";
    try {
      const parts = url.split('/');
      return decodeURIComponent(parts[parts.length - 1]);
    } catch { return url; }
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  const fetchVideos = async () => {
    setLoading(true);
    try {
      const res = await axiosClient.get("/videos/list");
      if (res.data && res.data.success) {
        setVideos(res.data.data || []);
      }
    } catch (error) {
      console.error("Lỗi lấy danh sách video:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleVideoClick = async (video) => {
    setViewLoading(true);
    try {
      // SỬ DỤNG _id GỐC CỦA MONGO
      const res = await axiosClient.get(`/videos/${video._id}/full`);
      if (res.data && res.data.success) {
        setSelectedVideo(res.data.data.video);
      }
    } catch (error) {
      console.error("Lỗi lấy chi tiết video:", error);
      alert("Không thể tải thông tin chi tiết video này.");
    } finally {
      setViewLoading(false);
    }
  };

  // Logic lọc: Sử dụng _id thay vì video_id
  const filteredVideos = videos.filter((video) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    
    // Tìm theo _id
    const matchId = video._id?.toLowerCase().includes(term);
    // Tìm theo Tên Clip
    const displayName = (video.clip_name || getFileNameFromUrl(video.minio_url)).toLowerCase();
    const matchName = displayName.includes(term);
    
    return matchId || matchName;
  });

  if (selectedVideo) {
    const displayName = selectedVideo.clip_name || getFileNameFromUrl(selectedVideo.minio_url);
    return (
      <div className="max-w-6xl mx-auto animate-fade-in p-4">
        <button 
          onClick={() => setSelectedVideo(null)}
          className="mb-4 flex items-center text-gray-600 hover:text-indigo-600 font-medium transition group"
        >
          <ArrowLeft size={20} className="mr-2 group-hover:-translate-x-1 transition" /> 
          Quay lại danh sách
        </button>

        <div className="bg-black rounded-xl overflow-hidden shadow-2xl aspect-video mb-8 border border-gray-800">
          <video 
            controls 
            autoPlay 
            className="w-full h-full object-contain"
            src={selectedVideo.minio_url} 
          >
            Trình duyệt của bạn không hỗ trợ thẻ video.
          </video>
        </div>

        <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
          <div className="flex items-start justify-between mb-6 pb-6 border-b border-gray-100">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">{displayName}</h1>
              <p className="text-gray-500 flex items-center gap-2 text-sm">
                <Hash size={14} /> ID: <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-700">{selectedVideo._id}</span>
              </p>
            </div>
            {selectedVideo.quality_score && (
              <div className="text-center bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-100">
                <span className="block text-xs text-indigo-500 uppercase font-bold">Quality Score</span>
                <span className="text-xl font-black text-indigo-700">{selectedVideo.quality_score}</span>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-4">
              <h3 className="font-bold text-gray-800 flex items-center gap-2 border-l-4 border-blue-500 pl-3">
                <MonitorPlay size={18} className="text-blue-500"/> Thông số Kỹ thuật
              </h3>
              <div className="space-y-3 text-sm text-gray-600">
                <div className="flex justify-between border-b border-dashed border-gray-200 pb-2">
                  <span>FPS:</span><span className="font-medium text-gray-900">{selectedVideo.fps || "N/A"}</span>
                </div>
                <div className="flex justify-between border-b border-dashed border-gray-200 pb-2">
                  <span>Thời lượng:</span><span className="font-medium text-gray-900">{selectedVideo.duration ? `${selectedVideo.duration}s` : "N/A"}</span>
                </div>
                <div className="flex justify-between border-b border-dashed border-gray-200 pb-2">
                  <span>Nguồn:</span><span className="font-medium text-gray-900 truncate max-w-[150px]">{selectedVideo.folder_source || "Unknown"}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-bold text-gray-800 flex items-center gap-2 border-l-4 border-green-500 pl-3">
                <Layers size={18} className="text-green-500"/> Ngữ cảnh
              </h3>
              <div className="space-y-3 text-sm text-gray-600">
                <div className="flex justify-between border-b border-dashed border-gray-200 pb-2">
                  <span>Env ID:</span><span className="font-medium text-gray-900">{selectedVideo.environment_id || "N/A"}</span>
                </div>
                <div className="flex justify-between border-b border-dashed border-gray-200 pb-2">
                   <span>MinIO:</span><span className={`font-bold ${selectedVideo.minio_url ? "text-green-600" : "text-red-500"}`}>{selectedVideo.minio_url ? "Available" : "Missing"}</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 text-center flex flex-col items-center justify-center">
               <Activity className="text-gray-400 mb-2" size={32}/>
               <p className="text-sm text-gray-500 mb-2">Gán nhãn hành động</p>
               <button className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded hover:bg-indigo-700 transition w-full">Annotate</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- GIAO DIỆN DANH SÁCH (GRID VIEW) ---
  return (
    <div className="space-y-6">
      
      {/* HEADER + SEARCH BAR */}
      <div className="flex flex-col md:flex-row justify-between items-end border-b pb-4 border-gray-200 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Thư viện Video</h2>
          <p className="text-gray-500 text-sm mt-1">
            Hiển thị {filteredVideos.length} / {videos.length} video
          </p>
        </div>

        {/* Ô TÌM KIẾM */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Tìm theo ID hoặc Tên file..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm shadow-sm bg-white"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 animate-pulse">
          {[1, 2, 3, 4].map(i => <div key={i} className="bg-gray-200 h-64 rounded-xl"></div>)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredVideos.map((video) => (
            <div 
              key={video._id} 
              onClick={() => !viewLoading && handleVideoClick(video)}
              className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group relative ${viewLoading ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <div className="h-44 bg-slate-800 flex items-center justify-center relative group-hover:bg-slate-900 transition overflow-hidden">
                {video.thumbnail_url ? (
                    <img 
                      src={video.thumbnail_url} 
                      alt={video.clip_name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                    />
                ) : (
                    <FileVideo size={48} className="text-slate-600 group-hover:text-slate-500 transition" />
                )}
                
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-300 bg-black/30">
                   <div className="bg-indigo-600 text-white rounded-full p-3 shadow-lg transform scale-90 group-hover:scale-100">
                      <Play size={24} fill="currentColor" />
                   </div>
                </div>

                {video.duration > 0 && (
                   <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1">
                      <Clock size={10} /> {video.duration}s
                   </span>
                )}
              </div>

              <div className="p-4">
                <h3 className="font-bold text-gray-800 line-clamp-1 mb-1" title={video.clip_name}>
                   {video.clip_name || getFileNameFromUrl(video.minio_url)}
                </h3>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                   <Hash size={12} /> <span className="truncate">{video._id}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VideoManager;