function normalizeText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}
function nowISO() {
  return new Date().toISOString();
}
function getPageType(pageConfig, href) {
  const entry = Object.entries(pageConfig).find(([, cfg]) =>
    href.includes(cfg.pathIncludes),
  );
  return entry ? entry[0] : "unknown";
}
function findActionButton(actionText) {
  const buttons = Array.from(document.querySelectorAll("button"));
  return (
    buttons.find(
      (btn) =>
        normalizeText(btn.innerText).toLowerCase() === actionText.toLowerCase(),
    ) || null
  );
}
async function getCurrentUserEmail(loginInfoUrl) {
  try {
    const resp = await fetch(loginInfoUrl, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) return "";
    const data = await resp.json();
    if (data?.retcode !== 0) return "";
    return normalizeText(data?.data?.email || "").toLowerCase();
  } catch (e) {
    console.log("[QC Tracker] getCurrentUserEmail error", e);
    return "";
  }
}
function getInputValueByKeywords(keywords = []) {
  const inputs = Array.from(document.querySelectorAll("input, textarea"));
  for (const el of inputs) {
    const attrs = [
      el.name,
      el.id,
      el.placeholder,
      el.getAttribute("aria-label"),
      el.getAttribute("data-testid"),
    ]
      .filter(Boolean)
      .map((v) => String(v).toLowerCase());
    const matched = keywords.some((keyword) =>
      attrs.some((attr) => attr.includes(keyword.toLowerCase())),
    );
    if (matched) return normalizeText(el.value || "");
  }
  return "";
}
module.exports = {
  normalizeText,
  nowISO,
  getPageType,
  findActionButton,
  getCurrentUserEmail,
  getInputValueByKeywords,
};
