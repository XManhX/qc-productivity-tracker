import { userStore } from "./store/UserStore.js";
import { NavBar } from "./components/NavBar.js";
import { UserForm } from "./components/UserForm.js";
import { ImportSection } from "./components/ImportSection.js";
import { UserList } from "./components/UserList.js";

async function init() {
  checkAuth(); // Yêu cầu đăng nhập

  new NavBar(document.getElementById("nav-container"), "users");

  await userStore.loadRoles();
  await userStore.loadUsers();

  new UserForm(document.getElementById("single-user-container"));
  new ImportSection(document.getElementById("import-section-container"));
  new UserList(document.getElementById("user-list-container"));

  lucide.createIcons();
}

document.addEventListener("DOMContentLoaded", init);
