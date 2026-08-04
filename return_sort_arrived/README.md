# Arrival Sort Pro

**Phần mở rộng hỗ trợ quy trình phân loại hàng hoàn (Return Sort) trên hệ thống WMS Shopee**

Phiên bản: `2.2.2`

---

## Giới thiệu

Arrival Sort Pro tự động hóa tác vụ phân loại hàng hoàn tại kho Shopee. Khi nhân viên quét **mã phiếu nhập kho (sheet_id)**, extension sẽ:

- Nhận diện mã phiếu tức thời.
- Tra cứu loại hàng từ **Master Data**.
- Ánh xạ sang **ID trạm phân loại (station_id)**.
- Cập nhật số lượng vào phiên làm việc (session) theo thời gian thực.
- Cho phép **đóng kiện (TO)** và **in tem vận chuyển** ngay tại giao diện nổi.

Toàn bộ quy trình diễn ra **trên chính trang WMS**, không cần chuyển tab, giúp tăng tốc độ xử lý và giảm sai sót.

---

## Tính năng chính

### 1. Tự động nhận diện quét mã

- Bắt các request `scan_sheet_id` từ `fetch` và `XMLHttpRequest`.
- Lấy `sheet_id` và gửi sự kiện để xử lý ngay lập tức.

### 2. Tra cứu Master Data

- Lấy dữ liệu từ **Google Apps Script** (mapping `return_no` → `type`).
- Dữ liệu được lưu vào `chrome.storage.local` để dùng offline khi cần.

### 3. Ánh xạ loại hàng sang ID trạm

- Gọi API `https://return-sort-arrived.vercel.app/api/config/mappings`.
- Mỗi `type` sẽ có một `station_id` và `display_name`.
- Hỗ trợ cập nhật thủ công bằng nút trên giao diện.

### 4. Quản lý phiên làm việc (Session)

- Khi quét mã, extension gửi yêu cầu **tăng số lượng** (`increment`) lên server.
- Server trả về trạng thái `open`, `full` (đã đủ số lượng) hoặc lỗi.
- Session được đồng bộ **realtime** qua **Supabase Realtime**, tất cả người dùng đều thấy cập nhật.

### 5. Giao diện nổi (Popup)

- Hiển thị trên trang `/v2/returninbound/arrving` của WMS Shopee.
- Có thể **di chuyển**, **thu nhỏ** thành nút tròn.
- Các thành phần chính:
  - **Top‑5 badge**: 5 ID đang hoạt động đầu tiên với thanh tiến độ, click để xem chi tiết.
  - **Card trung tâm**: ID lớn, loại hàng, mã `return_tn`, thanh tiến độ, số lượng hiện tại / ngưỡng.
  - **Nút hành động**:
    - `🔄` Cập nhật Master Data
    - `🗂️` Cập nhật Type Mapping
    - `🗑️` Hủy (undo) mã vừa quét
    - Nút **Xác nhận đóng kiện** (khi đầy) hoặc **Đóng kiện ngay** (chưa đầy)
    - Nút **📊** chuyển sang Dashboard quản lý

### 6. Dashboard quản lý

Tích hợp trực tiếp trong popup, gồm 4 tab:

| Tab            | Mô tả                                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| **Đang mở**    | Danh sách ID đang có session (open/full), hiển thị tiến độ, nút **Đóng**.    |
| **Đã đóng**    | Lịch sử các TO đã đóng, có phân trang, nút **In lại** tem.                   |
| **Đơn active** | Các `return_tn` đang nằm trong session (chưa đóng), hỗ trợ **Hủy** từng đơn. |
| **In lại**     | 10 tem gần nhất đã in, cho phép in lại nhanh chóng.                          |

- Tất cả tab đều có **tìm kiếm theo ID**.
- Tab “Đang mở” có nút **Đóng tất cả** để đóng nhiều kiện cùng lúc.

### 7. In tem TO

- Khi đóng kiện, tự động in tem **TO‑{type}‑{id}**.
- Tem chứa mã TO, ngày, số đơn, email người tạo và mã QR.
- Nếu in thất bại, có nút **In lại** ngay trên giao diện và lưu tem vào lịch sử để in sau.

### 8. Hỗ trợ thao tác

- **Tự động click nút “Complete”** sau khi quét thành công.
- **Phát âm thanh ID trạm** (text‑to‑speech) khi nhận diện mã.
- **Tự ẩn popup** khi rời khỏi trang arriving, hiện lại khi quay lại.
- **Giữ kết nối** với extension service worker qua persistent port để tránh bị “sleep”.

### 9. Xử lý lỗi & thông báo

- Cảnh báo khi mã không có trong Master Data.
- Hiển thị lỗi ánh xạ type → ID.
- Thông báo lỗi kết nối server, sai tuyến, …
- Toast message khi cập nhật dữ liệu thành công.

---

## Cài đặt

1. Tải mã nguồn hoặc giải nén file `.zip`.
2. Mở Chrome, vào `chrome://extensions`.
3. Bật **Developer mode**.
4. Chọn **Load unpacked** và chọn thư mục chứa extension.
5. Extension sẽ hoạt động khi bạn truy cập `https://wms.ssc.shopee.vn/.../arrving`.

> **Lưu ý:** Extension yêu cầu quyền truy cập vào các domain:
>
> - `wms.ssc.shopee.vn` – trang WMS chính
> - `script.google.com` – lấy Master Data
> - `return-sort-arrived.vercel.app` – API quản lý session
> - `gjnfyjmrrpxmnufikjgo.supabase.co` – realtime database

---

## Cách sử dụng

### Quét mã phiếu

- Khi nhân viên quét mã `sheet_id`, popup sẽ hiện **ID trạm tương ứng**, số lượng hiện tại.
- Đèn tín hiệu (màu card) thay đổi theo trạng thái: xám (đang xử lý), xanh lá (đầy), vàng (cảnh báo), đỏ (lỗi).

### Đóng kiện

- Khi thanh tiến độ đạt 100%, popup sẽ hiển thị nút **Xác nhận đóng kiện**.
- Nhấn vào nút để in tem và kết thúc phiên.
- Có thể đóng sớm bằng nút **Đóng kiện ngay** (có xác nhận).

### Dashboard

- Nhấn biểu tượng 📊 để mở Dashboard.
- Trong tab **Đang mở**, có thể đóng từng ID hoặc tất cả.
- Tab **Đơn active** cho phép hủy một `return_tn` khỏi session hiện tại.
- Tab **In lại** liệt kê 10 tem in gần nhất, click để in lại.

---

## Kiến trúc kỹ thuật

### Thành phần chính

| File                             | Vai trò                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `manifest.json`                  | Khai báo extension, quyền, content scripts, host permissions                     |
| `background.js` (service worker) | Kết nối Supabase Realtime, fetch Master Data / Type Mappings, broadcast sessions |
| `content/interceptor.js`         | Inject vào trang để bắt request `scan_sheet_id` và click nút “Complete”          |
| `content/stateManager.js`        | Xử lý logic nghiệp vụ: gọi API, quản lý session, đồng bộ UI                      |
| `content/ui/popup.js`            | Popup chính Arrival Sort – hiển thị ID, điều khiển scan                          |
| `content/ui/dashboard.js`        | Dashboard tích hợp – tab quản lý mở rộng                                         |
| `content/printer.js`             | (không hiển thị) Xử lý in tem TO                                                 |

### Luồng dữ liệu

1. **Intercept** → lấy `sheet_id`.
2. `stateManager` tra Master Data để lấy `type`.
3. Từ `type` → `station_id` qua mapping.
4. Gọi `POST /api/scan/increment` với `id`, `return_tn`, `email`.
5. Server xử lý, cập nhật Supabase → Realtime broadcast.
6. `stateManager` nhận sessions mới, cập nhật UI.

### Dịch vụ bên ngoài

- **Google Apps Script** – cung cấp Master Data (dữ liệu `rv` → `type`).
- **Vercel API** – REST API cho các thao tác scan (increment, decrement, close, mark_printed) và lấy cấu hình type mapping.
- **Supabase** – PostgreSQL + Realtime để lưu session và đồng bộ trạng thái giữa các client.

---

## Quyền (Permissions)

- `storage` – Lưu Master Data, vị trí popup, lịch sử in.
- `activeTab` – Cho phép inject script vào tab đang hoạt động.
- `scripting` – Thực thi script trên trang WMS.
- `host_permissions` – Đọc/ghi dữ liệu trên các domain cần thiết.

---

## Xử lý sự cố thường gặp

| Triệu chứng                            | Nguyên nhân / Cách khắc phục                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| Popup không hiển thị                   | Trang hiện tại không phải `/v2/returninbound/arrving`. Kiểm tra URL.               |
| Luôn hiện “Không có trong master data” | Master Data chưa được tải. Nhấn nút `🔄` hoặc kiểm tra kết nối Google Apps Script. |
| ID hiện “?”                            | Type chưa được gán `station_id`. Kiểm tra Type Mapping trên Vercel.                |
| Đếm không tăng                         | Kiểm tra kết nối API, log trong DevTools (F12).                                    |
| Không in được tem                      | Máy in chưa kết nối. Extension sẽ thử 3 lần, sau đó tải file HTML về.              |

---

## Hỗ trợ

Liên hệ đội phát triển nội bộ hoặc tạo issue trên repository (nếu có).

---

_Arrival Sort Pro – Tăng tốc phân loại, chính xác từng kiện hàng._
