// 한국 시간 기준 날짜. Vercel 서버는 UTC라 toISOString() 날짜는 KST 자정~오전
// 9시에 저장한 기록을 전날로 민다 — 기록일·일기·아카이브가 하루 어긋난다.
// KST는 DST가 없어 +9h 고정 시프트로 충분하다.

// 쓰기용: 오늘 날짜 (YYYY-MM-DD, KST)
export const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 읽기용: ISO 타임스탬프 → KST 날짜. 날짜만 있는 값("2026-07-07")은 이미
// 저장 당시의 로컬 날짜이므로 그대로 통과시킨다.
export const kstDay = (iso) => {
  if (!iso) return "";
  const s = String(iso);
  if (s.length <= 10) return s;
  const t = new Date(s);
  return isNaN(t) ? s.slice(0, 10) : new Date(t.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
};
