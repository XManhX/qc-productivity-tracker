import { store } from "./store/DashboardStore.js";
import { NavBar } from "./components/NavBar.js";
import { FilterBar } from "./components/FilterBar.js";
import { StatsOverview } from "./components/StatsOverview.js";
import { HeatmapTable } from "./components/HeatmapTable.js";
import { Pagination } from "./components/Pagination.js";
// import { checkAuth, handleAuthToken, isAdmin } from './services/auth.js'; // Bật nếu cần auth

async function init() {
  // ---- Bỏ comment nếu cần auth ----
  // handleAuthToken();
  // if (!checkAuth()) return;
  // if (!isAdmin()) {
  //   alert('Bạn không có quyền truy cập.');
  //   window.location.href = '/index.html';
  //   return;
  // }
  new NavBar(document.getElementById("nav-container"));

  // 1. Khôi phục filter từ URL/localStorage
  store.loadFiltersFromStorage();

  // 2. Tải danh sách roles
  await store.loadRoles();

    // Thêm dòng này – tải cấu hình giờ nghỉ trước khi render bảng
  await store.loadAlertConfig();

  store.validateFilters();
  // 3. Khởi tạo các component (chúng tự subscribe store)
  new FilterBar(document.getElementById("filter-bar-container"));
  new StatsOverview(document.getElementById("stats-overview"));
  new HeatmapTable(document.getElementById("heatmap-table"));

  // 4. Load dữ liệu lần đầu
  await store.loadData();

  console.log(store.state.data); // Debug state ban đầu

  // 5. Kiểm tra chuyển ngày và tự động refresh khi cần
  setInterval(() => {
    const today = store.getTodayVN();
    if (today !== store._lastDateCheck) {
      // Sang ngày mới → cập nhật filter-date & tải lại dữ liệu
      store._lastDateCheck = today;
      store.setFilters({ date: today });
    } else if (store.state.filters.date === today) {
      // Vẫn đang trong ngày hiện tại → refresh dữ liệu
      store.loadData();
    }
  }, 60_000); // 1 phút
}

document.addEventListener("DOMContentLoaded", init);
