import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Download, Play, Pause, SkipBack, SkipForward } from "lucide-react";
import axiosClient from "../../api/axiosClient";

const AnnotationStudio = () => {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);

  // State
  const [videoData, setVideoData] = useState(null);
  const [captions, setCaptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [activeCaption, setActiveCaption] = useState(null);

  // Fetch video data
  const fetchVideoData = useCallback(async () => {
    try {
      console.log("Fetching video data for ID:", videoId);
      const res = await axiosClient.get(`/videos/${videoId}`);
      console.log("Video data response:", res.data);
      if (res.data.success) {
        const videoInfo = res.data.result;
        console.log("📹 Video URL (minio_url):", videoInfo.minio_url);
        console.log("📊 Video status:", videoInfo.status);
        console.log("📁 Full video data:", videoInfo);
        setVideoData(videoInfo);
        
        // Check if video URL exists
        if (!videoInfo.minio_url) {
          console.warn("⚠️ Video has no minio_url!");
          alert(`⚠️ Video chưa có URL!\n\nStatus: ${videoInfo.status}\nFile: ${videoInfo.file_name}\n\nVideo có thể đang được xử lý hoặc chưa upload thành công.`);
        }
      }
    } catch (error) {
      console.error("Error fetching video data:", error);
      alert("Không thể tải thông tin video!");
      navigate("/user/dashboard");
    } finally {
      setLoading(false);
    }
  }, [videoId, navigate]);

  // Fetch captions
  const fetchCaptions = useCallback(async () => {
    try {
      // Fetch captions from metadata (assuming captions are stored in metadata collection)
      const res = await axiosClient.get(`/videos/${videoId}/metadata`);
      console.log("📊 Metadata response:", res.data);
      if (res.data.success && res.data.data) {
        const metadata = res.data.data;
        console.log("📊 Full metadata object:", metadata);
        console.log("📊 Related data:", metadata.related_data);
        
        // Extract captions from related_data.caption first
        const extractedCaptions = [];
        
        // Check if captions exist in related_data
        if (metadata.related_data?.caption && Array.isArray(metadata.related_data.caption)) {
          console.log("✅ Found captions in related_data.caption:", metadata.related_data.caption.length);
          metadata.related_data.caption.forEach(cap => {
            if (cap.caption_text) {
              extractedCaptions.push({
                time: cap.start_time || 0,
                endTime: cap.end_time || (cap.start_time + 5),
                text: cap.caption_text,
                segmentId: cap.segment_id || cap._id
              });
            }
          });
        }
        // Fallback: check segments array
        else if (metadata.related_data?.segment && Array.isArray(metadata.related_data.segment)) {
          console.log("⚠️ No caption collection, using segments:", metadata.related_data.segment.length);
          metadata.related_data.segment.forEach(segment => {
            console.log("Segment data:", segment);
            if (segment.caption || segment.description) {
              extractedCaptions.push({
                time: segment.start_time || 0,
                endTime: segment.end_time || (segment.start_time + 5),
                text: segment.caption || segment.description || "No caption",
                segmentId: segment.segment_id || segment._id
              });
            }
          });
        }
        
        // Sort by time
        extractedCaptions.sort((a, b) => a.time - b.time);
        console.log("✅ Total extracted captions:", extractedCaptions.length);
        console.log("📋 Captions:", extractedCaptions);
        setCaptions(extractedCaptions);
      }
    } catch (error) {
      console.error("Error fetching captions:", error);
      // Don't navigate away, just show empty captions
      setCaptions([]);
    }
  }, [videoId]);

  // Fetch video data and captions on mount
  useEffect(() => {
    fetchVideoData();
    fetchCaptions();
  }, [fetchVideoData, fetchCaptions]);

  // Video player handlers
  const togglePlayPause = () => {
    if (videoRef.current) {
      if (!videoData?.minio_url) {
        alert("Video URL không khả dụng!");
        return;
      }
      
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(error => {
          console.error("Error playing video:", error);
          alert("Không thể phát video. Có thể video đang xử lý hoặc URL không hợp lệ.");
        });
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const current = videoRef.current.currentTime;
      setCurrentTime(current);
      
      // Find active caption
      const active = captions.find(
        cap => current >= cap.time && current <= cap.endTime
      );
      setActiveCaption(active);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const seekTo = (time) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const skipTime = (seconds) => {
    if (videoRef.current) {
      videoRef.current.currentTime += seconds;
    }
  };

  // Search functionality
  const handleSearch = () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    const results = captions.filter(caption =>
      caption.text.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setSearchResults(results);
  };

  const jumpToCaption = (time) => {
    seekTo(time);
    if (!isPlaying && videoRef.current) {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  // Export functions
  const exportToSRT = () => {
    let srtContent = "";
    captions.forEach((caption, index) => {
      const startTime = formatTimeToSRT(caption.time);
      const endTime = formatTimeToSRT(caption.endTime);
      srtContent += `${index + 1}\n${startTime} --> ${endTime}\n${caption.text}\n\n`;
    });

    downloadFile(srtContent, `${videoData?.file_name || 'video'}.srt`, "text/plain");
  };

  const exportToDOCX = () => {
    let docContent = `VIDEO TRANSCRIPT - ${videoData?.file_name || 'Video'}\n`;
    docContent += `Generated on: ${new Date().toLocaleString()}\n\n`;
    docContent += "=" .repeat(50) + "\n\n";
    
    captions.forEach((caption) => {
      const timeStr = formatTime(caption.time);
      docContent += `[${timeStr}] ${caption.text}\n\n`;
    });

    downloadFile(docContent, `${videoData?.file_name || 'video'}_transcript.txt`, "text/plain");
  };

  const formatTimeToSRT = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${pad(mins)}:${pad(secs)}`;
  };

  const pad = (num, size = 2) => {
    let s = num + "";
    while (s.length < size) s = "0" + s;
    return s;
  };

  const downloadFile = (content, filename, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
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
                <p className="text-sm text-gray-500">{videoData?.file_name}</p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={exportToSRT}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                <Download size={18} />
                Export SRT
              </button>
              <button
                onClick={exportToDOCX}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                <Download size={18} />
                Export Transcript
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Video Player */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="relative bg-black" style={{ paddingTop: '56.25%' }}>
                {videoData?.minio_url ? (
                  <video
                    ref={videoRef}
                    src={videoData.minio_url}
                    className="absolute top-0 left-0 w-full h-full"
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onError={(e) => {
                      console.error("Video error:", e);
                      console.error("Video src:", videoData?.minio_url);
                      console.error("Video element:", e.target);
                    }}
                  />
                ) : (
                  <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center text-white bg-gray-900">
                    <div className="text-center p-8">
                      <p className="text-lg mb-4">⚠️ Video không khả dụng</p>
                      <div className="text-sm text-gray-400 space-y-2 max-w-md">
                        <p>Video đang được xử lý hoặc MinIO server không khả dụng</p>
                        <p className="text-xs">Status: {videoData?.status || 'unknown'}</p>
                        {videoData?.minio_url && (
                          <div className="mt-4 p-3 bg-gray-800 rounded text-left">
                            <p className="font-mono text-xs break-all text-yellow-400">
                              URL: {videoData.minio_url}
                            </p>
                            <p className="text-xs mt-2 text-red-400">
                              ⚠️ MinIO server (port 9000) cần phải chạy để xem video
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Video Controls */}
              <div className="p-4 bg-gray-50">
                <div className="flex items-center gap-4 mb-3">
                  <button
                    onClick={() => skipTime(-10)}
                    className="p-2 hover:bg-gray-200 rounded-lg transition"
                  >
                    <SkipBack size={20} />
                  </button>
                  <button
                    onClick={togglePlayPause}
                    className="p-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                  >
                    {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                  </button>
                  <button
                    onClick={() => skipTime(10)}
                    className="p-2 hover:bg-gray-200 rounded-lg transition"
                  >
                    <SkipForward size={20} />
                  </button>
                  <span className="text-sm text-gray-600">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                {/* Progress Bar */}
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  value={currentTime}
                  onChange={(e) => seekTo(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />

                {/* Active Caption Display */}
                {activeCaption && (
                  <div className="mt-4 p-3 bg-indigo-50 border-l-4 border-indigo-600 rounded">
                    <p className="text-sm font-medium text-indigo-900">{activeCaption.text}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Search in Video */}
            <div className="bg-white rounded-xl shadow-lg p-4">
              <h3 className="text-lg font-semibold mb-3">🔍 Search in Video</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Tìm đoạn học sinh giơ tay..."
                  className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
                />
                <button
                  onClick={handleSearch}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center gap-2"
                >
                  <Search size={18} />
                  Search
                </button>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="mt-4 space-y-2 max-h-60 overflow-y-auto">
                  <p className="text-sm text-gray-600 mb-2">
                    Found {searchResults.length} result(s):
                  </p>
                  {searchResults.map((result, idx) => (
                    <div
                      key={idx}
                      onClick={() => jumpToCaption(result.time)}
                      className="p-3 bg-gray-50 hover:bg-indigo-50 rounded-lg cursor-pointer border border-gray-200 hover:border-indigo-300 transition"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-indigo-600">
                          {formatTime(result.time)}
                        </span>
                        <Play size={16} className="text-indigo-600" />
                      </div>
                      <p className="text-sm text-gray-700 mt-1">{result.text}</p>
                    </div>
                  ))}
                </div>
              )}

              {searchTerm && searchResults.length === 0 && (
                <p className="mt-4 text-sm text-gray-500 text-center">
                  No results found for "{searchTerm}"
                </p>
              )}
            </div>
          </div>

          {/* Right: Action Log */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg p-4 sticky top-24">
              <h3 className="text-lg font-semibold mb-4">📋 Action Log</h3>
              
              {captions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No captions available</p>
                  <p className="text-sm mt-2">Captions will appear here when video is processed</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[calc(100vh-250px)] overflow-y-auto pr-2">
                  {captions.map((caption, idx) => (
                    <div
                      key={idx}
                      onClick={() => jumpToCaption(caption.time)}
                      className={`p-3 rounded-lg border cursor-pointer transition ${
                        activeCaption?.segmentId === caption.segmentId
                          ? 'bg-indigo-100 border-indigo-400 shadow-md'
                          : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono font-semibold text-indigo-600">
                          {formatTime(caption.time)}
                        </span>
                        {activeCaption?.segmentId === caption.segmentId && (
                          <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded">
                            Playing
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {caption.text}
                      </p>
                    </div>
                  ))}
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
