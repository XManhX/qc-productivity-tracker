import "./style.css";
import { NavBar } from "./components/NavBar.js";
import { router } from "./router.js";

// Khởi tạo NavBar một lần, dùng chung toàn app
new NavBar(document.getElementById("nav-container"));

// Điều hướng khi click link nội bộ
document.addEventListener("click", (e) => {
  const link = e.target.closest('a[href^="/"]');
  if (link && !link.target && !link.hasAttribute("download")) {
    e.preventDefault();
    const href = link.getAttribute("href");
    history.pushState(null, "", href);
    router();
  }
});

// Xử lý back/forward
window.addEventListener("popstate", router);

// Load trang ban đầu
router();
