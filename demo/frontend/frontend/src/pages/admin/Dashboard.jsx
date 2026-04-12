import React, { useEffect, useState } from "react";
import axiosClient from "../../api/axiosClient";

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalUploadedImages: 0,
    totalUsers: 0,
    captionGeneratedImages: 0,
    pendingCaptionImages: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [imageStatsRes, usersRes] = await Promise.all([
          axiosClient.get("/images/dashboard-stats"),
          axiosClient.get("/users", {
            params: { role: "all", page: 1, limit: 1, search: "" },
          }),
        ]);

        const imageStats = imageStatsRes?.data?.data || {};
        const totalUsers = usersRes?.data?.result?.page?.totalElements || 0;

        setStats({
          totalUploadedImages: imageStats.totalUploadedImages || 0,
          totalUsers,
          captionGeneratedImages: imageStats.captionGeneratedImages || 0,
          pendingCaptionImages: imageStats.pendingCaptionImages || 0,
        });
      } catch (error) {
        console.error("Error fetching dashboard stats:", error);
      }
    };

    fetchStats();
  }, []);

  const formatNumber = (value) => new Intl.NumberFormat("vi-VN").format(value || 0);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Tổng quan hệ thống</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
          <p className="text-gray-500">Tổng số Hình ảnh</p>
          <p className="text-3xl font-bold">{formatNumber(stats.totalUploadedImages)}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
          <p className="text-gray-500">Tổng số người dùng</p>
          <p className="text-3xl font-bold">{formatNumber(stats.totalUsers)}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-yellow-500">
          <p className="text-gray-500">Tổng số caption đã sinh</p>
          <p className="text-3xl font-bold">{formatNumber(stats.captionGeneratedImages)}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-red-500">
          <p className="text-gray-500">Ảnh chưa có caption</p>
          <p className="text-3xl font-bold">{formatNumber(stats.pendingCaptionImages)}</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;