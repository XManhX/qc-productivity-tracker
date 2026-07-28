import * as XLSX from "xlsx";

export function exportToExcel(dataArray, filename = "danh-sach-users.xlsx") {
    const ws = XLSX.utils.json_to_sheet(dataArray);
    // Độ rộng cột đề xuất
    ws["!cols"] = [
        { wch: 25 }, // Họ tên
        { wch: 30 }, // Email
        { wch: 20 }, // Vai trò
        { wch: 15 }, // Trạng thái
        { wch: 15 }, // Widget
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Users");
    XLSX.writeFile(wb, filename);
}