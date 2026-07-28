import { NavBar } from "./components/NavBar.js";
import { AssignmentForm } from "./components/AssignmentForm.js";
import { AssignmentList } from "./components/AssignmentList.js";
import { AssignmentStore } from "./store/AssignmentStore.js";
import { checkAuth } from './services/auth.js';

async function init() {
    checkAuth(); // Yêu cầu đăng nhập

    new NavBar(document.getElementById("nav-container"), "assignments");

    const store = new AssignmentStore();
    await store.loadAssignments();

    new AssignmentForm(document.getElementById("assignment-form-container"), store);
    new AssignmentList(document.getElementById("assignment-list-container"), store);

    lucide.createIcons();
}

document.addEventListener("DOMContentLoaded", init);