const BASE_URL = "/api";

export function checkAuth() {
  const token = localStorage.getItem("qc_session_token");
  if (token) {
    try {
      const parts = token.split(".");
      if (parts.length === 2) {
        const payload = JSON.parse(atob(parts[0]));
        if (payload.email && payload.exp > Date.now()) {
          localStorage.setItem("user_email", payload.email);
          return true;
        }
      }
    } catch (e) { }
  }
  localStorage.removeItem("qc_session_token");
  localStorage.removeItem("user_email");
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
    try {
      fetchAndStoreRole(token);
      const parts = token.split(".");
      if (parts.length === 2) {
        const payload = JSON.parse(atob(parts[0]));
        if (payload.email && payload.exp > Date.now()) {
          localStorage.setItem("qc_session_token", token);
          localStorage.setItem("user_email", payload.email);
          const newUrl = window.location.pathname;
          history.replaceState(null, "", newUrl);
        }
      }
    } catch (e) { }
  }
}

export function isAdmin() {
  return localStorage.getItem("user_role") === "admin";
}
