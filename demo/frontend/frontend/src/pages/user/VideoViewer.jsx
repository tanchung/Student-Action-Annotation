import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Video as VideoIcon, Loader } from "lucide-react";
import axiosClient from "../../api/axiosClient";

const VideoViewer = () => {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchVideo();
  }, [videoId]);

  const fetchVideo = async () => {
    try {
      setLoading(true);
      const res = await axiosClient.get(`/videos/${videoId}`);
      if (res.data?.success) {
        console.log('📹 Video data:', res.data.result);
        console.log('🔗 Video URL:', res.data.result.minio_url);
        setVideo(res.data.result);
      } else {
        setError("Không thể tải video");
      }
    } catch (err) {
      console.error("Error fetching video:", err);
      setError(err.response?.data?.message || "Lỗi khi tải video");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div className="text-center">
          <Loader className="animate-spin mx-auto mb-4 text-indigo-600" size={48} />
          <p className="text-gray-600">Đang tải video...</p>
        </div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div className="text-center">
          <VideoIcon className="mx-auto mb-4 text-gray-300" size={64} />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Video không tìm thấy</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/my-videos')}
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
              onClick={() => navigate('/my-videos')}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{video.clip_name}</h1>
              <p className="text-sm text-gray-500">Video Viewer</p>
            </div>
          </div>
        </div>
      </header>

      {/* Video Player */}
      <main className="max-w-[1400px] mx-auto p-6">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-black aspect-video flex items-center justify-center">
            {video.minio_url ? (
              <video
                controls
                className="w-full h-full"
                src={video.minio_url}
                crossOrigin="anonymous"
                preload="metadata"
                onError={(e) => {
                  console.error("Video load error:", e);
                  console.error("Video URL:", video.minio_url);
                  console.error("Video type:", video.clip_name.split('.').pop());
                  setError(`Không thể phát video. Format: ${video.clip_name.split('.').pop().toUpperCase()}. Browser có thể không hỗ trợ format này.`);
                }}
                onLoadedMetadata={() => {
                  console.log('✅ Video metadata loaded successfully');
                }}
              >
                <source src={video.minio_url} type="video/mp4" />
                <source src={video.minio_url} type="video/webm" />
                Trình duyệt của bạn không hỗ trợ phát video.
              </video>
            ) : (
              <div className="text-white text-center">
                <VideoIcon size={64} className="mx-auto mb-4 opacity-50" />
                <p>Video không có sẵn</p>
              </div>
            )}
            
            {error && (
              <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-8">
                <div className="bg-red-500/90 text-white px-6 py-4 rounded-lg max-w-md text-center">
                  <p className="font-semibold mb-2">⚠️ Lỗi phát video</p>
                  <p className="text-sm">{error}</p>
                  <p className="text-xs mt-3 opacity-75">
                    Video AVI cần được convert sang MP4 để browser có thể phát.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Video Info */}
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-gray-500 mb-1">Tên video</p>
                <p className="font-semibold text-gray-900">{video.clip_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Trạng thái</p>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                  video.status === 'uploaded' ? 'bg-gray-100 text-gray-600' :
                  video.status === 'processing' ? 'bg-blue-100 text-blue-600' :
                  video.status === 'done' ? 'bg-green-100 text-green-600' :
                  'bg-red-100 text-red-600'
                }`}>
                  {video.status}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Thời lượng</p>
                <p className="font-semibold text-gray-900">
                  {video.duration > 0 ? `${video.duration}s` : 'N/A'}
                </p>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-500 mb-1">URL</p>
              <p className="text-xs text-gray-400 font-mono break-all bg-gray-50 p-2 rounded">
                {video.minio_url}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default VideoViewer;
