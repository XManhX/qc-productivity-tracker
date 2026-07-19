import { targetStore } from "./store/TargetStore.js";
import { NavBar } from "./components/NavBar.js";
import { RoleTable } from "./components/RoleTable.js";
import { TargetTable } from "./components/TargetTable.js";

async function init() {
  new NavBar(document.getElementById("nav-container"), "targets");
  new RoleTable(document.getElementById("role-section"));
  new TargetTable(document.getElementById("target-section"));
  await targetStore.loadAll();
  lucide.createIcons();
}

document.addEventListener("DOMContentLoaded", init);
