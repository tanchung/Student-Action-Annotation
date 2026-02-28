import React from "react";
// ✅ Import đúng: Không có dấu ngoặc nhọn vì UserManager là export default
import UserManager from "./UserManager"; 

const AdminManager = () => {
  return (
    <UserManager 
      roleType="admin" 
      pageTitle="Quản lý Quản trị viên" 
    />
  );
};

export default AdminManager;