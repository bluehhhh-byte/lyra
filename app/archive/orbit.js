import Link from "next/link";
import { valenceColor, emotionValence } from "../../lib/keywords";
import { MOOD_NEUTRAL_BAND } from "../../lib/emotion-model";
import { placeLabels, clampLabel } from "../../lib/orbit-layout";
import { workLabel } from "../../lib/archive-stats";

// 감정 궤도 — 선택 연도의 월들을 valence(가로)·arousal(세로) 평면에 놓고 시간
// 순서를 화살표로 잇는다. 전부 서버 렌더링 SVG + 링크라 JS 없이도 키보드로
// 월을 고를 수 있고, 스크린리더용 표가 아래에 따로 있다.
//
// 좌표계를 화면 크기별로 따로 둔다. 640×480 하나를 320px 폭에 밀어 넣으면 11px 글자가
// 5.5px가 되어 한글을 읽을 수 없다. 모바일은 viewBox를 좁게 잡아 같은 물리 크기에서
// 글자가 더 크게 나오도록 하고, 여백(PAD)도 라벨이 들어갈 만큼 넉넉히 준다.
// 점과 선은 작게, 판은 넓게 — 이 그림의 정보는 "점들이 평면 어디에 있고 어떻게
// 이동했는가"다. 마크가 크면 점끼리 뭉치고 화살표가 겹쳐, 판이 아니라 마크를 읽게 된다.
// rBase/rMax/rK가 점 반지름(rBase + min(rMax, √count × rK)), aw가 화살표 굵기다.
//
// 2026-08: 점을 더 줄였다. 모든 해가 같은 −3~+3 척도를 쓰는데 실제 월 좌표는
// 40개월 중 37개가 ±1.5 안에 있다. 점들이 판 가운데 뭉치는 그림이라, 마크가 크면
// 서로 겹쳐 어느 달이 어디인지 읽히지 않았다. 척도는 연도 비교를 위해 그대로 두고
// 마크만 줄인다.
//
// 2026-08(2): 판을 더 키우고 점을 더 줄였다. 판이 넓어야 라벨이 놓일 자리가 생기고,
// 점이 작아야 라벨이 점을 피해 갈 여지가 남는다. 둘은 같은 문제의 양면이다 —
// 이 그림에서 읽어야 하는 것은 마크의 크기가 아니라 마크가 놓인 자리다.
const VARIANTS = {
  mobile: { key: "m", W: 360, H: 480, PAD: 44, fs: 12, axisFs: 11, quadFs: 10, labelW: 30, labelH: 14, rBase: 2.2, rMax: 2.2, rK: 0.55, aw: 1.1 },
  desktop: { key: "d", W: 760, H: 560, PAD: 54, fs: 12, axisFs: 11, quadFs: 11, labelW: 30, labelH: 14, rBase: 1.8, rMax: 2.2, rK: 0.5, aw: 1 },
};

const DOMAIN = [-3, 3];

// 점 색은 valence가 아니라 시간 순서다.
//
// 예전에는 점을 valence 색으로 칠했다. 그런데 valence는 이미 가로축이다. 같은 값을
// 두 채널에 그리면 색이 아무 새 정보도 싣지 않고, "언제"를 알려면 화살표를 눈으로
// 따라가는 수밖에 없다. 점 열두 개가 얽히면 그게 안 된다.
//
// 색을 시간에 내주면 화살표를 따라가지 않아도 궤적이 읽힌다.
//
// 처음에는 한 색상 안에서 흐림→또렷함으로 갔는데 이웃한 달끼리 구분이 되지 않았다.
// 명도로 차이를 벌리는 것도 답이 아니다 — 이 사이트는 다크(#0d0d0f)와
// 라이트(#fdfdfc)를 모두 쓰므로, 어두운 끝은 다크 배경에서 묻히고 밝은 끝은
// 라이트 배경에서 묻힌다. 두 배경 모두에서 살아남으려면 명도는 중간 띠에
// 머물러야 한다.
//
// 그래서 명도는 0.62~0.80으로 좁게 두고 색상을 보라(300)에서 연둣빛(95)까지
// 205도 돌린다. 달이 여덟이면 한 칸에 29도씩 벌어져 이웃한 달도 다른 색으로 읽힌다.
// 보라 → 파랑 → 청록 → 초록 → 연두 순이라 순서 감각도 남는다.
const TIME_HUE_FROM = 300;
const TIME_HUE_TO = 95;

function timeColor(index, total) {
  const t = total > 1 ? index / (total - 1) : 1;
  const hue = TIME_HUE_FROM - t * (TIME_HUE_FROM - TIME_HUE_TO);
  // 명도는 살짝만 올린다. 색상만으로 순서가 안 읽히는 사람에게 남는 단서다.
  const lightness = 0.62 + t * 0.18;
  const chroma = 0.15;
  return `oklch(${lightness.toFixed(3)} ${chroma} ${hue.toFixed(0)})`;
}

// 범례용 — 양 끝만 이으면 중간 색상이 실제와 다르게 보간된다(CSS는 최단 경로로 돈다).
const timeStops = (total, steps = 6) =>
  Array.from({ length: steps }, (_, i) => timeColor((i / (steps - 1)) * (total - 1), total));

const mm = (month) => `${Number(month.slice(5))}월`;
const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

const pointTitle = (s) =>
  `${mm(s.month)} · ${s.type}${s.dominant ? ` · 대표 감정 ${s.dominant}` : ""} · 밝기 ${fmt1(s.center.v)} · 각성 ${fmt1(s.center.a)} · ${s.count}개 기록${s.move ? ` · ${s.move}` : ""}`;

// 한글 폭 추정 — 정확한 측정은 브라우저만 할 수 있으니 넉넉하게 잡는다.
// 좁게 잡으면 clamp가 덜 밀어 글자가 잘린다.
const textWidth = (text, fs) => {
  let units = 0;
  for (const ch of text) units += /[가-힣]/.test(ch) ? 1 : /[0-9A-Za-z]/.test(ch) ? 0.58 : 0.55;
  return units * fs;
};

function OrbitChart({ points, month, monthHref, v, chartId }) {
  const { W, H, PAD, fs, axisFs, quadFs, labelW, labelH, rBase, rMax, rK, aw } = v;
  const r = (s) => rBase + Math.min(rMax, Math.sqrt(s.count) * rK);
  const T = MOOD_NEUTRAL_BAND;

  // 모든 연도에 같은 -3..3 척도를 쓴다. 자동 확대는 작은 이동을 큰 변화처럼 보이게 하고,
  // 해마다 같은 좌표가 다른 자리에 놓여 비교를 어렵게 했다.
  const [vLo, vHi] = DOMAIN;
  const [aLo, aHi] = DOMAIN;
  const sx = (val) => PAD + ((val - vLo) / (vHi - vLo)) * (W - PAD * 2);
  const sy = (val) => H - PAD - ((val - aLo) / (aHi - aLo)) * (H - PAD * 2);
  const clampX = (x) => Math.max(PAD, Math.min(W - PAD, x));
  const clampY = (y) => Math.max(PAD, Math.min(H - PAD, y));
  const box = { width: W, height: H, pad: 5 };

  // 월 라벨이 서로/점과 겹치지 않게 자리를 먼저 잡고, viewBox 밖으로 나가면 안으로 민다
  const px = points.map((s) => ({ x: sx(s.center.v), y: sy(s.center.a) }));
  const labelPos = placeLabels(
    points.map((s, i) => {
      // 앞뒤 점을 잇는 선의 반대쪽에 라벨을 두려 한다 — 라벨 배경이 화살표를 덮으면
      // 이동 순서가 끊겨 보인다
      const neighbors = [px[i - 1], px[i + 1]].filter(Boolean);
      const away = neighbors.length
        ? (() => {
            const dx = neighbors.reduce((s2, n) => s2 + (px[i].x - n.x), 0);
            const dy = neighbors.reduce((s2, n) => s2 + (px[i].y - n.y), 0);
            const len = Math.hypot(dx, dy) || 1;
            return { x: dx / len, y: dy / len };
          })()
        : null;
      return { x: px[i].x, y: px[i].y, r: r(s), w: labelW, h: labelH, away };
    })
  ).map((pos) => clampLabel({ ...pos, w: labelW, h: labelH }, box));

  // 사분면 라벨은 안쪽 여백을 두고 놓는다 — 테두리에 아슬아슬하게 붙이지 않는다
  const inset = 10;
  const quadrants = [
    { x: PAD + inset, y: PAD + quadFs + 6, label: "긴장된 저항", anchor: "start" },
    { x: W - PAD - inset, y: PAD + quadFs + 6, label: "밝은 확장", anchor: "end" },
    { x: PAD + inset, y: H - PAD - inset, label: "깊은 침잠", anchor: "start" },
    { x: W - PAD - inset, y: H - PAD - inset, label: "고요한 회복", anchor: "end" },
  ]
    .map((q) => ({ ...q, ...clampLabel({ x: q.x, y: q.y, anchor: q.anchor, w: textWidth(q.label, quadFs), h: quadFs }, box) }));

  // 축의 의미를 네 방향에 직접 붙인다. 사분면 이름과 겹치지 않도록 판 바깥에 둔다.
  const axes = [
    { text: "↑ 고조됨", x: W / 2, y: PAD - 18, anchor: "middle" },
    { text: "고요함 ↓", x: W / 2, y: H - PAD + 32, anchor: "middle" },
    { text: "어두움 ←", x: PAD, y: H - PAD + 32, anchor: "start" },
    { text: "→ 밝음", x: W - PAD, y: H - PAD + 32, anchor: "end" },
  ].map((a) => ({ ...a, ...clampLabel({ x: a.x, y: a.y, anchor: a.anchor, w: textWidth(a.text, axisFs), h: axisFs }, box) }));

  // 뷰포트를 채우도록 늘리지 않는다 — 점 열두 개짜리 그림이 화면 폭만큼 커지면
  // 여백만 넓어지고 글자 대비 그림이 성겨져 오히려 읽기 어렵다
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-labelledby={`${chartId}-title ${chartId}-desc`}
      className="h-auto w-full"
    >
      <title id={`${chartId}-title`}>정서 지도 — 월별 밝기와 각성도</title>
      <desc id={`${chartId}-desc`}>
        가로축은 어두움에서 밝음, 세로축은 고요함에서 고조됨이다. 각 점은 한 달의 기록이고 화살표가 시간 순서를 잇는다.
      </desc>
      <defs>
        <marker id={`${chartId}-arrow`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--color-muted)" />
        </marker>
      </defs>

      {/* 네 정서 영역을 같은 크기로 보여 준다. 좌우 색은 점의 밝기 색과 같은 문법이다. */}
      <rect x={PAD} y={PAD} width={sx(0) - PAD} height={sy(0) - PAD} fill={valenceColor(-2)} opacity="0.07" />
      <rect x={sx(0)} y={PAD} width={W - PAD - sx(0)} height={sy(0) - PAD} fill={valenceColor(2)} opacity="0.07" />
      <rect x={PAD} y={sy(0)} width={sx(0) - PAD} height={H - PAD - sy(0)} fill={valenceColor(-2)} opacity="0.035" />
      <rect x={sx(0)} y={sy(0)} width={W - PAD - sx(0)} height={H - PAD - sy(0)} fill={valenceColor(2)} opacity="0.035" />
      {/* 고정 눈금은 해가 달라도 좌표의 거리감을 동일하게 유지한다. */}
      {[-2, -1, 1, 2].map((tick) => (
        <g key={tick} opacity="0.35">
          <line x1={sx(tick)} y1={PAD} x2={sx(tick)} y2={H - PAD} stroke="var(--color-line)" strokeDasharray="2 5" />
          <line x1={PAD} y1={sy(tick)} x2={W - PAD} y2={sy(tick)} stroke="var(--color-line)" strokeDasharray="2 5" />
        </g>
      ))}
      {/* 중립 밴드 — 사분면에 억지로 넣지 않는 영역. 보이는 범위와 겹치는 만큼만 */}
      <rect
        x={clampX(sx(-T))} y={clampY(sy(T))}
        width={Math.max(0, clampX(sx(T)) - clampX(sx(-T)))}
        height={Math.max(0, clampY(sy(-T)) - clampY(sy(T)))}
        fill="var(--color-line)" opacity="0.22" rx="8"
      />
      <line x1={clampX(sx(0))} y1={PAD} x2={clampX(sx(0))} y2={H - PAD} stroke="var(--color-line)" />
      <line x1={PAD} y1={clampY(sy(0))} x2={W - PAD} y2={clampY(sy(0))} stroke="var(--color-line)" />
      <rect x={PAD} y={PAD} width={W - PAD * 2} height={H - PAD * 2} fill="none" stroke="var(--color-line)" rx="12" />
      {quadrants.map((q) => (
        <text key={q.label} x={q.x} y={q.y} textAnchor={q.anchor} fontSize={quadFs} fill="var(--color-muted)" opacity="0.8">
          {q.label}
        </text>
      ))}

      {/* 축 라벨 */}
      {axes.map((a) => (
        <text key={a.text} x={a.x} y={a.y} textAnchor={a.anchor} fontSize={axisFs} fill="var(--color-muted)">
          {a.text}
        </text>
      ))}

      {/* 시간 순서 화살표 — 점선은 기록 없는 달을 건너뛴 이동 */}
      {points.slice(1).map((s, i) => {
        const p = points[i];
        const dx = sx(s.center.v) - sx(p.center.v);
        const dy = sy(s.center.a) - sy(p.center.a);
        const len = Math.hypot(dx, dy) || 1;
        const trim = (rr) => ({ tx: (dx / len) * rr, ty: (dy / len) * rr });
        const a = trim(r(p) + 2), b = trim(r(s) + 5);
        return (
          <line
            key={s.month}
            x1={sx(p.center.v) + a.tx} y1={sy(p.center.a) + a.ty}
            x2={sx(s.center.v) - b.tx} y2={sy(s.center.a) - b.ty}
            stroke={timeColor(i + 1, points.length)} strokeWidth={aw}
            strokeDasharray={s.prev?.gap > 0 ? "5 4" : "none"}
            markerEnd={`url(#${chartId}-arrow)`} opacity="0.6"
          />
        );
      })}

      {/* 월 점 — 클릭·키보드로 그 달 아카이브로 이동 */}
      {points.map((s, i) => {
        const active = s.month === month;
        const cx = sx(s.center.v), cy = sy(s.center.a);
        const label = labelPos[i];
        return (
          <a key={s.month} href={monthHref(s.month)} aria-label={pointTitle(s)} aria-current={active ? "page" : undefined}>
            <title>{pointTitle(s)}</title>
            {active && <circle cx={cx} cy={cy} r={r(s) + 7} fill="var(--color-accent)" opacity="0.12" />}
            {active && <circle cx={cx} cy={cy} r={r(s) + 4} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" />}
            <circle
              cx={cx} cy={cy} r={r(s)}
              fill={timeColor(i, points.length)}
              opacity={s.sparse ? 0.5 : 1}
              stroke={s.sparse ? "var(--color-muted)" : "var(--color-bg)"}
              strokeWidth="0.8"
              strokeDasharray={s.sparse ? "2 2" : "none"}
            />
            {/* 라벨 뒤에 배경을 깔아 선·점 위에서도 읽히게 한다. stroke는 글자 바깥으로
                번지므로 clampLabel의 여백이 그만큼을 이미 비워 뒀다 */}
            <text
              x={label.x} y={label.y}
              textAnchor={label.anchor} fontSize={fs} fontWeight={active ? 700 : 400}
              stroke="var(--color-bg)" strokeWidth="3" strokeLinejoin="round" paintOrder="stroke"
              fill={active ? "var(--color-accent)" : "var(--color-ink)"}
            >
              {mm(s.month)}
            </text>
          </a>
        );
      })}
    </svg>
  );
}

// 정서 추이 — 같은 값을 시간축으로 펴서 본다.
//
// 궤도 그림은 "평면 어디에 있었나"를 보여주지만 "언제 어떻게 움직였나"는 화살표를
// 따라가야 읽힌다. 게다가 모든 해가 같은 −3~+3 척도를 쓰는 탓에 실제 좌표가 가운데
// 25% 안에 뭉쳐 이동 폭이 작아 보인다. 같은 데이터를 가로=달, 세로=값으로 펴면
// 폭이 값 범위와 무관하게 열두 칸으로 벌어져 오르내림이 그대로 읽힌다.
//
// 두 계열을 겹치지 않고 위아래로 나눈다. 한 판에 두 선을 그으면 교차점마다
// 어느 선인지 확인해야 하는데, 밝기와 각성은 단위가 달라 교차 자체에 뜻이 없다.
const TREND = { W: 760, H: 168, PAD_X: 30, PAD_Y: 16, ROW: 68, GAP: 12 };

function TrendRow({ points, yearMonths, label, pick, color, y0, chartId }) {
  const { W, PAD_X, ROW } = TREND;
  const step = (W - PAD_X * 2) / Math.max(1, yearMonths.length - 1);
  const x = (i) => PAD_X + i * step;
  // 세로는 ±2로 고정한다. 40개월 중 38개가 그 안이고, 넘는 달은 가장자리에 붙는다.
  // 자동 확대를 쓰면 조용한 해의 미세한 흔들림이 격동처럼 보인다.
  const LIM = 2;
  const y = (val) => y0 + ROW / 2 - (Math.max(-LIM, Math.min(LIM, val)) / LIM) * (ROW / 2 - 6);

  const byMonth = new Map(points.map((s) => [s.month, s]));
  const seq = yearMonths.map((m, i) => ({ i, month: m, stat: byMonth.get(m) }));
  const filled = seq.filter((d) => d.stat);

  // 기록이 없는 달은 선을 잇지 않는다 — 이어 버리면 없는 값을 있는 것처럼 그린다
  const runs = [];
  let run = [];
  for (const d of seq) {
    if (d.stat) run.push(d);
    else if (run.length) (runs.push(run), (run = []));
  }
  if (run.length) runs.push(run);

  return (
    <g>
      <text x={PAD_X} y={y0 - 4} fontSize="10" fill="var(--color-muted)">{label}</text>
      <line x1={PAD_X} y1={y(0)} x2={W - PAD_X} y2={y(0)} stroke="var(--color-line)" />
      {runs.map((r, ri) => (
        <polyline
          key={ri}
          points={r.map((d) => `${x(d.i)},${y(pick(d.stat))}`).join(" ")}
          fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
          opacity="0.75"
        />
      ))}
      {filled.map((d) => (
        <circle
          key={d.month}
          cx={x(d.i)} cy={y(pick(d.stat))} r="2.6"
          fill={color} opacity={d.stat.sparse ? 0.45 : 1}
        >
          <title>{`${mm(d.month)} · ${label} ${fmt1(pick(d.stat))}`}</title>
        </circle>
      ))}
    </g>
  );
}

export function EmotionTrend({ stats, year }) {
  const points = stats.filter((s) => s.center);
  if (points.length < 2) return null;

  const { W, H, PAD_X, PAD_Y, ROW, GAP } = TREND;
  // 열두 달을 모두 그린다 — 기록이 없는 달도 자리를 차지해야 공백이 공백으로 보인다
  const yearMonths = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const step = (W - PAD_X * 2) / 11;
  const chartId = `trend-${year}`;

  return (
    <figure className="min-w-0 max-w-full">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${chartId}-title`} className="h-auto w-full">
        <title id={`${chartId}-title`}>
          {year}년 월별 밝기와 각성의 추이. 가로는 1월부터 12월, 세로는 −2에서 +2다.
        </title>
        <TrendRow
          points={points} yearMonths={yearMonths} label="밝기"
          pick={(s) => s.center.v} color={valenceColor(1.5)} y0={PAD_Y} chartId={chartId}
        />
        <TrendRow
          points={points} yearMonths={yearMonths} label="각성"
          pick={(s) => s.center.a} color={`oklch(0.7 0.1 ${TIME_HUE})`} y0={PAD_Y + ROW + GAP} chartId={chartId}
        />
        {yearMonths.map((m, i) =>
          i % 2 === 0 ? (
            <text
              key={m} x={PAD_X + i * step} y={H - 4}
              textAnchor="middle" fontSize="10" fill="var(--color-muted)"
            >
              {i + 1}
            </text>
          ) : null
        )}
      </svg>
      <figcaption className="mt-2 text-[11px] leading-5 text-muted">
        같은 좌표를 시간축으로 편 그림이다. 선이 끊긴 구간은 기록이 없는 달이고, 세로는 −2~+2로 고정이다.
      </figcaption>
    </figure>
  );
}

export function EmotionOrbit({ stats, month, monthHref }) {
  const points = stats.filter((s) => s.center);
  if (points.length === 0)
    return <p className="text-sm text-muted">감정이 기록된 달이 아직 없어 궤도를 그릴 수 없다.</p>;

  const active = points.find((s) => s.month === month) || points.at(-1);

  return (
    <figure className="min-w-0 max-w-full">
      {/* 좌표계가 다르므로 화면 크기별로 다른 SVG를 낸다. 숨겨진 쪽은 display:none이라
          링크가 탭 순서에 끼어들지 않는다 */}
      <div className="sm:hidden">
        <OrbitChart points={points} month={month} monthHref={monthHref} v={VARIANTS.mobile} chartId="orbit-m" />
      </div>
      <div className="hidden sm:block">
        <OrbitChart points={points} month={month} monthHref={monthHref} v={VARIANTS.desktop} chartId="orbit-d" />
      </div>
      <figcaption className="mt-3">
        <div className="grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-surface px-2 py-3 text-center">
          <div className="min-w-0 px-2">
            <span className="block truncate text-sm font-semibold text-ink">{active.dominant || "—"}</span>
            <span className="mt-0.5 block text-[10px] text-muted">{mm(active.month)} 대표 감정</span>
          </div>
          <div className="min-w-0 px-2">
            <span className="block text-sm font-semibold tabular-nums text-ink">{fmt1(active.center.v)} · {fmt1(active.center.a)}</span>
            <span className="mt-0.5 block text-[10px] text-muted">밝기 · 각성</span>
          </div>
          <div className="min-w-0 px-2">
            <span className="block text-sm font-semibold tabular-nums text-ink">{active.count}개</span>
            <span className="mt-0.5 block text-[10px] text-muted">기록량</span>
          </div>
        </div>
        {/* 색이 시간을 뜻한다는 것을 그림으로 말한다 — 글로만 적으면 아무도 안 읽는다 */}
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
          <span className="shrink-0">{mm(points[0].month)}</span>
          <span
            aria-hidden
            className="h-1.5 min-w-0 flex-1 rounded-full"
            style={{
              background: `linear-gradient(to right, ${timeStops(points.length).join(", ")})`,
            }}
          />
          <span className="shrink-0">{mm(points.at(-1).month)}</span>
        </div>
        <p className="mt-2 text-[11px] leading-5 text-muted">
          점 색은 시간 순서다 — 연초 보라에서 연말 연두로 색이 돈다. 가로 위치가 밝기, 세로가 각성이라
          색까지 밝기에 쓰면 같은 값을 두 번 그리는 셈이라 시간에 내줬다. 모든 해가 같은 −3~+3 척도를 쓴다.
          점 크기는 기록량, 점선 테두리는 감정 기록 3곡 미만, 점선 이동은 빈 달을 건너뛴 구간이다.
        </p>
      </figcaption>

      {/* 스크린리더·비시각 확인용 월별 데이터 표.
          sr-only를 <table>에 직접 주면 width:1px이 테이블 레이아웃에 먹지 않아 내용만큼
          늘어나고, position:absolute라 그대로 문서 폭이 된다. 감싸는 div가 잘라야 한다 */}
      <div className="sr-only">
        <table>
          <caption>월별 정서 좌표</caption>
          <thead>
            <tr><th>월</th><th>정서 유형</th><th>대표 감정</th><th>밝기</th><th>각성</th><th>이동</th><th>기록</th></tr>
          </thead>
          <tbody>
            {points.map((s) => (
              <tr key={s.month}>
                <td>{mm(s.month)}</td><td>{s.type}</td><td>{s.dominant || "—"}</td>
                <td>{fmt1(s.center.v)}</td><td>{fmt1(s.center.a)}</td>
                <td>{s.move || "—"}</td><td>{s.count}개</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

// 시간축 일대기 — 연·월 순서로 읽는 가로 스트립. 모바일에서는 줄바꿈을 허용해
// 가로 스크롤에만 의존하지 않는다.
export function BioTimeline({ stats, month, monthHref }) {
  if (!stats.length) return null;
  return (
    <ol className="flex min-w-0 flex-wrap items-stretch gap-y-3" aria-label="월별 정서 일대기">
      {stats.map((s, i) => {
        const active = s.month === month;
        return (
          <li key={s.month} className="flex min-w-0 max-w-full items-center">
            {i > 0 && (
              <span aria-hidden className="px-1.5 text-muted">
                {s.prev?.gap > 0 ? "⇢" : "→"}
              </span>
            )}
            <Link
              href={monthHref(s.month)}
              aria-current={active ? "page" : undefined}
              className={`block min-w-0 max-w-full rounded-xl border px-3 py-2 text-xs leading-5 transition ${
                active ? "border-accent bg-accent/10" : "border-line hover:border-accent/60"
              }`}
            >
              <span className={`block font-semibold ${active ? "text-accent" : ""}`}>
                {s.month.slice(0, 4)}.{s.month.slice(5)} {s.type}
              </span>
              <span className="block text-muted">
                {s.center
                  ? `${s.dominant} · 밝기 ${fmt1(s.center.v)} · 각성 ${fmt1(s.center.a)}`
                  : "감정 기록 없음"}
                {s.move ? ` · ${s.move}` : ""} · {s.count}개
              </span>
              {(s.repSong || s.repMovie) && (
                // 아티스트명이 길어도 카드가 화면을 넘기지 않게 — 자르지 말고 줄을 바꾼다
                <span className="block max-w-full break-words text-muted [overflow-wrap:anywhere] sm:max-w-56">
                  {[s.repSong && workLabel(s.repSong), s.repMovie && workLabel(s.repMovie)].filter(Boolean).join(" · ")}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}


// 감정 구성 — 선택한 달의 감정 비율.
//
// 전에는 원 둘레에 막대를 두른 그림과 비율 목록을 나란히 두었다. 그림은 한 감정이
// 전체의 몇 할인지 읽을 수 없었고(길이가 최댓값 기준이었다), 목록은 그림과 떨어져
// 있어 어느 막대가 어느 줄인지 눈으로 이어야 했다. 둘을 한 줄로 합친다 —
// 이름·막대·수치가 같은 행에 있으면 잇는 일 자체가 사라진다.
//
// 막대 길이는 전체 대비 비율이다. 옆의 %와 같은 값이라 그림과 숫자가 어긋나지 않는다.
// 색은 valence(밝음/어두움)다 — 지도의 점 색이 시간을 뜻하게 바뀐 뒤로는 서로 다른
// 뜻이니, 두 그림을 색으로 이어 읽지 말 것. 추이 그래프의 '밝기' 선이 이쪽과 같은 축이다.
export function EmotionComposition({ stat }) {
  if (!stat?.emotions?.length) return null;
  const total = stat.emotions.reduce((s, [, n]) => s + n, 0);

  return (
    <ul className="min-w-0 space-y-2.5" aria-label="감정별 비율">
      {stat.emotions.map(([emotion, n]) => {
        const pct = Math.round((n / total) * 100);
        return (
          <li key={emotion} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 text-xs leading-5">
              <span className="min-w-0 truncate text-ink">{emotion}</span>
              <span className="shrink-0 tabular-nums text-muted">
                {n}곡 · {pct}%
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line/50">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: valenceColor(emotionValence(emotion)) }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
