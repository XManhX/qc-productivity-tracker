import { store } from "../store/DashboardStore.js";

export class StatsOverview {
  constructor(container) {
    this.totalEl = container.querySelector("#stat-total-orders");
    this.activeEl = container.querySelector("#stat-active-qcs");
    this.avgEl = container.querySelector("#stat-avg-performance");
    store.on("update", () => this._update());
  }

  _update() {
    const stats = store.state.stats;
    if (!stats) {
      this.totalEl.textContent = "0";
      this.activeEl.textContent = "0";
      this.avgEl.innerHTML = `0 <span class="text-xs text-slate-400 font-normal">đơn/giờ</span>`;
      return;
    }

    this.totalEl.textContent = stats.totalOrders.toLocaleString("vi-VN");
    this.activeEl.textContent = stats.activeQCs;
    this.avgEl.innerHTML = `${stats.avgPerformance} <span class="text-xs text-slate-400 font-normal">đơn/giờ</span>`;
  }
}
