import React from "react";

const Dashboard = () => {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Tổng quan hệ thống</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
          <p className="text-gray-500">Tổng số Video</p>
          <p className="text-3xl font-bold">12</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
          <p className="text-gray-500">Học sinh</p>
          <p className="text-3xl font-bold">45</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-yellow-500">
          <p className="text-gray-500">Lượt xem</p>
          <p className="text-3xl font-bold">1,203</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-red-500">
          <p className="text-gray-500">Cảnh báo hành vi</p>
          <p className="text-3xl font-bold">5</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;