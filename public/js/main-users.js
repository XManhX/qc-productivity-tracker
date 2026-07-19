import { userStore } from "./store/UserStore.js";
import { NavBar } from "./components/NavBar.js";
import { UserForm } from "./components/UserForm.js";
import { ImportSection } from "./components/ImportSection.js";
import { UserList } from "./components/UserList.js";
// import { checkAuth, handleAuthToken, isAdmin } from './services/auth.js'; // nếu cần auth

async function init() {
  // ---- Bỏ comment nếu cần auth ----
  // handleAuthToken();
  // if (!checkAuth()) return;
  // if (!isAdmin()) {
  //   alert('Bạn không có quyền truy cập.');
  //   window.location.href = '/index.html';
  //   return;
  // }
  new NavBar(document.getElementById("nav-container"), "users");

  await userStore.loadRoles();
  await userStore.loadUsers();

  new UserForm(document.getElementById("single-user-container"));
  new ImportSection(document.getElementById("import-section-container"));
  new UserList(document.getElementById("user-list-container"));

  lucide.createIcons();
}

document.addEventListener("DOMContentLoaded", init);
