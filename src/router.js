const routes = {
  "/": () => import("./pages/DashboardPage.js"),
  "/users": () => import("./pages/UsersPage.js"),
  "/targets": () => import("./pages/TargetsPage.js"),
};

export async function router() {
  const path = window.location.pathname;
  const loadPage = routes[path] || routes["/"];
  const { default: Page } = await loadPage();
  const main = document.getElementById("app-main");
  main.innerHTML = "";
  new Page(main);
}
