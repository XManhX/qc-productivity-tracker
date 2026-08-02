# Thêm mới Entity vào Admin API

## Mô tả

Skill hướng dẫn cách mở rộng endpoint admin động `api/admin/[...entity].js` để hỗ trợ thêm một bảng (table) mới trong database.

## Điều kiện tiên quyết

- Nắm rõ schema của table mới trong Supabase.
- Biết tên entity (ví dụ: `shifts`).

## Các bước thực hiện

1. **Mở file**: `api/admin/[...entity].js` và `lib/admin/[entity].js` (nếu chưa có thì tạo mới).
2. **Cập nhật Router**: Trong `api/admin/[...entity].js`, thêm case `entity === 'shifts'` để gọi tới hàm xử lý tương ứng trong `lib`.
3. **Viết Logic Lib**: Tạo file `lib/admin/shifts.js`. Xuất các hàm `list`, `create`, `update`, `delete` sử dụng Supabase client.
4. **Validate**: Đảm bảo các hàm kiểm tra quyền (role) của user đang gọi API.
5. **Frontend (tuỳ chọn)**: Tạo component mới trong `public/js/components/` và store tương ứng trong `public/js/store/` để giao diện quản lý entity này.

## Lưu ý

- Luôn dùng `try-catch` và trả về cấu trúc JSON chuẩn: `{ success: boolean, data?: any, error?: string }`.
