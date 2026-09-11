// 백업이 "돌았다"와 "쓸 수 있다"는 다른 말이다.
//
// dump-content.mjs는 DB에서 읽은 것을 파일로 쓴다. 그 과정이 성공해도 백업이
// 망가질 수 있는 길이 있다: DB 쪽에서 콘텐츠가 대량으로 사라진 뒤 덤프가 돌면
// 그 빈 상태가 그대로 백업에 덮인다. 그러면 사고가 난 다음 날, 복구하려고 연
// 백업에도 이미 아무것도 없다.
//
// 그래서 덤프 뒤에 한 번 센다. 전날보다 크게 줄었으면 커밋을 만들지 않고
// 워크플로를 실패시킨다 — 사람이 확인할 때까지 멀쩡한 어제 백업을 지키는 쪽이
// 낫다.

// 20%. 근거: 이 아카이브는 곡이 늘기만 했고(2026-07-08 시작, 현재 966곡),
// 하루에 20%가 줄어드는 정상적인 경로가 없다. 중복 정리 같은 대량 삭제를
// 실제로 할 때는 --allow-shrink로 한 번 통과시킨다.
export const MAX_SHRINK_RATIO = 0.2;

// 처음 몇 건일 때는 비율이 쉽게 흔들린다(3 → 2는 33% 감소다). 이 밑에서는
// 비율 대신 "0이 되었는가"만 본다.
export const SMALL_CORPUS = 10;

const count = (value) => Math.max(0, Math.floor(Number(value) || 0));

export function checkBackupIntegrity(current = {}, previous = {}, { maxShrink = MAX_SHRINK_RATIO } = {}) {
  const kinds = ["songs", "movies"];
  const findings = [];
  for (const kind of kinds) {
    const now = count(current[kind]);
    const before = count(previous[kind]);
    const label = kind === "songs" ? "곡" : "영화";

    // 전부 사라졌으면 규모와 무관하게 사고다
    if (before > 0 && now === 0) {
      findings.push(`${label}이 ${before}개에서 0개가 됐습니다 — 덤프가 빈 DB를 읽었을 수 있습니다.`);
      continue;
    }
    if (before <= SMALL_CORPUS) continue; // 표본이 적으면 비율을 믿지 않는다
    const shrink = (before - now) / before;
    if (shrink > maxShrink) {
      findings.push(`${label}이 ${before}개에서 ${now}개로 ${(shrink * 100).toFixed(1)}% 줄었습니다 (허용 ${(maxShrink * 100).toFixed(0)}%).`);
    }
  }
  return { ok: findings.length === 0, findings, current, previous };
}

export function renderBackupReport(result) {
  const line = (kind, label) =>
    `| ${label} | ${count(result.previous[kind])} | ${count(result.current[kind])} |`;
  const lines = [
    "# 백업 무결성 점검",
    "",
    result.ok ? "이상 없음 — 백업을 커밋합니다." : "**중단** — 백업을 커밋하지 않았습니다.",
    "",
    "| 항목 | 이전 백업 | 이번 덤프 |",
    "| --- | --- | --- |",
    line("songs", "곡"),
    line("movies", "영화"),
  ];
  if (!result.ok) {
    lines.push(
      "",
      "## 사유",
      ...result.findings.map((f) => `- ${f}`),
      "",
      "어제 백업은 그대로 두었습니다. DB 상태를 확인한 뒤,",
      "의도한 감소라면 `--allow-shrink`로 한 번 통과시키세요.",
    );
  }
  return lines.join("\n");
}
