# TKB MCP server

Remote MCP server (Streamable HTTP, không auth) cho Claude hỏi thời khóa biểu.
Dữ liệu đọc trực tiếp từ `https://tuanphong3108.github.io/tkb/asset/*.json`, nên cập nhật TKB trong repo là Claude thấy ngay.

## Tool

- `get_schedule(date?)`: tiết học của 1 ngày. `date` = `today` (mặc định), `tomorrow` hoặc `YYYY-MM-DD`.
- `get_week(week?)`: cả tuần. Mặc định tuần hiện tại (tuần 1 bắt đầu 07/09/2026).

## Deploy lên Cloudflare Workers

```bash
cd mcp
npx wrangler login
npx wrangler deploy
```

Xong sẽ có URL dạng `https://tkb-mcp.<tên-bạn>.workers.dev`.

## Thêm vào Claude

Connectors → Add custom connector → dán URL Worker (không cần OAuth) → Connect.
Gói Free được 1 custom connector.

## Lưu ý

- Muốn thêm tuần mới thì chỉ cần thêm file `asset/<số tuần>.json`, không phải sửa server.
- Đổi ngày bắt đầu tuần 1 thì sửa `WEEK1_START` trong `worker.js`.
