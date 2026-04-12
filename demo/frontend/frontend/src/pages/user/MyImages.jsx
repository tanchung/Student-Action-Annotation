import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Image as ImageIcon, Grid, List, Filter, Calendar, Trash2, Eye, Edit3,
  Search, MoreVertical, CheckCircle2, AlertCircle, AlertTriangle,
  Loader, ChevronDown, X, Sparkles, ChevronLeft, ChevronRight, Network
} from "lucide-react";
import Footer from "../../components/Footer";
import Header from "../../components/Header";
import axiosClient from "../../api/axiosClient";
import GraphModal from "../../components/GraphModal";

const normalizeStatus = (status) => (status || "").toLowerCase();
const isUploadedStatus = (status) => normalizeStatus(status) === "uploaded";
const isProcessingStatus = (status) => normalizeStatus(status) === "processing";
const isDoneStatus = (status) => ["done", "completed"].includes(normalizeStatus(status));
const isErrorStatus = (status) => ["error", "failed"].includes(normalizeStatus(status));
const isPipelineExitSuccess = (image) => Number(image?.ai_pipeline_exit_code) === 0;
const isLegacyDoneImage = (image) => (
  isDoneStatus(image?.status) &&
  image?.ai_pipeline_exit_code == null &&
  !image?.processing_started_at &&
  !!image?.processed_at
);
const canAnnotateImage = (image) => isDoneStatus(image?.status) && (isPipelineExitSuccess(image) || isLegacyDoneImage(image));
const needsCaptionReview = (image) => Boolean(image?.caption_review_required || image?.caption_regeneration_required);
const getCaptionConfidence = (image) => {
  const raw = image?.caption_confidence ?? image?.confidence_score;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const MyImages = () => {
  const navigate = useNavigate();
  
  const [images, setImages] = useState([]);
  const [filteredImages, setFilteredImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("grid"); // "grid" or "list"
  const [previousImages, setPreviousImages] = useState([]); // Track previous state
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const imagesPerPage = 12;
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all, uploaded, processing, done, error
  const [dateFilter, setDateFilter] = useState("all"); // all, today, week, month
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // Graph Modal
  const [graphModalOpen, setGraphModalOpen] = useState(false);
  const [graphData, setGraphData] = useState(null);
  const [selectedImageForGraph, setSelectedImageForGraph] = useState(null);

  useEffect(() => {
    fetchImages();
  }, []);

  useEffect(() => {
    applyFilters();
    setCurrentPage(1); // Reset về trang 1 khi filter thay đổi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, searchQuery, statusFilter, dateFilter]);

  // Auto-refresh when there are processing images
  useEffect(() => {
    const hasProcessing = images.some((img) => isProcessingStatus(img.status));
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      console.log('🔄 Auto-refreshing images (processing detected)...');
      fetchImages({ silent: true });
    }, 3000); // Refresh every 3 seconds

    return () => clearInterval(interval);
  }, [images]);

  // Detect status changes from processing to error and show alert
  useEffect(() => {
    if (previousImages.length === 0) {
      setPreviousImages(images);
      return;
    }

    images.forEach(currentImage => {
      const prevImage = previousImages.find(img => img._id === currentImage._id);
      
      // Check if status changed from processing to error
      if (prevImage && prevImage.status === 'processing' && currentImage.status === 'error') {
        console.log('⚠️ Detected error for image:', currentImage.image_name);
        if (currentImage.error_message) {
          alert("⚠️ " + currentImage.error_message);
        } else {
          alert("⚠️ Xử lý AI thất bại. Vui lòng thử lại.");
        }
      }
    });

    setPreviousImages(images);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]);

  const fetchImages = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const res = await axiosClient.get("/images/list");
      if (res.data?.success) {
        setImages(res.data.data || []);
      }
    } catch (err) {
      console.error("Error fetching images:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...images];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(img => 
        img.image_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((img) => {
        if (statusFilter === "done") return isDoneStatus(img.status);
        if (statusFilter === "error") return isErrorStatus(img.status);
        return normalizeStatus(img.status) === statusFilter;
      });
    }

    // Date filter
    if (dateFilter !== "all") {
      const now = new Date();
      filtered = filtered.filter(img => {
        const imageDate = new Date(img.created_at);
        const diffDays = Math.floor((now - imageDate) / (1000 * 60 * 60 * 24));
        
        if (dateFilter === "today") return diffDays === 0;
        if (dateFilter === "week") return diffDays <= 7;
        if (dateFilter === "month") return diffDays <= 30;
        return true;
      });
    }

    setFilteredImages(filtered);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Bạn có chắc muốn xóa hình ảnh này?")) return;
    
    try {
      await axiosClient.post(`/images/${id}/soft-delete`);
      alert("✅ Đã xóa hình ảnh thành công!");
      fetchImages();
    } catch (err) {
      alert("❌ Lỗi khi xóa hình ảnh!");
      console.error(err);
    }
  };

  const handleRunAI = async (imageId) => {
    if (!window.confirm("Bạn có muốn phân tích hình ảnh này bằng AI không?")) return;
    
    try {
      // Update status optimistically
      setImages(prevImages => 
        prevImages.map(img => 
          img._id === imageId
            ? {
                ...img,
                status: 'processing',
                ai_pipeline_exit_code: null,
                ai_pipeline_finished_at: null,
                processing_started_at: new Date().toISOString(),
              }
            : img
        )
      );

      const response = await axiosClient.post(`/images/${imageId}/analyze`);
      
      // Show success message
      if (response.data?.success) {
        alert("✨ Đang phân tích hình ảnh bằng AI! Hệ thống sẽ tự động cập nhật và thông báo kết quả.");
      }
      
      // Fetch immediately to get latest status
      await fetchImages({ silent: true });
      
    } catch (err) {
      console.error('AI Analysis Error:', err);
      const errorMsg = err.response?.data?.message || "Lỗi khi gọi AI phân tích!";
      alert("❌ " + errorMsg);
      // Revert optimistic update
      fetchImages({ silent: true });
    }
  };

  const handleViewGraph = async (imageId, imageName) => {
    try {
      setSelectedImageForGraph(imageName);
      setGraphModalOpen(true);
      
      const response = await axiosClient.get(`/images/${imageId}/neo4j`);
      
      if (response.data?.success && response.data?.data) {
        setGraphData(response.data.data);
      } else {
        alert("❌ Không thể tải dữ liệu graph");
        setGraphModalOpen(false);
      }
    } catch (err) {
      console.error('Graph fetch error:', err);
      alert("❌ Lỗi khi tải graph: " + (err.response?.data?.message || err.message));
      setGraphModalOpen(false);
    }
  };

  // Pagination calculations
  const totalPages = Math.ceil(filteredImages.length / imagesPerPage);
  const indexOfLastImage = currentPage * imagesPerPage;
  const indexOfFirstImage = indexOfLastImage - imagesPerPage;
  const currentImages = filteredImages.slice(indexOfFirstImage, indexOfLastImage);

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
      uploaded: { bg: "bg-gray-100", text: "text-gray-600", icon: CheckCircle2, label: "Uploaded" },
      processing: { bg: "bg-blue-100", text: "text-blue-600", icon: Loader, label: "Processing" },
      done: { bg: "bg-green-100", text: "text-green-600", icon: CheckCircle2, label: "Completed" },
      completed: { bg: "bg-green-100", text: "text-green-600", icon: CheckCircle2, label: "Completed" },
      error: { bg: "bg-red-100", text: "text-red-600", icon: AlertCircle, label: "Failed" },
      failed: { bg: "bg-red-100", text: "text-red-600", icon: AlertCircle, label: "Failed" }
    };

    const config = statusConfig[normalizeStatus(status)] || statusConfig.uploaded;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${config.bg} ${config.text}`}>
        <Icon size={12} className={isProcessingStatus(status) ? "animate-spin" : ""} />
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

  const formatFileSize = (bytes) => {
    if (!bytes) return "N/A";
    if (bytes < 1024) return bytes + " B";
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    else return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 text-gray-800 font-sans flex flex-col">
      
      <Header activePage="my-images" />

      <main className="flex-1 max-w-[1400px] w-full mx-auto p-6 md:p-8 pt-28">
        
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">My Images</h1>
          <p className="text-gray-500">Quản lý và phân tích hình ảnh của bạn</p>
        </div>

        {/* TOOLBAR */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            
            {/* Search */}
            <div className="flex items-center bg-gray-50 px-4 py-2 rounded-lg border border-gray-200 focus-within:border-indigo-300 focus-within:bg-white transition-all w-full md:w-96">
              <Search size={18} className="text-gray-400 mr-2"/>
              <input 
                type="text" 
                placeholder="Tìm kiếm hình ảnh..." 
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
            Hiển thị <span className="font-bold text-gray-900">{currentImages.length}</span> / {filteredImages.length} hình ảnh
            {totalPages > 1 && <span className="ml-2 text-gray-400">(Trang {currentPage}/{totalPages})</span>}
          </p>
        </div>

        {/* IMAGE LIST/GRID */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-pulse">
            {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="bg-gray-200 h-64 rounded-xl"></div>)}
          </div>
        ) : filteredImages.length > 0 ? (
          viewMode === "grid" ? (
            // GRID VIEW
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {currentImages.map((image) => (
                <div key={image._id} className="group bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl hover:border-indigo-300 transition-all duration-300">
                  
                  {/* Image Preview */}
                  <div 
                    onClick={() => navigate(`/image/${image._id}`)}
                    className="relative h-44 bg-gray-100 flex items-center justify-center overflow-hidden cursor-pointer"
                  >
                    {image.minio_url ? (
                      <img 
                        src={image.minio_url} 
                        alt={image.image_name} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                      />
                    ) : (
                      <div className="flex flex-col items-center text-gray-400">
                        <ImageIcon size={32} className="mb-2 opacity-50"/>
                        <span className="text-xs font-medium">No Preview</span>
                      </div>
                    )}
                    
                    {/* Format Badge */}
                    {image.format && (
                      <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">
                        {image.format}
                      </div>
                    )}

                    {/* Dimensions Badge */}
                    {image.width && image.height && (
                      <div className="absolute bottom-2 left-2 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                        {image.width} × {image.height}
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
                    <h3 className="font-bold text-gray-800 text-sm line-clamp-1 mb-2" title={image.image_name}>
                      {image.image_name || "Untitled Image"}
                    </h3>
                    
                    <div className="flex items-center justify-between mb-3">
                      {getStatusBadge(image.status)}
                      <span className="text-xs text-gray-400">
                        {formatDate(image.created_at)}
                      </span>
                    </div>

                    {needsCaptionReview(image) && (
                      <div className="mb-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-semibold">
                        <AlertTriangle size={12} />
                        Caption cần kiểm tra{getCaptionConfidence(image) !== null ? ` (${getCaptionConfidence(image)}%)` : ""}
                      </div>
                    )}

                    {/* File size */}
                    {image.file_size && (
                      <p className="text-xs text-gray-500 mb-3">
                        {formatFileSize(image.file_size)}
                      </p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      {isUploadedStatus(image.status) ? (
                        <>
                          <button 
                            onClick={() => navigate(`/image/${image._id}`)}
                            className="flex-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition flex items-center justify-center gap-1"
                          >
                            <Eye size={14} /> View
                          </button>
                          <button 
                            onClick={() => handleRunAI(image._id)}
                            className="flex-1 px-3 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg text-xs font-bold hover:from-indigo-700 hover:to-purple-700 transition flex items-center justify-center gap-1.5 shadow-md"
                          >
                            <Sparkles size={14} />
                          </button>
                          <button 
                            onClick={() => handleDelete(image._id)}
                            className="px-3 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      ) : isProcessingStatus(image.status) ? (
                        <div className="w-full px-3 py-2 bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5">
                          <Loader size={14} className="animate-spin" /> Đang phân tích...
                        </div>
                      ) : isErrorStatus(image.status) ? (
                        <>
                          <button 
                            onClick={() => navigate(`/image/${image._id}`)}
                            className="flex-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition flex items-center justify-center gap-1"
                          >
                            <Eye size={14} /> View
                          </button>
                          <button 
                            onClick={() => handleRunAI(image._id)}
                            className="flex-1 px-3 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg text-xs font-bold hover:from-indigo-700 hover:to-purple-700 transition flex items-center justify-center gap-1.5 shadow-md"
                            title="Thử lại xử lí AI"
                          >
                            <Sparkles size={14} /> AI
                          </button>
                          <button 
                            onClick={() => handleDelete(image._id)}
                            className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      ) : canAnnotateImage(image) ? (
                        <>
                          <button 
                            onClick={() => navigate(`/image/${image._id}`)}
                            className="flex-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition flex items-center justify-center gap-1"
                          >
                            <Eye size={14} /> View
                          </button>
                          <button 
                            onClick={() => handleViewGraph(image._id, image.image_name)}
                            className="flex-1 px-3 py-1.5 bg-cyan-50 text-cyan-600 rounded-lg text-xs font-semibold hover:bg-cyan-100 transition flex items-center justify-center gap-1"
                            title="Xem graph từ Neo4j"
                          >
                            <Network size={14} /> Graph
                          </button>
                          <button 
                            onClick={() => navigate(`/annotation-studio/${image._id}`)}
                            className="flex-1 px-3 py-1.5 bg-green-50 text-green-600 rounded-lg text-xs font-semibold hover:bg-green-100 transition flex items-center justify-center gap-1"
                          >
                            <Edit3 size={14} /> Annotate
                          </button>
                          <button 
                            onClick={() => handleDelete(image._id)}
                            className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      ) : isDoneStatus(image.status) ? (
                        <div className="w-full px-3 py-2 bg-amber-50 text-amber-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5">
                          <Loader size={14} className="animate-spin" /> Chờ xác nhận...
                        </div>
                      ) : (
                        <>
                          <button 
                            onClick={() => navigate(`/image/${image._id}`)}
                            className="flex-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition flex items-center justify-center gap-1"
                          >
                            <Eye size={14} /> View
                          </button>
                          <button 
                            onClick={() => handleDelete(image._id)}
                            className="flex-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 transition"
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
                    <th className="px-6 py-4">Hình ảnh</th>
                    <th className="px-6 py-4">Trạng thái</th>
                    <th className="px-6 py-4">Kích thước</th>
                    <th className="px-6 py-4">Ngày tạo</th>
                    <th className="px-6 py-4 text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {currentImages.map((image) => (
                    <tr key={image._id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-16 h-12 bg-gray-100 rounded flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {image.minio_url ? (
                              <img src={image.minio_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon size={20} className="text-gray-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">{image.image_name}</p>
                            <p className="text-xs text-gray-500">{image.format?.toUpperCase()} • {formatFileSize(image.file_size)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-start gap-2">
                          {getStatusBadge(image.status)}
                          {needsCaptionReview(image) && (
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-semibold">
                              <AlertTriangle size={12} />
                              Cần kiểm tra caption{getCaptionConfidence(image) !== null ? ` (${getCaptionConfidence(image)}%)` : ""}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {image.width && image.height ? `${image.width} × ${image.height}` : "N/A"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {formatDate(image.created_at)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {isUploadedStatus(image.status) ? (
                            <>
                              <button 
                                onClick={() => handleRunAI(image._id)}
                                className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg text-xs font-bold hover:from-indigo-700 hover:to-purple-700 transition flex items-center gap-1.5"
                                title="Phân tích bằng AI"
                              >
                                <Sparkles size={14} /> Phân tích
                              </button>
                              <button 
                                onClick={() => handleDelete(image._id)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                                title="Xóa"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          ) : isProcessingStatus(image.status) ? (
                            <div className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                              <Loader size={14} className="animate-spin" /> Đang phân tích...
                            </div>
                          ) : isErrorStatus(image.status) ? (
                            <>
                              <button 
                                onClick={() => navigate(`/image/${image._id}`)}
                                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                title="Xem chi tiết"
                              >
                                <Eye size={16} />
                              </button>
                              <button 
                                onClick={() => handleRunAI(image._id)}
                                className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition"
                                title="Thử lại xử lí AI"
                              >
                                <Sparkles size={16} />
                              </button>
                              <button 
                                onClick={() => handleDelete(image._id)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                                title="Xóa"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          ) : canAnnotateImage(image) ? (
                            <>
                              <button 
                                onClick={() => navigate(`/image/${image._id}`)}
                                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                title="Xem chi tiết"
                              >
                                <Eye size={16} />
                              </button>
                              <button 
                                onClick={() => handleViewGraph(image._id, image.image_name)}
                                className="p-2 text-cyan-600 hover:bg-cyan-50 rounded-lg transition"
                                title="Xem graph từ Neo4j"
                              >
                                <Network size={16} />
                              </button>
                              <button 
                                onClick={() => navigate(`/annotation-studio/${image._id}`)}
                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition"
                                title="Annotate"
                              >
                                <Edit3 size={16} />
                              </button>
                              <button 
                                onClick={() => handleDelete(image._id)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                                title="Xóa"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          ) : isDoneStatus(image.status) ? (
                            <div className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                              <Loader size={14} className="animate-spin" /> Chờ xác nhận...
                            </div>
                          ) : (
                            <>
                              <button 
                                onClick={() => navigate(`/image/${image._id}`)}
                                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                title="Xem chi tiết"
                              >
                                <Eye size={16} />
                              </button>
                              <button 
                                onClick={() => handleDelete(image._id)}
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
            <ImageIcon size={48} className="mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500 text-lg mb-2">Không tìm thấy hình ảnh nào</p>
            <p className="text-gray-400 text-sm mb-4">Thử thay đổi bộ lọc hoặc upload hình ảnh mới</p>
            <button 
              onClick={() => navigate("/dashboard")}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              Upload Image
            </button>
          </div>
        )}

        {/* PAGINATION */}
        {filteredImages.length > imagesPerPage && (
          <div className="mt-8 flex items-center justify-between bg-white rounded-2xl border border-gray-200 p-6">
            <div className="text-sm text-gray-600">
              Hiển thị <span className="font-semibold text-gray-900">{indexOfFirstImage + 1}</span> -{" "}
              <span className="font-semibold text-gray-900">{Math.min(indexOfLastImage, filteredImages.length)}</span> trong tổng số{" "}
              <span className="font-semibold text-gray-900">{filteredImages.length}</span> hình ảnh
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

      {/* Graph Modal */}
      <GraphModal 
        isOpen={graphModalOpen}
        onClose={() => setGraphModalOpen(false)}
        data={graphData}
        title={`Image Graph - ${selectedImageForGraph || "Loading"}`}
      />

      <Footer />
    </div>
  );
};

export default MyImages;
