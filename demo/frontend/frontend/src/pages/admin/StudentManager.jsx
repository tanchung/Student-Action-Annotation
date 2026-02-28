import React from "react";
import UserManager from "./UserManager";

const StudentManager = () => {
  return (
    <UserManager 
      roleType="user" 
      pageTitle="Quản lý Người dùng" 
    />
  );
};

export default StudentManager;