"use client";
import { useMemo, useState } from "react";
import { EMOTIONS } from "../../lib/keywords";
import { filterAdminSongs } from "../../lib/admin/song-search";
import AdminErrorMessage from "./error-message";

async function api(action, body) {
  const res = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.slice(0, 200) };
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Per-song maintenance: regenerate the comment (음슴체), or add a translation to a
// song that has none (used to give Korean songs the bilingual two-line layout).
export default function SongTools({ songs, duplicateGroups = [] }) {
  const [state, setState] = useState({}); // slug -> { busy, comment, msg, err }
  const [query, setQuery] = useState("");
  const [duplicates, setDuplicates] = useState(duplicateGroups);
  const filteredSongs = useMemo(() => filterAdminSongs(songs, query), [songs, query]);

  const set = (slug, patch) => setState((s) => ({ ...s, [slug]: { ...s[slug], ...patch } }));

  const regenMeta = async (slug) => {
    set(slug, { busy: "meta", err: "", msg: "", previousComment: "" });
    try {
      const data = await api("regenMeta", { slug });
      const { updated, comment, previousComment } = data;
      // 메타 재생성은 코멘트를 덮어쓴다. 필드 이름만 알려주면 무엇으로 바뀌었는지,
      // 무엇이 사라졌는지 확인할 길이 없어 되돌릴지 판단할 수 없다.
      const { keptWebComment } = data;
      set(slug, {
        msg: [
          updated?.length ? `갱신: ${updated.join(", ")}` : "변경 없음",
          keptWebComment ? "웹 근거 코멘트는 그대로 둠" : "",
        ].filter(Boolean).join(" · "),
        comment: comment ?? undefined,
        previousComment: comment && previousComment && comment !== previousComment ? previousComment : "",
      });
    } catch (e) {
      set(slug, { err: e.message });
    } finally {
      set(slug, { busy: "" });
    }
  };

  const regen = async (slug) => {
    set(slug, { busy: "comment", err: "", msg: "", previousComment: "" });
    try {
      const { comment, previousComment, appearanceSuggestion, commentSources = [], degraded } = await api("regenComment", { slug });
      const prev = comment && previousComment && comment !== previousComment ? previousComment : "";
      if (degraded) {
        // 웹 조사가 막혀 가사만으로 썼다는 사실을 결과에 남긴다 — 출처가 왜 없는지
        // 나중에 다시 물어보게 되는 것이 이 화면의 반복된 문제였다.
        set(slug, { comment, previousComment: prev, msg: `웹 조사 못 함 · 가사만으로 갱신 · ${degraded}` });
      } else if (appearanceSuggestion) {
        const { unchanged } = await api("appearanceSave", { songSlug: slug, ...appearanceSuggestion });
        set(slug, { comment, previousComment: prev, msg: unchanged ? `코멘트 갱신 · 작품 정보 확인됨 · 근거 ${commentSources.length}개` : `코멘트·작품 정보 갱신 · 근거 ${commentSources.length}개` });
      } else {
        set(slug, { comment, previousComment: prev, msg: commentSources.length ? `근거 기반 코멘트 갱신 · 출처 ${commentSources.length}개` : "가사 중심 코멘트 갱신" });
      }
    } catch (e) {
      set(slug, { err: e.message });
    } finally {
      set(slug, { busy: "" });
    }
  };

  const notes = async (slug) => {
    set(slug, { busy: "notes", err: "", msg: "", previousComment: "" });
    try {
      const { notes: n } = await api("regenNotes", { slug });
      set(slug, { msg: `해설 ${n}개 생성·저장 완료` });
    } catch (e) {
      set(slug, { err: e.message });
    } finally {
      set(slug, { busy: "" });
    }
  };

  const restanza = async (slug) => {
    set(slug, { busy: "stanza", err: "", msg: "", previousComment: "" });
    try {
      const { stanzas } = await api("restanza", { slug });
      set(slug, { msg: `연 ${stanzas}개로 재구성·저장 완료` });
    } catch (e) {
      set(slug, { err: e.message });
    } finally {
      set(slug, { busy: "" });
    }
  };

  // 추천 곡 생성 — Gemini 1회 + iTunes 매칭. /recommendations/music에 회차로 쌓인다.
  const [recsBusy, setRecsBusy] = useState("");
  const [recMode, setRecMode] = useState("balance");
  const [recEmotion, setRecEmotion] = useState("고독");
  const songRecs = async () => {
    setRecsBusy("추천 생성 중…");
    try {
      const { added, total, mode } = await api("songRecs", { mode: recMode, emotion: recEmotion });
      setRecsBusy(`추천 +${added}곡 (${mode}, 누적 ${total}) — 저장 완료`);
    } catch (e) {
      setRecsBusy(`실패: ${e.message}`);
    }
  };

  // 취향 리포트 생성 — Gemini 1회. /songs/taste 상단에 표시되고 추천 프롬프트에도 반영.
  const musicReport = async () => {
    setRecsBusy("리포트 생성 중…");
    try {
      const { count } = await api("musicReport", {});
      setRecsBusy(`리포트 생성됨 (${count}곡 기준) — 저장 완료`);
    } catch (e) {
      setRecsBusy(`실패: ${e.message}`);
    }
  };

  // 가사 모티프 생성 — 전곡 가사를 Gemini 1회로 클러스터. /songs/motifs 반영.
  const motifs = async () => {
    setRecsBusy("모티프 분석 중…");
    try {
      const { motifs: n } = await api("motifs", {});
      setRecsBusy(`모티프 ${n}개 생성됨 — 저장 완료`);
    } catch (e) {
      setRecsBusy(`실패: ${e.message}`);
    }
  };

  const addTrans = async (slug) => {
    set(slug, { busy: "trans", err: "", msg: "", previousComment: "" });
    try {
      await api("addTranslation", { slug });
      set(slug, { msg: "번역 추가·저장 완료" });
    } catch (e) {
      set(slug, { err: e.message });
    } finally {
      set(slug, { busy: "" });
    }
  };

  const mergeDuplicate = async (canonicalSlug, duplicateSlug) => {
    if (!window.confirm("대표 곡의 기존 값은 유지하고, 중복 기록은 삭제하지 않은 채 대표 곡으로 연결합니다. 계속할까요?")) return;
    set(canonicalSlug, { busy: "merge", err: "", msg: "", previousComment: "" });
    try {
      const result = await api("mergeDuplicate", { canonicalSlug, duplicateSlug });
      setDuplicates((groups) => groups.filter((group) => !group.songs.some((song) => song.slug === duplicateSlug)));
      set(canonicalSlug, { msg: `중복 병합 완료 · 보완 ${result.copied.length}개 · 수록정보 이전 ${result.movedAppearances}개` });
    } catch (error) {
      set(canonicalSlug, { err: error.message });
    } finally {
      set(canonicalSlug, { busy: "" });
    }
  };

  return (
    <div className="max-w-2xl">
      {duplicates.length > 0 && (
        <details className="mb-4 border border-line bg-surface p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            중복 후보 {duplicates.length}쌍 검토
          </summary>
          <p className="mt-2 text-xs text-muted">같은 Apple 곡 ID 또는 같은 아티스트·제목입니다. 자동 삭제하지 않으며 두 기록을 확인한 뒤 정리합니다.</p>
          <ul className="mt-2 space-y-2 text-xs">
            {duplicates.map((group, index) => (
              <li key={`${group.reason}-${index}`} className="border-t border-line pt-2">
                <span className="mr-2 text-muted">{group.reason === "trackId" ? "Apple 곡 ID 일치" : "표기 정규화 일치"}</span>
                {group.songs.map((item, itemIndex) => (
                  <span key={item.slug}>
                    {itemIndex > 0 && <span className="mx-1 text-muted">↔</span>}
                    <a href={`/songs/${item.slug}`} className="text-accent hover:underline">{item.artist} — {item.title}</a>
                    {item.date && <span className="ml-1 text-muted">({item.date})</span>}
                    {group.songs.length === 2 && (
                      <button
                        type="button"
                        disabled={!!state[item.slug]?.busy}
                        onClick={() => mergeDuplicate(item.slug, group.songs.find((song) => song.slug !== item.slug).slug)}
                        className="ml-2 border border-line px-1.5 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-40"
                      >
                        이 기록을 대표로
                      </button>
                    )}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </details>
      )}
      {/* 모바일: 2열 그리드, 데스크톱: 한 줄 — 고정 폭 버튼이 좁은 화면을
          뚫고 나가지 않게 한다. */}
      <div className="mb-3 grid grid-cols-2 items-center gap-2 sm:flex sm:gap-3">
        {/* 키워드·감정 일괄 추출 버튼이 있던 자리 — 전곡 소급은 CLAUDE.md의 대량
            작업 원칙대로 로컬 스크립트·bulkApply 경로가 맡고, 여기서는 Gemini 1회로
            끝나는 AI 취향 리포트를 생성한다. /songs/taste 상단에 게시된다. */}
        <button
          onClick={musicReport}
          disabled={recsBusy.endsWith("중…")}
          className=" border border-accent px-4 py-2 text-center text-sm font-semibold leading-tight text-accent hover:bg-accent hover:text-bg disabled:opacity-40 sm:min-w-32"
        >
          AI 리포트
          <br />
          생성
        </button>
        <div className="flex flex-col gap-1 sm:min-w-32">
          <div className="flex gap-1">
            <select
              value={recMode}
              onChange={(e) => setRecMode(e.target.value)}
              aria-label="추천 방향"
              className="w-full  border border-line bg-surface px-1.5 py-1 text-xs outline-none focus:border-accent"
            >
              <option value="balance">균형</option>
              <option value="deep">깊게</option>
              <option value="wide">넓게</option>
              <option value="mood">분위기</option>
            </select>
            {recMode === "mood" && (
              <select
                value={recEmotion}
                onChange={(e) => setRecEmotion(e.target.value)}
                aria-label="감정"
                className="w-full  border border-line bg-surface px-1.5 py-1 text-xs outline-none focus:border-accent"
              >
                {EMOTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            )}
          </div>
          <button
            onClick={songRecs}
            disabled={recsBusy.endsWith("중…")}
            className=" border border-accent px-4 py-1.5 text-center text-sm font-semibold leading-tight text-accent hover:bg-accent hover:text-bg disabled:opacity-40"
          >
            추천 곡 생성
          </button>
        </div>
        <button
          onClick={motifs}
          disabled={recsBusy.endsWith("중…")}
          className=" border border-accent px-4 py-2 text-center text-sm font-semibold leading-tight text-accent hover:bg-accent hover:text-bg disabled:opacity-40 sm:min-w-32"
        >
          모티프
          <br />
          생성
        </button>
        <span className="col-span-2 text-xs text-muted sm:col-span-1">
          {recsBusy || "가사 분석은 가사만 보고 태그·코멘트를 덮어씀 · 웹 조사는 근거를 찾아 출처까지 남김 · AI 리포트는 /songs/taste 상단에 게시"}
        </span>
      </div>
      <div className="mb-3  border border-line bg-surface p-3">
        <label htmlFor="registered-song-search" className="mb-1.5 block text-xs font-semibold text-muted">
          등록된 곡 검색
        </label>
        <div className="flex gap-2">
          <input
            id="registered-song-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="원문·한글 제목, 아티스트, 앨범 또는 별칭"
            autoComplete="off"
            className="min-w-0 flex-1  border border-line bg-bg px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="shrink-0  border border-line px-3 py-2 text-xs text-muted transition hover:border-accent hover:text-accent"
            >
              초기화
            </button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted" aria-live="polite">
          {query ? `검색 결과 ${filteredSongs.length}곡 / 전체 ${songs.length}곡` : `전체 ${songs.length}곡`}
        </p>
      </div>
      <ul className="divide-y divide-line  border border-line">
      {filteredSongs.map((s) => {
        const st = state[s.slug] || {};
        return (
          <li key={s.slug} className="px-3 py-2 text-sm">
            {/* title on its own line, actions underneath — the row ran out of
                width once there were five of them */}
            <div className="flex items-start gap-3">
              {/* 표지를 누르면 그 곡의 글로 간다 — 목록에서 눈에 걸린 곡을
                  바로 열어 보게. 표지가 없는 곡도 같은 자리를 누를 수 있어야
                  한다(빈 칸만 안 열리면 그게 더 헷갈린다). */}
              <a
                href={`/songs/${s.slug}`}
                title={`${s.title} 페이지 열기`}
                aria-label={`${s.title} 페이지 열기`}
                className="shrink-0 transition hover:opacity-70"
              >
                {s.artwork ? (
                  <img
                    src={s.artwork.replace("600x600bb", "100x100bb")} // 36px slot needs no 600px source
                    alt=""
                    loading="lazy"
                    className="h-9 w-9 "
                  />
                ) : (
                  <span aria-hidden="true" className="block h-9 w-9  bg-line" />
                )}
              </a>
              <div className="min-w-0 flex-1">
              <p className="truncate">
                <span className="font-medium">{s.title}</span>
                {s.title_ko && s.title_ko !== s.title && (
                  <span className="text-muted"> ({s.title_ko})</span>
                )}
                <span className="text-muted"> — {s.artist}</span>
                {s.artist_ko && s.artist_ko !== s.artist && (
                  <span className="text-muted"> ({s.artist_ko})</span>
                )}
              </p>
              {/* 커버 카드에 실리는 "이런 순간에" 한 줄 — 없는 곡은 조용히 비운다 */}
              {s.listenWhen && (
                <p className="truncate text-xs text-muted" data-listen-when>「{s.listenWhen}」</p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                onClick={() => regenMeta(s.slug)}
                disabled={!!st.busy}
                className="shrink-0 text-xs text-accent hover:underline disabled:opacity-40"
              >
                {st.busy === "meta" ? "분석 중…" : "가사 분석"}
              </button>
              <button
                onClick={() => regen(s.slug)}
                disabled={!!st.busy}
                className="shrink-0 text-xs text-accent hover:underline disabled:opacity-40"
              >
                {st.busy === "comment" ? "조사 중…" : "웹 조사"}
              </button>
              <button
                onClick={() => notes(s.slug)}
                disabled={!!st.busy}
                className="shrink-0 text-xs text-accent hover:underline disabled:opacity-40"
              >
                {st.busy === "notes" ? "생성 중…" : "해설"}
              </button>
              <button
                onClick={() => restanza(s.slug)}
                disabled={!!st.busy}
                className="shrink-0 text-xs text-accent hover:underline disabled:opacity-40"
              >
                {st.busy === "stanza" ? "정리 중…" : "연 정리"}
              </button>
              {!s.hasTranslation && (
                <button
                  onClick={() => addTrans(s.slug)}
                  disabled={!!st.busy}
                  className="shrink-0 text-xs text-accent hover:underline disabled:opacity-40"
                >
                  {st.busy === "trans" ? "번역 중…" : "번역 추가"}
                </button>
              )}
              <a href={`/admin/edit/${s.slug}`} className="shrink-0 text-xs text-muted hover:text-accent">
                수정
              </a>
              </div>
              </div>
            </div>
            {/* 결과 문구가 코멘트를 가리면, 덮어쓴 내용을 확인하지 못한 채 넘어가게 된다.
                문구는 위에, 바뀐 코멘트는 그 아래에 둔다. */}
            <div className="mt-1 pl-12 text-xs text-muted">
              {st.err ? (
                <AdminErrorMessage message={st.err} compact />
              ) : (
                <>
                  {st.msg && <p className="text-accent">{st.msg}</p>}
                  <p className={st.msg ? "mt-1" : ""}>{st.comment ?? s.comment ?? "(코멘트 없음)"}</p>
                  {st.previousComment && (
                    <p className="mt-1 border-l-2 border-line pl-2">
                      <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent">이전</span>
                      {st.previousComment}
                    </p>
                  )}
                </>
              )}
            </div>
          </li>
        );
      })}
      {filteredSongs.length === 0 && (
        <li className="px-4 py-8 text-center text-sm text-muted">
          일치하는 곡이 없습니다.
        </li>
      )}
      </ul>
    </div>
  );
}
