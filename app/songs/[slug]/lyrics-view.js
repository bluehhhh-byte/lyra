"use client";
import { useEffect, useState } from "react";
import CardModal from "./lyric-card";
import { hasReadings, savedReadingSize, savedReadingVisibility } from "../../../lib/reading-preference";
import { repeatedStanzaDisplay } from "../../../lib/lyric-display";
import { formatLyricQuote } from "../../../lib/lyric-quote";
import { LyricThread } from "../../fable-scenes";

const MODES = [
  { key: "both", label: "전체" },
  { key: "orig", label: "원문" },
  { key: "trans", label: "번역" },
];

// one scale step per size — original stays a notch above the translation
const SIZES = {
  s: { orig: "text-base", reading: "text-[11px]", trans: "text-xs", gap: "space-y-3" },
  m: { orig: "text-lg", reading: "text-xs", trans: "text-sm", gap: "space-y-4" },
  l: { orig: "text-2xl", reading: "text-sm", trans: "text-base", gap: "space-y-5" },
};
const SIZE_KEYS = ["s", "m", "l"];

const STORE_KEY = "lyra_read"; // { mode, size } — survives navigation between songs

// allowNotes=false on the movie page: inline notes write to the songs store, so
// a movie slug there would create a bogus song file — movies use `comment` only.
export default function LyricsView({ stanzas, lang, song, allowNotes = true, missingTranslationCount = 0 }) {
  const [mode, setMode] = useState("both");
  const [size, setSize] = useState("m");
  const [showReadings, setShowReadings] = useState(true);
  const [notes, setNotes] = useState({}); // stanza index -> note, overriding the file
  const [editing, setEditing] = useState(-1);
  const [owner, setOwner] = useState(false); // see lyra_admin in app/api/login
  const [active, setActive] = useState(-1); // stanza highlighted from #hash
  const [progress, setProgress] = useState(0);
  const [card, setCard] = useState(null); // { lines, initial } for the carousel modal
  const [expandedRepeats, setExpandedRepeats] = useState(() => new Set());
  const [copiedStanza, setCopiedStanza] = useState(-1);

  // the card picker offers every line in the song (section labels included for
  // orientation); the clicked stanza's first lines are just the starting selection
  const openCard = (idx) => {
    const lines = [];
    let start = 0;
    stanzas.forEach((st, k) => {
      if (k === idx) start = lines.length;
      // stanza 인덱스를 함께 실어 보낸다 — 캐러셀은 연 단위로 카드를 만들기 때문에
      // 어느 줄이 어느 연에 속하는지 모달이 알아야 한다. section 라벨은 없을 수 있어
      // (라벨 없는 연) 경계 판정에 쓸 수 없다.
      st.lines.forEach((l, j) =>
        lines.push({ en: l.en, ko: l.ko, section: j === 0 ? st.section : "", stanza: k })
      );
    });
    const count = Math.min(4, stanzas[idx].lines.length);
    setCard({ lines, initial: Array.from({ length: count }, (_, i) => start + i) });
  };

  // restore prefs after mount — reading localStorage during render breaks hydration
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      if (MODES.some((m) => m.key === saved.mode)) setMode(saved.mode);
      setSize(savedReadingSize(saved.size));
      setShowReadings(savedReadingVisibility(saved.readings));
    } catch {} // corrupt value — fall back to defaults
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ mode, size, readings: showReadings }));
    } catch {} // 사생활 보호 모드·용량 제한에서도 기본 읽기 화면은 유지
  }, [mode, size, showReadings]);

  useEffect(() => {
    setOwner(allowNotes && document.cookie.split("; ").includes("lyra_admin=1"));
  }, [allowNotes]);

  // note edits go straight to the file (a commit online), so the page shows the
  // saved text right away instead of waiting for the redeploy
  const saveNote = async (i, note) => {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setNote", slug: song.slug, index: i, note }),
    });
    if (!res.ok) {
      alert("노트 저장 실패 — 로그인이 만료됐을 수 있습니다");
      return;
    }
    setNotes((n) => ({ ...n, [i]: note }));
    setEditing(-1);
  };

  // reading progress across the whole page
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // on load / hash change: scroll to the linked stanza and flash it
  useEffect(() => {
    const jump = () => {
      const m = location.hash.match(/^#v(\d+)$/);
      if (!m) return;
      const i = +m[1];
      setActive(i);
      document.getElementById(`v${i}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    jump();
    window.addEventListener("hashchange", jump);
    return () => window.removeEventListener("hashchange", jump);
  }, []);

  const s = SIZES[size];
  const canToggleReadings = hasReadings(stanzas);
  const displayStanzas = repeatedStanzaDisplay(stanzas);
  const copyStanza = async (stanza, index) => {
    try {
      await navigator.clipboard.writeText(formatLyricQuote(stanza.lines, song, `${location.origin}${location.pathname}#v${index}`));
      setCopiedStanza(index);
      setTimeout(() => setCopiedStanza(-1), 1500);
    } catch {}
  };

  return (
    <div data-lyric-view className="relative isolate mx-auto max-w-2xl pb-3 pr-7 sm:pr-10">
      <LyricThread seed={song?.slug || "lyrics"} />
      <p className={`mb-4 text-right text-[11px] ${missingTranslationCount ? "text-amber-400" : "text-muted"}`}>
        {missingTranslationCount ? `번역 필요 ${missingTranslationCount}줄` : "번역 상태 · 완료"}
      </p>
      {/* toolbar sticks so mode/size stay reachable deep into a long song */}
      <div data-reader-toolbar className="sticky top-0 z-20 mb-8 border-b border-line bg-bg/85 py-3 backdrop-blur">
        <div className="mb-2.5 h-0.5 w-full overflow-hidden  bg-line">
          {/* scroll-driven: transform tracks the scroll directly — a transition here
              would just lag the input, and width would re-layout on every frame */}
          <div
            className="h-full w-full origin-left  bg-accent"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
        {/* 한 줄에 다 들어가야 한다. 버튼은 터치 타깃이라 44px 아래로 못 줄이므로
            남는 여지는 여백뿐이다 — 좁은 화면에서 묶음 간격과 버튼 좌우 여백을 조여
            360px부터 일곱 개가 한 줄에 들어간다. 320px은 버튼만 308px이라 산술적으로
            불가능해, 그때만 이 줄이 가로로 밀린다(페이지 전체는 밀리지 않는다). */}
        <div className="-mx-1 flex items-center justify-between gap-0.5 overflow-x-auto px-1 sm:mx-0 sm:gap-2 sm:overflow-x-visible sm:px-0">
          <div className="flex min-w-fit flex-1 gap-0.5 sm:gap-1.5">
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`min-h-11 min-w-fit flex-1 whitespace-nowrap border px-1.5 py-1 text-xs transition active:scale-[0.97] sm:flex-none sm:px-3 ${
                  mode === m.key
                    ? "border-accent bg-accent font-semibold text-bg"
                    : "border-line text-muted hover:text-ink"
                }`}
              >
                {m.label}
              </button>
            ))}
            {canToggleReadings && (
              <button
                onClick={() => setShowReadings((value) => !value)}
                aria-pressed={showReadings}
                className={`min-h-11 min-w-fit flex-1 whitespace-nowrap border px-1.5 py-1 text-xs transition active:scale-[0.97] sm:flex-none sm:px-3 ${
                  showReadings
                    ? "border-accent bg-accent font-semibold text-bg"
                    : "border-line text-muted hover:text-ink"
                }`}
              >
                독음
              </button>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
            {SIZE_KEYS.map((k) => (
              <button
                key={k}
                onClick={() => setSize(k)}
                aria-label={`글자 크기 ${k}`}
                aria-pressed={size === k}
                className={`h-11 w-11  border px-2 py-1 leading-none transition ${
                  k === "s" ? "text-[10px]" : k === "m" ? "text-xs" : "text-sm"
                } ${
                  size === k
                    ? "border-accent bg-accent font-semibold text-bg"
                    : "border-line text-muted hover:text-ink"
                }`}
              >
                가
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-10">
        {displayStanzas.map(({ stanza, collapsed, occurrence, repeatCount }, i) => (
          <section
            key={i}
            id={`v${i}`}
            data-fable-stanza
            className={`group/stanza reveal relative scroll-mt-24  transition-colors duration-1000 ${
              active === i ? "bg-accent/10" : ""
            }`}
          >
            {song && stanza.lines.length > 0 && (
              <button
                onClick={() => copyStanza(stanza, i)}
                aria-label="이 구절을 출처와 함께 복사"
                className="absolute -top-3 right-11 flex h-11 min-w-11 items-center justify-center  px-1 text-[11px] text-muted transition hover:text-accent"
              >
                {copiedStanza === i ? "복사됨" : "복사"}
              </button>
            )}
            {song && stanza.lines.length > 0 && (
              <button
                onClick={() => openCard(i)}
                aria-label="이 구절로 인스타그램 캐러셀 만들기"
                title="캐러셀 만들기"
                className="absolute -top-3 right-0 flex h-11 w-11 items-center justify-center  text-muted transition hover:text-accent sm:opacity-0 sm:group-hover/stanza:opacity-100"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                </svg>
              </button>
            )}
            {stanza.section && (
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent">
                {stanza.section}
              </p>
            )}
            {collapsed && !expandedRepeats.has(i) ? (
              <button
                type="button"
                onClick={() => setExpandedRepeats((current) => new Set(current).add(i))}
                className="w-full  border border-dashed border-line px-4 py-5 text-left text-sm text-muted hover:border-accent hover:text-accent"
              >
                반복 후렴 {occurrence}/{repeatCount} · 펼쳐서 읽기
              </button>
            ) : (
            <div className={s.gap}>
              {stanza.lines.map((line, j) => (
                // `>^N`으로 덮인 줄은 번역이 비어 있다 — 번역만 보기에서는 빈 칸만
                // 남으므로 건너뛴다 (원문 보기·둘 다 보기에서는 그대로 나온다)
                mode === "trans" && !line.ko ? null : (
                <div key={j} className="lyric-line" role="group" aria-label="원문과 번역">
                  {mode !== "trans" && (
                    <p id={`lyric-${i}-${j}-original`} lang={lang || "en"} className={`font-serif leading-snug ${s.orig}`}>
                      <span className="sr-only">원문: </span>
                      {line.en}
                    </p>
                  )}
                  {mode !== "trans" && showReadings && line.reading && (
                    <p className={`mt-0.5 text-muted ${s.reading}`}>{line.reading}</p>
                  )}
                  {mode !== "orig" &&
                    line.ko &&
                    (/[가-힣]/.test(line.ko) ? (
                      // Korean translation (EN/JA songs) → batang
                      <p
                        lang="ko"
                        aria-describedby={mode === "both" ? `lyric-${i}-${j}-original` : undefined}
                        className={`font-batang text-muted ${s.trans} ${mode === "both" ? "mt-0.5" : ""}`}
                      >
                        <span className="sr-only">한국어 번역: </span>
                        {line.ko}
                      </p>
                    ) : (
                      // English translation (Korean songs) → latin serif, italic to set it apart
                      <p
                        lang="en"
                        aria-describedby={mode === "both" ? `lyric-${i}-${j}-original` : undefined}
                        className={`font-serif italic text-muted ${s.trans} ${mode === "both" ? "mt-0.5" : ""}`}
                      >
                        <span className="sr-only">영어 번역: </span>
                        {line.ko}
                      </p>
                    ))}
                  {line.translationMissing && mode !== "trans" && (
                    <span className="mt-1 inline-block  border border-amber-400/40 px-1.5 py-0.5 text-[10px] text-amber-400">번역 필요</span>
                  )}
                </div>
                )
              ))}
            </div>
            )}
            {editing === i ? (
              <NoteEditor
                initial={notes[i] ?? stanza.note ?? ""}
                onSave={(v) => saveNote(i, v)}
                onCancel={() => setEditing(-1)}
              />
            ) : (
              (notes[i] ?? stanza.note) && (
                <aside role="note" aria-label="이 연에 대한 해설" className="mt-8 border-l-2 border-accent/60 bg-accent/5 px-4 py-3 text-sm leading-relaxed text-muted">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">연 해설</span>
                  {notes[i] ?? stanza.note}
                  {owner && (
                    <button
                      onClick={() => setEditing(i)}
                      className="ml-2 text-xs text-muted hover:text-accent"
                    >
                      수정
                    </button>
                  )}
                </aside>
              )
            )}
            {owner && editing !== i && !(notes[i] ?? stanza.note) && (
              <button
                onClick={() => setEditing(i)}
                className="mt-3 text-xs text-muted transition hover:text-accent sm:opacity-0 sm:group-hover/stanza:opacity-100"
              >
                ✎ 노트 추가
              </button>
            )}
          </section>
        ))}
      </div>

      {card && (
        <CardModal song={song} lines={card.lines} initial={card.initial} onClose={() => setCard(null)} />
      )}
    </div>
  );
}

// owner-only, inline: write the stanza's note without opening the markdown file
function NoteEditor({ initial, onSave, onCancel }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const save = async (v) => {
    setBusy(true);
    await onSave(v);
    setBusy(false);
  };
  return (
    <div className="mt-4  bg-surface px-4 py-3">
      <textarea
        autoFocus
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="이 구절에 대한 해설·감상"
        className="w-full resize-none  border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => save(text.trim())}
          disabled={busy}
          className=" bg-accent px-3 py-1 text-xs font-semibold text-bg disabled:opacity-40"
        >
          {busy ? "저장 중…" : "저장"}
        </button>
        <button onClick={onCancel} className="text-xs text-muted hover:text-accent">
          취소
        </button>
        {initial && (
          <button
            onClick={() => save("")}
            disabled={busy}
            className="ml-auto text-xs text-muted hover:text-red-400 disabled:opacity-40"
          >
            삭제
          </button>
        )}
      </div>
    </div>
  );
}
