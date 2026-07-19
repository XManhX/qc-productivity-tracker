export function refreshIcons() {
  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }
}
