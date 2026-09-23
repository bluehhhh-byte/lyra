// Jev(TypeSafe AI, Vercel AI Gateway) — Lyra 관리자 도구가 쓰는 빠른 판단형
// 품질 게이트 모음. 2026-09-15 출시, 무료는 프로모션 기간(2026-09-26 00:00
// KST까지, vercel.com/ai-gateway/models/typesafe-ai/jev 표기)뿐이다. 그 뒤로는
// 가격이 바뀌거나 계정에 요금이 붙을 수 있으므로, 이 모듈의 모든 공개 함수는
// 실패를 "예외"로 다루지 않는다 — 키가 없든, 402/403(카드·쿼터)이든, 타임아웃
// 이든, 프로모션이 끝났든, 무엇이 됐든 null을 돌려준다. 호출부는 null을 받으면
// 게이트 없이 원래 동작(재작성 안 함·잠그지 않음·의심하지 않음)을 그대로 쓴다.
// 이 모듈이 통째로 죽어도 곡 등록·재생성 파이프라인은 절대 영향받지 않는다.

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/evaluate";
const TIMEOUT_MS = 6_000;

// 프로모션 종료 시점 — 2026-09-26 00:00 KST부터 차단한다(UTC로는 09-25T15:00:00Z).
// Vercel 공식 모델 페이지는 "ends on September 25, 2026"이라고 적혀 하루 차이가
// 있는데, 더 늦춰 잡지 않고 사용자가 확인한 9/26 기준을 그대로 쓴다.
// 이 시각 이후로는 402/403을 기다리지 않고 호출 자체를 건너뛴다 — 실패하는
// 요청을 반복해 서버리스 시간을 태울 이유가 없다.
export const PROMO_END_UTC = Date.parse("2026-09-25T15:00:00Z");

// 모든 게이트가 공유하는 실제 호출부. state/questions만 다르고 나머지(시각 확인·
// 키 확인·타임아웃·에러 처리)는 완전히 같다 — 따로 두면 게이트를 하나 늘릴
// 때마다 같은 실패 계약을 다시 베끼게 된다.
//
// fetch 호출 줄에서 8줄 이내에 signal이 있어야 lib/external-timeouts.test.mjs의
// 정적 검사를 통과한다 — body를 미리 만들어 호출문 자체를 짧게 유지한다.
async function evaluate(state, questions, now) {
  if (now >= PROMO_END_UTC) return null; // 프로모션 종료 — 호출 자체를 건너뛴다
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) return null;
  const body = JSON.stringify({ model: "typesafe-ai/jev", state, questions });
  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null; // 402(카드/쿼터)·403·429 등 — 프로모션 종료 후 흔해질 경로
    return await res.json();
  } catch {
    return null; // 타임아웃·네트워크 오류 — 게이트 없이 진행
  }
}

const answerOf = (data, key) => data?.answers?.[key] || null;
const scoreOf = (data, key) => {
  const s = answerOf(data, key)?.score;
  return typeof s === "number" && Number.isFinite(s) ? s : null;
};

const probabilityOf = (data, key) => {
  const p = data?.answers?.[key]?.probability;
  return typeof p === "number" && p >= 0 && p <= 1 ? p : null;
};

// ── comment 상투구 게이트 ────────────────────────────────────────────────
//
// 상투적 감성 어휘("그립다/애절하다/쓸쓸하다/먹먹하다" 류)에 기대는 정도를
// 0~1 확률로 묻는다. 이 값 이상일 때만 재작성을 시도한다 — 매번 재작성을
// 걸면 Gemini 호출이 두 배로 늘어 무료 쿼터를 반나절 만에 태운다.
export const CLICHE_THRESHOLD = 0.7;

export async function checkCliche(comment, { now = Date.now() } = {}) {
  const text = String(comment || "").trim();
  if (!text) return null;
  const data = await evaluate(
    text,
    {
      cliche: {
        type: "boolean",
        instructions:
          '이 코멘트가 "그립다/애절하다/쓸쓸하다/먹먹하다" 같은 상투적 감성 어휘에 기대는 대신, ' +
          "곡의 구체적 이미지·상황·정서로 쓰였는지 평가하라. 상투구에 기댈수록 true에 가깝다.",
      },
    },
    now
  );
  return probabilityOf(data, "cliche");
}

// ── 장르 세분화 게이트 ───────────────────────────────────────────────────
//
// lib/genre.js의 genreIssue()는 저장된 장르가 정확히 "Rock"이나 "Pop"이면
// 무조건 "세분화 권장" 결손으로 잡는다. 문제는 정말 하위 장르를 특정할 수
// 없는 순수한 Rock/Pop 곡도 있다는 것 — 10cc <I'm Not In Love>가 그렇다.
// 사람이 "Pop"을 다시 골라 저장해도 genreIssue는 똑같이 결손으로 재판정해서,
// 그 곡만 "장르 손보기" 대기열에 영원히 남는다.
//
// 이 게이트는 그 재확정 시점에 붙는다 — "이 곡이 정말 더 구체적인 하위
// 장르로 나뉠 수 있는가"를 독립적으로 재확인해, 아니라고 나오면 그 곡의
// 장르 판정을 잠근다(genre_locked). 이 확률이 낮을수록(세분화 불가에
// 가까울수록) 잠글 근거가 된다.
// 실측(2026-09-22, 5곡 표본)으로 0.3을 0.5로 올렸다. Jev는 거의 모든 곡을 "어느
// 정도는 세분화 가능"하다고 답하는 쪽으로 기울어 있다 — 1969년식 전형적인
// 버블검 팝(The Archies <Sugar, Sugar>)조차 0.43이 나왔고, 10cc <I'm Not In Love>는
// 0.60, Oasis <Wonderwall>은 0.83이었다. 임계값 0.3으로는 사실상 아무것도 안 잠기는
// 셈이었다. 0.5로 올리면 정말 단순한 경우(Sugar, Sugar 수준)는 잠기고, 10cc처럼
// Jev가 실제로 세분화 여지(Art Pop·Soft Rock 등)가 있다고 보는 곡은 그 판단을 그대로
// 존중해 잠그지 않는다 — 이건 버그가 아니라 Jev의 근거 있는 판단이다.
export const GENRE_LOCK_THRESHOLD = 0.5; // 이 값 미만이면 "세분화 불가"로 보고 잠근다

export async function checkGenreSubdividable(genre, title, artist, { now = Date.now() } = {}) {
  const g = String(genre || "").trim();
  const t = String(title || "").trim();
  if (!g || !t) return null;
  const data = await evaluate(
    `장르: ${g}\n곡: "${t}" — ${artist || "?"}`,
    {
      subdividable: {
        type: "boolean",
        instructions:
          `이 곡이 "${g}"보다 더 구체적인 하위 장르(예: Synth-Pop, Dance-Pop, Indie Pop, City Pop, ` +
          `Alternative Rock, Hard Rock, Punk Rock 등)로 분류될 수 있는가? 정말 하위 장르를 특정하기 ` +
          `어려운 순수한 ${g}이면 false에 가깝다.`,
      },
    },
    now
  );
  return probabilityOf(data, "subdividable");
}

// ── 앨범 정체성 게이트 (커버 오매칭 1차 필터) ────────────────────────────
//
// Jev는 이미지를 보지 못한다 — 커버 사진 자체가 맞는지는 판별할 수 없다.
// 대신 저장된 title/artist/album 조합이 "원곡 아티스트 자신의 정식 발매"처럼
// 읽히는지는 판단할 수 있다. Coldplay <The Scientist>처럼 검색 매칭이
// 동명이곡·커버 버전에 낚이면, 앨범명 자리에 "Lullaby Versions of Coldplay
// Songs"나 "Piano Tribute to..." 같은 3자 편곡 음반명이 남는다 — 이런
// 조합은 authentic 확률이 낮게 나온다. 텍스트 신호일 뿐이라 이미지가 실제로
// 잘못됐는지는 못 잡는다(회신 없는 스토리지에 남은 플레이스홀더 등). 그런
// 경우까지 잡는 완전한 해가 아니라, 사람이 볼 228곡을 줄이는 1차 필터다.
export const ALBUM_SUSPECT_THRESHOLD = 0.3; // authentic 확률이 이 값 미만이면 의심 목록

export async function checkAlbumIdentity({ title, artist, album } = {}, { now = Date.now() } = {}) {
  const t = String(title || "").trim();
  const a = String(artist || "").trim();
  const al = String(album || "").trim();
  if (!t || !a || !al) return null;
  const data = await evaluate(
    `제목: ${t}\n아티스트: ${a}\n앨범: ${al}`,
    {
      authentic: {
        type: "boolean",
        instructions:
          "이 아티스트가 이 제목의 곡을 이 앨범명으로 정식 발매했을 가능성이 있는가? 앨범명이 다른 " +
          "아티스트의 커버·트리뷰트·리믹스·자장가/피아노 편곡 음반(예: 'Lullaby Versions of...', " +
          "'Piano Tribute to...', '... Performs Coldplay' 같은)처럼 원곡 아티스트 자신의 발매가 " +
          "아닌 것을 가리키면 false에 가깝다.",
      },
    },
    now
  );
  return probabilityOf(data, "authentic");
}

// ── listen_when 상투구 + 감정 일관성 (호출 한 번에 두 질문) ─────────────
//
// listen_when을 6가지 각도로 무작위 지시해도(PR #12) 결과 문구가 "홀로 남겨진
// 밤"처럼 어느 곡에나 붙는 장면으로 돌아오는 일이 남았다. 이 확률이 높으면
// song-meta.js가 한 번만 다시 쓰게 한다.
//
// 감정은 Jev가 코멘트만 보고 판단한다 — 가사를 보는 Gemini보다 정보가 적다.
// 실측에서 10cc <I'm Not In Love>의 "방어적인 태도" 코멘트를 "저항"으로 읽었다.
// 그래서 Jev가 감정을 직접 바꾸지 않는다. 기존 감정이 거의 0이고 다른 감정이
// 뚜렷할 때만, song-meta.js가 가사를 보는 Gemini에게 둘 중 하나를 다시 고르게 한다.
export const LISTEN_CLICHE_THRESHOLD = 0.7;
export const EMOTION_MISMATCH_MAX = 0.1; // 기존 감정의 확률이 이보다 낮고
export const EMOTION_SUGGEST_MIN = 0.5; // 다른 감정이 이보다 높을 때만 재판정

export async function reviewSongMeta({ comment, listenWhen, emotions = [] } = {}, { now = Date.now() } = {}) {
  const c = String(comment || "").trim();
  const l = String(listenWhen || "").trim();
  const questions = {};
  if (l)
    questions.listenCliche = {
      type: "boolean",
      instructions:
        '"이런 순간에" 문구(listenWhen)가 "혼자 있는 밤", "잠 못 드는 새벽"처럼 어느 곡에나 붙일 수 있는 ' +
        "흔한 장면에 기대는가? 곡 고유의 구체적 상황이면 false에 가깝다.",
    };
  if (c && emotions.length >= 2)
    questions.emotion = {
      type: "choice",
      instructions: "코멘트(comment)가 그리는 곡의 감정으로 가장 알맞은 것을 골라라.",
      criteria: Object.fromEntries(emotions.map((e) => [e, e])),
    };
  if (!Object.keys(questions).length) return null;
  const data = await evaluate({ comment: c, listenWhen: l }, questions, now);
  if (!data) return null;
  const probs = answerOf(data, "emotion")?.probabilities;
  return {
    listenCliche: l ? probabilityOf(data, "listenCliche") : null,
    emotionProbs: probs && typeof probs === "object" ? probs : null,
  };
}

// ── 번역 충실도 (가사 정확성 검토 우선순위) ─────────────────────────────
//
// "가사 정확성 검토"는 사람이 원문과 대조하는 느린 작업이다. 전 곡을 볼 수는 없으니
// 원문·번역 쌍 표본을 Jev에 보여 곡 단위 점수(0~3)를 받고, 낮은 곡부터 보게 한다.
// scripts/audit-translation-fidelity.mjs가 쓴다.
export const TRANSLATION_FIDELITY_CRITERIA = [
  "크게 어긋남: 뜻이 다르거나 반대인 줄이 여럿이다",
  "일부 어긋남: 몇 줄이 원문의 뜻과 다르다",
  "대체로 정확: 표현은 달라도 뜻은 맞다",
  "정확: 원문의 뜻을 충실히 옮겼다",
];

export async function scoreTranslationFidelity(pairs = [], { now = Date.now() } = {}) {
  const items = (Array.isArray(pairs) ? pairs : [])
    .map((p) => ({ 원문: String(p?.original || "").trim(), 번역: String(p?.translation || "").trim() }))
    .filter((p) => p.원문 && p.번역);
  if (items.length < 2) return null;
  const data = await evaluate(
    items,
    {
      fidelity: {
        type: "score",
        instructions:
          "각 항목은 가사 원문 한 줄과 그 한국어 번역이다. 번역이 원문의 뜻을 얼마나 충실히 옮겼는지 곡 " +
          "전체로 평가하라. 시적 의역은 허용하되, 뜻이 바뀌거나 반대가 되거나 빠진 줄은 감점한다.",
        criteria: TRANSLATION_FIDELITY_CRITERIA,
      },
    },
    now
  );
  return scoreOf(data, "fidelity");
}

// ── 같은 원곡인가 (곡 중복 탐지 보조) ───────────────────────────────────
//
// findDuplicateSong은 trackId나 정규화한 제목·아티스트가 똑같을 때만 잡는다.
// "Makes Me Wonder"와 "Makes Me Wonder (Live)"는 통과한다. 그런 후보만 골라
// (song-duplicate.js의 nearDuplicateCandidates) Jev에게 같은 원곡인지 묻는다.
// 실측: 라이브 vs 원곡 0.95, "Love" vs "Love Story" 0.09.
export const SAME_SONG_THRESHOLD = 0.85;

export async function checkSameSong(candidate = {}, existing = {}, { now = Date.now() } = {}) {
  const pick = (s) => ({
    제목: String(s?.title || "").trim(),
    아티스트: String(s?.artist || "").trim(),
    앨범: String(s?.album || "").trim(),
  });
  const a = pick(candidate);
  const b = pick(existing);
  if (!a.제목 || !a.아티스트 || !b.제목 || !b.아티스트) return null;
  const data = await evaluate(
    { 새로_추가하려는_곡: a, 이미_등록된_곡: b },
    {
      same: {
        type: "boolean",
        instructions:
          "두 기록이 같은 아티스트의 같은 원곡을 가리키는가? 라이브·리마스터·에디트·피처링·부제 표기 " +
          "차이만 있으면 true다. 제목 일부가 겹칠 뿐 다른 곡이면 false다.",
      },
    },
    now
  );
  return probabilityOf(data, "same");
}

// ── AI 취향 리포트 근거 점수 ────────────────────────────────────────────
//
// /songs/taste에 걸리는 리포트가 집계와 무관한 일반론("음악은 삶의 위로다")으로
// 흐르는지 0~2점으로 본다. 실측: 일반론 0.22, 수치를 교차 해석한 문단 1.78.
export const REPORT_GROUNDING_MIN = 1;

export async function scoreReportGrounding(summary, report, { now = Date.now() } = {}) {
  const s = String(summary || "").trim();
  const r = String(report || "").trim();
  if (!s || !r) return null;
  const data = await evaluate(
    { 집계: s, 리포트: r },
    {
      grounding: {
        type: "score",
        instructions: "리포트가 집계 수치(장르·연대·감정·키워드·아티스트 곡 수)를 근거로 삼아 교차 해석하는지 평가하라.",
        criteria: [
          "일반론: 집계와 무관한 뻔한 문장이 대부분이다",
          "부분 근거: 일부 문장만 집계를 근거로 삼는다",
          "근거 충실: 집계를 구체적으로 교차 해석한다",
        ],
      },
    },
    now
  );
  return scoreOf(data, "grounding");
}
