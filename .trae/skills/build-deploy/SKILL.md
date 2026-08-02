# Build và Deploy QC Productivity Tracker

## Mô tả

Skill này thực hiện toàn bộ quy trình build userscript, build Tailwind CSS và deploy lên Vercel.

## Điều kiện tiên quyết

- Đã cài đặt Node.js >= 18 và pnpm/npm.
- Có quyền truy cập vào Vercel CLI (hoặc đã link project).
- Biến môi trường đã được cấu hình trong `.env.local`.

## Các bước thực hiện

1. **Build CSS**: Chạy lệnh `npm run build:css` để compile Tailwind ra file CSS tĩnh trong `public/css/`.
2. **Build Userscript**: Chạy lệnh `npm run build` (hoặc `node build/build.js`) để tạo file `public/install/tracker.user.js`.
3. **Kiểm tra**: Mở file `public/install/tracker.user.js` và kiểm tra header (có đúng @match, @grant không).
4. **Deploy**: Chạy lệnh `vercel --prod` hoặc push lên branch `main` (nếu đã cấu hình CI/CD).
5. **Xác minh**: Kiểm tra log trên Vercel Dashboard để đảm bảo deployment thành công.

## Đầu ra dự kiến

- File `tracker.user.js` sẵn sàng để cài vào Tampermonkey.
- Dashboard hoạt động trên domain Vercel đã cấu hình.
