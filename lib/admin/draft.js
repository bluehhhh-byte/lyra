const PREFIX = "lyra:admin-song-draft:";

export const songDraftKey = (slug) => `${PREFIX}${encodeURIComponent(String(slug || ""))}`;

export function readSongDraft(storage, slug) {
  try {
    const value = storage?.getItem(songDraftKey(slug));
    if (!value) return null;
    const draft = JSON.parse(value);
    if (typeof draft?.raw !== "string") return null;
    return { raw: draft.raw, savedAt: String(draft.savedAt || "") };
  } catch {
    return null;
  }
}

export function writeSongDraft(storage, slug, raw, now = () => new Date().toISOString()) {
  try {
    storage?.setItem(songDraftKey(slug), JSON.stringify({ raw: String(raw), savedAt: now() }));
    return true;
  } catch {
    return false;
  }
}

export function clearSongDraft(storage, slug) {
  try {
    storage?.removeItem(songDraftKey(slug));
    return true;
  } catch {
    return false;
  }
}
