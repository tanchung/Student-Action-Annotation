import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader, MessageSquareText, Film, AlertTriangle } from "lucide-react";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import axiosClient from "../../api/axiosClient";

const VideoAnnotation = () => {
  const { videoId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [videoInfo, setVideoInfo] = useState(null);
  const [videoCaption, setVideoCaption] = useState("");
  const [captionMeta, setCaptionMeta] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await axiosClient.get(`/videos/${videoId}/metadata`);
        const payload = response.data?.data || {};
        const related = payload.related_data || {};

        const captionList = Array.isArray(related.caption) ? related.caption : [];

        const aggregatedCaptionDoc =
          captionList.find((item) => item.caption_scope === "video") ||
          captionList.find((item) => item.segment_captions && Array.isArray(item.segment_captions)) ||
          captionList[0];

        setVideoInfo(payload.video || null);
        setVideoCaption(aggregatedCaptionDoc?.caption || "");
        setCaptionMeta(aggregatedCaptionDoc || null);
      } catch (err) {
        console.error("Error loading video annotation:", err);
        setError(err.response?.data?.message || "Không thể tải dữ liệu annotation video");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [videoId]);

  const hasData = !!videoInfo || !!videoCaption;
  const captionNeedsReview = Boolean(captionMeta?.needs_regeneration);
  const captionConfidence = Number.isFinite(Number(captionMeta?.caption_confidence))
    ? Number(captionMeta?.caption_confidence)
    : null;
  const captionReviewReason = captionMeta?.regeneration_reason || captionMeta?.caption_validation?.reason || "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 text-gray-800 font-sans flex flex-col">
      <Header activePage="my-videos" />

      <main className="flex-1 max-w-[1200px] w-full mx-auto p-6 md:p-8 pt-28">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate("/my-videos")}
            className="p-2 rounded-lg hover:bg-gray-100 transition"
            title="Quay lại"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Video Annotation</h1>
            <p className="text-gray-500 text-sm md:text-base">Hiển thị video và caption tổng quát</p>
          </div>
        </div>

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-10 flex items-center justify-center gap-3 text-gray-600">
            <Loader size={20} className="animate-spin" /> Đang tải dữ liệu annotation...
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700">
            {error}
          </div>
        ) : !hasData ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
            <Film size={36} className="mx-auto text-gray-400 mb-3" />
            <p className="text-gray-700 font-semibold mb-1">Chưa có dữ liệu caption cho video này</p>
            <p className="text-gray-500 text-sm">Hãy bấm Run AI ở trang My Videos trước.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white border border-gray-200 rounded-2xl p-4 md:p-5">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Video</h2>

              <div className="rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center">
                {videoInfo?.minio_url ? (
                  <video
                    controls
                    className="w-full h-full"
                    src={videoInfo.minio_url}
                    preload="metadata"
                    crossOrigin="anonymous"
                  >
                    <source src={videoInfo.minio_url} type="video/mp4" />
                    <source src={videoInfo.minio_url} type="video/webm" />
                    Trình duyệt của bạn không hỗ trợ phát video.
                  </video>
                ) : (
                  <div className="text-white text-sm">Video không có sẵn</div>
                )}
              </div>

              {videoInfo?.clip_name && (
                <p className="text-xs text-gray-400 mt-3">Video: {videoInfo.clip_name}</p>
              )}
            </section>

            <section className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-3 text-indigo-700">
                <MessageSquareText size={18} />
                <h2 className="text-lg font-bold">Caption tổng quát</h2>
              </div>

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

              <p className="text-gray-700 leading-relaxed">
                {videoCaption || "Chưa có caption tổng quát."}
              </p>
            </section>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default VideoAnnotation;
