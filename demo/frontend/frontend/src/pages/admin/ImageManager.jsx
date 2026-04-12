import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import axiosClient from '../../api/axiosClient';

const ImageManager = () => {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewerImage, setViewerImage] = useState(null);

  // Fetch images on component mount
  useEffect(() => {
    fetchImages();
  }, []);

  const fetchImages = async () => {
    setLoading(true);
    try {
      const response = await axiosClient.get('/images/list');
      if (response.data.success) {
        setImages(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching images:', error);
      alert('Lỗi khi tải danh sách hình ảnh');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (imageId) => {
    if (!window.confirm('Bạn có chắc muốn xóa hình ảnh này?')) {
      return;
    }

    try {
      const response = await axiosClient.post(`/images/${imageId}/soft-delete`);
      if (response.data.success) {
        alert('Xóa hình ảnh thành công!');
        fetchImages();
      }
    } catch (error) {
      console.error('Error deleting image:', error);
      alert('Lỗi khi xóa hình ảnh: ' + (error.response?.data?.message || error.message));
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    else return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Quản lý Hình ảnh</h1>

      {/* Images List */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Danh sách Hình ảnh</h2>

        {loading && images.length === 0 ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">Đang tải...</p>
          </div>
        ) : images.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Chưa có hình ảnh nào</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {images.map((image) => (
              <div key={image._id} className="border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <div className="aspect-video bg-gray-100 relative">
                  <img
                    src={image.minio_url}
                    alt={image.image_name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-3">
                  <h3 className="font-semibold text-sm mb-1 truncate" title={image.image_name}>
                    {image.image_name}
                  </h3>
                  <p className="text-xs text-gray-600 mb-2">
                    {image.width} × {image.height} | {image.format?.toUpperCase()}
                  </p>
                  {image.file_size && (
                    <p className="text-xs text-gray-500 mb-2">
                      {formatFileSize(image.file_size)}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mb-3">
                    {new Date(image.created_at).toLocaleDateString('vi-VN')}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setViewerImage(image)}
                      className="flex-1 bg-blue-500 text-white text-xs py-1.5 px-3 rounded hover:bg-blue-600 transition-colors"
                    >
                      Xem
                    </button>
                    <button
                      onClick={() => handleDelete(image._id)}
                      className="flex-1 bg-red-500 text-white text-xs py-1.5 px-3 rounded hover:bg-red-600 transition-colors"
                    >
                      Xóa
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Image Viewer Modal */}
      {viewerImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
          onClick={() => setViewerImage(null)}
        >
          <div className="relative max-w-7xl max-h-full">
            {/* Close Button */}
            <button
              onClick={() => setViewerImage(null)}
              className="absolute -top-12 right-0 bg-white text-gray-800 rounded-full p-2 hover:bg-gray-200 transition-colors shadow-lg"
              title="Đóng"
            >
              <X size={24} />
            </button>
            
            {/* Image */}
            <img
              src={viewerImage.minio_url}
              alt={viewerImage.image_name}
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
            
            {/* Image Info */}
            <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 text-white p-4 rounded-b-lg">
              <h3 className="font-semibold text-lg mb-1">{viewerImage.image_name}</h3>
              <p className="text-sm">
                {viewerImage.width} × {viewerImage.height} | {viewerImage.format?.toUpperCase()} | {formatFileSize(viewerImage.file_size)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageManager;
