import React, { useState, useEffect, useCallback } from "react";
import {
  Users, Eye, Trash2, ChevronLeft, ChevronRight, Plus, ArrowUp, ArrowDown, Shield
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import axiosClient from "../../api/axiosClient";

export default function UserManager({ roleType = "user", pageTitle = "Quản lý người dùng" }) {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Sort & Pagination
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDir, setSortDir] = useState("desc");
  const [pageNumber, setPageNumber] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 10;

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      
      const params = {
        page: pageNumber,
        limit: pageSize,
        role: roleType, 
        search: search,
        sortBy: sortBy,
        sortDir: sortDir
      };

      const res = await axiosClient.get("/users", { params });
      
      if (res.data.success) {
        setUsers(res.data.result.content || []);
        setTotalPages(res.data.result.page.totalPages || 1);
      }
    } catch {
      console.error("Error fetching users:");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [pageNumber, pageSize, roleType, search, sortBy, sortDir]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    setPageNumber(1);
  }, [search]);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortDir("asc");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Bạn có chắc muốn xoá tài khoản này?")) return;
    try {
      await axiosClient.delete(`/users/${id}`);
      alert("Đã xoá thành công!");
      fetchUsers();
    } catch {
      alert("Lỗi khi xoá!");
    }
  };

  return (
    <div className="flex-1 p-6 bg-[#F5F7FB] min-h-screen text-gray-800 animate-fade-in">
      <div className="bg-white shadow-md rounded-2xl p-5 mb-5">
        
        {/* HEADER */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${roleType === 'admin' ? 'bg-purple-100' : 'bg-blue-100'}`}>
              {roleType === 'admin' ? <Shield className="text-purple-600" /> : <Users className="text-blue-600" />}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-700">{pageTitle}</h2>
              <p className="text-sm text-gray-500">
                 Danh sách {roleType === 'admin' ? 'Quản trị viên' : 'Học sinh'}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate("/admin/create-user", { state: { role: roleType } })}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 transition"
          >
            <Plus size={16} /> Thêm mới
          </button>
        </div>

        {/* TOOLBAR */}
        <div className="flex gap-3 mt-3">
          <input
            type="text"
            className="border rounded-lg px-3 py-2 text-sm w-72 outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Tìm theo tên, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* TABLE DATA */}
      {loading ? (
        <div className="text-center py-20 text-gray-500">Đang tải dữ liệu...</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-md overflow-hidden border border-gray-100">
          <table className="w-full text-sm text-left">
            <thead className={`text-white ${roleType === 'admin' ? 'bg-gradient-to-r from-purple-700 to-indigo-600' : 'bg-gradient-to-r from-blue-600 to-cyan-500'}`}>
              <tr>
                <th className="py-3 px-4 cursor-pointer" onClick={() => handleSort("username")}>
                  <div className="flex items-center gap-1">Username {sortBy==="username" && (sortDir==="asc"?<ArrowUp size={14}/>:<ArrowDown size={14}/>)}</div>
                </th>
                <th className="py-3 px-4 cursor-pointer" onClick={() => handleSort("full_name")}>
                  <div className="flex items-center gap-1">Họ tên {sortBy==="full_name" && (sortDir==="asc"?<ArrowUp size={14}/>:<ArrowDown size={14}/>)}</div>
                </th>
                <th className="py-3 px-4 cursor-pointer" onClick={() => handleSort("email")}>
                  <div className="flex items-center gap-1">Email {sortBy==="email" && (sortDir==="asc"?<ArrowUp size={14}/>:<ArrowDown size={14}/>)}</div>
                </th>
                <th className="py-3 px-4">Vai trò</th>
                <th className="py-3 px-4 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.length > 0 ? users.map((u) => (
                <tr key={u._id} className="hover:bg-gray-50 transition">
                  <td className="py-3 px-4 font-medium text-gray-700">{u.username}</td>
                  <td className="py-3 px-4 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold text-xs">
                      {u.full_name ? u.full_name[0].toUpperCase() : "U"}
                    </div>
                    {u.full_name || "Chưa cập nhật"}
                  </td>
                  <td className="py-3 px-4 text-gray-500">{u.email}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                      u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 flex justify-center gap-2">
                    <button className="p-2 text-blue-600 hover:bg-blue-50 rounded transition" title="Xem chi tiết" onClick={() => navigate(`/admin/users/detail/${u._id}`)}>
                        <Eye size={18} />
                    </button>
                    <button onClick={() => handleDelete(u._id)} className="p-2 text-red-600 hover:bg-red-50 rounded transition" title="Xóa">
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="5" className="text-center py-10 text-gray-400">Không tìm thấy dữ liệu.</td></tr>
              )}
            </tbody>
          </table>

          {/* PAGINATION */}
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <span className="text-gray-600">Trang {pageNumber} / {totalPages}</span>
            <div className="flex gap-2">
              <button disabled={pageNumber === 1} onClick={() => setPageNumber(p => p - 1)} className="px-3 py-1 border rounded bg-white hover:bg-gray-100 disabled:opacity-50 flex items-center"><ChevronLeft size={16}/> Trước</button>
              <button disabled={pageNumber >= totalPages} onClick={() => setPageNumber(p => p + 1)} className="px-3 py-1 border rounded bg-white hover:bg-gray-100 disabled:opacity-50 flex items-center">Sau <ChevronRight size={16}/></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}