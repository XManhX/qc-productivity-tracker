# QC Productivity Tracker
Tampermonkey script để track productivity QC trên các flow WMS return inbound:
- `https://wms.ssc.shopee.vn/v2/returninbound/qc`- `https://wms.ssc.shopee.vn/v2/returninbound/judgement`- `https://wms.ssc.shopee.vn/v2/returninbound/rimassreceive`
---
## 1. Mục tiêu
Script sẽ:- lấy email user hiện tại từ API WMS:  `GET /api/v2/apps/system/user/get_login_info`- gọi backend authz để kiểm tra user có được phép dùng không- nếu được phép:  - đọc input tại thời điểm user bấm action  - gom thành 1 record  - gửi về backend log API
---
## 2. Dữ liệu track theo từng page
### QCURL:- `/v2/returninbound/qc`
Fields:- ASN- Return TN- Order SN
Action:- `Complete`
### JudgementURL:- `/v2/returninbound/judgement`
Fields:- ASN- Return TN- Order SN- LMTN- UID
Action:- `Confirm Judged`
### RIMASS ReceiveURL:- `/v2/returninbound/rimassreceive`
Fields:- Device ID- ASN- Return TN- Order SN- LMTN- UID
Action:- `Confirm Received`
---
## 3. Bảo mật và quyền sử dụng
### Source code- repo ở chế độ private
### Quyền sử dụng script- script lấy email user hiện tại từ API WMS- script gọi backend authz:  `POST /api/qc-productivity/authz`- backend quyết định:  - user có được phép dùng hay không  - có thể trả về session token ngắn hạn
### Lưu ý quan trọngUser script là code phía client nên:- không được xem là bí mật tuyệt đối- không được hard-code:  - token  - password  - cookie  - API key  - secret
Bảo mật thực sự phải nằm ở backend:- allowlist email / role- validate payload- reject user không hợp lệ- rate limit / chống duplicate nếu cần
---
## 4. API cần có
### 4.1 AuthZ API
`POST /api/qc-productivity/authz`
Request:
```json
{
"email": "xuanmanh.nguyen@shopee.com",
"page": "/v2/returninbound/qc"
}
```
Response:
```json
{
"allowed": true,
"reason": "",
"user": {
"email": "xuanmanh.nguyen@shopee.com",
"role": "qc"
},
"session_token": "optional-short-lived-token"
}
```
4.2 Log API
`POST /api/qc-productivity/log`
Header optional:
```text
X-QC-Session-Token: <short-lived-token>
```
Request:
```json
{
"version": "1.0.0",
"timestamp": "2026-07-15T08:30:00.000Z",
"page": "qc",
"action": "Complete",
"operator": "xuanmanh.nguyen@shopee.com",
"url": "https://wms.ssc.shopee.vn/v2/returninbound/qc",
"device_id": "",
"asn": "ASN123",
"return_tn": "RTN123",
"order_sn": "ORD123",
"lmtn": "",
"uid": ""
}
```
5\. Setup local
Cài Node.js
Yêu cầu:
- Node.js &gt;= 18
Cài dependencies
```bash
npm install
```
Build userscript
```bash
npm run build
```
Sau khi build, thư mục `public/` sẽ có:
- `tracker.user.js`- `tracker.meta.js`
6\. Environment variables
Cần 2 biến:
- `API_BASE_URL`- `HOST_BASE_URL`
Ví dụ:
```bash
API_BASE_URL=https://your-api.company-domain.com
HOST_BASE_URL=https://tm-qc-tools.company-domain.com
```
7\. Deploy với Vercel
Bước 1
Connect Vercel với GitHub private repo
Bước 2
Set environment variables trong Vercel:
- `API_BASE_URL`- `HOST_BASE_URL`
Bước 3
Deploy
Sau deploy, Vercel sẽ serve:
- `/tracker.user.js`- `/tracker.meta.js`
8\. Cài Tampermonkey
Mở link:
```text
https://tm-qc-tools.company-domain.com/tracker.user.js
```
Tampermonkey sẽ hiện prompt cài đặt.
9\. Auto update
Tampermonkey sẽ check:
- `tracker.meta.js`- nếu version mới hơn thì tải `tracker.user.js`
Khi update:
1. tăng version trong `package.json`2. build lại3. deploy lại
10\. Điều cần chỉnh sau khi copy repo
A. URL thật
Thay:
- `https://your-api.company-domain.com`- `https://tm-qc-tools.company-domain.com`
B. Selector thật
Nếu input WMS không match theo heuristic hiện tại, chỉnh ở:
- `src/selectors.js`
C. Backend
Bạn cần có backend thật cho:
- authz- log
11\. Gợi ý backend validate
Backend `/log` nên check lại:
- operator có trong allowlist không- page có hợp lệ không- action có đúng page không- field required có đủ không- có bị duplicate quá gần nhau không
12\. Gợi ý vận hành
Nên làm
- allowlist theo email hoặc role- lưu log vào DB hoặc sheet nội bộ- có dashboard tổng hợp theo user / ca / ngày
Không nên
- tin hoàn toàn vào check phía client- nhúng secret vào userscript- public source code nếu có logic nội bộ nhạy cảm
```