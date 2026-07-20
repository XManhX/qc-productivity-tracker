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

  store.validateFilters();
  // 3. Khởi tạo các component (chúng tự subscribe store)
  new FilterBar(document.getElementById("filter-bar-container"));
  new StatsOverview(document.getElementById("stats-overview"));
  new HeatmapTable(document.getElementById("heatmap-table"));

  // 4. Load dữ liệu lần đầu
  await store.loadData();

  console.log(store.state.data); // Debug state ban đầu

  // 5. Tự động refresh mỗi 2 phút nếu đang xem ngày hôm nay
  setInterval(() => {
    if (store.state.filters.date === store.getTodayVN()) {
      store.loadData();
    }
  }, 120000);
}

document.addEventListener("DOMContentLoaded", init);
