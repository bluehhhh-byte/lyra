const wordsOf = (text) => String(text || "")
  .normalize("NFKC")
  .toLocaleLowerCase("ko-KR")
  .match(/[가-힣]+/g) || [];

const PARTICLES = new Set([
  "은", "는", "이", "가", "을", "를", "의", "에", "에서", "에게", "께", "로", "으로",
  "와", "과", "도", "만", "까지", "부터", "처럼", "보다", "마다", "조차", "마저", "이나", "나",
  "이랑", "랑", "이야", "야", "이라", "라", "이라고", "라고", "이었다", "였다", "이고", "인",
]);

// 열린 형태소 분석만으로는 ‘내가’와 ‘벼랑’을 구별할 수 없다. 그래서 모티프가 될 수
// 있는 구체어를 넓게 정의하고, 실제 순위와 횟수는 언제나 현재 번역문 전체가 결정한다.
const NOUN_GROUPS = {
  "풍경": [
    "밤", "새벽", "아침", "낮", "어둠", "그림자", "빛", "불빛", "햇빛", "햇살", "달", "별", "태양",
    "하늘", "구름", "비", "빗물", "눈보라", "바람", "폭풍", "번개", "안개", "무지개", "불", "불꽃",
    "연기", "재", "물", "바다", "파도", "강", "호수", "모래", "해변", "섬", "산", "절벽", "벼랑",
    "들판", "꽃", "장미", "나무", "숲", "나뭇잎", "풀", "계절", "봄", "여름", "가을", "겨울",
  ],
  "몸과 감각": [
    "눈", "눈물", "심장", "마음", "가슴", "손", "손끝", "손가락", "입술", "입", "얼굴", "미소",
    "피", "뼈", "숨", "숨결", "목소리", "피부", "몸", "머리", "어깨", "발", "상처", "흉터", "향기",
  ],
  "장소와 사물": [
    "거리", "길", "골목", "도시", "방", "문", "창문", "벽", "천장", "집", "침대", "의자", "계단",
    "지붕", "다리", "기차", "차", "전화", "사진", "편지", "책", "거울", "시계", "칼", "총", "무덤",
    "천국", "지옥", "우주", "세상", "경계", "끝", "낭떠러지", "감옥", "교회", "학교", "무대", "술",
  ],
  "시간과 기억": [
    "기억", "추억", "꿈", "악몽", "시절", "순간", "영원", "과거", "미래", "시간", "어제", "오늘",
    "내일", "처음", "마지막", "청춘", "어린날", "생일", "밤새", "한때",
  ],
  "감정과 관계": [
    "사랑", "외로움", "슬픔", "불안", "두려움", "공포", "신경", "고통", "미움", "후회", "질투",
    "욕망", "희망", "절망", "행복", "기쁨", "분노", "죄", "용서", "거짓말", "약속", "비밀", "이름",
    "자유", "운명", "전쟁", "평화", "돈", "침묵", "소음", "노래", "음악", "눈빛", "체온",
  ],
};

const VERBS = [
  ["망가져", "파괴와 변화", /^망가(?:져|진|지고|지며|졌|질|뜨|트)/],
  ["무너져", "파괴와 변화", /^무너(?:져|진|지고|지며|졌|질)/],
  ["부서져", "파괴와 변화", /^부서(?:져|진|지고|지며|졌|질)/],
  ["깨져", "파괴와 변화", /^깨(?:져|진|지고|지며|졌|질|뜨)/],
  ["찢겨", "파괴와 변화", /^찢(?:겨|긴|기고|겼|어|어진)/],
  ["불타", "파괴와 변화", /^불타$|^불타(?:는|고|올라|버|오르|서|면|던|게|지|랐)/],
  ["가라앉아", "움직임", /^가라앉(?:아|은|고|았|을|는)/],
  ["떨어져", "움직임", /^떨어(?:져|진|지고|졌|질|지는)/],
  ["흘러", "움직임", /^흘(?:러|렀|리고|리는|린|릴)/],
  ["헤매", "움직임", /^헤매$|^헤매(?:고|는|던|어|었|지|며)/],
  ["도망쳐", "움직임", /^도망치(?:는|고|던|려|면)|^도망쳐/],
  ["사라져", "움직임", /^사라(?:져|진|지고|졌|질|지는)/],
  ["떠나", "움직임", /^떠나$|^떠나(?:는|고|던|려|면|간|갔|가|지)/],
  ["돌아와", "움직임", /^돌아(?:와|온|오|왔|갈|가)/],
  ["춤", "몸짓", /^춤$|^춤(?:춰|추는|추고|췄|출|추며)/],
  ["울어", "몸짓", /^(?:울어|울고|울던|울며|울지|울었|우는|운다|울음)/],
  ["웃어", "몸짓", /^(?:웃어|웃고|웃던|웃으며|웃지|웃었|웃는|웃음)/],
  ["떨려", "몸짓", /^떨(?:려|린|리고|렸|리는|림)/],
  ["숨겨", "몸짓", /^숨(?:겨|긴|기고|겼|기는)/],
  ["죽어", "생과 죽음", /^죽(?:어|은|고|었|을|는|음)/],
  ["살아", "생과 죽음", /^살아$|^살아(?:가|남|나|있|온|갈|난)/],
];

const NOUNS = Object.entries(NOUN_GROUPS).flatMap(([category, words]) =>
  words.map((word) => ({ word, category }))
);

function matchesNoun(token, word) {
  if (token === word) return true;
  if (!token.startsWith(word)) return false;
  const suffix = token.slice(word.length);
  // ‘별로’처럼 조사를 떼면 전혀 다른 뜻이 되는 번역 상투어는 제외한다.
  if (word === "별" && token === "별로") return false;
  return PARTICLES.has(suffix);
}

function expressiveWord(token) {
  for (const term of NOUNS) if (matchesNoun(token, term.word)) return term;
  for (const [word, category, pattern] of VERBS) if (pattern.test(token)) return { word, category };
  return null;
}

export function lyricVocabulary(songs, { limit = 50 } = {}) {
  const vocabulary = new Map();
  for (const song of songs || []) {
    const songCounts = new Map();
    for (const line of song.stanzas?.flatMap((stanza) => stanza.lines) || []) {
      for (const token of wordsOf(line.ko)) {
        const term = expressiveWord(token);
        if (term) songCounts.set(term.word, { category: term.category, count: (songCounts.get(term.word)?.count || 0) + 1 });
      }
    }
    for (const [word, value] of songCounts) {
      const row = vocabulary.get(word) || { word, category: value.category, count: 0, songs: [], years: new Map() };
      row.count += value.count;
      row.songs.push({ slug: song.slug, title: song.title, artist: song.artist, year: song.year || "", count: value.count });
      const year = /^\d{4}$/.test(String(song.year || "")) ? String(song.year) : "연도 미상";
      row.years.set(year, (row.years.get(year) || 0) + value.count);
      vocabulary.set(word, row);
    }
  }
  return [...vocabulary.values()]
    .map((row) => ({
      word: row.word,
      category: row.category,
      count: row.count,
      songCount: row.songs.length,
      songs: row.songs.sort((a, b) => b.count - a.count
        || a.title.localeCompare(b.title, "ko")
        || a.artist.localeCompare(b.artist, "ko")
        || a.slug.localeCompare(b.slug)),
      years: [...row.years].map(([year, count]) => ({ year, count })).sort((a, b) => b.count - a.count || a.year.localeCompare(b.year)),
    }))
    .sort((a, b) => b.count - a.count || b.songCount - a.songCount || a.word.localeCompare(b.word, "ko"))
    .slice(0, limit);
}
