import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, ZoomIn, ZoomOut, Eye, EyeOff, AlertTriangle } from "lucide-react";
import axiosClient from "../../api/axiosClient";

const AnnotationStudio = () => {
  const { imageId } = useParams();
  const navigate = useNavigate();
  const imageContainerRef = useRef(null);

  // State
  const [imageData, setImageData] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });

  // Fetch image data
  useEffect(() => {
    const fetchImageData = async () => {
      try {
        console.log("Fetching image data for ID:", imageId);
        const res = await axiosClient.get(`/images/${imageId}`);
        console.log("Image data response:", res.data);
        
        if (res.data.success) {
          const imageInfo = res.data.result;
          console.log("🖼️ Image URL (minio_url):", imageInfo.minio_url);
          console.log("📊 Image status:", imageInfo.status);
          setImageData(imageInfo);
          
          if (!imageInfo.minio_url) {
            console.warn("⚠️ Image has no minio_url!");
            alert(`⚠️ Hình ảnh chưa có URL!\n\nStatus: ${imageInfo.status}\nFile: ${imageInfo.image_name}`);
          }
        }
      } catch (error) {
        console.error("Error fetching image data:", error);
        alert("Không thể tải thông tin hình ảnh!");
        navigate("/user/dashboard");
      }
    };

    const fetchMetadata = async () => {
      try {
        console.log("Fetching metadata for image:", imageId);
        const res = await axiosClient.get(`/images/${imageId}/metadata`);
        console.log("📊 Metadata response:", res.data);
        
        if (res.data.success && res.data.data) {
          const meta = res.data.data;
          setMetadata(meta);
        }
      } catch (error) {
        console.error("Error fetching metadata:", error);
        setMetadata(null);
      } finally {
        setLoading(false);
      }
    };

    fetchImageData();
    fetchMetadata();
  }, [imageId, navigate]);

  // Zoom handlers
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => setZoom(1);

  const getFitScale = () => {
    const viewport = imageContainerRef.current;
    if (!viewport || !naturalSize.width || !naturalSize.height) return 1;
    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    if (!viewportWidth || !viewportHeight) return 1;
    return Math.min(viewportWidth / naturalSize.width, viewportHeight / naturalSize.height);
  };

  const handleOriginalSize = () => {
    const fitScale = getFitScale();
    const originalZoom = fitScale > 0 ? 1 / fitScale : 1;
    setZoom(Math.min(Math.max(originalZoom, 0.5), 5));
  };

  const captionItems = metadata?.related_data?.caption || [];
  const captionText = captionItems
    .map((item) => item?.caption || item?.text || item?.caption_text || item?.description)
    .filter(Boolean)
    .join("\n\n");
  const primaryCaption = captionItems[0] || null;
  const captionNeedsReview = Boolean(primaryCaption?.needs_regeneration);
  const captionConfidence = Number.isFinite(Number(primaryCaption?.caption_confidence))
    ? Number(primaryCaption?.caption_confidence)
    : null;
  const captionReviewReason = primaryCaption?.regeneration_reason || primaryCaption?.caption_validation?.reason || "";

  // Export functions
  const exportMetadataJSON = () => {
    const exportData = {
      image_name: imageData?.image_name,
      dimensions: {
        width: imageData?.width,
        height: imageData?.height
      },
      format: imageData?.format,
      file_size: imageData?.file_size,
      metadata: metadata,
      exported_at: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${imageData?.image_name || 'image'}_metadata.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportAnnotationsTXT = () => {
    let txtContent = `IMAGE ANALYSIS REPORT - ${imageData?.image_name || 'Image'}\n`;
    txtContent += `Generated on: ${new Date().toLocaleString()}\n`;
    txtContent += `Dimensions: ${imageData?.width}x${imageData?.height}\n`;
    txtContent += `Format: ${imageData?.format}\n`;
    txtContent += "=" .repeat(60) + "\n\n";
    
    // Detected Objects
    if (metadata?.related_data?.entity_object?.length > 0) {
      txtContent += "DETECTED OBJECTS:\n";
      txtContent += "-" .repeat(60) + "\n";
      metadata.related_data.entity_object.forEach((obj, idx) => {
        txtContent += `${idx + 1}. ${obj.object_type || 'Unknown'}\n`;
        if (obj.name) txtContent += `   Name: ${obj.name}\n`;
        if (obj.confidence) txtContent += `   Confidence: ${(obj.confidence * 100).toFixed(1)}%\n`;
        if (obj.bbox) txtContent += `   Bounding Box: [${obj.bbox.join(', ')}]\n`;
        txtContent += "\n";
      });
    }

    // Activities
    if (metadata?.related_data?.activity?.length > 0) {
      txtContent += "\nACTIVITIES DETECTED:\n";
      txtContent += "-" .repeat(60) + "\n";
      metadata.related_data.activity.forEach((act, idx) => {
        txtContent += `${idx + 1}. ${act.activity_type || act.description}\n`;
        if (act.confidence) txtContent += `   Confidence: ${(act.confidence * 100).toFixed(1)}%\n`;
        txtContent += "\n";
      });
    }

    // Environment/Scene
    if (metadata?.related_data?.environment?.length > 0) {
      txtContent += "\nENVIRONMENT/SCENE:\n";
      txtContent += "-" .repeat(60) + "\n";
      metadata.related_data.environment.forEach((env, idx) => {
        txtContent += `${idx + 1}. ${env.environment_type || env.scene_type}\n`;
        if (env.description) txtContent += `   ${env.description}\n`;
        txtContent += "\n";
      });
    }

    const blob = new Blob([txtContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${imageData?.image_name || 'image'}_analysis.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading Annotation Studio...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate("/user/dashboard")}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-800">Annotation Studio</h1>
                <p className="text-sm text-gray-500">{imageData?.image_name}</p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={exportMetadataJSON}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm"
              >
                <Download size={18} />
                Export JSON
              </button>
              <button
                onClick={exportAnnotationsTXT}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
              >
                <Download size={18} />
                Export Report
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Image Viewer */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              {/* Image Display */}
              <div
                ref={imageContainerRef}
                className="relative bg-gray-900 overflow-auto h-[75vh] min-h-[460px] max-h-[80vh]"
              >
                {imageData?.minio_url ? (
                  <div className="w-full h-full flex items-center justify-center p-4 md:p-6">
                    <img
                      src={imageData.minio_url}
                      alt={imageData.image_name}
                      className="w-full h-full object-contain"
                      style={{ 
                        transform: `scale(${zoom})`,
                        transition: 'transform 0.2s',
                        transformOrigin: 'center center'
                      }}
                      onError={(e) => {
                        console.error("Image error:", e);
                        console.error("Image src:", imageData?.minio_url);
                      }}
                      onLoad={() => {
                        const img = new Image();
                        img.onload = () => {
                          setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
                        };
                        img.src = imageData.minio_url;
                      }}
                    />
                  </div>
                ) : (
                  <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center text-white">
                    <div className="text-center p-8">
                      <p className="text-lg mb-4">⚠️ Hình ảnh không khả dụng</p>
                      <div className="text-sm text-gray-400 space-y-2 max-w-md">
                        <p>Hình ảnh đang được xử lý hoặc MinIO server không khả dụng</p>
                        <p className="text-xs">Status: {imageData?.status || 'unknown'}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Image Controls */}
              <div className="p-4 bg-gray-50">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleZoomOut}
                      className="p-2 hover:bg-gray-200 rounded-lg transition"
                      title="Zoom Out"
                    >
                      <ZoomOut size={20} />
                    </button>
                    <span className="text-sm font-medium text-gray-700 min-w-[60px] text-center">
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      onClick={handleZoomIn}
                      className="p-2 hover:bg-gray-200 rounded-lg transition"
                      title="Zoom In"
                    >
                      <ZoomIn size={20} />
                    </button>
                    <button
                      onClick={handleResetZoom}
                      className="p-2 hover:bg-gray-200 rounded-lg transition text-xs px-3"
                      title="Fit to screen"
                    >
                      Fit
                    </button>
                    <button
                      onClick={handleOriginalSize}
                      className="p-2 hover:bg-gray-200 rounded-lg transition text-xs px-3"
                      title="Original size"
                    >
                      1:1
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAnnotations(!showAnnotations)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                        showAnnotations 
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {showAnnotations ? <Eye size={18} /> : <EyeOff size={18} />}
                      <span className="text-sm">
                        {showAnnotations ? 'Hide' : 'Show'} Annotations
                      </span>
                    </button>
                  </div>
                </div>

                {/* Image Info */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Dimensions:</span>
                      <p className="font-semibold text-gray-800">
                        {imageData?.width} × {imageData?.height}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Format:</span>
                      <p className="font-semibold text-gray-800 uppercase">
                        {imageData?.format}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">File Size:</span>
                      <p className="font-semibold text-gray-800">
                        {imageData?.file_size ? (imageData.file_size / 1024 / 1024).toFixed(2) + ' MB' : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Status:</span>
                      <p className="font-semibold text-gray-800 capitalize">
                        {imageData?.status}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Right: Caption Panel */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg p-4 sticky top-24">
              <h3 className="text-lg font-semibold mb-4">Caption</h3>

              {captionNeedsReview && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 p-3 text-sm">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle size={16} /> Caption cần kiểm tra lại
                  </div>
                  <div className="mt-1 text-xs">
                    {captionConfidence !== null ? `Độ tin cậy: ${captionConfidence}%` : "Độ tin cậy: chưa có"}
                    {captionReviewReason ? ` - ${captionReviewReason}` : ""}
                  </div>
                </div>
              )}

              {!captionText ? (
                <div className="text-center py-8 text-gray-500">
                  <p>Chưa có caption cho ảnh này</p>
                  <p className="text-sm mt-2">Caption sẽ hiển thị sau khi ảnh được xử lý</p>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-gray-800 leading-relaxed whitespace-pre-wrap max-h-[calc(100vh-250px)] overflow-y-auto">
                  {captionText}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnnotationStudio;
