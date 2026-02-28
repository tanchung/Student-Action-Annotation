import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Video, Camera, Sun, Settings, AlertTriangle, Upload, Sparkles,
  FileText, Download, ChevronRight, ChevronDown, BookOpen,
  CheckCircle2, XCircle, Lightbulb, PlayCircle, Edit, Eye,
  FileSpreadsheet, Users, MessageSquare, Phone, Moon, ArrowRight,
  Zap, Target, Award
} from "lucide-react";

const TutorialsPage = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("best-practices");
  const [openFaq, setOpenFaq] = useState(null);

  const scrollToSection = (sectionId) => {
    setActiveSection(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/home")}
              className="flex items-center gap-2 font-black text-xl tracking-tight hover:text-indigo-600 transition"
            >
              <div className="bg-indigo-600 text-white p-1.5 rounded-lg">
                <Video size={20} />
              </div>
              ANNOTATION.IO
            </button>
            <span className="text-gray-300">|</span>
            <div className="flex items-center gap-2 text-gray-600">
              <BookOpen size={20} />
              <span className="font-semibold">Tutorials & Documentation</span>
            </div>
          </div>
          
          <button
            onClick={() => navigate("/dashboard")}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium"
          >
            Back to Dashboard
          </button>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto flex gap-8 p-8">
        {/* Sidebar Navigation */}
        <aside className="w-64 flex-shrink-0 sticky top-24 h-fit">
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">
              Table of Contents
            </h3>
            <nav className="space-y-2">
              {[
                { id: "best-practices", label: "Best Practices", icon: Target },
                { id: "workflow", label: "Workflow (4 Steps)", icon: Zap },
                { id: "actions", label: "Action Vocabulary", icon: BookOpen },
                { id: "faq", label: "FAQ", icon: MessageSquare }
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollToSection(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left transition ${
                    activeSection === item.id
                      ? "bg-indigo-50 text-indigo-600 font-semibold"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <item.icon size={18} />
                  <span className="text-sm">{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 space-y-12">
          {/* Hero Section */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-3xl p-10 text-white shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <Award className="text-yellow-300" size={32} />
              <h1 className="text-4xl font-black">Complete Guide</h1>
            </div>
            <p className="text-xl text-indigo-100 mb-6 leading-relaxed">
              Học cách sử dụng hệ thống AI Caption để tạo chú thích tự động cho video lớp học. 
              Làm theo hướng dẫn này để đạt được độ chính xác cao nhất!
            </p>
            <div className="flex gap-4">
              <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 flex items-center gap-2">
                <PlayCircle size={18} />
                <span className="text-sm font-medium">5 min read</span>
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 flex items-center gap-2">
                <Users size={18} />
                <span className="text-sm font-medium">For Educators</span>
              </div>
            </div>
          </div>

          {/* Section 1: Best Practices */}
          <section id="best-practices" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-indigo-100 rounded-xl">
                <Target className="text-indigo-600" size={28} />
              </div>
              <div>
                <h2 className="text-3xl font-black text-gray-900">Tiêu chuẩn Video Đầu vào</h2>
                <p className="text-gray-600">Best Practices for Recording</p>
              </div>
            </div>

            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-r-xl mb-8">
              <div className="flex gap-3">
                <Lightbulb className="text-yellow-600 flex-shrink-0" size={24} />
                <div>
                  <h4 className="font-bold text-yellow-900 mb-2">Tại sao quan trọng?</h4>
                  <p className="text-yellow-800 text-sm leading-relaxed">
                    Hệ thống AI phân tích hình ảnh (Computer Vision) rất nhạy cảm với chất lượng video. 
                    Video mờ, tối, hoặc góc quay sai sẽ khiến AI nhận diện kém và tạo ra caption sai!
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Camera Angle */}
              <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100 hover:shadow-xl transition">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 bg-blue-100 rounded-xl">
                    <Camera className="text-blue-600" size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Góc máy</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="flex gap-3 items-start">
                    <CheckCircle2 className="text-green-500 flex-shrink-0 mt-1" size={20} />
                    <div>
                      <p className="font-semibold text-gray-900 mb-1">Nên:</p>
                      <p className="text-gray-600 text-sm leading-relaxed">
                        Đặt camera ở góc cao, phía trên bục giảng nhìn xuống lớp hoặc ở góc phòng 
                        nhìn bao quát toàn bộ học sinh.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-3 items-start">
                    <XCircle className="text-red-500 flex-shrink-0 mt-1" size={20} />
                    <div>
                      <p className="font-semibold text-gray-900 mb-1">Không nên:</p>
                      <p className="text-gray-600 text-sm leading-relaxed">
                        Đặt máy quá thấp, góc ngang bằng vai (học sinh ngồi trước sẽ che khuất 
                        học sinh phía sau - Occlusion).
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 font-medium">💡 PRO TIP</p>
                  <p className="text-sm text-gray-700 mt-1">
                    Góc quay 45° từ trên cao cho kết quả tốt nhất
                  </p>
                </div>
              </div>

              {/* Lighting */}
              <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100 hover:shadow-xl transition">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 bg-yellow-100 rounded-xl">
                    <Sun className="text-yellow-600" size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Ánh sáng</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="flex gap-3 items-start">
                    <CheckCircle2 className="text-green-500 flex-shrink-0 mt-1" size={20} />
                    <div>
                      <p className="font-semibold text-gray-900 mb-1">Nên:</p>
                      <p className="text-gray-600 text-sm leading-relaxed">
                        Lớp học đủ sáng, bật đèn rõ ràng. Ánh sáng tự nhiên từ cửa sổ kết hợp 
                        đèn trần là lý tưởng.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-3 items-start">
                    <XCircle className="text-red-500 flex-shrink-0 mt-1" size={20} />
                    <div>
                      <p className="font-semibold text-gray-900 mb-1">Không nên:</p>
                      <p className="text-gray-600 text-sm leading-relaxed">
                        Quay ngược sáng (camera hướng thẳng ra cửa sổ chói nắng) hoặc lớp học 
                        quá tối khiến khuôn mặt/hành động bị nhòe.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 font-medium">⚠️ LƯU Ý</p>
                  <p className="text-sm text-gray-700 mt-1">
                    Tránh backlight - học sinh sẽ chỉ còn là bóng đen
                  </p>
                </div>
              </div>

              {/* Video Quality */}
              <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100 hover:shadow-xl transition">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 bg-purple-100 rounded-xl">
                    <Settings className="text-purple-600" size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Chất lượng Video</h3>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <p className="font-semibold text-gray-900 mb-2">Khuyến nghị:</p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-2 h-2 bg-indigo-600 rounded-full"></div>
                        <span className="text-gray-700">Độ phân giải: <strong>720p (HD)</strong> hoặc <strong>1080p (Full HD)</strong></span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-2 h-2 bg-indigo-600 rounded-full"></div>
                        <span className="text-gray-700">Tốc độ khung hình: <strong>30 FPS</strong></span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-2 h-2 bg-indigo-600 rounded-full"></div>
                        <span className="text-gray-700">Định dạng: <strong>.MP4, .AVI, .MOV</strong></span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                  <p className="text-xs text-indigo-600 font-bold">✨ AUTO CONVERT</p>
                  <p className="text-sm text-indigo-900 mt-1">
                    Hệ thống tự động chuyển video sang H.264 codec để đảm bảo tương thích
                  </p>
                </div>
              </div>

              {/* Obstacles */}
              <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100 hover:shadow-xl transition">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 bg-red-100 rounded-xl">
                    <AlertTriangle className="text-red-600" size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Chướng ngại vật</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="flex gap-3 items-start">
                    <XCircle className="text-red-500 flex-shrink-0 mt-1" size={20} />
                    <div>
                      <p className="text-gray-600 text-sm leading-relaxed">
                        <strong>Tránh:</strong> Cột nhà, màn hình máy chiếu lớn, tủ sách cao che khuất 
                        khung hình học sinh.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-3 items-start">
                    <CheckCircle2 className="text-green-500 flex-shrink-0 mt-1" size={20} />
                    <div>
                      <p className="text-gray-600 text-sm leading-relaxed">
                        <strong>Đảm bảo:</strong> Khung hình "sạch", thấy rõ ít nhất 80% diện tích 
                        lớp học và học sinh.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 font-medium">🎯 MỤC TIÊU</p>
                  <p className="text-sm text-gray-700 mt-1">
                    Mỗi học sinh chiếm ít nhất 3% khung hình
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Workflow */}
          <section id="workflow" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-green-100 rounded-xl">
                <Zap className="text-green-600" size={28} />
              </div>
              <div>
                <h2 className="text-3xl font-black text-gray-900">Quy trình 4 bước</h2>
                <p className="text-gray-600">Workflow - From Upload to Export</p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Step 1 */}
              <div className="bg-white rounded-2xl p-8 shadow-lg border-l-4 border-indigo-600">
                <div className="flex items-start gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg">
                      1
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <Upload className="text-indigo-600" size={24} />
                      <h3 className="text-2xl font-bold text-gray-900">Tải video lên</h3>
                    </div>
                    <p className="text-gray-600 mb-4 leading-relaxed">
                      Truy cập mục <strong>Dashboard</strong> hoặc <strong>My Videos</strong>, 
                      kéo thả video lớp học vào khu vực tải lên. Đợi video tải xong lên hệ thống.
                    </p>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></div>
                        Hệ thống tự động trích xuất metadata (độ dài, FPS)
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></div>
                        Tạo thumbnail tự động từ giây thứ 1
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></div>
                        Convert sang H.264 nếu cần (để phát trên browser)
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="bg-white rounded-2xl p-8 shadow-lg border-l-4 border-purple-600">
                <div className="flex items-start gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-16 h-16 bg-purple-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg">
                      2
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <Sparkles className="text-purple-600" size={24} />
                      <h3 className="text-2xl font-bold text-gray-900">Chạy Phân tích AI</h3>
                    </div>
                    <p className="text-gray-600 mb-4 leading-relaxed">
                      Tại trang <strong>My Videos</strong>, nhấn nút <strong>"🤖 Run AI"</strong> trên 
                      các video có trạng thái <span className="px-2 py-1 bg-gray-100 rounded text-sm font-mono">Uploaded</span>.
                    </p>
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <p className="text-sm text-purple-900 font-medium mb-2">⏱️ Thời gian xử lý:</p>
                      <p className="text-sm text-purple-800 leading-relaxed">
                        Thông thường bằng <strong>1/3 đến 1/2</strong> độ dài video thực tế 
                        (ví dụ: video 10 phút → xử lý khoảng 3-5 phút).
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="bg-white rounded-2xl p-8 shadow-lg border-l-4 border-blue-600">
                <div className="flex items-start gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg">
                      3
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <Eye className="text-blue-600" size={24} />
                      <h3 className="text-2xl font-bold text-gray-900">Xem và Chỉnh sửa</h3>
                    </div>
                    <p className="text-gray-600 mb-4 leading-relaxed">
                      Sau khi video chuyển sang trạng thái <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-sm font-mono">Done</span>, 
                      nhấn <strong>"👁️ View"</strong> để xem kết quả AI tạo ra.
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-blue-50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Eye className="text-blue-600" size={18} />
                          <p className="font-semibold text-blue-900 text-sm">View Mode</p>
                        </div>
                        <p className="text-xs text-blue-800">
                          Xem danh sách caption theo timeline, phát video kèm chú thích
                        </p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Edit className="text-blue-600" size={18} />
                          <p className="font-semibold text-blue-900 text-sm">Annotate Mode</p>
                        </div>
                        <p className="text-xs text-blue-800">
                          Sửa caption AI tạo sai, điều chỉnh thời gian chính xác
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="bg-white rounded-2xl p-8 shadow-lg border-l-4 border-green-600">
                <div className="flex items-start gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-16 h-16 bg-green-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg">
                      4
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <Download className="text-green-600" size={24} />
                      <h3 className="text-2xl font-bold text-gray-900">Xuất báo cáo</h3>
                    </div>
                    <p className="text-gray-600 mb-4 leading-relaxed">
                      Nhấn nút <strong>"📥 Export"</strong> để tải xuống dữ liệu caption.
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="text-green-600" size={20} />
                          <p className="font-bold text-green-900">.SRT File</p>
                        </div>
                        <p className="text-sm text-green-800">
                          Phụ đề chuẩn để ghép vào video (VLC, PotPlayer)
                        </p>
                      </div>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <FileSpreadsheet className="text-green-600" size={20} />
                          <p className="font-bold text-green-900">.CSV File</p>
                        </div>
                        <p className="text-sm text-green-800">
                          Dữ liệu dạng bảng để phân tích, làm báo cáo
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Action Vocabulary */}
          <section id="actions" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-orange-100 rounded-xl">
                <BookOpen className="text-orange-600" size={28} />
              </div>
              <div>
                <h2 className="text-3xl font-black text-gray-900">Từ điển Hành vi</h2>
                <p className="text-gray-600">Action Vocabulary - What AI Can Detect</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
              <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-8 py-6">
                <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                  <CheckCircle2 size={28} />
                  Hành động học tập tích cực
                </h3>
                <p className="text-green-50 mt-2">Positive Learning Activities</p>
              </div>
              
              <div className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { action: "Writing / Note-taking", desc: "Ghi chép bài, viết vở", icon: "✍️" },
                    { action: "Reading", desc: "Đọc sách, đọc tài liệu", icon: "📖" },
                    { action: "Raising Hand", desc: "Giơ tay phát biểu, hỏi bài", icon: "🙋" },
                    { action: "Discussing", desc: "Thảo luận nhóm, trao đổi", icon: "💬" },
                    { action: "Listening", desc: "Lắng nghe giáo viên giảng bài", icon: "👂" },
                    { action: "Presenting", desc: "Lên bảng trình bày", icon: "🎤" }
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-start gap-4 p-4 bg-green-50 rounded-xl border border-green-200 hover:shadow-md transition">
                      <div className="text-3xl">{item.icon}</div>
                      <div>
                        <p className="font-bold text-gray-900">{item.action}</p>
                        <p className="text-sm text-gray-600 mt-1">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden mt-6">
              <div className="bg-gradient-to-r from-red-500 to-orange-600 px-8 py-6">
                <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                  <AlertTriangle size={28} />
                  Hành động thiếu tập trung
                </h3>
                <p className="text-red-50 mt-2">Off-Task Behaviors</p>
              </div>
              
              <div className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { action: "Using Phone", desc: "Sử dụng điện thoại trong giờ học", icon: "📱" },
                    { action: "Sleeping / Resting head", desc: "Gục đầu xuống bàn, ngủ gật", icon: "😴" },
                    { action: "Turning around", desc: "Quay người nói chuyện bàn dưới", icon: "🔄" },
                    { action: "Looking away", desc: "Nhìn ra ngoài cửa sổ, mất tập trung", icon: "👀" }
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-start gap-4 p-4 bg-red-50 rounded-xl border border-red-200 hover:shadow-md transition">
                      <div className="text-3xl">{item.icon}</div>
                      <div>
                        <p className="font-bold text-gray-900">{item.action}</p>
                        <p className="text-sm text-gray-600 mt-1">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-r-xl mt-6">
              <div className="flex gap-3">
                <Lightbulb className="text-blue-600 flex-shrink-0" size={24} />
                <div>
                  <h4 className="font-bold text-blue-900 mb-2">Mô hình AI được huấn luyện</h4>
                  <p className="text-blue-800 text-sm leading-relaxed">
                    Hệ thống sử dụng Computer Vision models (YOLOv8, OpenPose) để phát hiện tư thế, 
                    hành động và các object (sách, điện thoại, bút). Độ chính xác trung bình: <strong>85-92%</strong> 
                    với video đạt tiêu chuẩn.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 4: FAQ */}
          <section id="faq" className="scroll-mt-24 pb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-pink-100 rounded-xl">
                <MessageSquare className="text-pink-600" size={28} />
              </div>
              <div>
                <h2 className="text-3xl font-black text-gray-900">Câu hỏi thường gặp</h2>
                <p className="text-gray-600">Frequently Asked Questions</p>
              </div>
            </div>

            <div className="space-y-4">
              {[
                {
                  q: "Quá trình phân tích AI mất bao lâu?",
                  a: "Thông thường, thời gian xử lý bằng 1/3 đến 1/2 độ dài thực tế của video (tùy thuộc vào cấu hình server GPU hiện tại). Ví dụ: video 10 phút sẽ mất khoảng 3-5 phút để phân tích."
                },
                {
                  q: "Tại sao tôi bấm vào Video lại bị màn hình đen?",
                  a: "Nếu video vừa tải lên bị màn hình đen, hãy thử làm mới (F5) trình duyệt. Đảm bảo video đã được convert sang định dạng H.264 (hệ thống tự động làm điều này khi upload)."
                },
                {
                  q: "Tôi có thể ghép các đoạn caption do AI tạo ra thẳng vào video không?",
                  a: "Có, bạn có thể xuất file dạng .SRT và dùng các trình phát video thông thường (như VLC, PotPlayer) để hiển thị chữ chạy cùng video. File .SRT được xuất theo chuẩn SubRip Subtitle."
                },
                {
                  q: "AI có thể nhận diện từng học sinh riêng lẻ không?",
                  a: "Hiện tại, hệ thống nhận diện hành động theo vùng (region-based) chứ chưa theo từng cá nhân cụ thể. Tuy nhiên, nếu video chất lượng cao và góc quay chuẩn, AI có thể phát hiện được 90% hành động trong lớp."
                },
                {
                  q: "Làm thế nào để cải thiện độ chính xác của AI?",
                  a: "Tuân thủ các tiêu chuẩn trong phần 'Best Practices': góc máy cao và rộng, ánh sáng đủ, video độ phân giải tối thiểu 720p. Video đạt chuẩn sẽ cho kết quả chính xác hơn 15-20%!"
                },
                {
                  q: "Tôi có thể chỉnh sửa caption AI tạo ra không?",
                  a: "Có! Sau khi AI phân tích xong, bạn vào chế độ 'Annotate' để sửa lại các caption sai, điều chỉnh thời gian, hoặc thêm caption mới. Hệ thống hỗ trợ annotation trực quan với timeline."
                },
                {
                  q: "Dữ liệu video của tôi có được bảo mật không?",
                  a: "Có. Tất cả video được lưu trữ trên MinIO server riêng với xác thực JWT. Chỉ người upload mới có quyền xem/sửa/xóa video của mình. Hệ thống không chia sẻ dữ liệu với bên thứ ba."
                }
              ].map((faq, index) => (
                <div key={index} className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
                  <button
                    onClick={() => toggleFaq(index)}
                    className="w-full px-8 py-6 flex items-center justify-between hover:bg-gray-50 transition text-left"
                  >
                    <h4 className="font-bold text-gray-900 text-lg pr-4">{faq.q}</h4>
                    {openFaq === index ? (
                      <ChevronDown className="text-indigo-600 flex-shrink-0" size={24} />
                    ) : (
                      <ChevronRight className="text-gray-400 flex-shrink-0" size={24} />
                    )}
                  </button>
                  
                  {openFaq === index && (
                    <div className="px-8 pb-6 pt-2 bg-gray-50 border-t border-gray-100">
                      <p className="text-gray-700 leading-relaxed">{faq.a}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Call to Action */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-3xl p-10 text-center text-white shadow-xl">
            <h2 className="text-3xl font-black mb-4">Sẵn sàng bắt đầu?</h2>
            <p className="text-xl text-indigo-100 mb-8 max-w-2xl mx-auto">
              Hãy thử upload video lớp học đầu tiên và trải nghiệm sức mạnh của AI!
            </p>
            <button
              onClick={() => navigate("/dashboard")}
              className="px-8 py-4 bg-white text-indigo-600 rounded-xl font-bold text-lg hover:shadow-2xl hover:scale-105 transition inline-flex items-center gap-3"
            >
              <Upload size={24} />
              Upload Video Ngay
              <ArrowRight size={20} />
            </button>
          </div>
        </main>
      </div>
    </div>
  );
};

// Arrow Icon Component
const ArrowRightIcon = ({ className }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M7.5 15L12.5 10L7.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default TutorialsPage;
