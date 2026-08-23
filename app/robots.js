// 개인 1인용 사이트다. 검색 색인 대상이 아니다.
//
// 전면 허용이던 시절 sitemap이 곡 928 · 영화 50 · 인물 2,545 · 기록 560을 합쳐
// 4,091개 URL을 광고했다. 이 URL들은 전부 동적 라우트라 크롤러 한 번의 순회가
// 사람의 사용량과 무관하게 Vercel 함수를 4,000번 깨운다. 인물 한 건은 영화와
// Watcha 기록을 합쳐 전체 인물 목록을 만들고, 곡 한 건은 전곡을 파싱한다.
// 무료 한도에서 먼저 닳는 것은 전송량이 아니라 Active CPU다.
//
// robots.txt는 규약일 뿐 강제가 아니다. 이것만으로 봇을 막았다고 보지 말 것 —
// 함수 도달 자체를 막으려면 Vercel Deployment Protection이 필요하다(README 참조).
export default function robots() {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
