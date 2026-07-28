import { alertConfigStore } from "./store/AlertConfigStore.js";
import { NavBar } from "./components/NavBar.js";
import { AlertConfigForm } from "./components/AlertConfigForm.js";

async function init() {
  checkAuth(); // Yêu cầu đăng nhập

  new NavBar(document.getElementById("nav-container"), "alert-config");

  await alertConfigStore.loadConfig();

  new AlertConfigForm(document.getElementById("config-form-container"));

  lucide.createIcons();
}

document.addEventListener("DOMContentLoaded", init);
