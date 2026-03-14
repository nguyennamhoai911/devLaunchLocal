# DevLaunch

Quản lý localhost đơn giản và hiệu quả cho Windows.

## Tính năng chính
- **Quản lý tiến trình**: Khởi động, dừng và khởi động lại các lệnh terminal dễ dàng.
- **Nhận diện URL**: Tự động tìm URL (localhost/IP) từ log để mở nhanh trình duyệt.
- **Kéo & Thả**: Sắp xếp thứ tự các tiến trình theo ý muốn.
- **Console Real-time**: Xem log trực tiếp và tương tác với tiến trình qua terminal builtin.
- **Gom nhóm**: Tự động phân loại các tiến trình theo tên dự án.
- **Sao lưu**: Xuất và nhập cấu hình dự án qua file JSON.

## Cách sử dụng

### 1. Cài đặt môi trường
Yêu cầu Node.js v18 trở lên.
```bash
npm install
```

### 2. Khởi chạy
```bash
npm start
```

### 3. Đóng gói thành file .exe
Sử dụng lệnh sau để tạo bản cài đặt hoặc bản portable trong thư mục `dist/`:
```bash
npm run build
```

## Lưu trữ dữ liệu
Cấu hình được lưu cục bộ tại máy cá nhân:  
`%AppData%/Roaming/devlaunch/services.json`
