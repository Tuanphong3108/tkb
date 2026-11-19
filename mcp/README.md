# TKB MCP server

Remote MCP server qua **Streamable HTTP** cho ứng dụng Thời khóa biểu. Server chạy trên Cloudflare Workers và đọc dữ liệu public từ:

`https://tuanphong3108.github.io/tkb/asset/*.json`

Dữ liệu được cache tối đa khoảng 5 phút.

## Tools

- `get_schedule(date?)`: lịch học một ngày. `date` nhận `today` (mặc định), `tomorrow` hoặc `YYYY-MM-DD`.
- `get_week(week?)`: lịch cả tuần. Mặc định là tuần hiện tại; tuần 1 bắt đầu ngày 07/09/2026.

## Deploy lên Cloudflare Workers

```bash
cd mcp
npx wrangler login
npx wrangler deploy
```

Worker sẽ có URL dạng `https://tkb-mcp.<your-subdomain>.workers.dev`.

## MCP transport & limitations

- Transport hiện tại: Streamable HTTP qua HTTP POST, JSON-RPC 2.0.
- Server stateless; không quản lý session ID.
- Các method đang xử lý: `initialize`, `ping`, `tools/list`, `tools/call`.
- GET/SSE không được triển khai; request không phải POST (ngoại trừ OPTIONS) nhận HTTP 405.
- Endpoint hiện không có OAuth, Dynamic Client Registration (DCR), hoặc xác thực người dùng.
- Chỉ có công cụ đọc dữ liệu TKB; không có thao tác ghi/sửa dữ liệu.

Đây là mô tả đúng theo code hiện tại, **không phải chứng nhận MCP compliance**. Hãy kiểm thử với MCP Inspector hoặc client mục tiêu trước khi triển khai sử dụng thực tế.

## Gemini Apps / Gemini Web

Gemini Apps có tính năng Custom Apps nhận MCP server URL, nhưng quyền truy cập phụ thuộc điều kiện của Google. Tài liệu Google hiện tại nêu yêu cầu **từ 18 tuổi và ở Hoa Kỳ**, cùng các điều kiện về tài khoản và lịch sử hoạt động. Vì vậy, phần này chỉ ghi nhận tình trạng tương thích kỹ thuật; không hướng dẫn né điều kiện tuổi/khu vực và không khẳng định server đã được Gemini xác nhận tương thích.

Ngoài ra, Worker hiện không có OAuth/DCR. Nếu client yêu cầu cơ chế xác thực hoặc capability khác, server sẽ cần được thiết kế và kiểm thử riêng trước khi có thể tuyên bố hỗ trợ.

## Dùng với Claude

Trong Claude, mở phần Connectors / custom connector và thêm URL Worker nếu tài khoản và client của bạn hỗ trợ MCP server không xác thực. Tên mục có thể khác tùy phiên bản Claude.

## Cập nhật dữ liệu

- Thêm tuần mới bằng cách thêm file `asset/<số tuần>.json`; không cần sửa server.
- Nếu đổi ngày bắt đầu tuần 1, cập nhật `WEEK1_START` trong `worker.js`.
