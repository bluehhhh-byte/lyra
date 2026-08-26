export function isEditableTarget(target) {
  if (!target) return false;
  const tag = String(target.tagName || "").toLowerCase();
  if (["input", "textarea", "select"].includes(tag) || target.isContentEditable) return true;
  return Boolean(target.closest?.("input, textarea, select, [contenteditable='true']"));
}

export function shouldOpenSearchShortcut(event) {
  return Boolean(
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    String(event.key || "").toLowerCase() === "k" &&
    !isEditableTarget(event.target)
  );
}
