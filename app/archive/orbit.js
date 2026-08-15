import Link from "next/link";
import { valenceColor, emotionValence } from "../../lib/keywords";
import { emotionAngles, MOOD_NEUTRAL_BAND } from "../../lib/emotion-model";
import { axisRange, placeLabels, clampLabel, textBounds } from "../../lib/orbit-layout";
import { workLabel } from "../../lib/archive-stats";

// 감정 궤도 — 선택 연도의 월들을 valence(가로)·arousal(세로) 평면에 놓고 시간
// 순서를 화살표로 잇는다. 전부 서버 렌더링 SVG + 링크라 JS 없이도 키보드로
// 월을 고를 수 있고, 스크린리더용 표가 아래에 따로 있다.
//
// 좌표계를 화면 크기별로 따로 둔다. 640×480 하나를 320px 폭에 밀어 넣으면 11px 글자가
// 5.5px가 되어 한글을 읽을 수 없다. 모바일은 viewBox를 좁게 잡아 같은 물리 크기에서
// 글자가 더 크게 나오도록 하고, 여백(PAD)도 라벨이 들어갈 만큼 넉넉히 준다.
const VARIANTS = {
  mobile: { key: "m", W: 360, H: 424, PAD: 52, fs: 14, axisFs: 13, quadFs: 13, labelW: 34, labelH: 15 },
  desktop: { key: "d", W: 640, H: 504, PAD: 64, fs: 13, axisFs: 12, quadFs: 13, labelW: 32, labelH: 14 },
};

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
  const { W, H, PAD, fs, axisFs, quadFs, labelW, labelH } = v;
  const r = (s) => 6 + Math.min(8, Math.sqrt(s.count) * 1.6);
  const T = MOOD_NEUTRAL_BAND;

  // 축은 그 해 기록이 실제로 차지하는 범위에 맞춘다 — -3..3 고정이면 점이 한 귀퉁이에
  // 뭉쳐 이동을 못 읽는다. 0(중립선)은 언제나 화면 안에 남는다.
  const [vLo, vHi] = axisRange(points.map((s) => s.center.v));
  const [aLo, aHi] = axisRange(points.map((s) => s.center.a));
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
    { x: PAD + inset, y: PAD + quadFs + 6, label: "긴장된 저항", show: vLo < 0 && aHi > 0, anchor: "start" },
    { x: W - PAD - inset, y: PAD + quadFs + 6, label: "밝은 확장", show: vHi > 0 && aHi > 0, anchor: "end" },
    { x: PAD + inset, y: H - PAD - inset, label: "깊은 침잠", show: vLo < 0 && aLo < 0, anchor: "start" },
    { x: W - PAD - inset, y: H - PAD - inset, label: "고요한 회복", show: vHi > 0 && aLo < 0, anchor: "end" },
  ]
    .filter((q) => q.show)
    .map((q) => ({ ...q, ...clampLabel({ x: q.x, y: q.y, anchor: q.anchor, w: textWidth(q.label, quadFs), h: quadFs }, box) }));

  // 축 라벨은 차트 밖 두 줄로 나눈다. 예전에는 세로축의 '고요함 ↓'과 가로축의
  // '← 어두움'이 같은 줄 같은 x에 놓여 글자가 포개졌다.
  const rowA = H - PAD + axisFs + 10; // 세로축 아래쪽
  const rowB = rowA + axisFs + 8; // 가로축
  const axes = [
    { text: "고조됨 ↑", x: PAD, y: PAD - 12, anchor: "start" },
    { text: "고요함 ↓", x: PAD, y: rowA, anchor: "start" },
    { text: "← 어두움", x: PAD, y: rowB, anchor: "start" },
    { text: "밝음 →", x: W - PAD, y: rowB, anchor: "end" },
  ].map((a) => ({ ...a, ...clampLabel({ x: a.x, y: a.y, anchor: a.anchor, w: textWidth(a.text, axisFs), h: axisFs }, box) }));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-labelledby={`${chartId}-title ${chartId}-desc`}
      className="h-auto w-full max-w-full"
    >
      <title id={`${chartId}-title`}>감정 궤도 — 월별 정서 좌표와 이동</title>
      <desc id={`${chartId}-desc`}>
        가로축은 어두움에서 밝음, 세로축은 고요함에서 고조됨이다. 각 점은 한 달의 기록이고 화살표가 시간 순서를 잇는다.
      </desc>
      <defs>
        <marker id={`${chartId}-arrow`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--color-muted)" />
        </marker>
      </defs>

      {/* 사분면 배경과 읽는 법 */}
      <rect x={PAD} y={PAD} width={W - PAD * 2} height={H - PAD * 2} fill="none" stroke="var(--color-line)" />
      {/* 중립 밴드 — 사분면에 억지로 넣지 않는 영역. 보이는 범위와 겹치는 만큼만 */}
      <rect
        x={clampX(sx(-T))} y={clampY(sy(T))}
        width={Math.max(0, clampX(sx(T)) - clampX(sx(-T)))}
        height={Math.max(0, clampY(sy(-T)) - clampY(sy(T)))}
        fill="var(--color-line)" opacity="0.22" rx="8"
      />
      <line x1={clampX(sx(0))} y1={PAD} x2={clampX(sx(0))} y2={H - PAD} stroke="var(--color-line)" />
      <line x1={PAD} y1={clampY(sy(0))} x2={W - PAD} y2={clampY(sy(0))} stroke="var(--color-line)" />
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
            stroke="var(--color-muted)" strokeWidth="1.6"
            strokeDasharray={s.prev?.gap > 0 ? "5 4" : "none"}
            markerEnd={`url(#${chartId}-arrow)`} opacity="0.8"
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
            {active && <circle cx={cx} cy={cy} r={r(s) + 5} fill="none" stroke="var(--color-accent)" strokeWidth="2" />}
            <circle
              cx={cx} cy={cy} r={r(s)}
              fill={valenceColor(s.center.v)}
              opacity={s.sparse ? 0.45 : 0.95}
              stroke={s.sparse ? "var(--color-muted)" : "var(--color-bg)"}
              strokeWidth="1.5"
              strokeDasharray={s.sparse ? "3 2" : "none"}
            />
            {/* 라벨 뒤에 배경을 깔아 선·점 위에서도 읽히게 한다. stroke는 글자 바깥으로
                번지므로 clampLabel의 여백이 그만큼을 이미 비워 뒀다 */}
            <text
              x={label.x} y={label.y}
              textAnchor={label.anchor} fontSize={fs} fontWeight={active ? 700 : 400}
              stroke="var(--color-bg)" strokeWidth="3.5" strokeLinejoin="round" paintOrder="stroke"
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
      <figcaption className="mt-2 text-xs text-muted">
        점 크기는 기록량, 흐린 점선 테두리는 감정 기록 3곡 미만(표본 부족)이다. 점선 화살표는 기록이 없는 달을 건너뛴 이동.
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

// 감정 구성 — 선택한 달의 감정 비율. 궤도의 보조 시각화. 원 둘레 배치는
// 가나다순이 아니라 circumplex 각도(emotionAngle)다. hover 없이도 읽히도록
// 수치 목록을 항상 같이 보여준다.
//
// viewBox를 막대 길이보다 넉넉히 잡고 라벨을 안으로 clamp한다. 예전에는 220 안에서
// 막대 끝 + 13에 라벨 중심을 두어 원 가장자리 감정("긴장된 저항" 같은 긴 이름은 아니지만
// 두 글자여도) 한글이 viewBox 밖으로 나갔다.
const COMP = { S: 272, R0: 30, R1: 96, FS: 13 };

export function EmotionComposition({ stat }) {
  if (!stat?.emotions?.length) return null;
  const total = stat.emotions.reduce((s, [, n]) => s + n, 0);
  const { S, R0, R1, FS } = COMP;
  const C = S / 2;
  const max = stat.emotions[0][1];
  const angles = emotionAngles(stat.emotions.map(([e]) => e));

  const placed = [];
  const items = stat.emotions.map(([emotion, n]) => {
    // SVG y축은 아래가 +라서 각도를 뒤집어 위가 고각성이 되게 한다
    const ang = -angles.get(emotion);
    const len = R0 + ((R1 - R0) * n) / max;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const w = textWidth(emotion, FS);
    // 좌우 가장자리에서는 글자가 바깥으로 뻗지 않도록 anchor를 바꾼다
    const anchor = cos > 0.35 ? "start" : cos < -0.35 ? "end" : "middle";
    const gap = anchor === "middle" ? 8 : 6;
    let x = C + cos * (len + gap);
    let y = C + sin * (len + gap) + FS * 0.35;
    let pos = clampLabel({ x, y, anchor, w, h: FS }, { width: S, height: S, pad: 3 });
    // 같은 방향으로 몰린 라벨이 포개지면 반지름 방향으로 조금 더 밀어낸다
    for (let step = 0; step < 6; step++) {
      const [l, rr] = textBounds(pos.x, anchor, w);
      const hit = placed.some((q) => l < q.r + 2 && rr + 2 > q.l && pos.y - FS * 0.8 < q.b + 1 && pos.y + FS * 0.25 + 1 > q.t);
      if (!hit) break;
      pos = clampLabel(
        { x: pos.x + cos * (FS * 0.9), y: pos.y + sin * (FS * 0.9) + (sin >= 0 ? FS * 0.5 : -FS * 0.5), anchor, w, h: FS },
        { width: S, height: S, pad: 3 }
      );
    }
    const [l, rr] = textBounds(pos.x, anchor, w);
    placed.push({ l, r: rr, t: pos.y - FS * 0.8, b: pos.y + FS * 0.25 });
    return {
      emotion, n, ang, len,
      x1: C + cos * R0, y1: C + sin * R0,
      x2: C + cos * len, y2: C + sin * len,
      label: pos, anchor,
    };
  });

  return (
    // 모바일은 그래프와 수치 목록을 세로로 쌓아 폭을 넘기지 않는다
    <div className="flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
      <svg
        viewBox={`0 0 ${S} ${S}`}
        role="img"
        aria-label={`${Number(stat.month.slice(5))}월 감정 구성`}
        className="h-auto w-full max-w-72 sm:w-64"
      >
        <circle cx={C} cy={C} r={R1 + 8} fill="none" stroke="var(--color-line)" />
        <circle cx={C} cy={C} r={R0 - 6} fill="none" stroke="var(--color-line)" opacity="0.6" />
        {items.map((it) => (
          <g key={it.emotion}>
            <title>{`${it.emotion} ${it.n}곡 · ${Math.round((it.n / total) * 100)}%`}</title>
            <line x1={it.x1} y1={it.y1} x2={it.x2} y2={it.y2} stroke={valenceColor(emotionValence(it.emotion))} strokeWidth="7" strokeLinecap="round" />
            <text
              x={it.label.x} y={it.label.y}
              textAnchor={it.anchor} fontSize={FS} fill="var(--color-ink)"
              stroke="var(--color-bg)" strokeWidth="2.5" strokeLinejoin="round" paintOrder="stroke"
            >
              {it.emotion}
            </text>
          </g>
        ))}
      </svg>
      <ul className="min-w-0 text-xs leading-6 text-muted" aria-label="감정별 비율">
        {items.map((it) => (
          <li key={it.emotion}>
            <span className="text-ink">{it.emotion}</span> {it.n}곡 · {Math.round((it.n / total) * 100)}%
          </li>
        ))}
      </ul>
    </div>
  );
}
