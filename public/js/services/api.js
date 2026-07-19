export async function fetchDashboard(params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/qc-productivity/dashboard?${qs}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Dữ liệu không hợp lệ");
  return data;
}

export async function fetchRoles() {
  const res = await fetch("/api/qc-roles");
  if (!res.ok) throw new Error("Không thể tải roles");
  return res.json();
}

export async function fetchMe() {
  const token = localStorage.getItem("qc_session_token");
  const res = await fetch("/api/qc-productivity/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Không lấy được thông tin user");
  return res.json();
}

// ========== Users API ==========
export async function fetchUsers() {
  const res = await fetch("/api/qc-productivity/users");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function createUser({ name, email, role_key }) {
  const res = await fetch("/api/qc-productivity/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, role_key }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function updateUser({
  id,
  name,
  email,
  role_key,
  is_active,
  widget_visible,
}) {
  const res = await fetch("/api/qc-productivity/users", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      name,
      email,
      role_key,
      is_active,
      widget_visible,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function bulkCreateUsers(payload) {
  // payload = { import: [...] } hoặc gửi thẳng array tùy API
  const res = await fetch("/api/qc-productivity/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// Thêm vào cuối file api.js
export async function fetchTargets() {
  const res = await fetch("/api/qc-productivity/targets");
  if (!res.ok) throw new Error("Lỗi tải targets");
  return res.json();
}

export async function createRole(data) {
  const res = await fetch("/api/qc-roles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Lỗi");
  }
  return res.json();
}

export async function updateRole(data) {
  const res = await fetch("/api/qc-roles", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Lỗi");
  }
  return res.json();
}

export async function deleteRole(id) {
  const res = await fetch(`/api/qc-roles?id=${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Lỗi");
  }
  return res.json();
}

export async function updateTarget(data) {
  const res = await fetch("/api/qc-productivity/targets", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Lỗi");
  }
  return res.json();
}
