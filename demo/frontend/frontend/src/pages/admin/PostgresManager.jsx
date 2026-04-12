import React, { useState, useEffect } from "react";
import axiosClient from "../../api/axiosClient";
import { 
  Database, ArrowLeft, ChevronRight, Table, Edit3, Save, X, Image as ImageIcon, Server, Search, Trash2 
} from "lucide-react";

// --- CẤU HÌNH KHÓA CHÍNH ---
const PRIMARY_KEYS = {
  images: "image_id",
  environments: "env_id",
  persons: "person_id",        
  entity_objects: "object_id", 
  activities: "activity_id",
  captions: "caption_id"
};

const PostgresManager = () => {
  // State
  const [step, setStep] = useState(1); 
  const [images, setImages] = useState([]);
  // eslint-disable-next-line no-unused-vars
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null); 
  const [pgData, setPgData] = useState(null); 
  const [selectedTable, setSelectedTable] = useState(null);
  
  // Search State
  const [searchTerm, setSearchTerm] = useState("");

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingData, setEditingData] = useState({}); 
  const [originalId, setOriginalId] = useState(null);    
  const [currentIdField, setCurrentIdField] = useState(""); 
  
  // Delete State
  const [showDeleted, setShowDeleted] = useState(false);

  const getFileNameFromUrl = (url) => { if(!url) return "Unknown"; try { return decodeURIComponent(url.split('/').pop()); } catch { return url; } };

  const isReadOnlyField = (key) => {
    const k = key.toLowerCase();
    if (["minio_url", "thumbnail_url", "created_at", "updated_at"].includes(k)) return true;
    if (k.endsWith("_id")) return true;
    if (k === "id") return true;
    if (k === currentIdField) return true;
    return false;
  };

  const fetchImages = async () => {
    setLoading(true);
    try {
        const url = showDeleted ? "/images/list?show_deleted=true" : "/images/list";
        const res = await axiosClient.get(url);
        if (res.data?.success) setImages(res.data.data || []);
    } catch(e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { 
    fetchImages(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDeleted]);

  const handleSelectImage = async (image) => {
    setLoading(true);
    try {
      // Gửi _id lên API Postgres
      const res = await axiosClient.get(`/images/${image._id}/postgres`);
      if (res.data?.success) { 
          setSelectedImage(image); 
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
      else if(step===2){ setStep(1); setSelectedImage(null); } 
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
      const res = await axiosClient.put("/images/update-postgres", payload);
      if (res.data?.success) {
        alert("✅ Cập nhật PG thành công!");
        setIsEditModalOpen(false);
        await handleSelectImage(selectedImage); 
      } else { alert("⚠️ " + res.data.message); }
    } catch { alert("❌ Server Error"); }
  };

  const handleSoftDelete = async (image, e) => {
    e.stopPropagation();
    
    if (!window.confirm(`⚠️ Bạn có chắc muốn xóa hình ảnh "${image.image_name || 'Untitled'}"?\n\n` +
      "Hình ảnh sẽ được đánh dấu là đã xóa (soft delete) trong MongoDB, PostgreSQL và Neo4j.\n" +
      "Bạn có thể xem lại trong mục 'Hình ảnh đã xóa'.")) {
      return;
    }

    setLoading(true);
    try {
      const res = await axiosClient.post(`/images/${image._id}/soft-delete`);
      if (res.data?.success) {
        alert("✅ Đã xóa hình ảnh thành công!");
        await fetchImages();
      } else {
        alert("⚠️ " + res.data.message);
      }
    } catch (error) {
      alert("❌ Lỗi khi xóa hình ảnh: " + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (image, e) => {
    e.stopPropagation();
    
    if (!window.confirm(`✅ Bạn có chắc muốn khôi phục hình ảnh "${image.image_name || 'Untitled'}"?\n\n` +
      "Hình ảnh sẽ được khôi phục trong MongoDB, PostgreSQL và Neo4j.")) {
      return;
    }

    setLoading(true);
    try {
      const res = await axiosClient.post(`/images/${image._id}/restore`);
      if (res.data?.success) {
        alert("✅ Đã khôi phục hình ảnh thành công!");
        await fetchImages();
      } else {
        alert("⚠️ " + res.data.message);
      }
    } catch (error) {
      alert("❌ Lỗi khi khôi phục hình ảnh: " + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
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
  const filteredImages = images.filter(v => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const name = (v.image_name || getFileNameFromUrl(v.minio_url)).toLowerCase();
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
             <p className="text-sm text-gray-500">{step > 1 && selectedImage && (selectedImage.image_name || getFileNameFromUrl(selectedImage.minio_url))}</p>
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
                {showDeleted ? "Xem hình ảnh thường" : "Hình ảnh đã xóa"}
              </button>
            )}
            {step > 1 && <button onClick={handleBack} className="border px-4 py-2 rounded flex gap-2 items-center"><ArrowLeft size={16}/> Back</button>}
          </div>
       </div>

       {/* STEP 1: IMAGES */}
       {step === 1 && (
          <div className="bg-white rounded-xl shadow border overflow-hidden">
             <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                 <div className="flex gap-3 items-center">
                   <span className="font-bold text-gray-700 flex items-center gap-2">
                     Danh sách Hình ảnh ({filteredImages.length})
                     {showDeleted && (
                       <span className="bg-red-100 text-red-600 text-xs px-2 py-1 rounded-full font-semibold">
                         Đã xóa
                       </span>
                     )}
                   </span>
                 </div>
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
                <thead className="bg-white border-b text-gray-500 text-xs uppercase"><tr><th className="p-4">ID</th><th className="p-4">Tên Hình ảnh</th><th className="p-4">Hành động</th><th className="p-4"></th></tr></thead>
                <tbody>
                   {filteredImages.length > 0 ? (
                       filteredImages.map(v => (
                          <tr key={v._id} className="hover:bg-blue-50 border-b last:border-0 transition">
                             <td className="p-4 text-blue-600 font-mono font-bold text-sm">{v._id}</td>
                             <td className="p-4">
                                 <div className="flex gap-2 items-center text-sm">
                                   <ImageIcon size={16} className="text-gray-400"/>
                                   {v.image_name || getFileNameFromUrl(v.minio_url)}
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
                             <td className="p-4 cursor-pointer" onClick={() => handleSelectImage(v)}><ChevronRight size={18} className="text-gray-400"/></td>
                          </tr>
                       ))
                   ) : (
                       <tr><td colSpan="4" className="p-8 text-center text-gray-400">{showDeleted ? "Không có hình ảnh nào đã xóa." : "Không tìm thấy hình ảnh nào."}</td></tr>
                   )}
                </tbody>
             </table>
          </div>
       )}

       {/* STEP 2: TABLES */}
       {step === 2 && pgData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           {Object.keys(pgData)
            .filter((name) => !["interactions", "interaction_members"].includes(name))
            .map(name => (
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