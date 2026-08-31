"use client";

import { useCallback, useEffect, useState } from "react";
import AdminErrorMessage from "./error-message";

const WORK_TYPES = [
  ["movie", "영화"],
  ["drama", "드라마"],
  ["anime_movie", "극장판 애니메이션"],
  ["anime_series", "TV 애니메이션"],
];

const ROLES = [
  ["main_theme", "메인 주제가"],
  ["opening", "오프닝"],
  ["ending", "엔딩"],
  ["insert_song", "삽입곡"],
  ["background", "배경음악"],
  ["trailer", "예고편·프로모션"],
  ["character_song", "캐릭터송"],
  ["other", "기타"],
];

const input =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base outline-none focus:border-accent sm:text-sm";
const button =
  "rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg transition active:scale-[0.98] disabled:opacity-40";

const blank = () => ({
  workTitle: "",
  originalTitle: "",
  workType: "movie",
  mediaType: "movie",
  tmdbId: "",
  year: "",
  poster: "",
  role: "insert_song",
  season: "",
  episode: "",
  evidenceUrl: "",
  evidenceLabel: "공식 자료",
  status: "verified",
  note: "",
});

async function api(action, body) {
  const response = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.slice(0, 200) };
  }
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

const labelOf = (options, value) => options.find(([key]) => key === value)?.[1] || value;

export default function SongAppearanceEditor({ songSlug }) {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!songSlug) return;
    const data = await api("appearanceList", { songSlug });
    setItems(data.items || []);
  }, [songSlug]);

  useEffect(() => {
    setError("");
    void load().catch((reason) => setError(reason.message));
  }, [load]);

  const run = async (name, work) => {
    setBusy(name);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy("");
    }
  };

  const search = () => run("search", async () => {
    const data = await api("movieSearch", { query });
    setResults(data.results || []);
    if (!(data.results || []).length) setMessage("검색 결과가 없습니다. 아래에서 작품명을 직접 입력할 수 있습니다.");
  });

  const pick = (result) => run("detail", async () => {
    const detail = await api("movieDetail", { tmdbId: result.tmdbId, mediaType: result.mediaType });
    const workType = detail.isAnimation
      ? detail.mediaType === "tv" ? "anime_series" : "anime_movie"
      : detail.mediaType === "tv" ? "drama" : "movie";
    setForm((current) => ({
      ...current,
      workTitle: detail.title || result.title,
      originalTitle: detail.originalTitle || result.originalTitle || "",
      workType,
      mediaType: detail.mediaType,
      tmdbId: detail.tmdbId,
      year: detail.year || "",
      poster: detail.poster || result.thumb || "",
    }));
    setResults([]);
    setQuery(detail.title || result.title);
  });

  const save = () => run("save", async () => {
    await api("appearanceSave", { songSlug, ...form });
    setForm(blank());
    setQuery("");
    setResults([]);
    setMessage("작품 사용 정보를 저장했습니다.");
    await load();
  });

  const remove = (item) => {
    if (!window.confirm(`‘${item.workTitle}’ 연결을 삭제할까요?`)) return;
    void run(`delete:${item.id}`, async () => {
      await api("appearanceDelete", { id: item.id });
      setMessage("연결을 삭제했습니다.");
      await load();
    });
  };

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <section className="rounded-xl border border-line bg-bg/40 p-4 sm:p-5" aria-labelledby={`appearance-title-${songSlug}`}>
      <h2 id={`appearance-title-${songSlug}`} className="text-sm font-semibold">작품 사용 정보</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        영화·드라마·애니메이션에서 이 곡이 어떻게 쓰였는지 연결합니다. ‘확인됨’은 근거 주소가 있어야 공개됩니다.
      </p>

      {items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3">
              {item.poster ? <img src={item.poster} alt="" className="h-16 w-11 shrink-0 rounded object-cover" /> : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.workTitle}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {labelOf(WORK_TYPES, item.workType)} · {labelOf(ROLES, item.role)}
                  {item.season != null ? ` · 시즌 ${item.season}` : ""}
                  {item.episode != null ? ` · ${item.episode}화` : ""}
                </p>
                <p className={`mt-1 text-[11px] ${item.status === "verified" ? "text-accent" : "text-amber-500"}`}>
                  {item.status === "verified" ? "확인됨 · 공개 중" : "검토 필요 · 비공개"}
                </p>
              </div>
              <button
                type="button"
                aria-label={`${item.workTitle} 연결 삭제`}
                disabled={Boolean(busy)}
                onClick={() => remove(item)}
                className="shrink-0 text-xs text-muted hover:text-red-500 disabled:opacity-40"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5">
        <label htmlFor={`work-search-${songSlug}`} className="mb-1 block text-xs text-muted">작품 검색</label>
        <div className="flex gap-2">
          <input
            id={`work-search-${songSlug}`}
            className={input}
            placeholder="작품명 검색 또는 직접 입력"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && query.trim()) {
                event.preventDefault();
                void search();
              }
            }}
          />
          <button type="button" className={button} disabled={!query.trim() || Boolean(busy)} onClick={search}>
            {busy === "search" ? "…" : "검색"}
          </button>
        </div>
        {results.length > 0 && (
          <ul className="mt-2 max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {results.map((result) => (
              <li key={`${result.mediaType}:${result.tmdbId}`}>
                <button type="button" onClick={() => pick(result)} className="flex w-full items-center gap-3 p-2 text-left hover:bg-surface">
                  {result.thumb ? <img src={result.thumb} alt="" className="h-14 w-10 shrink-0 rounded object-cover" /> : null}
                  <span className="min-w-0 text-sm">
                    <span className="block truncate font-medium">{result.title}</span>
                    <span className="text-xs text-muted">{result.kind} · {result.year || "연도 미상"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted sm:col-span-2">
          작품명
          <input className={input + " mt-1"} value={form.workTitle} onChange={(event) => set("workTitle", event.target.value)} placeholder="검색 결과가 없으면 직접 입력" />
        </label>
        {form.tmdbId && (
          <p className="-mt-1 text-[11px] text-muted sm:col-span-2">
            TMDB #{form.tmdbId}와 연결됨 ·{" "}
            <button
              type="button"
              className="underline hover:text-accent"
              onClick={() => setForm((current) => ({
                ...current,
                originalTitle: "",
                tmdbId: "",
                poster: "",
              }))}
            >
              직접 입력으로 전환
            </button>
          </p>
        )}
        <label className="text-xs text-muted">
          작품 종류
          <select className={input + " mt-1"} value={form.workType} onChange={(event) => {
            const workType = event.target.value;
            setForm((current) => ({ ...current, workType, mediaType: workType === "drama" || workType === "anime_series" ? "tv" : "movie" }));
          }}>
            {WORK_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">
          공개 연도 <span className="text-muted/60">(선택)</span>
          <input type="number" min="1800" max="2200" className={input + " mt-1"} value={form.year} onChange={(event) => set("year", event.target.value)} />
        </label>
        <label className="text-xs text-muted">
          사용 방식
          <select className={input + " mt-1"} value={form.role} onChange={(event) => set("role", event.target.value)}>
            {ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">
          시즌 <span className="text-muted/60">(선택)</span>
          <input type="number" min="0" className={input + " mt-1"} value={form.season} onChange={(event) => set("season", event.target.value)} />
        </label>
        <label className="text-xs text-muted">
          회차 <span className="text-muted/60">(선택)</span>
          <input type="number" min="0" className={input + " mt-1"} value={form.episode} onChange={(event) => set("episode", event.target.value)} />
        </label>
        <label className="text-xs text-muted sm:col-span-2">
          근거 주소
          <input type="url" className={input + " mt-1"} value={form.evidenceUrl} onChange={(event) => set("evidenceUrl", event.target.value)} placeholder="공식 OST·제작사·음반사 페이지 주소" />
        </label>
        <label className="text-xs text-muted">
          근거 이름
          <input className={input + " mt-1"} value={form.evidenceLabel} onChange={(event) => set("evidenceLabel", event.target.value)} />
        </label>
        <label className="text-xs text-muted">
          공개 상태
          <select className={input + " mt-1"} value={form.status} onChange={(event) => set("status", event.target.value)}>
            <option value="verified">확인됨 · 공개</option>
            <option value="pending">검토 필요 · 비공개</option>
          </select>
        </label>
        <label className="text-xs text-muted sm:col-span-2">
          관리자 메모 <span className="text-muted/60">(공개되지 않음)</span>
          <textarea className={input + " mt-1 h-20"} value={form.note} onChange={(event) => set("note", event.target.value)} placeholder="예고편에만 사용됨 등 구분이 필요한 내용" />
        </label>
      </div>
      <button type="button" className={button + " mt-3"} disabled={!form.workTitle.trim() || Boolean(busy)} onClick={save}>
        {busy === "save" ? "저장 중…" : "작품 연결 저장"}
      </button>
      {message && <p className="mt-2 text-xs text-muted" role="status">{message}</p>}
      <AdminErrorMessage message={error} className="mt-3" />
    </section>
  );
}
