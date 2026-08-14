import Link from "next/link";
import { getAllSongs } from "../../../lib/songs";
import { readData } from "../../../lib/store";
import { summarizeMusicTaste, interpretMusicTaste, recentShift } from "../../../lib/music-taste-core";
import { emotionValence, valenceColor, parseEmotion } from "../../../lib/keywords";
import CoverImage from "../../cover-image";

export const metadata = {
  title: "음악 취향 | Lyra",
  description: "모아온 곡들로 본 음악 취향 — 장르·감정·시대·아티스트·키워드",
};

// "내가 어떤 음악을 모으는가"의 해석. 별점·재생 기록이 없으므로 모든 표현은
// '많이 담은'이다 — '좋아하는'이 아니라. 숫자·기록 나열은 /stats 담당.
function Bar({ label, n, max, total, color, href }) {
  return (
    <span className="flex items-center gap-3 text-sm">
      {href ? (
        <Link href={href} className="w-32 shrink-0 truncate hover:text-accent hover:underline sm:w-40">
          {label}
        </Link>
      ) : (
        <span className="w-32 shrink-0 truncate sm:w-40">{label}</span>
      )}
      <span className="h-4 flex-1 overflow-hidden rounded bg-line/50">
        <span
          aria-hidden
          className="h-full rounded"
          style={{ display: "block", width: `${Math.max(2, (n / max) * 100)}%`, background: color || "var(--color-accent)" }}
        />
      </span>
      <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted">
        {n}곡 · {Math.round((n / total) * 100)}%
      </span>
    </span>
  );
}

function Section({ title, hint, children }) {
  return (
    <section className="mb-12">
      <h2 className="text-sm font-semibold text-muted">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-muted/60">{hint}</p>}
      <div className="mt-4 space-y-2">{children}</div>
    </section>
  );
}

function representativeSongs(songs, taste) {
  const topEmotion = taste.emotion[0]?.[0];
  const topGenre = taste.genre[0]?.[0];
  const topDecade = taste.decade[0]?.[0];
  const decade = parseInt(topDecade, 10);
  return songs
    .map((song) => {
      const emotionHit = parseEmotion(song.emotion) === topEmotion;
      const genreHit = topGenre && song.tags.includes(topGenre);
      const decadeHit = Number.isFinite(decade) && +song.year >= decade && +song.year < decade + 10;
      return { song, score: Number(emotionHit) + Number(genreHit) + Number(decadeHit) };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ song }) => {
      const line = song.stanzas.flatMap((stanza) => stanza.lines).find((item) => item.ko || item.en);
      return { ...song, quote: line?.ko || line?.en || "" };
    });
}

function Evidence({ songs, taste }) {
  const examples = representativeSongs(songs, taste);
  if (!examples.length) return null;
  return (
    <section className="mb-12 rounded-2xl border border-line bg-surface/60 p-5 sm:p-7">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">이 취향을 만든 기록</h2>
          <p className="mt-1 text-xs text-muted">대표 감정·장르·시대가 겹치는 실제 곡과 가사입니다.</p>
        </div>
        <Link href={`/?emotion=${encodeURIComponent(taste.emotion[0]?.[0] || "")}`} className="text-xs text-accent hover:underline">
          같은 감정의 모든 곡 →
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-5">
        {examples.map((song) => (
          <Link key={song.slug} href={`/songs/${song.slug}`} className="group min-w-0">
            <CoverImage src={song.artwork} alt="" label={song.title} loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
            <p className="mt-2 truncate text-xs font-semibold group-hover:text-accent">{song.title}</p>
            {song.quote && <p className="mt-1 line-clamp-2 font-serif text-[11px] leading-4 text-muted">“{song.quote}”</p>}
          </Link>
        ))}
      </div>
    </section>
  );
}

function EmotionEvidence({ emotion, n, songs, taste }) {
  const matched = songs.filter((song) => parseEmotion(song.emotion) === emotion);
  const counts = (values) => {
    const map = new Map();
    for (const value of values.filter(Boolean)) map.set(value, (map.get(value) || 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  };
  const decades = counts(matched.map((song) => song.year && `${Math.floor(+song.year / 10) * 10}년대`));
  const keywords = counts(matched.flatMap((song) => song.keywords || []));
  const examples = matched.slice(0, 5);
  return (
    <details className="group rounded-lg border border-transparent open:border-line open:bg-surface/50 open:p-4">
      <summary className="cursor-pointer list-none">
        <Bar emotionPanel label={emotion} n={n} max={taste.emotion[0]?.[1] || 1} total={taste.count} color={valenceColor(emotionValence(emotion))} />
      </summary>
      <div className="mt-4 border-t border-line pt-4">
        <p className="text-xs leading-5 text-muted">
          {decades[0] ? `${emotion}은 ${decades.slice(0, 2).map(([name, count]) => `${name} ${count}곡`).join(" · ")}에서 많이 나타납니다.` : "시대 정보가 있는 곡이 더 필요합니다."}
          {keywords.length > 0 && ` 함께 반복된 말은 ${keywords.slice(0, 5).map(([word]) => word).join(", ")}입니다.`}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {examples.map((song) => (
            <Link key={song.slug} href={`/songs/${song.slug}`} className="group/song min-w-0">
              <CoverImage src={song.artwork} alt="" label={song.title} loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
              <p className="mt-1.5 truncate text-xs group-hover/song:text-accent">{song.title}</p>
            </Link>
          ))}
        </div>
        <Link href={`/?emotion=${encodeURIComponent(emotion)}`} className="mt-4 inline-block text-xs text-accent hover:underline">
          {emotion}에 해당하는 {n}곡 모두 보기 →
        </Link>
      </div>
    </details>
  );
}

export default function MusicTastePage() {
  const songs = getAllSongs();
  const t = summarizeMusicTaste(songs);
  const text = interpretMusicTaste(t);
  const report = readData("music-report.json", null);
  const shift = recentShift(songs);

  if (t.count === 0)
    return (
      <>
        <h1 className="mb-8 text-2xl font-bold">음악 취향</h1>
        <div className="rounded-xl border border-dashed border-line px-6 py-16 text-center text-sm text-muted">
          아직 분석할 곡이 없습니다. 곡을 담으면 취향이 여기에 나타납니다.
        </div>
      </>
    );

  const tiles = [
    ["곡", `${t.count}곡`],
    ["아티스트", `${t.artist.length}팀`],
    ["최다 장르", t.genre[0]?.[0] || "—"],
    ["최다 감정", t.emotion[0]?.[0] || "—"],
    ["최다 시대", t.decade[0]?.[0] || "—"],
    ["최다 권역", t.region[0]?.[0] || "—"],
  ];

  // 감정 기울기 게이지 (-3 어두움 ~ +3 밝음)의 마커 위치
  const valencePct = ((t.valenceMean + 3) / 6) * 100;

  return (
    <>
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">음악 취향</h1>
          <p className="mt-1 text-sm text-muted">지금까지 모아온 {t.count}곡이 말해주는 것</p>
        </div>
        <div className="flex gap-4">
          <Link href="/recommendations/music" className="text-sm text-accent hover:underline">
            추천 곡 →
          </Link>
          <Link href="/stats" className="text-sm text-accent hover:underline">
            통계 →
          </Link>
        </div>
      </div>

      {text && (
        <div className="mb-6 rounded-xl border border-accent/30 bg-accent/5 px-5 py-4 text-sm leading-relaxed">
          {text}
        </div>
      )}

      <Evidence songs={songs} taste={t} />

      {/* Gemini 리포트 — admin의 '취향 리포트 생성'이 저장한 교차 해석.
          위 한 줄 요약은 코드 계산(항상 최신), 이건 생성 시점 스냅샷. */}
      {report?.text && (
        <div className="mb-10 rounded-xl border border-line bg-surface px-5 py-4">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-muted">AI 리포트</h2>
            <span className="text-xs text-muted/60">
              {report.count}곡 기준 · {new Date(report.at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}
            </span>
          </div>
          <div className="space-y-3 text-sm leading-relaxed">
            {report.text.split(/\n\s*\n/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      )}

      <div className="mb-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line bg-surface px-4 py-3">
            <p className="text-xs text-muted">{k}</p>
            <p className="mt-1 truncate text-sm font-semibold">{v}</p>
          </div>
        ))}
      </div>

      <Section
        title="감정 분포"
        hint={`${t.count}곡 중 ${t.covered.emotion}곡 기준 — 감정을 누르면 그 감정의 곡만, 색은 밝음(주황) ↔ 어두움(파랑)`}
      >
        {t.emotion.map(([e, n]) => (
          <EmotionEvidence
            key={e}
            emotion={e}
            n={n}
            songs={songs}
            taste={t}
          />
        ))}
        {t.emotion.length > 0 && (
          <div className="pt-4">
            <div className="relative h-2 rounded-full" style={{ background: "linear-gradient(to right, oklch(0.72 0.13 250), oklch(0.72 0.13 40))" }}>
              <span
                className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-ink"
                style={{ left: `${valencePct}%` }}
                title={`기울기 ${t.valenceMean.toFixed(1)}`}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-xs text-muted">
              <span>어두움</span>
              <span className="tabular-nums">{t.valenceMean > 0 ? "+" : ""}{t.valenceMean.toFixed(1)}</span>
              <span>밝음</span>
            </div>
          </div>
        )}
      </Section>

      {shift && (
        <Section title="최근의 변화" hint={`최근 ${shift.n}곡을 전체와 비교 — 기록이 움직이는 방향`}>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              shift.genre && ["요즘 장르", shift.genre],
              shift.emotion && ["요즘 감정", shift.emotion],
              shift.region && ["요즘 권역", shift.region],
            ]
              .filter(Boolean)
              .map(([label, d]) => (
                <div key={label} className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">
                  <p className="text-xs text-muted">{label}</p>
                  <p className="mt-1 font-semibold">
                    {d.name} <span className="text-xs font-normal text-muted">{d.n}/{shift.n}곡</span>
                    {d.deltaPct !== 0 && (
                      <span className={`ml-2 text-xs font-normal ${d.deltaPct > 0 ? "text-accent" : "text-muted"}`}>
                        전체 대비 {d.deltaPct > 0 ? `+${d.deltaPct}` : d.deltaPct}%p
                      </span>
                    )}
                  </p>
                </div>
              ))}
            <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">
              <p className="text-xs text-muted">정서 기울기</p>
              <p className="mt-1 font-semibold tabular-nums">
                {shift.valenceRecent > 0 ? "+" : ""}{shift.valenceRecent.toFixed(1)}
                <span className="ml-2 text-xs font-normal text-muted">
                  전체 {shift.valenceAll > 0 ? "+" : ""}{shift.valenceAll.toFixed(1)} →{" "}
                  {shift.valenceRecent > shift.valenceAll + 0.3
                    ? "밝아지는 중"
                    : shift.valenceRecent < shift.valenceAll - 0.3
                      ? "어두워지는 중"
                      : "비슷함"}
                </span>
              </p>
            </div>
          </div>
          {shift.newArtists.length > 0 && (
            <p className="pt-1 text-xs text-muted">
              처음 등장한 아티스트: {shift.newArtists.slice(0, 8).join(", ")}
              {shift.newArtists.length > 8 && ` 외 ${shift.newArtists.length - 8}팀`}
            </p>
          )}
        </Section>
      )}

      <Section title="많이 담은 장르" hint={`${t.count}곡 중 ${t.covered.genre}곡 기준 — 장르를 누르면 그 태그의 곡·영화로`}>
        {t.genre.slice(0, 12).map(([g, n]) => (
          <Bar key={g} label={g} n={n} max={t.genre[0]?.[1] || 1} total={t.count} href={`/tags/${encodeURIComponent(g)}`} />
        ))}
      </Section>

      <Section title="많이 담은 시대" hint={`연도 있는 ${t.covered.decade}곡 기준 — 시대를 누르면 그 연대의 곡만`}>
        {[...t.decade].sort((a, b) => a[0].localeCompare(b[0])).map(([d, n]) => (
          <Bar key={d} label={d} n={n} max={t.decade[0]?.[1] || 1} total={t.count} href={`/?decade=${parseInt(d)}s`} />
        ))}
      </Section>

      <Section title="국가·권역" hint="권역을 누르면 그 태그의 곡·영화로">
        {t.region.map(([r, n]) => (
          <Bar
            key={r}
            label={r}
            n={n}
            max={t.region[0]?.[1] || 1}
            total={t.count}
            href={r === "기타" ? undefined : `/tags/${encodeURIComponent(r)}`}
          />
        ))}
      </Section>

      <Section
        title="많이 담은 아티스트"
        hint={`전체 ${t.artist.length}팀 중 ${t.once.length}팀은 한 곡씩만 담긴 발견형 — 이름을 누르면 그 가수의 곡으로`}
      >
        {t.repeat.slice(0, 10).map(([a, n]) => (
          <Bar key={a} label={a} n={n} max={t.repeat[0]?.[1] || 1} total={t.count} href={`/?q=${encodeURIComponent(a)}`} />
        ))}
        {t.repeat.length === 0 && <p className="text-sm text-muted">아직 두 곡 이상 담은 아티스트가 없습니다.</p>}
      </Section>

      <Section title="가사 키워드" hint="누르면 그 단어가 나오는 곡을 가사에서 찾는다">
        <div className="flex flex-wrap gap-2 pt-1">
          {t.keywords.slice(0, 30).map(([w, n]) => (
            <Link
              key={w}
              href={`/?q=${encodeURIComponent(w)}`}
              className="rounded-full border border-line px-3 py-1 text-xs text-muted transition hover:border-accent hover:text-accent"
            >
              #{w} <span className="tabular-nums text-muted/60">{n}</span>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
