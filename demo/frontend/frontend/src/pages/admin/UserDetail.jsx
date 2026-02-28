import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Edit3, X, User, Shield, Mail, Calendar, Lock } from "lucide-react";
import axiosClient from "../../api/axiosClient";

const UserDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState({
    username: "",
    full_name: "",
    email: "",
    role: "user",
    dateOfBirth: "",
    nonLocked: true,
  });
  
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  const fetchUserDetail = useCallback(async () => {
    try {
      const res = await axiosClient.get(`/users/${id}`);
      if (res.data.success) {
        const userData = res.data.result;
        
        // Xử lý ngày tháng để hiển thị đúng trong input type="date"
        if (userData.dateOfBirth) {
            try {
                userData.dateOfBirth = new Date(userData.dateOfBirth).toISOString().split('T')[0];
            } catch {
                userData.dateOfBirth = "";
            }
        } else {
            userData.dateOfBirth = "";
        }

        setUser(userData);
      }
    } catch {
      alert("Không thể tải thông tin người dùng!");
      navigate("/admin/users");
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchUserDetail();
  }, [fetchUserDetail]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setUser({
      ...user,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const handleSave = async () => {
    try {
      // Chỉ gửi các trường được phép sửa, tránh gửi username/password/id
      const payload = {
          full_name: user.full_name,
          email: user.email,
          role: user.role,
          dateOfBirth: user.dateOfBirth,
          nonLocked: user.nonLocked
      };

      const res = await axiosClient.put(`/users/${id}`, payload);
      if (res.data.success) {
        alert("✅ Cập nhật thành công!");
        setIsEditing(false);
      }
    } catch (error) {
      alert("❌ Lỗi khi lưu: " + (error.response?.data?.message || "Lỗi server"));
    }
  };

  if (loading) return <div className="p-10 text-center text-gray-500">Đang tải thông tin...</div>;

  return (
    <div className="flex-1 p-6 bg-[#F5F7FB] min-h-screen animate-fade-in flex justify-center">
      <div className="bg-white shadow-lg rounded-2xl p-8 w-full max-w-3xl border border-gray-100">
        
        {/* HEADER */}
        <div className="flex justify-between items-center mb-8 border-b pb-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate(-1)} 
              className="p-2 hover:bg-gray-100 rounded-full transition text-gray-500"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-gray-800">
                {isEditing ? "Chỉnh sửa thông tin" : "Chi tiết người dùng"}
              </h2>
              <p className="text-sm text-gray-500">ID: {id}</p>
            </div>
          </div>

          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-lg shadow-indigo-200"
            >
              <Edit3 size={18} /> Chỉnh sửa
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => { setIsEditing(false); fetchUserDetail(); }}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                <X size={18} /> Hủy
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition shadow-lg shadow-green-200"
              >
                <Save size={18} /> Lưu thay đổi
              </button>
            </div>
          )}
        </div>

        {/* FORM */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Cột Trái */}
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-2">
                <User size={16} className="text-blue-500"/> Username
              </label>
              <input
                type="text"
                name="username"
                value={user.username || ""} 
                disabled={true}
                className="w-full p-3 border rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed font-medium"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-2">
                <Shield size={16} className="text-purple-500"/> Họ và tên
              </label>
              <input
                type="text"
                name="full_name"
                value={user.full_name || ""} 
                onChange={handleChange}
                disabled={!isEditing}
                className={`w-full p-3 border rounded-lg outline-none transition ${isEditing ? 'focus:ring-2 focus:ring-indigo-500 bg-white' : 'bg-gray-50 text-gray-700'}`}
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-2">
                <Mail size={16} className="text-red-500"/> Email
              </label>
              <input
                type="email"
                name="email"
                value={user.email || ""}
                onChange={handleChange}
                disabled={!isEditing}
                className={`w-full p-3 border rounded-lg outline-none transition ${isEditing ? 'focus:ring-2 focus:ring-indigo-500 bg-white' : 'bg-gray-50 text-gray-700'}`}
              />
            </div>
          </div>

          {/* Cột Phải */}
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-2">
                <Lock size={16} className="text-gray-500"/> Mật khẩu
              </label>
              <input
                type="password"
                value="********"
                disabled={true}
                className="w-full p-3 border rounded-lg bg-gray-200 text-gray-500 cursor-not-allowed"
              />
              {isEditing && <p className="text-xs text-red-500 mt-1">* Mật khẩu không thể chỉnh sửa tại đây.</p>}
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-2">
                <Calendar size={16} className="text-green-500"/> Ngày sinh
              </label>
              <input
                type="date"
                name="dateOfBirth"
                value={user.dateOfBirth || ""}
                onChange={handleChange}
                disabled={!isEditing}
                className={`w-full p-3 border rounded-lg outline-none transition ${isEditing ? 'focus:ring-2 focus:ring-indigo-500 bg-white' : 'bg-gray-50 text-gray-700'}`}
              />
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-bold text-gray-700 mb-1">Vai trò</label>
                <select
                  name="role"
                  value={user.role || "user"}
                  onChange={handleChange}
                  disabled={!isEditing}
                  className={`w-full p-3 border rounded-lg outline-none transition ${isEditing ? 'bg-white' : 'bg-gray-50 appearance-none'}`}
                >
                  <option value="user">Học sinh (User)</option>
                  <option value="admin">Quản trị viên (Admin)</option>
                </select>
              </div>

              <div className="flex-1">
                <label className="block text-sm font-bold text-gray-700 mb-1">Trạng thái</label>
                <select
                  name="nonLocked"
                  value={user.nonLocked}
                  onChange={(e) => setUser({...user, nonLocked: e.target.value === 'true'})}
                  disabled={!isEditing}
                  className={`w-full p-3 border rounded-lg outline-none transition font-bold ${
                    user.nonLocked ? "text-green-600" : "text-red-600"
                  } ${isEditing ? 'bg-white' : 'bg-gray-50 appearance-none'}`}
                >
                  <option value="true">Hoạt động</option>
                  <option value="false">Đã khóa</option>
                </select>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default UserDetail;