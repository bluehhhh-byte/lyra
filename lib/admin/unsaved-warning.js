export function hasUnsavedChanges(currentRaw, savedRaw) {
  if (currentRaw === null) return false;
  if (savedRaw === null) return true;
  return currentRaw !== savedRaw;
}

export function warnBeforeUnload(event, dirty) {
  if (!dirty) return false;
  event.preventDefault();
  event.returnValue = "";
  return true;
}
