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
const VARIANTS = {
  mobile: { key: "m", W: 360, H: 420, PAD: 46, fs: 13, axisFs: 12, quadFs: 11, labelW: 34, labelH: 15, rBase: 5, rMax: 5, rK: 1.2, aw: 1.5 },
  desktop: { key: "d", W: 760, H: 420, PAD: 58, fs: 12, axisFs: 11, quadFs: 11, labelW: 32, labelH: 14, rBase: 4, rMax: 5, rK: 1.1, aw: 1.4 },
};

const DOMAIN = [-3, 3];

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
      className="h-auto w-full max-w-[760px]"
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
            stroke="var(--color-muted)" strokeWidth={aw}
            strokeDasharray={s.prev?.gap > 0 ? "5 4" : "none"}
            markerEnd={`url(#${chartId}-arrow)`} opacity="0.42"
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
              fill={valenceColor(s.center.v)}
              opacity={s.sparse ? 0.45 : 0.95}
              stroke={s.sparse ? "var(--color-muted)" : "var(--color-bg)"}
              strokeWidth="1"
              strokeDasharray={s.sparse ? "3 2" : "none"}
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
        <p className="mt-2 text-[11px] leading-5 text-muted">
          모든 해가 같은 −3~+3 척도를 쓴다. 점 크기는 기록량, 점선 테두리는 감정 기록 3곡 미만, 점선 이동은 빈 달을 건너뛴 구간이다.
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
// 색은 valence(밝음/어두움)라 궤도 그래프의 점 색과 같은 뜻이다.
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
