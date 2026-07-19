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
