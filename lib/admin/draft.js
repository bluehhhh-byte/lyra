const PREFIX = "lyra:admin-song-draft:";
// 등록 폼은 곡 하나가 아니라 "작성 중인 새 곡"이라 slug가 없다. 같은 접두사를
// 공유해 정리 로직이 한 번에 훑을 수 있게 하고, 이름만 고정한다.
export const NEW_SONG_SLUG = "__new__";

// 7일. 근거: 그보다 오래된 초안은 되살려도 무엇을 쓰던 중이었는지 기억나지
// 않고, 그 사이 원곡이 이미 등록됐을 수 있다. 지우기 전에 콘솔에 남긴다 —
// 조용히 사라지면 "저장했는데 없어졌다"로 기억된다.
export const DRAFT_MAX_AGE_DAYS = 7;

export const songDraftKey = (slug) => `${PREFIX}${encodeURIComponent(String(slug || ""))}`;

const ageDays = (savedAt, now) => {
  const at = Date.parse(savedAt || "");
  if (!Number.isFinite(at)) return Infinity; // 시각이 없으면 믿지 않는다
  return (now - at) / 86_400_000;
};

export function readSongDraft(storage, slug, { now = Date.now(), maxAgeDays = DRAFT_MAX_AGE_DAYS, logger = console } = {}) {
  try {
    const value = storage?.getItem(songDraftKey(slug));
    if (!value) return null;
    const draft = JSON.parse(value);
    if (typeof draft?.raw !== "string") return null;
    if (ageDays(draft.savedAt, now) > maxAgeDays) {
      logger?.warn?.(`[lyra] ${maxAgeDays}일이 지난 초안을 버립니다: ${slug} (${draft.savedAt || "시각 없음"})`);
      clearSongDraft(storage, slug);
      return null;
    }
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
    // 저장 용량이 찼거나 사생활 보호 모드 — 초안을 못 남기는 것이 편집을
    // 막을 이유는 아니다.
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

// 열 때 한 번 훑어 묵은 것을 버린다. 되살릴 화면이 없는 초안(그 곡을 지웠다든지)
// 은 아무도 읽지 않아 영원히 남는다.
export function pruneSongDrafts(storage, { now = Date.now(), maxAgeDays = DRAFT_MAX_AGE_DAYS, logger = console } = {}) {
  const dropped = [];
  try {
    const keys = [];
    for (let i = 0; i < (storage?.length || 0); i++) {
      const key = storage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      try {
        const draft = JSON.parse(storage.getItem(key) || "null");
        if (!draft || ageDays(draft.savedAt, now) > maxAgeDays) {
          logger?.warn?.(`[lyra] 오래된 초안을 버립니다: ${key} (${draft?.savedAt || "시각 없음"})`);
          storage.removeItem(key);
          dropped.push(key);
        }
      } catch {
        storage.removeItem(key);
        dropped.push(key);
      }
    }
  } catch {
    // storage 접근 자체가 막힌 환경 — 정리는 다음 기회에
  }
  return dropped;
}
