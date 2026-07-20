// services/api.js
const BASE_URL = "/api/qc-productivity";

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

// Dashboard
export async function fetchDashboard(params) {
  const qs = new URLSearchParams(params).toString();
  return request(`${BASE_URL}/dashboard?${qs}`);
}

// Roles
export async function fetchRoles() {
  return request("/api/qc-roles");
}

// Users
export async function fetchUsers() {
  return request(`${BASE_URL}/users`);
}

export async function createUser({ name, email, role_key }) {
  return request(`${BASE_URL}/users`, {
    method: "POST",
    body: JSON.stringify({ name, email, role_key }),
  });
}

export async function updateUser({
  id,
  name,
  email,
  role_key,
  is_active,
  widget_visible,
}) {
  return request(`${BASE_URL}/users`, {
    method: "PUT",
    body: JSON.stringify({
      id,
      name,
      email,
      role_key,
      is_active,
      widget_visible,
    }),
  });
}

export async function bulkCreateUsers(payload) {
  return request(`${BASE_URL}/users`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Targets
export async function fetchTargets() {
  return request(`${BASE_URL}/targets`);
}

export async function updateTarget(data) {
  return request(`${BASE_URL}/targets`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// Roles (CRUD)
export async function createRole(data) {
  return request("/api/qc-roles", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateRole(data) {
  return request("/api/qc-roles", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteRole(id) {
  return request(`/api/qc-roles?id=${id}`, { method: "DELETE" });
}

// Auth
export async function fetchMe() {
  return request(`${BASE_URL}/me`);
}
