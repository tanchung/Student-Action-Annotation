import axios from "axios";

const axiosClient = axios.create({
  baseURL: "http://localhost:5000/api", // Đổi port nếu backend khác
  headers: {
    "Content-Type": "application/json",
  },
});

// Interceptor để tự động gắn Token vào mọi request
axiosClient.interceptors.request.use(async (config) => {
  const token = localStorage.getItem("token");
  console.log('📡 API Request:', config.method.toUpperCase(), config.url, 'Token:', token ? '✅ Present' : '❌ Missing');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor để xử lý response errors
axiosClient.interceptors.response.use(
  (response) => {
    console.log('✅ API Response:', response.config.url, 'Status:', response.status);
    return response;
  },
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url;
    console.error('❌ API Error:', url, 'Status:', status, 'Message:', error.response?.data?.message);
    
    // Nếu lỗi 401 (Unauthorized) hoặc 403 (Forbidden), chuyển về trang login
    if (status === 401 || status === 403) {
      console.warn('🚪 Redirecting to login - Token invalid or expired');
      localStorage.clear();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default axiosClient;