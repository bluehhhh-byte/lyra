import { VALENCE_RANGE, valenceColor } from "../lib/keywords";

// 일자별 감정 변화 — 서버 컴포넌트, 순수 SVG(차트 라이브러리 없음).
//
// 예전에는 기록이 있는 날마다 점을 하나씩 찍었다. 567일이 720 단위 판에 들어가니
// 점 지름 13.7px에 간격 1.6px — 점 하나가 이웃을 여덟 겹으로 덮어 색만 뭉개진
// 띠가 됐고, 날짜 라벨 284개가 겹쳐 아무것도 읽히지 않았다.
//
// 그래서 두 층으로 나눈다. 일별 값은 '선'이 맡는다 — 선은 몇 개가 겹쳐도 모양을
// 잃지 않는다. '점'은 달마다 하나씩만 찍어 그 달의 평균에 색을 준다. 하루의
// 오르내림은 선의 결로, 계절의 이동은 점의 색으로 읽힌다. 감정이 없는 날은
// 0으로 끌어내리지 않고 선을 끊는다.
export default function EmotionTimeline({ days, height = 170 }) {
  const pts = days.filter((d) => d.valence !== null);
  if (pts.length < 2) {
    return (
      <p className=" border border-dashed border-line px-4 py-3 text-xs text-muted">
        감정 데이터가 이틀 이상 쌓이면 변화 곡선이 그려집니다.
      </p>
    );
  }

  const W = 720;
  const H = height;
  const padX = 26;
  const padY = 26;
  const [lo, hi] = VALENCE_RANGE;
  const x = (i) => padX + (i * (W - 2 * padX)) / (pts.length - 1);
  const y = (v) => padY + ((hi - v) / (hi - lo)) * (H - 2 * padY);
  const midY = y(0);

  const line = pts.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(d.valence).toFixed(1)}`).join(" ");

  // 달마다 한 점 — 그 달 기록의 평균 밝기와, 몇 날이 모였는지.
  const months = [];
  pts.forEach((d, i) => {
    const key = d.day.slice(0, 7);
    const last = months[months.length - 1];
    if (last && last.key === key) {
      last.sum += d.valence;
      last.days += 1;
      last.lastIndex = i;
    } else {
      months.push({ key, sum: d.valence, days: 1, firstIndex: i, lastIndex: i });
    }
  });
  const marks = months.map((m) => ({
    key: m.key,
    valence: m.sum / m.days,
    days: m.days,
    // 그 달이 걸친 구간의 가운데에 점을 놓는다
    i: (m.firstIndex + m.lastIndex) / 2,
  }));

  // 라벨은 해가 바뀌면 연도까지, 아니면 월만.
  const label = (m, index) => {
    const [year, month] = m.key.split("-");
    const prev = marks[index - 1];
    return !prev || prev.key.slice(0, 4) !== year ? `${year}.${Number(month)}` : `${Number(month)}월`;
  };

  // 달마다 기록 일수가 달라 점 간격이 고르지 않다 — "격월로 하나씩" 같은 규칙은
  // 촘촘한 구간에서 그대로 겹친다. 마지막으로 놓은 라벨에서 실제로 떨어진
  // 거리를 보고 자리가 있을 때만 놓는다. 연도가 바뀌는 달은 기준점이라 우선한다.
  const LABEL_MIN_GAP = 46;
  const labelled = new Set();
  let lastLabelX = -Infinity;
  let lastLabelKey = "";
  marks.forEach((m, index) => {
    const at = x(m.i);
    const startsYear = index === 0 || marks[index - 1].key.slice(0, 4) !== m.key.slice(0, 4);
    const roomy = at - lastLabelX >= LABEL_MIN_GAP;
    if (!startsYear && !roomy) return;
    // 해가 바뀌는 달은 시간을 읽는 기준점이라 거리와 무관하게 놓되, 그 바람에
    // 바로 앞 라벨과 부딪히면 앞의 것을 거둔다 — 연도가 그냥 이기면 겹친다.
    if (startsYear && !roomy && lastLabelKey) labelled.delete(lastLabelKey);
    labelled.add(m.key);
    lastLabelX = at;
    lastLabelKey = m.key;
  });

  return (
    <figure className="overflow-x-auto">
      <figcaption className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5" style={{ background: valenceColor(3) }} />
          밝은 감정
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5" style={{ background: valenceColor(-3) }} />
          어두운 감정
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="26" height="10" aria-hidden>
            <line x1="1" y1="5" x2="25" y2="5" stroke="var(--color-muted)" strokeWidth="1.5" opacity="0.55" />
          </svg>
          하루하루의 값
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden>
            <circle cx="6" cy="6" r="4.5" fill="var(--color-muted)" stroke="var(--color-bg)" strokeWidth="1.5" />
          </svg>
          그 달의 평균
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" role="img" aria-label="일자별 감정 변화와 월별 평균">
        {/* 밝음·어두움을 가르는 0선 */}
        <line x1={padX} y1={midY} x2={W - padX} y2={midY} stroke="var(--color-line)" strokeWidth="1" strokeDasharray="3 4" />

        {/* 일별 값 — 선 하나로 567일을 담는다 */}
        <path d={line} fill="none" stroke="var(--color-muted)" strokeWidth="1.2" strokeLinejoin="round" opacity="0.55" />

        {/* 월별 평균 */}
        {marks.map((m, index) => (
          <g key={m.key}>
            <circle cx={x(m.i)} cy={y(m.valence)} r="4.5" fill={valenceColor(m.valence)} stroke="var(--color-bg)" strokeWidth="1.5">
              <title>{`${m.key} · 평균 밝기 ${m.valence.toFixed(1)} · ${m.days}일 기록`}</title>
            </circle>
            {labelled.has(m.key) && (
              <text x={x(m.i)} y={H - 8} textAnchor="middle" className="fill-muted" fontSize="10">
                {label(m, index)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </figure>
  );
}
