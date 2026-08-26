export function isSaveShortcut(event) {
  return (
    String(event?.key || "").toLowerCase() === "s" &&
    (event?.ctrlKey === true || event?.metaKey === true) &&
    event?.altKey !== true &&
    event?.shiftKey !== true
  );
}
