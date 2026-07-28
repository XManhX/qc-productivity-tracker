// public/js/services/auth.js
const BASE_URL = "/api";

export function checkAuth() {
  const token = localStorage.getItem("qc_session_token");
  console.log("[checkAuth] token:", token);

  if (token) {
    try {
      const parts = token.split(".");
      console.log("[checkAuth] parts:", parts);

      if (parts.length === 2) {
        // Decode base64 chuẩn
        const payload = JSON.parse(atob(parts[0]));
        console.log("[checkAuth] payload:", payload);

        if (payload.email && payload.exp > Date.now()) {
          localStorage.setItem("user_email", payload.email);
          console.log("[checkAuth] token valid, stay on page");
          return true;
        } else {
          console.log("[checkAuth] expired or missing email", {
            exp: payload.exp,
            now: Date.now(),
            email: payload.email
          });
        }
      } else {
        console.log("[checkAuth] parts.length !== 2");
      }
    } catch (e) {
      console.error("[checkAuth] parse error:", e);
    }
  }

  localStorage.removeItem("qc_session_token");
  localStorage.removeItem("user_email");
  console.log("[checkAuth] redirect to login");
  window.location.href = "/login.html";
  return false;
}

export async function fetchAndStoreRole(token) {
  try {
    const data = await (
      await fetch(`${BASE_URL}/qc/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();
    localStorage.setItem("user_role", data.role_key);
  } catch (e) {
    console.error("Fetch role error:", e);
  }
}

export function handleAuthToken() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (token) {
    localStorage.setItem("qc_session_token", token);
    // Xoá token khỏi URL
    const newUrl = window.location.pathname;
    history.replaceState(null, "", newUrl);
    // Giải mã lấy email (nếu cần)
    try {
      const parts = token.split(".");
      const payload = JSON.parse(atob(parts[0]));
      if (payload.email) {
        localStorage.setItem("user_email", payload.email);
      }
    } catch (e) { }
  }
}

export function isAdmin() {
  return localStorage.getItem("user_role") === "admin";
}
