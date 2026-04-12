import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Image as ImageIcon, Loader, Download, ZoomIn, ZoomOut, Sparkles, AlertCircle } from "lucide-react";
import axiosClient from "../../api/axiosClient";

const ImageViewer = () => {
  const { imageId } = useParams();
  const navigate = useNavigate();
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [processingAI, setProcessingAI] = useState(false);
  const [previousStatus, setPreviousStatus] = useState(null);
  const imageViewportRef = useRef(null);

  const fetchImage = async () => {
    try {
      setLoading(true);
      const res = await axiosClient.get(`/images/${imageId}`);
      if (res.data?.success) {
        console.log('🖼️ Image data:', res.data.result);
        console.log('🔗 Image URL:', res.data.result.minio_url);
        setImage(res.data.result);
      } else {
        setError("Không thể tải hình ảnh");
      }
    } catch (err) {
      console.error("Error fetching image:", err);
      setError(err.response?.data?.message || "Lỗi khi tải hình ảnh");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageId]);

  // Auto-refresh when image is processing
  useEffect(() => {
    if (image?.status !== 'processing') return;

    console.log('🔄 Image is processing, starting auto-refresh...');
    const interval = setInterval(async () => {
      const res = await axiosClient.get(`/images/${imageId}`);
      if (res.data?.success) {
        setImage(res.data.result);
      }
    }, 3000); // Refresh every 3 seconds

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image?.status]);

  // Detect status change from processing to error
  useEffect(() => {
    if (!image) return;
    
    // Check if status changed from processing to error
    if (previousStatus === 'processing' && image.status === 'error') {
      console.log('⚠️ Detected error status change');
      if (image.error_message) {
        alert("⚠️ " + image.error_message);
      } else {
        alert("⚠️ Xử lý AI thất bại. Vui lòng thử lại.");
      }
    }
    
    // Update previous status
    setPreviousStatus(image.status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image?.status]);

  const handleDownload = () => {
    if (image?.minio_url) {
      window.open(image.minio_url, '_blank');
    }
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.25, 5));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.25, 0.5));
  };

  const getFitScale = () => {
    const viewport = imageViewportRef.current;
    if (!viewport || !naturalSize.width || !naturalSize.height) return 1;
    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    if (!viewportWidth || !viewportHeight) return 1;
    return Math.min(viewportWidth / naturalSize.width, viewportHeight / naturalSize.height);
  };

  const handleFit = () => {
    setZoom(1);
  };

  const handleOriginalSize = () => {
    const fitScale = getFitScale();
    const originalZoom = fitScale > 0 ? 1 / fitScale : 1;
    setZoom(Math.min(Math.max(originalZoom, 0.5), 5));
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "N/A";
    if (bytes < 1024) return bytes + " B";
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    else return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div className="text-center">
          <Loader className="animate-spin mx-auto mb-4 text-indigo-600" size={48} />
          <p className="text-gray-600">Đang tải hình ảnh...</p>
        </div>
      </div>
    );
  }

  if (error || !image) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div className="text-center">
          <ImageIcon className="mx-auto mb-4 text-gray-300" size={64} />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Hình ảnh không tìm thấy</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/my-images')}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            Quay lại danh sách
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-20">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/my-images')}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{image.image_name}</h1>
              <p className="text-sm text-gray-500">Image Viewer</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleZoomOut}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
              title="Zoom Out"
            >
              <ZoomOut size={20} />
            </button>
            <span className="text-sm font-medium text-gray-600 min-w-[60px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
              title="Zoom In"
            >
              <ZoomIn size={20} />
            </button>
            <button
              onClick={handleFit}
              className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition"
              title="Fit to screen"
            >
              Fit
            </button>
            <button
              onClick={handleOriginalSize}
              className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition"
              title="Original size"
            >
              1:1
            </button>
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center gap-2"
            >
              <Download size={18} />
              Download
            </button>
          </div>
        </div>
      </header>

      {/* Image Display */}
      <main className="max-w-[1200px] mx-auto p-6">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="relative bg-gray-900 min-h-[600px] overflow-auto p-6 md:p-8">
            {image.minio_url ? (
              <div
                ref={imageViewportRef}
                className="w-full h-[75vh] min-h-[460px] max-h-[80vh] flex items-center justify-center"
              >
                <img
                  src={image.minio_url}
                  alt={image.image_name}
                  className="w-full h-full object-contain transition-transform duration-200"
                  style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
                  onError={(e) => {
                    console.error("Image load error:", e);
                    console.error("Image URL:", image.minio_url);
                    setError(`Không thể tải hình ảnh. Format: ${image.format?.toUpperCase()}.`);
                  }}
                  onLoad={() => {
                    console.log('✅ Image loaded successfully');
                    const img = new Image();
                    img.onload = () => {
                      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
                    };
                    img.src = image.minio_url;
                  }}
                />
              </div>
            ) : (
              <div className="text-white text-center">
                <ImageIcon size={64} className="mx-auto mb-4 opacity-50" />
                <p>Hình ảnh không có sẵn</p>
              </div>
            )}
            
            {error && (
              <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-8">
                <div className="bg-red-500/90 text-white px-6 py-4 rounded-lg max-w-md text-center">
                  <p className="font-semibold mb-2">⚠️ Lỗi tải hình ảnh</p>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            )}
          </div>

          {/* Image Info */}
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-gray-500 mb-1">Tên hình ảnh</p>
                <p className="font-semibold text-gray-900">{image.image_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Trạng thái</p>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                  image.status === 'uploaded' ? 'bg-gray-100 text-gray-600' :
                  image.status === 'processing' ? 'bg-blue-100 text-blue-600' :
                  image.status === 'done' ? 'bg-green-100 text-green-600' :
                  'bg-red-100 text-red-600'
                }`}>
                  {image.status}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Kích thước</p>
                <p className="font-semibold text-gray-900">
                  {image.width && image.height ? `${image.width} × ${image.height}` : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Dung lượng</p>
                <p className="font-semibold text-gray-900">
                  {formatFileSize(image.file_size)}
                </p>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-500 mb-1">Format</p>
                <p className="font-semibold text-gray-900 uppercase">
                  {image.format || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Ngày tạo</p>
                <p className="font-semibold text-gray-900">
                  {new Date(image.created_at).toLocaleString('vi-VN')}
                </p>
              </div>
            </div>

            

            {/* Error Notification */}
            {image.status === "error" && (
              <div className="mt-6 p-4 bg-red-50 border border-red-300 rounded-lg flex gap-3">
                <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-red-800">⚠️ Xử lý AI thất bại</p>
                  <p className="text-sm text-red-700 mt-1">
                    {image.error_message || "Vui lòng thử lại hoặc liên hệ hỗ trợ."}
                  </p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-6 flex gap-3">
              {image.status === "uploaded" || image.status === "error" ? (
                <button
                  onClick={async () => {
                    if (processingAI) return;
                    
                    setProcessingAI(true);
                    try {
                      // Update status optimistically
                      setImage(prev => ({ ...prev, status: 'processing' }));
                      
                      const res = await axiosClient.post(`/images/${image._id}/analyze`);
                      
                      if (res.data?.success) {
                        alert("✨ Đang phân tích hình ảnh bằng AI! Hệ thống sẽ tự động cập nhật kết quả.");
                      }
                      
                      // Fetch immediately
                      await fetchImage();
                      
                    } catch (err) {
                      console.error('AI Analysis Error:', err);
                      const errorMsg = err.response?.data?.message || "Lỗi khi gọi AI phân tích!";
                      alert("❌ " + errorMsg);
                      // Revert optimistic update
                      fetchImage();
                    } finally {
                      setProcessingAI(false);
                    }
                  }}
                  disabled={processingAI}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processingAI ? (
                    <>
                      <Loader size={18} className="animate-spin" />
                      Đang gửi...
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      {image.status === "error" ? "Thử lại Xử lí AI" : "Xử lí AI"}
                    </>
                  )}
                </button>
              ) : image.status === "processing" ? (
                <div className="flex-1 px-6 py-3 bg-blue-100 text-blue-600 rounded-lg font-semibold flex items-center justify-center gap-2">
                  <Loader size={18} className="animate-spin" />
                  Đang phân tích...
                </div>
              ) : image.status === "done" ? (
                <button
                  onClick={() => navigate(`/annotation-studio/${image._id}`)}
                  className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold"
                >
                  Mở trong Annotation Studio
                </button>
              ) : null}
              <button
                onClick={handleDownload}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-semibold"
              >
                Tải xuống
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ImageViewer;
