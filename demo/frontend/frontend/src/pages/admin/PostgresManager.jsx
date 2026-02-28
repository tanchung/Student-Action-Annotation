import React, { useState, useEffect } from "react";
import axiosClient from "../../api/axiosClient";
import { 
  Database, ArrowLeft, ChevronRight, Table, Edit3, Save, X, FileVideo, Server, Search 
} from "lucide-react";

// --- CẤU HÌNH KHÓA CHÍNH ---
const PRIMARY_KEYS = {
  videos: "video_id",
  environments: "env_id",
  segments: "segment_id",
  persons: "person_id",        
  entity_objects: "object_id", 
  activities: "activity_id",
  interactions: "interaction_id",
  captions: "caption_id",     
  users: "user_id"
};

const PostgresManager = () => {
  // State
  const [step, setStep] = useState(1); 
  const [videos, setVideos] = useState([]);
  // eslint-disable-next-line no-unused-vars
  const [loading, setLoading] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null); 
  const [pgData, setPgData] = useState(null); 
  const [selectedTable, setSelectedTable] = useState(null);
  
  // Search State
  const [searchTerm, setSearchTerm] = useState("");

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingData, setEditingData] = useState({}); 
  const [originalId, setOriginalId] = useState(null);    
  const [currentIdField, setCurrentIdField] = useState(""); 

  const getFileNameFromUrl = (url) => { if(!url) return "Unknown"; try { return decodeURIComponent(url.split('/').pop()); } catch { return url; } };

  const isReadOnlyField = (key) => {
    const k = key.toLowerCase();
    if (["minio_url", "thumbnail_url", "created_at", "updated_at"].includes(k)) return true;
    if (k.endsWith("_id")) return true;
    if (k === "id") return true;
    if (k === currentIdField) return true;
    return false;
  };

  useEffect(() => { fetchVideos(); }, []);

  const fetchVideos = async () => {
    setLoading(true);
    try {
        const res = await axiosClient.get("/videos/list");
        if (res.data?.success) setVideos(res.data.data || []);
    } catch(e) { console.error(e); } finally { setLoading(false); }
  };

  const handleSelectVideo = async (video) => {
    setLoading(true);
    try {
      // Gửi _id lên API Postgres
      const res = await axiosClient.get(`/videos/${video._id}/postgres`);
      if (res.data?.success) { 
          setSelectedVideo(video); 
          setPgData(res.data.data); 
          setSearchTerm(""); 
          setStep(2); 
      }
    } catch(e) { alert("Lỗi tải data: " + (e.response?.data?.message || e.message)); } finally { setLoading(false); }
  };

  const handleSelectTable = (name) => { 
      setSelectedTable(name); 
      setSearchTerm(""); 
      setStep(3); 
  };
  
  const handleBack = () => { 
      setSearchTerm(""); 
      if(step===3){ setStep(2); setSelectedTable(null); } 
      else if(step===2){ setStep(1); setSelectedVideo(null); } 
  };

  const openEditModal = (item) => {
    const idField = PRIMARY_KEYS[selectedTable] || PRIMARY_KEYS[selectedTable.toLowerCase()] || "id";
    const idValue = item[idField];
    if (!idValue) { alert(`⚠️ Không tìm thấy khóa chính '${idField}'!`); return; }

    setCurrentIdField(idField);
    setOriginalId(idValue);
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
        tableName: selectedTable, 
        idField: currentIdField,   
        idValue: originalId,        
        updateData: editingData               
      };
      // Gọi đúng API update
      const res = await axiosClient.put("/videos/update-postgres", payload);
      if (res.data?.success) {
        alert("✅ Cập nhật PG thành công!");
        setIsEditModalOpen(false);
        await handleSelectVideo(selectedVideo); 
      } else { alert("⚠️ " + res.data.message); }
    } catch { alert("❌ Server Error"); }
  };

  const renderInput = (key, value) => {
      const isLocked = isReadOnlyField(key);
      const valType = typeof value;
      return (
        <div key={key} className="flex flex-col">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex justify-between">
                {key} {isLocked && <span className="text-red-500 text-[10px] bg-red-50 px-1 rounded">LOCKED</span>}
            </label>
            <input 
               type={valType === 'number' ? 'number' : 'text'}
               disabled={isLocked}
               value={value === null ? '' : value}
               onChange={(e) => handleInputChange(key, valType === 'number' ? parseFloat(e.target.value) : e.target.value)}
               className={`w-full p-2 text-sm border rounded outline-none ${isLocked ? 'bg-gray-100 text-gray-400 cursor-not-allowed select-none' : 'bg-white focus:ring-2 focus:ring-blue-500'}`}
            />
        </div>
      );
  };

  // --- LOGIC LỌC ---
  const filteredVideos = videos.filter(v => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const name = (v.clip_name || getFileNameFromUrl(v.minio_url)).toLowerCase();
      // Sử dụng _id để lọc
      const id = v._id?.toLowerCase() || "";
      return name.includes(term) || id.includes(term);
  });

  const getFilteredData = () => {
    const rawData = pgData[selectedTable] || [];
    if (!searchTerm) return rawData;
    return rawData.filter(item => JSON.stringify(item).toLowerCase().includes(searchTerm.toLowerCase()));
  };

  const filteredList = step === 3 ? getFilteredData() : [];

  return (
    <div className="space-y-6 animate-fade-in p-2 relative">
       {/* HEADER */}
       <div className="flex justify-between border-b pb-4">
          <div>
             <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Server className="text-blue-600"/> Quản lý PostgreSQL</h2>
             <p className="text-sm text-gray-500">{step > 1 && selectedVideo && (selectedVideo.clip_name || getFileNameFromUrl(selectedVideo.minio_url))}</p>
          </div>
          {step > 1 && <button onClick={handleBack} className="border px-4 py-2 rounded flex gap-2 items-center"><ArrowLeft size={16}/> Back</button>}
       </div>

       {/* STEP 1: VIDEOS */}
       {step === 1 && (
          <div className="bg-white rounded-xl shadow border overflow-hidden">
             <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                 <span className="font-bold text-gray-700">Danh sách Video ({filteredVideos.length})</span>
                 <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input 
                        type="text" 
                        placeholder="Tìm ID, Tên..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                 </div>
             </div>

             <table className="w-full text-left">
                <thead className="bg-white border-b text-gray-500 text-xs uppercase"><tr><th className="p-4">ID</th><th className="p-4">Tên Clip</th><th className="p-4">Action</th></tr></thead>
                <tbody>
                   {filteredVideos.length > 0 ? (
                       filteredVideos.map(v => (
                          <tr key={v._id} onClick={() => handleSelectVideo(v)} className="hover:bg-blue-50 cursor-pointer border-b last:border-0 transition">
                             <td className="p-4 text-blue-600 font-mono font-bold text-sm">{v._id}</td>
                             <td className="p-4 flex gap-2 items-center text-sm">
                                 <FileVideo size={16} className="text-gray-400"/>
                                 {v.clip_name || getFileNameFromUrl(v.minio_url)}
                             </td>
                             <td className="p-4"><ChevronRight size={18} className="text-gray-400"/></td>
                          </tr>
                       ))
                   ) : (
                       <tr><td colSpan="3" className="p-8 text-center text-gray-400">Không tìm thấy video nào.</td></tr>
                   )}
                </tbody>
             </table>
          </div>
       )}

       {/* STEP 2: TABLES */}
       {step === 2 && pgData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             {Object.keys(pgData).map(name => (
                <div key={name} onClick={() => handleSelectTable(name)} className="bg-white p-6 rounded-xl border shadow-sm hover:border-blue-400 cursor-pointer flex justify-between">
                   <div className="flex gap-3 items-center"><Table className="text-blue-600"/><h3 className="font-bold capitalize">{name}</h3></div>
                   <span className="text-xs text-gray-500">{pgData[name]?.length} rows</span>
                </div>
             ))}
          </div>
       )}

       {/* STEP 3: DATA LIST & EDIT */}
       {step === 3 && pgData && (
           <div className="bg-gray-50 p-4 rounded-xl border min-h-[500px]">
              <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                 <div className="flex items-center gap-2">
                     <h3 className="font-bold text-gray-700 uppercase">Bảng: {selectedTable}</h3>
                     <span className="text-xs bg-gray-200 px-2 py-0.5 rounded text-gray-600 font-mono">Total: {pgData[selectedTable]?.length || 0}</span>
                 </div>
                 <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input 
                        type="text" 
                        placeholder="Tìm trong bảng này..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                    />
                 </div>
              </div>
              
              <div className="grid gap-3">
                 {filteredList.length > 0 ? (
                     filteredList.map((item, idx) => {
                        const idKey = PRIMARY_KEYS[selectedTable] || 'id';
                        return (
                            <div key={idx} className="bg-white p-3 rounded shadow-sm border flex justify-between items-center group hover:border-blue-300 transition">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <span className="text-sm font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 font-mono whitespace-nowrap">
                                        {idKey}: {item[idKey] || "N/A"}
                                    </span>
                                    <span className="text-sm text-gray-500 truncate">
                                        {item.name || item.activity_name || item.object_name || item.role || item.caption_text || "..."}
                                    </span>
                                </div>
                                <button onClick={() => openEditModal(item)} className="text-xs border border-gray-300 px-3 py-1.5 rounded hover:bg-blue-600 hover:text-white flex gap-1 transition ml-2 whitespace-nowrap">
                                    <Edit3 size={12}/> Edit
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

       {/* MODAL FORM */}
       {isEditModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
             <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-4 border-b bg-gray-50 flex justify-between rounded-t-xl">
                   <h3 className="font-bold text-blue-700">Sửa Bảng: {selectedTable}</h3>
                   <button onClick={() => setIsEditModalOpen(false)}><X/></button>
                </div>
                <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.keys(editingData).map(key => renderInput(key, editingData[key]))}
                   </div>
                </div>
                <div className="p-4 border-t flex justify-end gap-2 rounded-b-xl">
                   <button onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded">Hủy</button>
                   <button onClick={handleSaveChanges} className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Lưu thay đổi</button>
                </div>
             </div>
          </div>
       )}
    </div>
  );
};

export default PostgresManager;