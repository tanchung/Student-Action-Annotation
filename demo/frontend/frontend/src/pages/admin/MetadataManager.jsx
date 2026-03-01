import React, { useState, useEffect } from "react";
import axiosClient from "../../api/axiosClient";
import { 
  Database, ArrowLeft, ChevronRight, Layers, Edit3, Save, X, FileVideo, Search, Trash2, AlertCircle
} from "lucide-react";

// --- CẤU HÌNH HIỂN THỊ ID ---
const MONGO_DISPLAY_KEYS = {
  video: "_id",
  environment: "env_id",
  segment: "segment_id",
  person: "person_id",
  entity_object: "object_id",
  activity: "activity_id",
  interaction: "interaction_id",
  caption: "caption_id"
};

const MetadataManager = () => {
  // State
  const [step, setStep] = useState(1); 
  const [videos, setVideos] = useState([]);
  // eslint-disable-next-line no-unused-vars
  const [loading, setLoading] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null); 
  const [fullMetadata, setFullMetadata] = useState(null);   
  const [selectedCollection, setSelectedCollection] = useState(null);
  
  // Search State
  const [searchTerm, setSearchTerm] = useState("");

  // Edit State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingData, setEditingData] = useState({});
  const [originalId, setOriginalId] = useState(null);
  
  // Delete State
  const [showDeleted, setShowDeleted] = useState(false); // Toggle để xem video đã xóa    

  // Helper
  const getFileNameFromUrl = (url) => { 
      if (!url) return "Unknown";
      try { return decodeURIComponent(url.split('/').pop()); } catch { return url; } 
  };

  const isReadOnlyField = (key) => {
    const k = key.toLowerCase();
    if (["minio_url", "thumbnail_url", "created_at", "createdat", "updatedat", "__v"].includes(k)) return true;
    if (k === "_id" || k === "id") return true;
    if (Object.values(MONGO_DISPLAY_KEYS).includes(key)) return true;
    return false;
  };

  const fetchVideos = async () => {
    setLoading(true);
    try {
      // Thêm query param để lấy video đã xóa nếu showDeleted = true
      const url = showDeleted ? "/videos/list?show_deleted=true" : "/videos/list";
      const res = await axiosClient.get(url);
      if (res.data?.success) setVideos(res.data.data || []);
    } catch(e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { 
    fetchVideos(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDeleted]); // Only re-fetch when showDeleted changes

  const handleSelectVideo = async (video) => {
    setLoading(true);
    try {
      // SỬ DỤNG _id GỐC
      const res = await axiosClient.get(`/videos/${video._id}/full`);
      if (res.data?.success) { 
          setSelectedVideo(video); 
          setFullMetadata(res.data.data); 
          setSearchTerm(""); 
          setStep(2); 
      }
    } catch(e) { alert("Lỗi tải data: " + (e.response?.data?.message || e.message)); } finally { setLoading(false); }
  };

  const handleSelectCollection = (name) => { 
      setSelectedCollection(name); 
      setSearchTerm(""); 
      setStep(3); 
  };
  
  const handleBack = () => { 
      setSearchTerm(""); 
      if(step===3){ setStep(2); setSelectedCollection(null); } 
      else if(step===2){ setStep(1); setSelectedVideo(null); setFullMetadata(null); } 
  };

  const openEditModal = (item) => {
    setOriginalId(item._id);
    setEditingData({ ...item }); 
    setIsEditModalOpen(true);
  };

  const handleInputChange = (key, value) => {
    setEditingData(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveChanges = async () => {
    setLoading(true);
    try {
      const payload = {
        collectionName: selectedCollection,
        idField: "_id",
        idValue: originalId,
        updateData: editingData
      };
      // Gọi đúng API endpoint cập nhật
      const res = await axiosClient.put("/videos/update-metadata", payload);
      if (res.data?.success) {
        alert("✅ Cập nhật thành công!");
        setIsEditModalOpen(false);
        await handleSelectVideo(selectedVideo);
      } else { alert("⚠️ " + res.data.message); }
    } catch { alert("❌ Lỗi Server"); }
  };

  const handleSoftDelete = async (video, e) => {
    e.stopPropagation(); // Prevent row click
    
    if (!window.confirm(`⚠️ Bạn có chắc muốn xóa video "${video.clip_name || 'Untitled'}"?\n\n` +
      "Video sẽ được đánh dấu là đã xóa (soft delete) trong MongoDB, PostgreSQL và Neo4j.\n" +
      "Bạn có thể xem lại trong mục 'Video đã xóa'.")) {
      return;
    }

    setLoading(true);
    try {
      const res = await axiosClient.post(`/videos/${video._id}/soft-delete`);
      if (res.data?.success) {
        alert("✅ Đã xóa video thành công!");
        await fetchVideos(); // Refresh danh sách
      } else {
        alert("⚠️ " + res.data.message);
      }
    } catch (error) {
      alert("❌ Lỗi khi xóa video: " + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (video, e) => {
    e.stopPropagation(); // Prevent row click
    
    if (!window.confirm(`✅ Bạn có chắc muốn khôi phục video "${video.clip_name || 'Untitled'}"?\n\n` +
      "Video sẽ được khôi phục trong MongoDB, PostgreSQL và Neo4j.")) {
      return;
    }

    setLoading(true);
    try {
      const res = await axiosClient.post(`/videos/${video._id}/restore`);
      if (res.data?.success) {
        alert("✅ Đã khôi phục video thành công!");
        await fetchVideos(); // Refresh danh sách
      } else {
        alert("⚠️ " + res.data.message);
      }
    } catch (error) {
      alert("❌ Lỗi khi khôi phục video: " + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const renderFormInput = (key, value) => {
    const isLocked = isReadOnlyField(key); 
    const valueType = typeof value;

    if (valueType === 'object' && value !== null) {
      return (
        <div key={key} className="col-span-full">
           <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{key} (JSON)</label>
           <textarea 
             disabled={isLocked}
             className={`w-full p-2 text-sm border rounded font-mono h-24 ${isLocked ? 'bg-gray-200 cursor-not-allowed' : 'bg-white'}`}
             value={JSON.stringify(value, null, 2)}
             onChange={(e) => { try { handleInputChange(key, JSON.parse(e.target.value)); } catch{ /* Invalid JSON */ } }}
           />
        </div>
      );
    }
    return (
      <div key={key} className="flex flex-col">
        <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex justify-between">
          {key} {isLocked && <span className="text-red-500 text-[10px] bg-red-50 px-1 rounded">LOCKED</span>}
        </label>
        <input
          type={valueType === 'number' ? 'number' : 'text'}
          disabled={isLocked}
          value={value === null || value === undefined ? '' : value}
          onChange={(e) => handleInputChange(key, valueType === 'number' ? parseFloat(e.target.value) : e.target.value)}
          className={`w-full p-2.5 text-sm border rounded-lg outline-none transition ${isLocked ? "bg-gray-100 text-gray-500 cursor-not-allowed" : "bg-white border-gray-300 focus:ring-2 focus:ring-indigo-500"}`}
        />
      </div>
    );
  };

  // --- LOGIC LỌC DỮ LIỆU ---
  const filteredVideos = videos.filter(v => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const name = (v.clip_name || getFileNameFromUrl(v.minio_url)).toLowerCase();
      // Sử dụng _id để lọc
      const id = v._id?.toLowerCase() || "";
      return name.includes(term) || id.includes(term);
  });

  const getFilteredData = () => {
      const rawData = fullMetadata?.related_data[selectedCollection] || [];
      if (!searchTerm) return rawData;
      return rawData.filter(item => JSON.stringify(item).toLowerCase().includes(searchTerm.toLowerCase()));
  };

  const filteredList = step === 3 ? getFilteredData() : [];

  return (
    <div className="space-y-6 animate-fade-in p-2 relative">
       {/* HEADER */}
       <div className="flex justify-between border-b pb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Database className="text-indigo-600"/> 
              Quản lý Metadata (Mongo)
            </h2>
            <p className="text-sm text-gray-500">
                {step > 1 && selectedVideo && (selectedVideo.clip_name || getFileNameFromUrl(selectedVideo.minio_url))}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {step === 1 && (
              <button 
                onClick={() => setShowDeleted(!showDeleted)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
                  showDeleted 
                    ? "bg-red-600 text-white hover:bg-red-700" 
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                <Trash2 size={16} />
                {showDeleted ? "Xem video thường" : "Video đã xóa"}
              </button>
            )}
            {step > 1 && (
              <button onClick={handleBack} className="border px-4 py-2 rounded flex gap-2 items-center">
                <ArrowLeft size={16}/> Quay lại
              </button>
            )}
          </div>
       </div>

       {/* STEP 1: VIDEOS */}
       {step === 1 && (
          <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
             <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                 <span className="font-bold text-gray-700 flex items-center gap-2">
                   Danh sách Video ({filteredVideos.length})
                   {showDeleted && (
                     <span className="bg-red-100 text-red-600 text-xs px-2 py-1 rounded-full font-semibold">
                       Đã xóa
                     </span>
                   )}
                 </span>
                 <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input 
                        type="text" placeholder="Tìm ID, Tên..." value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                 </div>
             </div>
             <table className="w-full text-left">
                <thead className="bg-white border-b text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="p-4">ID</th>
                    <th className="p-4">Tên Clip</th>
                    <th className="p-4">Hành động</th>
                    <th className="p-4"></th>
                  </tr>
                </thead>
                <tbody>
                   {filteredVideos.length > 0 ? (
                       filteredVideos.map(v => (
                          <tr key={v._id} className="hover:bg-indigo-50 border-b last:border-0 transition">
                             {/* HIỂN THỊ _id GỐC */}
                             <td className="p-4 text-indigo-600 font-mono font-bold text-sm">{v._id}</td>
                             <td className="p-4">
                               <div className="flex gap-2 items-center text-sm">
                                 <FileVideo size={16} className="text-gray-400"/> 
                                 {v.clip_name || getFileNameFromUrl(v.minio_url)}
                                 {v.is_deleted && (
                                   <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                                     <AlertCircle size={12} /> Đã xóa
                                   </span>
                                 )}
                               </div>
                             </td>
                             <td className="p-4">
                               {showDeleted ? (
                                 <button
                                   onClick={(e) => handleRestore(v, e)}
                                   className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded hover:bg-green-600 hover:text-white transition"
                                 >
                                   <Save size={14}/> Khôi phục
                                 </button>
                               ) : (
                                 <button
                                   onClick={(e) => handleSoftDelete(v, e)}
                                   className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-600 hover:text-white transition"
                                 >
                                   <Trash2 size={14}/> Xóa
                                 </button>
                               )}
                             </td>
                             <td className="p-4 cursor-pointer" onClick={() => handleSelectVideo(v)}>
                               <ChevronRight size={18} className="text-gray-400"/>
                             </td>
                          </tr>
                       ))
                   ) : (
                       <tr>
                         <td colSpan="4" className="p-8 text-center text-gray-400">
                           {showDeleted ? "Không có video nào đã xóa." : "Không tìm thấy video nào."}
                         </td>
                       </tr>
                   )}
                </tbody>
             </table>
          </div>
       )}

       {/* STEP 2: COLLECTIONS */}
       {step === 2 && fullMetadata && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             {Object.keys(fullMetadata.related_data).map(name => (
                <div key={name} onClick={() => handleSelectCollection(name)} className="bg-white p-6 rounded-xl border shadow-sm hover:border-indigo-400 cursor-pointer flex justify-between">
                   <div className="flex gap-3 items-center"><Layers className="text-indigo-600"/><h3 className="capitalize font-bold">{name}</h3></div>
                   <span className="text-xs text-gray-500">{fullMetadata.related_data[name]?.length} rows</span>
                </div>
             ))}
          </div>
       )}

       {/* STEP 3: DATA LIST */}
       {step === 3 && fullMetadata && (
        <div className="bg-gray-50 min-h-[500px] rounded-xl border border-gray-200 p-4">
          <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
             <div className="flex items-center gap-2">
                 <h3 className="font-bold text-gray-700 uppercase">Collection: {selectedCollection}</h3>
                 <span className="text-xs bg-gray-200 px-2 py-0.5 rounded text-gray-600 font-mono">Total: {fullMetadata.related_data[selectedCollection]?.length || 0}</span>
             </div>
             <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input type="text" placeholder="Tìm trong bảng này..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
                />
             </div>
          </div>
          <div className="grid gap-3">
            {filteredList.length > 0 ? (
                filteredList.map((item, index) => {
                const idKey = MONGO_DISPLAY_KEYS[selectedCollection] || '_id';
                const displayId = item[idKey] || "N/A";
                return (
                    <div key={index} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex justify-between items-center hover:border-indigo-400 hover:shadow-md transition group">
                        <div className="flex items-center gap-3 overflow-hidden">
                            <span className="font-mono font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded text-xs whitespace-nowrap">{idKey}: {displayId}</span>
                            <span className="text-sm text-gray-500 truncate">
                                {item.name || item.role || item.activity_name || item.object_name || item.caption_text || item.description || "..."}
                            </span>
                        </div>
                        <button onClick={() => openEditModal(item)} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-indigo-600 hover:text-white transition whitespace-nowrap ml-2">
                           <Edit3 size={14}/> Sửa
                        </button>
                    </div>
                );
                })
            ) : (
                <div className="text-center py-10 bg-white border border-dashed rounded text-gray-400">Không tìm thấy kết quả.</div>
            )}
          </div>
        </div>
       )}

       {/* MODAL EDIT */}
       {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b bg-gray-50 flex justify-between rounded-t-xl">
               <h3 className="font-bold text-gray-800 flex items-center gap-2"><Edit3 size={18} className="text-indigo-600"/> Sửa Document</h3>
               <button onClick={() => setIsEditModalOpen(false)}><X size={20} className="text-gray-400 hover:text-red-500"/></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.keys(editingData).map(key => renderFormInput(key, editingData[key]))}
               </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-2 rounded-b-xl bg-white">
               <button onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Hủy</button>
               <button onClick={handleSaveChanges} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Lưu thay đổi</button>
            </div>
          </div>
        </div>
       )}
    </div>
  );
};

export default MetadataManager;