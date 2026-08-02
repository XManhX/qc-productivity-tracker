# Cài đặt và Test Chrome Extension (Arrival Manager)

## Mô tả

Quy trình tải extension `QC Arrival Manager Pro` lên Chrome để test.

## Các bước thực hiện

1. Mở Chrome, truy cập `chrome://extensions/`.
2. Bật chế độ **Developer mode** (thanh trượt góc phải trên cùng).
3. Nhấn **Load unpacked**.
4. Chọn đúng thư mục `return_sort_arrived/` trong dự án.
5. Kiểm tra extension đã xuất hiện trong danh sách chưa.
6. Truy cập WMS page: `https://wms.ssc.shopee.vn/v2/returninbound/arrving*`.
7. Mở Console (F12) để xem log từ `content.js` và `interceptor.js`.

## Xử lý sự cố

- Nếu extension không bắt được RV: Kiểm tra lại `matches` trong `manifest.json`.
- Nếu QR không hiện: Kiểm tra xem thư viện `qrcode.min.js` đã được load chưa.
