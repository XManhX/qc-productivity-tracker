---
description: Chuẩn phát triển extension
globs: return_sort_arrived/**/*
alwaysApply: false
---

- Extension sử dụng **Manifest V3**. Service worker (`background.js`) không được phép truy cập DOM, mọi thao tác DOM phải qua `content.js`.
- Nếu cần fetch dữ liệu từ nội bộ (WMS), sử dụng `interceptor.js` để bắt API thay vì gọi fetch thủ công.
- **Không** đưa dependencies nặng vào extension nếu không cần thiết. QR Code đã được generate offline bằng thư viện nhúng sẵn.
