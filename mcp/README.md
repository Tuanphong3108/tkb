# TKB MCP server

Remote MCP server qua **Streamable HTTP** cho ứng dụng Thời khóa biểu. Server chạy trên Cloudflare Workers và đọc dữ liệu public từ:

`https://tuanphong3108.github.io/tkb/asset/*.json`

Dữ liệu được cache tối đa khoảng 5 phút.

## Tools

- `get_schedule(date?)`: lịch học một ngày. `date` nhận `today` (mặc định), `tomorrow` hoặc `YYYY-MM-DD`.
- `get_week(week?)`: lịch cả tuần. Mặc định là tuần hiện tại; tuần 1 bắt đầu ngày 07/09/2026.

- Cả hai tool đều trả về **đầy đủ nội dung `alert`** gắn với từng tiết học, không chỉ tên môn và giáo viên. Nếu một tiết có thông báo, nội dung sẽ được đưa vào kết quả dưới nhãn `⚠️ Thông báo`.

Cả hai tool đều chỉ đọc dữ liệu. Server khai báo `readOnlyHint`, `destructiveHint`, `idempotentHint` và `openWorldHint` để MCP client có thể phân loại hành vi tool.

## Gemini Apps / Gemini Web readiness

Worker đã được cập nhật theo các hướng dẫn tích hợp MCP của Google:

- Trả về `serverInfo`, `capabilities.tools` và `instructions` trong `initialize`.
- Khai báo mô tả tool rõ ràng, JSON Schema có kiểu dữ liệu và giới hạn đầu vào.
- Khai báo safety annotations cho cả hai tool (read-only, non-destructive, idempotent).
- Hỗ trợ thương lượng các MCP protocol version `2025-11-25`, `2025-06-18` và `2025-03-26`.
- Dùng stateless Streamable HTTP: JSON-RPC qua POST; GET/SSE là endpoint tùy chọn và hiện trả HTTP 405.
- Không tạo session ID; notification được trả HTTP 202.

**Lưu ý:** Đây là các điều chỉnh để tăng khả năng tương thích theo tài liệu, không phải xác nhận Gemini đã kết nối thành công. Cần deploy Worker và kiểm tra thực tế trong Gemini Apps Developer Mode để xác minh tool discovery, schema và tool calls.

## MCP transport & limitations

- Transport: Streamable HTTP qua HTTP POST, JSON-RPC 2.0.
- Server stateless; không quản lý session ID.
- Methods: `initialize`, `ping`, `tools/list`, `tools/call` và các notification khởi tạo/hủy.
- GET/SSE không được triển khai; request GET nhận HTTP 405.
- Endpoint hiện không có OAuth, Dynamic Client Registration (DCR), hoặc xác thực người dùng.
- Chỉ có công cụ đọc dữ liệu TKB; không có thao tác ghi/sửa dữ liệu.

Đây là mô tả theo code hiện tại, **không phải chứng nhận MCP compliance**. Hãy kiểm thử với MCP Inspector hoặc client mục tiêu trước khi sử dụng thực tế.

## Deploy lên Cloudflare Workers

```bash
cd mcp
npx wrangler login
npx wrangler deploy
```

Worker sẽ có URL dạng `https://tkb-mcp.<your-subdomain>.workers.dev`.

## Dùng với Claude

Trong Claude, mở phần Connectors / custom connector và thêm URL Worker nếu tài khoản và client của bạn hỗ trợ MCP server không xác thực. Tên mục có thể khác tùy phiên bản Claude.

## Cập nhật dữ liệu

- Thêm tuần mới bằng cách thêm file `asset/<số tuần>.json`; không cần sửa server.
- Nếu đổi ngày bắt đầu tuần 1, cập nhật `WEEK1_START` trong `worker.js`.
