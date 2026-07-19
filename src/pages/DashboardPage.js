import { store } from "../store/DashboardStore.js";
import { FilterBar } from "../components/Dashboard/FilterBar.js";
import { StatsOverview } from "../components/Dashboard/StatsOverview.js";
import { HeatmapTable } from "../components/Dashboard/HeatmapTable.js";

export default class DashboardPage {
  constructor(container) {
    container.innerHTML = `
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div id="filter-bar-container" class="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-6"></div>
        <div id="stats-overview" class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"></div>
        <div id="heatmap-table" class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"></div>
      </div>
    `;
    new FilterBar(document.getElementById("filter-bar-container"));
    new StatsOverview(document.getElementById("stats-overview"));
    new HeatmapTable(document.getElementById("heatmap-table"));

    store.loadFiltersFromStorage();
    store.loadRoles().then(() => store.loadData());

    setInterval(() => {
      if (store.state.filters.date === store.getTodayVN()) store.loadData();
    }, 120000);
  }
}
