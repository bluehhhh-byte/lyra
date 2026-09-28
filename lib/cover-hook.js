// 캐러셀 1장 머리글이자 곡 페이지 코멘트 위에 굵게 서는 한 줄(cover_hook).
//
// 예전에는 AI가 만든 listen_when("이런 순간에" 장면)을 자동으로 얹었는데, 곡마다
// 사람이 원하는 한 줄과 어긋나는 일이 잦았고 "…한 밤"으로 쏠렸다. 이제는 사람이
// 캐러셀 창에서 가사 한 줄을 고르거나 직접 쓴 문구만 곡 데이터에 저장한다.
// 비워 두면 곡 페이지에는 아무것도 없고, 1장은 문구 없이 커버만 나간다.
// 길이는 두 줄 머리글에 들어갈 만큼만 받는다.
export const COVER_HOOK_MAX = 60;

export const cleanCoverHook = (value) =>
  String(value ?? "").replace(/\s+/g, " ").trim().slice(0, COVER_HOOK_MAX);

// 프론트매터 파서(lib/songs.js)는 [ ]로 감싼 값을 배열로 읽는다 — 문구 전체가
// 대괄호로 감싸여 있으면 저장하면 안 된다.
export const coverHookStorable = (value) => !/^\[.*\]$/.test(cleanCoverHook(value));

// 프론트매터에 cover_hook 줄을 넣거나 바꾸고, 빈 문구면 줄을 지운다.
// 앵커는 모든 곡에 있는 tags — 없으면 프론트매터 끝에 붙인다(조용히 버리지 않는다).
export function setCoverHookField(raw, value) {
  const text = String(raw ?? "").replace(/\r\n/g, "\n");
  const m = text.match(/^---\n([\s\S]*?)\n---(\n?[\s\S]*)$/);
  if (!m) return null;
  const hook = cleanCoverHook(value);
  let fm = m[1].split("\n").filter((l) => !/^cover_hook:/.test(l));
  if (hook) {
    const at = fm.findIndex((l) => /^tags:/.test(l));
    const line = `cover_hook: ${hook}`;
    if (at === -1) fm.push(line);
    else fm.splice(at + 1, 0, line);
  }
  return `---\n${fm.join("\n")}\n---${m[2]}`;
}
