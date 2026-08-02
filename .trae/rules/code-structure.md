---
description: Cấu trúc thư mục và đặt tên
globs: **/*.js,**/*.json
alwaysApply: true
---

- **Backend logic** phải nằm trong thư mục `lib/`, **không** viết logic phức tạp trực tiếp trong `api/` (api chỉ đóng vai trò router).
- **UI Components**: React components nằm trong `public/js/components/`. Component nào dùng chung nhiều nơi mới để ở root, còn lại để theo feature.
- **Đặt tên biến/hàm**: Sử dụng `camelCase` cho biến và hàm (ví dụ: `fetchUserData`). Sử dụng `PascalCase` cho tên component React và tên Class.
- **Import**: Ưu tiên dùng absolute imports (đã config trong `jsconfig.json`) thay vì `../../../`.
