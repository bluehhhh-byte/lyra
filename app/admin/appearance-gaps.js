"use client";
import { useState } from "react";
import AdminErrorMessage from "./error-message";
import { APPEARANCE_GAP_LABELS } from "../../lib/appearance-gaps";

// 작품 사용 정보의 빈칸을 한 번에 메운다.
//
// 감독 필드가 뒤늦게 생기면서 기존 항목이 전부 비었다. 한 건씩 곡 편집 화면을
// 열어 채우면 수십 번을 반복해야 하고, 그 사이 캡션의 `& 감독, 영화 <작품>
// 엔딩 (연도) |` 한 줄은 감독 없이 나간다.
//
// 두 단계다:
//   1. TMDB가 아는 것은 TMDB가 채운다 — tmdbId가 있는 항목의 감독·원제·포스터.
//      버튼 한 번, 외부 AI 없이 끝난다.
//   2. 남은 것만 JSON으로 내보내 밖에서 채워 오고, 돌아온 결과를 검증해 반영한다.
//      대량 작업 화면과 같은 방식이다 — 이 화면도 외부 AI를 부르지 않는다.
async function api(action, body) {
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

export default function AppearanceGaps() {
  const [scan, setScan] = useState(null);
  const [filled, setFilled] = useState(null);
  const [paste, setPaste] = useState("");
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const run = async (name, work) => {
    setBusy(name);
    setError("");
    try { await work(); } catch (reason) { setError(reason.message); } finally { setBusy(""); }
  };

  const look = () => run("scan", async () => {
    setFilled(null);
    setResult(null);
    setScan(await api("appearanceGaps", {}));
  });

  const autoFill = () => run("fill", async () => {
    const data = await api("appearanceGapFill", {});
    setFilled(data);
    setScan(await api("appearanceGaps", {}));
  });

  const download = () => {
    const rows = (scan?.items || []).filter((row) => !row.tmdbId || row.gaps.includes("director"));
    const packet = {
      note: "director_ko(한글 표기)와 director(원문)를 채워 주세요. id는 바꾸지 마세요.",
      fields: ["id", "director_ko", "director", "year", "workType", "role", "evidenceUrl"],
      items: rows,
    };
    const blob = new Blob([JSON.stringify(packet, null, 1)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `lyra-작품사용정보-결손-${rows.length}건.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const parsed = () => {
    const data = JSON.parse(paste);
    const items = Array.isArray(data) ? data : data.items;
    if (!Array.isArray(items)) throw new Error("items 배열을 찾지 못했습니다");
    return items;
  };

  const check = () => run("preview", async () => {
    setResult(null);
    setPreview(await api("appearanceGapApply", { items: parsed() }));
  });

  const apply = () => run("apply", async () => {
    setResult(await api("appearanceGapApply", { items: parsed(), apply: true }));
    setPreview(null);
    setPaste("");
    setScan(await api("appearanceGaps", {}));
  });

  const button = "border border-line px-3 py-1.5 text-sm hover:bg-surface disabled:opacity-50";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={look} disabled={Boolean(busy)}>
          {busy === "scan" ? "세는 중…" : "결손 세기"}
        </button>
        {scan && scan.auto > 0 && (
          <button type="button" className={button} onClick={autoFill} disabled={Boolean(busy)}>
            {busy === "fill" ? "채우는 중…" : "TMDB로 자동 채우기"}
          </button>
        )}
        {scan && scan.count > 0 && (
          <button type="button" className={button} onClick={download} disabled={Boolean(busy)}>
            남은 것 JSON 내려받기
          </button>
        )}
      </div>

      {scan && (
        <p className="text-sm text-muted">
          전체 {scan.total}건 중 <strong className="text-ink">{scan.count}건</strong>에 빈칸이 있습니다
          {scan.auto > 0 && <> · 그중 {scan.auto}건은 TMDB에 이미 연결돼 있어 바로 채워집니다. 연결이 없어도 제목과 연도가 모두 맞으면 찾아 붙입니다</>}
          {scan.count === 0 && " — 모두 채워졌습니다"}
        </p>
      )}

      {scan && scan.count > 0 && (
        <ul className="max-h-64 divide-y divide-line overflow-y-auto border border-line text-sm">
          {scan.items.slice(0, 100).map((row) => (
            <li key={row.id} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
              <span className="min-w-0 truncate">
                {row.workTitle}
                {row.year ? <span className="text-muted"> ({row.year})</span> : null}
                <span className="ml-2 text-xs text-muted">{row.songSlug}</span>
              </span>
              <span className="shrink-0 text-xs text-muted">
                {row.gaps.map((gap) => APPEARANCE_GAP_LABELS[gap] || gap).join(" · ")}
                {row.tmdbId ? " · TMDB" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      {filled && (
        <p className="text-sm" role="status">
          TMDB에서 {filled.filled.length}건 채웠습니다
          {filled.failed.length > 0 && <span className="text-muted"> · {filled.failed.length}건 실패</span>}
          {filled.remaining > 0 && <span className="text-muted"> · {filled.remaining}건 남음</span>}
        </p>
      )}

      <div>
        <label htmlFor="appearance-gap-paste" className="mb-1 block text-xs text-muted">
          밖에서 채워 온 JSON 붙여넣기
        </label>
        <textarea
          id="appearance-gap-paste"
          className="h-28 w-full border border-line bg-bg p-2 font-mono text-xs"
          value={paste}
          onChange={(event) => setPaste(event.target.value)}
          placeholder='{"items":[{"id":"…","director_ko":"봉준호"}]}'
        />
        <div className="mt-2 flex gap-2">
          <button type="button" className={button} onClick={check} disabled={!paste.trim() || Boolean(busy)}>
            {busy === "preview" ? "…" : "무엇이 바뀌는지 보기"}
          </button>
          <button type="button" className={button} onClick={apply} disabled={!preview?.applied?.length || Boolean(busy)}>
            {busy === "apply" ? "반영 중…" : "반영하기"}
          </button>
        </div>
      </div>

      {(preview || result) && (
        <div className="border border-line p-3 text-sm">
          {(() => {
            const shown = result || preview;
            return (
              <>
                <p>
                  {result ? "반영했습니다" : "미리보기"} — 적용 {shown.applied.length}건
                  {shown.rejected.length > 0 && <span className="text-muted"> · 거절 {shown.rejected.length}건</span>}
                </p>
                {shown.rejected.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-muted">
                    {shown.rejected.slice(0, 20).map((row, index) => (
                      <li key={`${row.id}-${index}`}>{row.id}: {row.why}</li>
                    ))}
                  </ul>
                )}
              </>
            );
          })()}
        </div>
      )}

      <AdminErrorMessage message={error} />
    </div>
  );
}
