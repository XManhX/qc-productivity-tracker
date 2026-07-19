import { store } from "../store/DashboardStore.js";

export class StatsOverview {
  constructor(container) {
    this.totalEl = container.querySelector("#stat-total-orders");
    this.activeEl = container.querySelector("#stat-active-qcs");
    this.avgEl = container.querySelector("#stat-avg-performance");
    store.on("update", () => this._update());
  }

  _update() {
    const data = store.state.data;
    if (!data.length) {
      this.totalEl.textContent = "0";
      this.activeEl.textContent = "0";
      this.avgEl.innerHTML = `0 <span class="text-xs text-slate-400 font-normal">đơn/giờ</span>`;
      return;
    }
    const hourStart = Number(store.state.filters.hourStart);
    const hourEnd = Number(store.state.filters.hourEnd);
    let totalOrders = 0;
    let totalActiveHours = 0;
    data.forEach((user) => {
      totalOrders += user.total || 0;
      for (let h = hourStart; h <= hourEnd; h++) {
        if (user.hourly?.[h] > 0) totalActiveHours++;
      }
    });
    const avgPerf =
      totalActiveHours > 0 ? Math.round(totalOrders / totalActiveHours) : 0;
    this.totalEl.textContent = totalOrders.toLocaleString("vi-VN");
    this.activeEl.textContent = data.length;
    this.avgEl.innerHTML = `${avgPerf} <span class="text-xs text-slate-400 font-normal">đơn/giờ</span>`;
  }
}
