"use client";

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
  "w-full border border-line bg-surface px-3 py-2 text-base outline-none focus:border-accent sm:text-sm";

export const emptyAppearanceDraft = () => ({
  workTitle: "",
  originalTitle: "",
  workType: "",
  mediaType: "",
  tmdbId: "",
  year: "",
  poster: "",
  role: "",
  season: "",
  episode: "",
  evidenceUrl: "",
  evidenceLabel: "",
  status: "pending",
  note: "",
  searchEntryPoint: "",
});

export default function SongAppearanceDraft({ value, onChange, onAiSearch, busy, searchState, warning }) {
  const set = (key, next) => onChange({ ...value, [key]: next });
  const hasValue = Boolean(value.workTitle);

  return (
    <div className="border border-line bg-bg/40 p-4" aria-labelledby="appearance-draft-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="appearance-draft-title" className="text-sm font-semibold">영화·드라마·애니메이션 수록 정보</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            선택 사항입니다. 코멘트와 같은 웹 리서치에서 작품 사용 근거를 확인한 경우에만 자동으로 채웁니다.
          </p>
        </div>
        <button
          type="button"
          className="border border-line px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-accent disabled:opacity-40"
          disabled={busy}
          onClick={onAiSearch}
        >
          {busy ? "AI 검색 중…" : "AI로 다시 찾기"}
        </button>
      </div>

      {searchState === "found" && (
        <p className="mt-3 text-xs text-accent" role="status">웹 근거가 있는 작품 정보를 찾았습니다. 저장 전에 확인해 주세요.</p>
      )}
      {searchState === "searching" && (
        <p className="mt-3 text-xs text-muted" role="status">곡의 배경과 작품 사용 정보를 웹에서 함께 확인하고 있습니다.</p>
      )}
      {searchState === "empty" && (
        <p className="mt-3 text-xs text-muted" role="status">확인할 수 있는 작품 수록 정보를 찾지 못해 빈칸으로 두었습니다.</p>
      )}
      {searchState === "error" && (
        <p className="mt-3 text-xs text-red-400" role="alert">웹 검색을 완료하지 못했습니다. 빈칸은 ‘수록 정보 없음’ 판정이 아니므로 다시 시도해 주세요.</p>
      )}
      {searchState === "needs_review" && (
        <p className="mt-3 text-xs text-amber-300" role="alert">{warning || "출처가 충돌하거나 충분히 신뢰할 수 없어 자동 입력하지 않았습니다. 근거를 직접 검토해 주세요."}</p>
      )}
      {warning && searchState !== "needs_review" && (
        <p className="mt-3 text-xs text-amber-300" role="status">웹 조사 참고: {warning}</p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted sm:col-span-2">
          작품명
          <input className={input + " mt-1"} value={value.workTitle} onChange={(event) => set("workTitle", event.target.value)} placeholder="예: 더 퍼스트 슬램덩크" />
        </label>
        <label className="text-xs text-muted sm:col-span-2">
          작품 원제 <span className="text-muted">(선택)</span>
          <input className={input + " mt-1"} value={value.originalTitle} onChange={(event) => set("originalTitle", event.target.value)} placeholder="예: THE FIRST SLAM DUNK" />
        </label>
        <label className="text-xs text-muted">
          작품 종류 {hasValue && <span className="text-accent">(필수)</span>}
          <select className={input + " mt-1"} value={value.workType} onChange={(event) => {
            const workType = event.target.value;
            onChange({ ...value, workType, mediaType: workType === "drama" || workType === "anime_series" ? "tv" : "movie" });
          }}>
            <option value="">선택 안 함</option>
            {WORK_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">
          사용 방식 {hasValue && <span className="text-accent">(필수)</span>}
          <select className={input + " mt-1"} value={value.role} onChange={(event) => set("role", event.target.value)}>
            <option value="">선택 안 함</option>
            {ROLES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">
          공개 연도 <span className="text-muted">(선택)</span>
          <input type="number" min="1800" max="2200" className={input + " mt-1"} value={value.year ?? ""} onChange={(event) => set("year", event.target.value)} />
        </label>
        <label className="text-xs text-muted">
          공개 상태
          <select className={input + " mt-1"} value={value.status} onChange={(event) => set("status", event.target.value)}>
            <option value="pending">검토 필요 · 비공개</option>
            <option value="verified">확인됨 · 공개</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          시즌 <span className="text-muted">(선택)</span>
          <input type="number" min="0" className={input + " mt-1"} value={value.season ?? ""} onChange={(event) => set("season", event.target.value)} />
        </label>
        <label className="text-xs text-muted">
          회차 <span className="text-muted">(선택)</span>
          <input type="number" min="0" className={input + " mt-1"} value={value.episode ?? ""} onChange={(event) => set("episode", event.target.value)} />
        </label>
        <label className="text-xs text-muted sm:col-span-2">
          근거 주소
          <input type="url" className={input + " mt-1"} value={value.evidenceUrl} onChange={(event) => set("evidenceUrl", event.target.value)} placeholder="공식 OST·제작사·음반사 페이지" />
        </label>
        <label className="text-xs text-muted sm:col-span-2">
          근거 이름
          <input className={input + " mt-1"} value={value.evidenceLabel} onChange={(event) => set("evidenceLabel", event.target.value)} placeholder="예: 공식 사운드트랙" />
        </label>
      </div>

      {value.searchEntryPoint && (
        <div className="mt-3 overflow-x-auto text-xs" dangerouslySetInnerHTML={{ __html: value.searchEntryPoint }} />
      )}

      {hasValue && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          {value.tmdbId && <span className="text-muted">TMDB #{value.tmdbId} 연결됨</span>}
          {value.evidenceUrl && <a href={value.evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">AI 검색 근거 보기 ↗</a>}
          <button type="button" className="text-muted underline hover:text-accent" onClick={() => onChange(emptyAppearanceDraft())}>내용 비우기</button>
        </div>
      )}
    </div>
  );
}
