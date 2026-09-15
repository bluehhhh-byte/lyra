"use client";
import { useState } from "react";
import AdminErrorMessage from "./error-message";

// 결손을 한 화면에서 보고, 해결할 수 있는 것부터 차례로 돌린다.
//
// 도구가 네 군데로 흩어져 있었다 — 누락 항목 보정, 번역 형식 검사, 영어 번역
// 없음 채우기, 작품 사용 정보 결손. 무엇이 얼마나 남았는지 보려면 네 번 열어
// 네 번 눌러야 했고, 그래서 아무도 전체를 보지 않았다.
//
// 여기는 판정도 생성도 하지 않는다. 세는 것은 songNeeds 한 곳이고, 고치는 것은
// 이미 있는 액션들이다. 이 화면이 하는 일은 모아서 보여 주고 순서대로 부르는
// 것뿐이다 — 규칙이 두 벌이 되면 화면마다 숫자가 달라진다.
async function api(action, body = {}) {
  const response = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.slice(0, 200) }; }
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

// 무엇을 자동으로 고칠 수 있는가. 고칠 길이 없는 항목은 숫자만 보여 주고
// 버튼을 만들지 않는다 — 누르면 아무 일도 안 나는 버튼이 더 나쁘다.
const FIELDS = [
  { key: "enTranslation", label: "영어 번역", fix: "en" },
  { key: "translation", label: "한국어 번역", fix: "lint" },
  { key: "reading", label: "독음", fix: "lint" },
  { key: "inline", label: "인라인 마커", fix: "lint" },
  { key: "comment", label: "코멘트", fix: "" },
  { key: "titleKo", label: "한글 제목", fix: "" },
  { key: "keywords", label: "키워드", fix: "" },
  { key: "emotion", label: "감정", fix: "" },
  { key: "artwork", label: "커버", fix: "" },
  { key: "year", label: "연도", fix: "" },
  { key: "sections", label: "가사 구간", fix: "" },
];

export default function GapConsole() {
  const [songs, setSongs] = useState(null);
  const [appearance, setAppearance] = useState(null);
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const note = (line) => setLog((current) => [...current, line]);

  const scan = async () => {
    setBusy("scan");
    setError("");
    setLog([]);
    try {
      const [overview, gaps] = await Promise.all([api("gapOverview"), api("appearanceGaps")]);
      setSongs(overview);
      setAppearance(gaps);
    } catch (reason) { setError(reason.message); } finally { setBusy(""); }
  };

  const resolve = async () => {
    const jobs = [];
    if (songs?.units.enTranslation) jobs.push("영어 번역");
    if (appearance?.count) jobs.push("작품 사용 정보");
    if (!jobs.length) return;
    if (!window.confirm(`${jobs.join(" · ")}을(를) 차례로 해결하고 바로 저장합니다. 진행할까요?`)) return;

    setBusy("resolve");
    setError("");
    setLog([]);
    try {
      if (appearance?.count) {
        note("작품 사용 정보 — TMDB로 채우는 중…");
        const filled = await api("appearanceGapFill");
        note(`작품 사용 정보 — ${filled.filled.length}건 채움 · ${filled.remaining}건 남음`);
      }
      if (songs?.units.enTranslation) {
        const queue = await api("enTranslateQueue");
        const targets = queue.items.filter((row) => row.fillable > 0);
        note(`영어 번역 — ${targets.length}곡 ${queue.lines}줄`);
        for (const item of targets) {
          try {
            const done = await api("enTranslate", { slug: item.slug });
            note(`  ${item.title} — ${done.filled}줄 채움`);
          } catch (reason) {
            note(`  ${item.title} — 실패: ${reason.message}`);
          }
        }
        if (queue.blockedLines) {
          note(`영어 번역 — ${queue.blockedSongs}곡 ${queue.blockedLines}줄은 번역 칸에 한국어가 있어 곡 편집 화면에서 확인해야 합니다`);
        }
      }
      note("다시 세는 중…");
      const [overview, gaps] = await Promise.all([api("gapOverview"), api("appearanceGaps")]);
      setSongs(overview);
      setAppearance(gaps);
      note("끝");
    } catch (reason) { setError(reason.message); } finally { setBusy(""); }
  };

  const button = "border border-line px-3 py-1.5 text-sm hover:bg-surface disabled:opacity-50";
  const rows = FIELDS.filter((field) => songs?.units[field.key]);
  const autoCount = (songs?.units.enTranslation ? 1 : 0) + (appearance?.count ? 1 : 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        곡과 작품 사용 정보의 빈칸을 한 번에 셉니다. 자동으로 고칠 수 있는 것만 여기서 돌리고,
        사람이 판단해야 하는 것은 어느 도구로 가야 하는지 적어 둡니다.
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={scan} disabled={Boolean(busy)}>
          {busy === "scan" ? "세는 중…" : "전체 결손 세기"}
        </button>
        {autoCount > 0 && (
          <button type="button" className={button} onClick={resolve} disabled={Boolean(busy)}>
            {busy === "resolve" ? "해결하는 중…" : "자동으로 해결할 수 있는 것 전부 실행"}
          </button>
        )}
      </div>

      {songs && (
        <div className="border border-line text-sm">
          <div className="border-b border-line px-3 py-2 text-xs text-muted">곡 {songs.total}편</div>
          {rows.length === 0 ? (
            <p className="px-3 py-2 text-muted">곡 쪽 빈칸 없음 ✓</p>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((field) => (
                <li key={field.key} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
                  <span>{field.label}</span>
                  <span className="text-xs text-muted">
                    {songs.songs[field.key]}곡 · {songs.units[field.key]}건
                    {field.fix === "en" && " · 여기서 해결"}
                    {field.fix === "lint" && " · ‘번역 형식 검사’에서"}
                    {!field.fix && " · ‘누락 항목 보정’에서"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line px-3 py-1.5">
            <span className="flex items-baseline justify-between gap-3">
              <span>작품 사용 정보</span>
              <span className="text-xs text-muted">
                {appearance ? `${appearance.count}건 / 전체 ${appearance.total}건` : "—"}
                {appearance?.count ? " · 여기서 해결" : ""}
              </span>
            </span>
          </div>
        </div>
      )}

      {log.length > 0 && (
        <pre className="max-h-64 overflow-y-auto border border-line p-3 text-xs leading-relaxed">{log.join("\n")}</pre>
      )}

      <AdminErrorMessage message={error} />
    </div>
  );
}
