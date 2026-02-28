import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Video, Grid, List, Filter, Calendar, Trash2, Eye, Edit3,
  Search, MoreVertical, Clock, CheckCircle2, AlertCircle, 
  Loader, ChevronDown, X, Sparkles, ChevronLeft, ChevronRight
} from "lucide-react";
import Footer from "../../components/Footer";
import axiosClient from "../../api/axiosClient";

const MyVideos = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  
  const [videos, setVideos] = useState([]);
  const [filteredVideos, setFilteredVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("grid"); // "grid" or "list"
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const videosPerPage = 8;
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all, uploaded, processing, done, error
  const [dateFilter, setDateFilter] = useState("all"); // all, today, week, month
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  useEffect(() => {
    fetchVideos();
  }, []);

  useEffect(() => {
    applyFilters();
    setCurrentPage(1); // Reset về trang 1 khi filter thay đổi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos, searchQuery, statusFilter, dateFilter]);

  const fetchVideos = async () => {
    try {
      setLoading(true);
      const res = await axiosClient.get("/videos/list");
      if (res.data?.success) {
        setVideos(res.data.data || []);
      }
    } catch (err) {
      console.error("Error fetching videos:", err);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...videos];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(v => 
        v.clip_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(v => v.status === statusFilter);
    }

    // Date filter
    if (dateFilter !== "all") {
      const now = new Date();
      filtered = filtered.filter(v => {
        const videoDate = new Date(v.created_at);
        const diffDays = Math.floor((now - videoDate) / (1000 * 60 * 60 * 24));
        
        if (dateFilter === "today") return diffDays === 0;
        if (dateFilter === "week") return diffDays <= 7;
        if (dateFilter === "month") return diffDays <= 30;
        return true;
      });
    }

    setFilteredVideos(filtered);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Bạn có chắc muốn xóa video này?")) return;
    
    try {
      await axiosClient.delete(`/videos/${id}`);
      alert("✅ Đã xóa video thành công!");
      fetchVideos();
    } catch (err) {
      alert("❌ Lỗi khi xóa video!");
      console.error(err);
    }
  };

  const handleRunAI = async (videoId) => {
    if (!window.confirm("Bạn có muốn phân tích video này bằng AI không?")) return;
    
    try {
      // TODO: Gọi API để chạy AI analysis
      // await axiosClient.post(`/videos/${videoId}/analyze`);
      alert("✨ Đang gửi video để AI phân tích! Vui lòng đợi vài phút.");
      // Cập nhật status thành processing
      fetchVideos();
    } catch (err) {
      alert("❌ Lỗi khi gọi AI phân tích!");
      console.error(err);
    }
  };

  // Pagination calculations
  const totalPages = Math.ceil(filteredVideos.length / videosPerPage);
  const indexOfLastVideo = currentPage * videosPerPage;
  const indexOfFirstVideo = indexOfLastVideo - videosPerPage;
  const currentVideos = filteredVideos.slice(indexOfFirstVideo, indexOfLastVideo);

  const goToPage = (pageNumber) => {
    setCurrentPage(pageNumber);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      uploaded: { bg: "bg-gray-100", text: "text-gray-600", icon: Clock, label: "Uploaded" },
      processing: { bg: "bg-blue-100", text: "text-blue-600", icon: Loader, label: "Processing" },
      done: { bg: "bg-green-100", text: "text-green-600", icon: CheckCircle2, label: "Completed" },
      error: { bg: "bg-red-100", text: "text-red-600", icon: AlertCircle, label: "Failed" }
    };

    const config = statusConfig[status] || statusConfig.uploaded;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${config.bg} ${config.text}`}>
        <Icon size={12} className={status === "processing" ? "animate-spin" : ""} />
        {config.label}
      </span>
    );
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("vi-VN", { 
      day: "2-digit", 
      month: "2-digit", 
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-gray-800 font-sans flex flex-col">
      
      {/* HEADER */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-20">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 font-black text-xl tracking-tight cursor-pointer" onClick={() => navigate("/home")}>
            <div className="bg-indigo-600 text-white p-1 rounded">
              <Video size={18} />
            </div>
            ANNOTATION.IO
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate("/dashboard")}
              className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition"
            >
              Dashboard
            </button>
            <button 
              onClick={() => navigate("/tutorials")}
              className="hidden sm:block px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition"
            >
              Tutorials
            </button>
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm border border-indigo-200">
              {user.username ? user.username[0].toUpperCase() : "U"}
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto p-6 md:p-8">
        
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">My Videos</h1>
          <p className="text-gray-500">Quản lý và phân tích video của bạn</p>
        </div>

        {/* TOOLBAR */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            
            {/* Search */}
            <div className="flex items-center bg-gray-50 px-4 py-2 rounded-lg border border-gray-200 focus-within:border-indigo-300 focus-within:bg-white transition-all w-full md:w-96">
              <Search size={18} className="text-gray-400 mr-2"/>
              <input 
                type="text" 
                placeholder="Tìm kiếm video..." 
                className="bg-transparent outline-none text-sm w-full"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              {/* Filter Button */}
              <button 
                onClick={() => setShowFilterPanel(!showFilterPanel)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition flex-1 md:flex-none ${
                  showFilterPanel ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <Filter size={16} />
                Filter
                {(statusFilter !== "all" || dateFilter !== "all") && (
                  <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                )}
              </button>

              {/* View Mode Toggle */}
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                <button 
                  onClick={() => setViewMode("grid")}
                  className={`p-2 rounded ${viewMode === "grid" ? "bg-white shadow-sm" : "text-gray-400"}`}
                >
                  <Grid size={18} />
                </button>
                <button 
                  onClick={() => setViewMode("list")}
                  className={`p-2 rounded ${viewMode === "list" ? "bg-white shadow-sm" : "text-gray-400"}`}
                >
                  <List size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* FILTER PANEL */}
          {showFilterPanel && (
            <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Status Filter */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Trạng thái</label>
                <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-300"
                >
                  <option value="all">Tất cả</option>
                  <option value="uploaded">Đã upload</option>
                  <option value="processing">Đang xử lý</option>
                  <option value="done">Hoàn thành</option>
                  <option value="error">Lỗi</option>
                </select>
              </div>

              {/* Date Filter */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Thời gian</label>
                <select 
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-300"
                >
                  <option value="all">Tất cả</option>
                  <option value="today">Hôm nay</option>
                  <option value="week">7 ngày qua</option>
                  <option value="month">30 ngày qua</option>
                </select>
              </div>

              {/* Reset Filters */}
              <div className="flex items-end">
                <button 
                  onClick={() => {
                    setStatusFilter("all");
                    setDateFilter("all");
                    setSearchQuery("");
                  }}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  Xóa bộ lọc
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RESULTS INFO */}
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Hiển thị <span className="font-bold text-gray-900">{currentVideos.length}</span> / {filteredVideos.length} video
            {totalPages > 1 && <span className="ml-2 text-gray-400">(Trang {currentPage}/{totalPages})</span>}
          </p>
        </div>

        {/* VIDEO LIST/GRID */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-pulse">
            {[1,2,3,4,5,6].map(i => <div key={i} className="bg-gray-200 h-64 rounded-xl"></div>)}
          </div>
        ) : filteredVideos.length > 0 ? (
          viewMode === "grid" ? (
            // GRID VIEW
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {currentVideos.map((video) => (
                <div key={video._id} className="group bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl hover:border-indigo-300 transition-all duration-300">
                  
                  {/* Thumbnail */}
                  <div 
                    onClick={() => navigate(`/video/${video._id}`)}
                    className="relative h-44 bg-gray-100 flex items-center justify-center overflow-hidden cursor-pointer"
                  >
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
                    
                    {/* Duration Badge */}
                    {video.duration > 0 && (
                      <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Clock size={10} /> {video.duration}s
                      </div>
                    )}

                    {/* Action Menu */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="relative">
                        <button className="p-2 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg hover:bg-white transition">
                          <MoreVertical size={16} className="text-gray-700" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <h3 className="font-bold text-gray-800 text-sm line-clamp-1 mb-2" title={video.clip_name}>
                      {video.clip_name || "Untitled Video"}
                    </h3>
                    
                    <div className="flex items-center justify-between mb-3">
                      {getStatusBadge(video.status)}
                      <span className="text-xs text-gray-400">
                        {formatDate(video.created_at)}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      {video.status === "uploaded" ? (
                        // Trạng thái UPLOADED: Hiện View, Run AI và Delete
                        <>
                          <button 
                            onClick={() => navigate(`/video/${video._id}`)}
                            className="flex-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition flex items-center justify-center gap-1"
                          >
                            <Eye size={14} /> View
                          </button>
                          <button 
                            onClick={() => handleRunAI(video._id)}
                            className="flex-1 px-3 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg text-xs font-bold hover:from-indigo-700 hover:to-purple-700 transition flex items-center justify-center gap-1.5 shadow-md"
                          >
                            <Sparkles size={14} />
                          </button>
                          <button 
                            onClick={() => handleDelete(video._id)}
                            className="px-3 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      ) : video.status === "processing" ? (
                        // Trạng thái PROCESSING: Hiện text đang phân tích, khóa mọi thao tác
                        <div className="w-full px-3 py-2 bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5">
                          <Loader size={14} className="animate-spin" /> Đang phân tích...
                        </div>
                      ) : (
                        // Trạng thái DONE/ERROR: Hiện đầy đủ View, Annotate, Delete
                        <>
                          <button 
                            onClick={() => navigate(`/video/${video._id}`)}
                            className="flex-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition flex items-center justify-center gap-1"
                          >
                            <Eye size={14} /> View
                          </button>
                          <button 
                            onClick={() => navigate(`/annotation-studio/${video._id}`)}
                            className="flex-1 px-3 py-1.5 bg-green-50 text-green-600 rounded-lg text-xs font-semibold hover:bg-green-100 transition flex items-center justify-center gap-1"
                          >
                            <Edit3 size={14} /> Annotate
                          </button>
                          <button 
                            onClick={() => handleDelete(video._id)}
                            className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // LIST VIEW
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    <th className="px-6 py-4">Video</th>
                    <th className="px-6 py-4">Trạng thái</th>
                    <th className="px-6 py-4">Thời lượng</th>
                    <th className="px-6 py-4">Ngày tạo</th>
                    <th className="px-6 py-4 text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {currentVideos.map((video) => (
                    <tr key={video._id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-16 h-12 bg-gray-100 rounded flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {video.thumbnail_url ? (
                              <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Video size={20} className="text-gray-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">{video.clip_name}</p>
                            <p className="text-xs text-gray-500">{video._id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(video.status)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {video.duration > 0 ? `${video.duration}s` : "N/A"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {formatDate(video.created_at)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {video.status === "uploaded" ? (
                            // Trạng thái UPLOADED: Chỉ hiện nút Run AI và Delete
                            <>
                              <button 
                                onClick={() => handleRunAI(video._id)}
                                className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg text-xs font-bold hover:from-indigo-700 hover:to-purple-700 transition flex items-center gap-1.5"
                                title="Phân tích bằng AI"
                              >
                                <Sparkles size={14} /> Phân tích
                              </button>
                              <button 
                                onClick={() => handleDelete(video._id)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                                title="Xóa"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          ) : video.status === "processing" ? (
                            // Trạng thái PROCESSING
                            <div className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                              <Loader size={14} className="animate-spin" /> Đang phân tích...
                            </div>
                          ) : (
                            // Trạng thái DONE/ERROR
                            <>
                              <button 
                                onClick={() => navigate(`/video/${video._id}`)}
                                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                title="Xem chi tiết"
                              >
                                <Eye size={16} />
                              </button>
                              <button 
                                onClick={() => navigate(`/annotation-studio/${video._id}`)}
                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition"
                                title="Annotate"
                              >
                                <Edit3 size={16} />
                              </button>
                              <button 
                                onClick={() => handleDelete(video._id)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                                title="Xóa"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          // EMPTY STATE
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
            <Video size={48} className="mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500 text-lg mb-2">Không tìm thấy video nào</p>
            <p className="text-gray-400 text-sm mb-4">Thử thay đổi bộ lọc hoặc upload video mới</p>
            <button 
              onClick={() => navigate("/dashboard")}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              Upload Video
            </button>
          </div>
        )}

        {/* PAGINATION */}
        {filteredVideos.length > videosPerPage && (
          <div className="mt-8 flex items-center justify-between bg-white rounded-2xl border border-gray-200 p-6">
            <div className="text-sm text-gray-600">
              Hiển thị <span className="font-semibold text-gray-900">{indexOfFirstVideo + 1}</span> -{" "}
              <span className="font-semibold text-gray-900">{Math.min(indexOfLastVideo, filteredVideos.length)}</span> trong tổng số{" "}
              <span className="font-semibold text-gray-900">{filteredVideos.length}</span> video
            </div>
            
            <div className="flex items-center gap-2">
              {/* Previous Button */}
              <button
                onClick={goToPreviousPage}
                disabled={currentPage === 1}
                className={`p-2 rounded-lg border transition ${
                  currentPage === 1
                    ? "border-gray-200 text-gray-300 cursor-not-allowed"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <ChevronLeft size={20} />
              </button>

              {/* Page Numbers */}
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNumber) => {
                  // Hiển thị: trang đầu, trang cuối, trang hiện tại, và các trang lân cận
                  if (
                    pageNumber === 1 ||
                    pageNumber === totalPages ||
                    (pageNumber >= currentPage - 1 && pageNumber <= currentPage + 1)
                  ) {
                    return (
                      <button
                        key={pageNumber}
                        onClick={() => goToPage(pageNumber)}
                        className={`min-w-[40px] h-10 rounded-lg font-semibold text-sm transition ${
                          currentPage === pageNumber
                            ? "bg-indigo-600 text-white shadow-md"
                            : "text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        {pageNumber}
                      </button>
                    );
                  } else if (
                    pageNumber === currentPage - 2 ||
                    pageNumber === currentPage + 2
                  ) {
                    return (
                      <span key={pageNumber} className="px-2 text-gray-400">
                        ...
                      </span>
                    );
                  }
                  return null;
                })}
              </div>

              {/* Next Button */}
              <button
                onClick={goToNextPage}
                disabled={currentPage === totalPages}
                className={`p-2 rounded-lg border transition ${
                  currentPage === totalPages
                    ? "border-gray-200 text-gray-300 cursor-not-allowed"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}

      </main>

      <Footer />
    </div>
  );
};

export default MyVideos;
