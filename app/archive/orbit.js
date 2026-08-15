import Link from "next/link";
import { valenceColor, emotionValence } from "../../lib/keywords";
import { emotionAngles, MOOD_NEUTRAL_BAND } from "../../lib/emotion-model";
import { axisRange, placeLabels } from "../../lib/orbit-layout";
import { workLabel } from "../../lib/archive-stats";

// 감정 궤도 — 선택 연도의 월들을 valence(가로)·arousal(세로) 평면에 놓고 시간
// 순서를 화살표로 잇는다. 전부 서버 렌더링 SVG + 링크라 JS 없이도 키보드로
// 월을 고를 수 있고, 스크린리더용 표가 아래에 따로 있다.
const W = 640, H = 480, PAD = 56;
const mm = (month) => `${Number(month.slice(5))}월`;
const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

const pointTitle = (s) =>
  `${mm(s.month)} · ${s.type}${s.dominant ? ` · 대표 감정 ${s.dominant}` : ""} · 밝기 ${fmt1(s.center.v)} · 각성 ${fmt1(s.center.a)} · ${s.count}개 기록${s.move ? ` · ${s.move}` : ""}`;

export function EmotionOrbit({ stats, month, monthHref }) {
  const points = stats.filter((s) => s.center);
  if (points.length === 0)
    return <p className="text-sm text-muted">감정이 기록된 달이 아직 없어 궤도를 그릴 수 없다.</p>;
  const r = (s) => 6 + Math.min(8, Math.sqrt(s.count) * 1.6);
  const T = MOOD_NEUTRAL_BAND;

  // 축은 그 해 기록이 실제로 차지하는 범위에 맞춘다 — -3..3 고정이면 점이 한 귀퉁이에
  // 뭉쳐 이동을 못 읽는다. 0(중립선)은 언제나 화면 안에 남는다.
  const [vLo, vHi] = axisRange(points.map((s) => s.center.v));
  const [aLo, aHi] = axisRange(points.map((s) => s.center.a));
  const sx = (v) => PAD + ((v - vLo) / (vHi - vLo)) * (W - PAD * 2);
  const sy = (a) => H - PAD - ((a - aLo) / (aHi - aLo)) * (H - PAD * 2);
  const clampX = (x) => Math.max(PAD, Math.min(W - PAD, x));
  const clampY = (y) => Math.max(PAD, Math.min(H - PAD, y));

  // 월 라벨이 서로/점과 겹치지 않게 자리를 미리 잡는다
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
      return { x: px[i].x, y: px[i].y, r: r(s), w: 30, h: 14, away };
    })
  );
  const quadrants = [
    { x: PAD + 8, y: PAD + 18, label: "긴장된 저항", show: vLo < 0 && aHi > 0, anchor: "start" },
    { x: W - PAD - 8, y: PAD + 18, label: "밝은 확장", show: vHi > 0 && aHi > 0, anchor: "end" },
    { x: PAD + 8, y: H - PAD - 10, label: "깊은 침잠", show: vLo < 0 && aLo < 0, anchor: "start" },
    { x: W - PAD - 8, y: H - PAD - 10, label: "고요한 회복", show: vHi > 0 && aLo < 0, anchor: "end" },
  ];

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby="orbit-title orbit-desc"
        className="w-full max-w-2xl"
      >
        <title id="orbit-title">감정 궤도 — 월별 정서 좌표와 이동</title>
        <desc id="orbit-desc">
          가로축은 어두움에서 밝음, 세로축은 고요함에서 고조됨이다. 각 점은 한 달의 기록이고 화살표가 시간 순서를 잇는다.
        </desc>
        <defs>
          <marker id="orbit-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
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
        {quadrants.filter((q) => q.show).map((q) => (
          <text key={q.label} x={q.x} y={q.y} textAnchor={q.anchor} fontSize="12" fill="var(--color-muted)" opacity="0.8">
            {q.label}
          </text>
        ))}

        {/* 축 라벨 */}
        <text x={PAD} y={H - PAD + 28} fontSize="11" fill="var(--color-muted)">← 어두움</text>
        <text x={W - PAD} y={H - PAD + 28} fontSize="11" fill="var(--color-muted)" textAnchor="end">밝음 →</text>
        <text x={PAD - 10} y={PAD - 12} fontSize="11" fill="var(--color-muted)">고조됨 ↑</text>
        <text x={PAD - 10} y={H - PAD + 14} fontSize="11" fill="var(--color-muted)">고요함 ↓</text>

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
              markerEnd="url(#orbit-arrow)" opacity="0.8"
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
              {/* 라벨 뒤에 배경을 깔아 선·점 위에서도 읽히게 한다 */}
              <text
                x={label.x} y={label.y}
                textAnchor={label.anchor} fontSize="11" fontWeight={active ? 700 : 400}
                stroke="var(--color-bg)" strokeWidth="3.5" strokeLinejoin="round" paintOrder="stroke"
                fill={active ? "var(--color-accent)" : "var(--color-ink)"}
              >
                {mm(s.month)}
              </text>
            </a>
          );
        })}
      </svg>
      <figcaption className="mt-2 text-xs text-muted">
        점 크기는 기록량, 흐린 점선 테두리는 감정 기록 3곡 미만(표본 부족)이다. 점선 화살표는 기록이 없는 달을 건너뛴 이동.
      </figcaption>

      {/* 스크린리더·비시각 확인용 월별 데이터 표 */}
      <table className="sr-only">
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
    </figure>
  );
}

// 시간축 일대기 — 연·월 순서로 읽는 가로 스트립. 모바일에서는 줄바꿈을 허용해
// 가로 스크롤에만 의존하지 않는다.
export function BioTimeline({ stats, month, monthHref }) {
  if (!stats.length) return null;
  return (
    <ol className="flex flex-wrap items-stretch gap-y-3" aria-label="월별 정서 일대기">
      {stats.map((s, i) => {
        const active = s.month === month;
        return (
          <li key={s.month} className="flex items-center">
            {i > 0 && (
              <span aria-hidden className="px-1.5 text-muted">
                {s.prev?.gap > 0 ? "⇢" : "→"}
              </span>
            )}
            <Link
              href={monthHref(s.month)}
              aria-current={active ? "page" : undefined}
              className={`block rounded-xl border px-3 py-2 text-xs leading-5 transition ${
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
                <span className="block max-w-56 text-muted">
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
export function EmotionComposition({ stat }) {
  if (!stat?.emotions?.length) return null;
  const total = stat.emotions.reduce((s, [, n]) => s + n, 0);
  const S = 220, C = S / 2, R0 = 26, R1 = 96;
  const max = stat.emotions[0][1];
  const angles = emotionAngles(stat.emotions.map(([e]) => e));
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label={`${Number(stat.month.slice(5))}월 감정 구성`} className="w-56 shrink-0 sm:w-64 lg:w-56">
        <circle cx={C} cy={C} r={R1 + 8} fill="none" stroke="var(--color-line)" />
        <circle cx={C} cy={C} r={R0 - 6} fill="none" stroke="var(--color-line)" opacity="0.6" />
        {stat.emotions.map(([emotion, n]) => {
          // SVG y축은 아래가 +라서 각도를 뒤집어 위가 고각성이 되게 한다
          const ang = -angles.get(emotion);
          const len = R0 + ((R1 - R0) * n) / max;
          const x1 = C + Math.cos(ang) * R0, y1 = C + Math.sin(ang) * R0;
          const x2 = C + Math.cos(ang) * len, y2 = C + Math.sin(ang) * len;
          return (
            <g key={emotion}>
              <title>{`${emotion} ${n}곡 · ${Math.round((n / total) * 100)}%`}</title>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={valenceColor(emotionValence(emotion))} strokeWidth="7" strokeLinecap="round" />
              <text
                x={C + Math.cos(ang) * (len + 13)} y={C + Math.sin(ang) * (len + 13) + 3.5}
                textAnchor="middle" fontSize="10" fill="var(--color-ink)"
              >
                {emotion}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="text-xs leading-6 text-muted" aria-label="감정별 비율">
        {stat.emotions.map(([emotion, n]) => (
          <li key={emotion}>
            <span className="text-ink">{emotion}</span> {n}곡 · {Math.round((n / total) * 100)}%
          </li>
        ))}
      </ul>
    </div>
  );
}
