import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, Mail, Shield, CalendarDays, IdCard, PencilLine } from "lucide-react";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import axiosClient from "../../api/axiosClient";

const decodeJwtPayload = (token) => {
  try {
    if (!token || token.split(".").length < 2) return null;
    const base64Payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(window.atob(base64Payload));
    return payload;
  } catch {
    return null;
  }
};

const toDateInputValue = (dateValue) => {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const UserDetailPage = () => {
  const navigate = useNavigate();
  const localUser = useMemo(() => JSON.parse(localStorage.getItem("user") || "{}"), []);
  const token = localStorage.getItem("token");

  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [userDetail, setUserDetail] = useState({
    username: localUser.username || "",
    full_name: localUser.full_name || "",
    email: localUser.email || "",
    role: localUser.role || "user",
    dateOfBirth: "",
    _id: "",
  });
  const [formData, setFormData] = useState({
    full_name: localUser.full_name || "",
    email: localUser.email || "",
    dateOfBirth: "",
  });

  useEffect(() => {
    const fetchUserDetail = async () => {
      try {
        const payload = decodeJwtPayload(token);
        const userId = payload?.id;

        if (!userId) {
          setLoading(false);
          return;
        }

        const res = await axiosClient.get(`/users/${userId}`);
        if (res.data?.success && res.data?.result) {
          const latestUser = res.data.result;
          setUserDetail((prev) => ({ ...prev, ...latestUser }));
          setFormData({
            full_name: latestUser.full_name || "",
            email: latestUser.email || "",
            dateOfBirth: toDateInputValue(latestUser.dateOfBirth),
          });
        }
      } catch (error) {
        console.error("User detail fetch error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserDetail();
  }, [token]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleStartEdit = () => {
    setSaveError("");
    setSaveSuccess("");
    setFormData({
      full_name: userDetail.full_name || "",
      email: userDetail.email || "",
      dateOfBirth: toDateInputValue(userDetail.dateOfBirth),
    });
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setSaveError("");
    setSaveSuccess("");
    setFormData({
      full_name: userDetail.full_name || "",
      email: userDetail.email || "",
      dateOfBirth: toDateInputValue(userDetail.dateOfBirth),
    });
    setIsEditing(false);
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      setSaveError("");
      setSaveSuccess("");

      const payload = decodeJwtPayload(token);
      const userId = userDetail._id || payload?.id;

      if (!userId) {
        setSaveError("Không xác định được người dùng để cập nhật");
        return;
      }

      const updatePayload = {
        full_name: formData.full_name?.trim() || "",
        email: formData.email?.trim() || "",
        dateOfBirth: formData.dateOfBirth || null,
      };

      const res = await axiosClient.put(`/users/${userId}`, updatePayload);
      if (res.data?.success && res.data?.result) {
        const updatedUser = res.data.result;
        setUserDetail((prev) => ({ ...prev, ...updatedUser }));
        setFormData({
          full_name: updatedUser.full_name || "",
          email: updatedUser.email || "",
          dateOfBirth: toDateInputValue(updatedUser.dateOfBirth),
        });

        const localUserData = JSON.parse(localStorage.getItem("user") || "{}");
        localStorage.setItem(
          "user",
          JSON.stringify({
            ...localUserData,
            full_name: updatedUser.full_name || "",
            email: updatedUser.email || "",
            dateOfBirth: updatedUser.dateOfBirth || null,
          })
        );

        setSaveSuccess("Cập nhật hồ sơ thành công");
        setIsEditing(false);
      } else {
        setSaveError("Không thể cập nhật hồ sơ, vui lòng thử lại");
      }
    } catch (error) {
      setSaveError(error?.response?.data?.message || "Lỗi cập nhật hồ sơ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 text-gray-800 font-sans flex flex-col">
      <Header activePage="user-detail" />

      <main className="flex-1 max-w-[1000px] w-full mx-auto p-6 md:p-8 pt-36 md:pt-40">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
              title="Quay lại"
            >
              <ArrowLeft size={20} />
            </button>
            
            <div>
              <h1 className="text-2xl font-bold text-gray-900">User Detail</h1>
              <p className="text-sm text-gray-500">Thông tin tài khoản của bạn</p>
            </div>
          </div>

          {isEditing ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancelEdit}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-100 transition disabled:opacity-60"
                title="Hủy"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition disabled:opacity-60"
                title="Lưu"
              >
                {saving ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          ) : (
            <button
              onClick={handleStartEdit}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition"
              title="Edit Profile"
            >
              <PencilLine size={16} />
              Edit Profile
            </button>
          )}
        </div>

        {saveError ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {saveError}
          </div>
        ) : null}

        {saveSuccess ? (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {saveSuccess}
          </div>
        ) : null}

        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 md:p-8">
          {loading ? (
            <p className="text-gray-500">Đang tải thông tin người dùng...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-2"><User size={14} /> Họ và tên</p>
                {isEditing ? (
                  <input
                    type="text"
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleInputChange}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                    placeholder="Nhập họ và tên"
                  />
                ) : (
                  <p className="font-semibold text-gray-900">{userDetail.full_name || "N/A"}</p>
                )}
              </div>

              <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-2"><IdCard size={14} /> Username</p>
                <p className="font-semibold text-gray-900">{userDetail.username || "N/A"}</p>
              </div>

              <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-2"><Mail size={14} /> Email</p>
                {isEditing ? (
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                    placeholder="Nhập email"
                  />
                ) : (
                  <p className="font-semibold text-gray-900">{userDetail.email || "N/A"}</p>
                )}
              </div>

              <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-2"><Shield size={14} /> Role</p>
                <p className="font-semibold text-gray-900 uppercase">{userDetail.role || "user"}</p>
              </div>

              <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-2"><CalendarDays size={14} /> Ngày sinh</p>
                {isEditing ? (
                  <input
                    type="date"
                    name="dateOfBirth"
                    value={formData.dateOfBirth}
                    onChange={handleInputChange}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                  />
                ) : (
                  <p className="font-semibold text-gray-900">
                    {userDetail.dateOfBirth ? new Date(userDetail.dateOfBirth).toLocaleDateString("vi-VN") : "Chưa cập nhật"}
                  </p>
                )}
              </div>

              <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">User ID</p>
                <p className="font-semibold text-gray-900 break-all">{userDetail._id || "N/A"}</p>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default UserDetailPage;
