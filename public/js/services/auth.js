const BASE_URL = "/api";

// Hàm đăng nhập bằng email/password
export async function login(email, password) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Đăng nhập thất bại");
  }
  return data; // { token, ... }
}

// Hàm kiểm tra token hiện tại có hợp lệ không
export async function checkSession(token) {
  try {
    const res = await fetch(`${BASE_URL}/qc/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

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
    } catch (e) {
      // Token không hợp lệ
    }
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
    localStorage.setItem("qc_session_token", token);
    const newUrl = window.location.pathname;
    history.replaceState(null, "", newUrl);
    try {
      const parts = token.split(".");
      const payload = JSON.parse(atob(parts[0]));
      if (payload.email) {
        localStorage.setItem("user_email", payload.email);
      }
    } catch (e) {
      console.error("Invalid token:", e);
    }
  }
}

export function isAdmin() {
  return localStorage.getItem("user_role") === "admin";
}