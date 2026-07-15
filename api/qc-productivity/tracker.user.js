// api/qc-productivity/tracker.js
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  try {
    // Đọc file tracker.user.js từ thư mục public hoặc thư mục gốc tùy cấu trúc dự án của bạn
    // Ở đây chúng ta tìm file trong thư mục public trước, nếu không có sẽ tìm ở thư mục gốc
    let filePath = path.join(process.cwd(), 'public', 'tracker.user.js');
    
    if (!fs.existsSync(filePath)) {
      filePath = path.join(process.cwd(), 'tracker.user.js');
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('// Error: File tracker.user.js not found on server.');
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');

    // Thiết lập Header bắt buộc để Tampermonkey tự động kích hoạt cài đặt
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="tracker.user.js"');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.status(200).send(fileContent);
  } catch (error) {
    return res.status(500).send(`// Server Error: ${error.message}`);
  }
}