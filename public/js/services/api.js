// api.js
const BASE_URL = "/api";

// ============================================================
// Hàm gửi request chung
// ============================================================
async function request(url, options = {}) {
  const token = localStorage.getItem("qc_session_token");
  const headers = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  if (data.success === false) throw new Error(data.error || "Request failed");
  return data;
}

// ============================================================
// Auth / User
// ============================================================
export async function fetchMe() {
  return request(`${BASE_URL}/qc/me`);
}

export async function checkAuthz(email) {
  return request(`${BASE_URL}/qc/authz`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

// ============================================================
// Dashboard
// ============================================================
export async function fetchDashboard(params) {
  const qs = new URLSearchParams(params).toString();
  return request(`${BASE_URL}/qc/dashboard?${qs}`);
}

export async function fetchLogs(operator) {
  return request(`${BASE_URL}/qc/log?operator=${encodeURIComponent(operator)}`);
}

export async function postLog(data) {
  return request(`${BASE_URL}/qc/log`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ============================================================
// Admin: Users
// ============================================================
export async function fetchUsers() {
  return request(`${BASE_URL}/admin/users`);
}

export async function createUser({ name, email, role_key }) {
  return request(`${BASE_URL}/admin/users`, {
    method: "POST",
    body: JSON.stringify({ name, email, role_key }),
  });
}

export async function updateUser({ id, name, email, role_key, is_active, widget_visible }) {
  return request(`${BASE_URL}/admin/users`, {
    method: "PUT",
    body: JSON.stringify({ id, name, email, role_key, is_active, widget_visible }),
  });
}

export async function deleteUser(id) {
  return request(`${BASE_URL}/admin/users?id=${id}`, { method: "DELETE" });
}

export async function bulkCreateUsers(payload) {
  return request(`${BASE_URL}/admin/users`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ============================================================
// Admin: Roles
// ============================================================
export async function fetchRoles() {
  return request(`${BASE_URL}/admin/roles`);
}

export async function createRole(data) {
  return request(`${BASE_URL}/admin/roles`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateRole(data) {
  return request(`${BASE_URL}/admin/roles`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteRole(id) {
  return request(`${BASE_URL}/admin/roles?id=${id}`, { method: "DELETE" });
}

// ============================================================
// Config
// ============================================================
export async function fetchPublicConfig() {
  return request(`${BASE_URL}/config/public`);
}

export async function fetchAlertConfig() {
  return request(`${BASE_URL}/config/alert`);
}

export async function updateAlertConfig(data) {
  return request(`${BASE_URL}/config/alert`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function fetchTargets() {
  return request(`${BASE_URL}/config/targets`);
}

export async function updateTarget(data) {
  return request(`${BASE_URL}/config/targets`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}