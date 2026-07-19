import { targetStore } from "../store/TargetStore.js";
import { RoleTable } from "../components/Targets/RoleTable.js";
import { TargetTable } from "../components/Targets/TargetTable.js";

export default class TargetsPage {
  constructor(container) {
    container.innerHTML = `
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="space-y-8">
          <div id="role-section" class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"></div>
          <div id="target-section" class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"></div>
        </div>
      </div>
    `;
    targetStore.loadAll();
    new RoleTable(document.getElementById("role-section"));
    new TargetTable(document.getElementById("target-section"));
  }
}
