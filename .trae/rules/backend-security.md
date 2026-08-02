---
description: Quy tắc bảo mật cho API và Lib
globs: api/**/*.js,lib/**/*.js
alwaysApply: true
---

- **Tuyệt đối không** hardcode token, secret hay biến môi trường. Luôn dùng `process.env`.
- Mọi API endpoint (trừ login) đều phải kiểm tra session/xác thực trước khi xử lý logic.
- Khi nhận dữ liệu đầu vào (req.body, req.query), bắt buộc phải validate và escape để tránh SQL Injection và XSS (sử dụng lib/utils nếu có).
- Log lỗi (error) phải đủ chi tiết để trace nhưng không được lộ thông tin nhạy cảm (password, token).
