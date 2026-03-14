# 🚀 DevLaunch — Quản lý Localhost

Phần mềm desktop để quản lý và khởi động các dự án localhost trên Windows.

---

## Yêu cầu

- **Node.js** v18 trở lên → https://nodejs.org
- **npm** (đi kèm với Node.js)

Kiểm tra bằng cách mở Command Prompt và gõ:
```
node --version
npm --version
```

---

## Cài đặt & Chạy

### Bước 1 — Giải nén
Giải nén thư mục `devlaunch` ra bất kỳ nơi nào trên máy, ví dụ `C:\Tools\devlaunch`

### Bước 2 — Cài thư viện
Mở Command Prompt, vào thư mục vừa giải nén:
```
cd C:\Tools\devlaunch
npm install
```
Chờ khoảng 1–2 phút lần đầu.

### Bước 3 — Chạy ứng dụng
```
npm start
```

✅ Cửa sổ **DevLaunch** sẽ mở ra!

---

## Đóng gói thành file .exe (tuỳ chọn)

Nếu muốn có file `.exe` cài đặt hoặc portable:
```
npm run build
```
File sẽ được tạo trong thư mục `dist\`.

---

## Hướng dẫn sử dụng

### Thêm service mới
1. Nhấn nút **＋ Thêm service** (góc trên phải)
2. Điền thông tin:
   - **Tên service**: Tên dễ nhớ, ví dụ "Frontend App"
   - **Dự án**: Nhóm các service lại, ví dụ "Shop Online"
   - **Lệnh khởi động**: `npm run dev`, `python manage.py runserver`, v.v.
   - **Thư mục dự án**: Nhấn 📁 để chọn thư mục hoặc gõ đường dẫn
   - **URL**: Có thể để trống — app sẽ tự nhận diện từ log (`localhost:3000`, v.v.)
3. Nhấn **💾 Lưu**

### Chạy / Dừng service
- Nhấn ▶ để **chạy**
- Nhấn ⏹ để **dừng**  
- Nhấn 🔄 để **khởi động lại**
- Nhấn 🔗 URL để **mở trình duyệt**
- Nhấn 📄 để **xem log** realtime

### Gom nhóm dự án
- Các service cùng tên "Dự án" sẽ được gom vào 1 nhóm
- Nhấn đầu nhóm để thu gọn / mở rộng
- Có thể chạy/dừng **tất cả** service trong nhóm cùng lúc (▶ / ⏹ ở header nhóm)

### Lọc & Tìm kiếm
- Sidebar trái: lọc **Tất cả / Đang chạy / Đã dừng**
- Hoặc click tên dự án để xem riêng từng dự án

### Backup & Khôi phục
- Nhấn **📤 Backup** → lưu file `.json` về máy
- Nhấn **📥 Import** → mở file backup để khôi phục
- Dùng khi chuyển máy hoặc cài lại Windows

---

## Câu hỏi thường gặp

**Q: Lệnh chạy không được, báo lỗi "không tìm thấy lệnh"?**  
A: Đảm bảo Node.js / Python / công cụ tương ứng đã được cài và thêm vào PATH. Thử chạy lệnh đó trong Command Prompt trước.

**Q: URL không tự nhận diện được?**  
A: Nhập thủ công vào trường URL khi thêm/sửa service.

**Q: Dữ liệu lưu ở đâu?**  
A: `C:\Users\<tên_user>\AppData\Roaming\devlaunch\services.json`

**Q: Muốn chỉnh sửa service?**  
A: Nhấn ✏️ ở service đó, sửa xong nhấn Lưu.
