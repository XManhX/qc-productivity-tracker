import { alertConfigStore } from "./store/AlertConfigStore.js";
import { NavBar } from "./components/NavBar.js";
import { AlertConfigForm } from "./components/AlertConfigForm.js";
import { handleAuthToken, checkAuth } from './services/auth.js';


async function init() {
  handleAuthToken();
  checkAuth(); // Kiểm tra đăng nhập, nếu không có token hợp lệ sẽ redirect

  new NavBar(document.getElementById("nav-container"), "alert-config");

  await alertConfigStore.loadConfig();

  new AlertConfigForm(document.getElementById("config-form-container"));

  lucide.createIcons();
}

document.addEventListener("DOMContentLoaded", init);
