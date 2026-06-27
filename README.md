# DevLaunch

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg?style=flat-square)
![Platform](https://img.shields.io/badge/platform-windows-lightgrey.svg?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-emerald.svg?style=flat-square)

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

## Tích hợp Model Context Protocol (MCP)
DevLaunch hỗ trợ giao thức MCP (Model Context Protocol) để các AI Coding Assistants như **Cursor, Claude Desktop, Windsurf** có thể tương tác trực tiếp, khởi chạy, dừng hoặc xem log các service trên máy của bạn.

### Các công cụ (Tools) cung cấp qua MCP:
- `list_services`: Xem danh sách tất cả các service đã cấu hình.
- `start_service`: Bật một service (truyền ID hoặc Tên).
- `stop_service`: Dừng một service đang chạy.
- `restart_service`: Khởi động lại service.
- `get_service_logs`: Xem tail log của service.
- `add_service`: Thêm mới cấu hình service trực tiếp từ AI.
- `delete_service`: Xóa một service.

### 1. Cấu hình tích hợp

#### Cách 1: Sử dụng Node.js (Khuyên dùng - Ổn định nhất)
Thêm cấu hình sau vào phần `mcpServers` trong file settings của IDE (ví dụ `claude_desktop_config.json` hoặc Cursor MCP settings):

```json
{
  "mcpServers": {
    "devlaunch": {
      "command": "node",
      "args": [
        "C:\\code\\c2026-03-09-devLaunch\\mcp-server.js"
      ]
    }
  }
}
```
*(Hãy thay đường dẫn trên bằng đường dẫn tuyệt đối đến file `mcp-server.js` trên máy của bạn).*

#### Cách 2: Sử dụng File đóng gói (.exe)
Khi chạy DevLaunch ở dạng đóng gói, bạn có thể truyền flag `--mcp` để kích hoạt giao thức stdio:
```json
{
  "mcpServers": {
    "devlaunch": {
      "command": "C:\\Đường_Dẫn_Cài_Đặt\\DevLaunch.exe",
      "args": [
        "--mcp"
      ]
    }
  }
}
```

### 2. Cách hoạt động & Bảo mật (GUI Sync & Consent)
- **GUI Sync**: Nếu ứng dụng DevLaunch (Giao diện GUI) đang mở, các yêu cầu từ AI sẽ tự động đồng bộ thời gian thực thông qua cổng TCP nội bộ (`127.0.0.1:20263`). Bạn sẽ thấy các service bật/tắt và log hiển thị trực tiếp trên GUI.
- **Standalone Fallback**: Nếu GUI đóng, MCP server sẽ chạy ngầm độc lập (headless), quản lý và ghi nhận log các tiến trình trong bộ nhớ và lưu trạng thái vào file `services.json`.
- **Xác nhận bảo mật**: Trong phần cài đặt MCP ở Sidebar GUI, bạn có thể bật tính năng **"Require Approval"**. Khi được kích hoạt, bất kỳ thao tác nhạy cảm nào do AI yêu cầu (như bật, tắt, thêm hoặc xóa service) đều phải được bạn click **Allow** (Cho phép) trên màn hình thì tiến trình mới thực thi. Hỗ trợ tự động từ chối (Deny) sau 60 giây nếu bạn không tương tác.

