import { NavBar } from "./components/NavBar.js";
import { AssignmentForm } from "./components/AssignmentForm.js";
import { AssignmentList } from "./components/AssignmentList.js";
import { AssignmentStore } from "./store/AssignmentStore.js";
import { handleAuthToken, checkAuth } from './services/auth.js';


async function init() {
    handleAuthToken();
    checkAuth(); // Kiểm tra đăng nhập, nếu không có token hợp lệ sẽ redirect

    new NavBar(document.getElementById("nav-container"), "assignments");

    const store = new AssignmentStore();
    await store.loadAssignments();

    new AssignmentForm(document.getElementById("assignment-form-container"), store);
    new AssignmentList(document.getElementById("assignment-list-container"), store);

    lucide.createIcons();
}

document.addEventListener("DOMContentLoaded", init);