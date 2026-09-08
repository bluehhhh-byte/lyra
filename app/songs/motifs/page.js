import Link from "next/link";
import { getAllSongsRuntime } from "../../../lib/songs";
import { readRuntimeData } from "../../../lib/store";
import CoverImage from "../../cover-image";
import { lyricVocabulary } from "../../../lib/lyric-vocabulary";
import { motifEmotionProfiles } from "../../../lib/motif-emotions";
import { motifCategoryTextTone, motifCategoryTone, motifYearTone } from "../../../lib/motif-vocabulary-colors";
import { motifWordCloud } from "../../../lib/motif-word-cloud";

export const metadata = {
  title: "가사 모티프 | Lyra",
  description: "번역된 가사 전체에서 반복되는 이미지와 주제의 지도",
};

// admin '모티프 생성'이 저장한 data/motifs.json — 컬렉션 가사를 관통하는
// 이미지·주제 클러스터. 구절은 생성 시점에 실제 가사와 대조해 검증됐다.
export default async function MotifsPage() {
  const [data, allSongs] = await Promise.all([
    readRuntimeData("motifs.json", null),
    getAllSongsRuntime(),
  ]);
  const songs = new Map(allSongs.map((s) => [s.slug, s]));
  const motifs = (data?.motifs || [])
    .map((m) => ({ ...m, songs: m.songs.filter((x) => songs.has(x.slug)) }))
    .filter((m) => m.songs.length >= 2);
  const vocabulary = lyricVocabulary(allSongs, { limit: 100 });
  const wordCloud = motifWordCloud(vocabulary);
  const motifEmotions = motifEmotionProfiles(data?.motifs || [], allSongs);

  return (
    <>
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">가사 모티프</h1>
          <p className="mt-1 text-sm text-muted">
            {data
              ? `${data.count}곡의 가사를 관통하는 이미지와 주제 · ${new Date(data.at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })} 생성`
              : "번역된 가사 전체에서 반복되는 이미지와 주제"}
          </p>
        </div>
        <Link href="/songs/taste" className="text-sm text-accent hover:underline">
          음악 취향 →
        </Link>
      </div>

      <section className="mb-12" aria-labelledby="vocabulary-title">
        <h2 id="vocabulary-title" className="text-lg font-bold">번역 가사에 반복된 이미지 어휘</h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">대명사·수식어·보조용언은 빼고, 장면·감각·감정·움직임이 떠오르는 말만 현재 번역 가사 전체에서 다시 센 상위 {vocabulary.length}개입니다. 조사와 활용형은 하나의 대표 어휘로 묶었습니다.</p>
        <figure className="mt-5 border-y border-line bg-surface/35 px-4 py-6 sm:px-8" aria-labelledby="word-cloud-title">
          <figcaption id="word-cloud-title" className="mb-5 flex flex-wrap items-end justify-between gap-2">
            <span className="text-sm font-semibold">이미지 어휘 구름</span>
            <span className="text-[11px] text-muted">글자가 클수록 더 자주 등장 · 색은 이미지의 결</span>
          </figcaption>
          <div className="flex min-h-[300px] flex-wrap content-center items-baseline justify-center gap-x-3 gap-y-2.5 text-center">
            {wordCloud.map((row) => (
              <Link
                key={row.word}
                href={`/?q=${encodeURIComponent(row.word)}`}
                className={`font-serif font-semibold leading-none transition-opacity hover:opacity-65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent ${motifCategoryTextTone(row.category)}`}
                style={{ fontSize: `${row.fontSize}px` }}
                title={`${row.rank}위 · ${row.word} · ${row.count}회 · ${row.songCount}곡 · ${row.category}`}
                aria-label={`${row.rank}위 ${row.word}, ${row.count}회, ${row.songCount}곡, ${row.category}`}
              >
                {row.word}
              </Link>
            ))}
          </div>
        </figure>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">관리자에서 곡을 등록하거나 번역 가사를 수정하면 캐시를 비우고, 다음 열람 때 전체 번역문을 다시 집계합니다. 이미지 어휘 규칙에 해당하는 말이 누적 빈도 상위 100위 안에 들면 이 구름과 표에 새로 반영됩니다.</p>
        <div className="mt-4 overflow-x-auto  border border-line">
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead className="bg-surface/70 text-muted"><tr><th className="px-3 py-2">순위</th><th className="px-3 py-2">어휘</th><th className="px-3 py-2">이미지의 결</th><th className="px-3 py-2 text-right">횟수</th><th className="px-3 py-2 text-right">곡</th><th className="px-3 py-2">주요 연도</th><th className="px-3 py-2">근거 곡</th></tr></thead>
            <tbody className="divide-y divide-line/60">
              {vocabulary.map((row, index) => (
                <tr key={row.word}>
                  <td className="px-3 py-2.5 tabular-nums text-muted">{index + 1}</td>
                  <th className="px-3 py-2.5 font-semibold">{row.word}</th>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex whitespace-nowrap border px-2 py-1 text-[11px] font-semibold ${motifCategoryTone(row.category)}`}>
                      {row.category}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{row.count}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{row.songCount}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {row.years.slice(0, 3).map((year) => (
                        <span
                          key={year.year}
                          className={`inline-flex whitespace-nowrap border px-2 py-1 text-[11px] tabular-nums ${motifYearTone(year.year)}`}
                          title={`${year.year} · ${year.count}회`}
                        >
                          {year.year} · {year.count}회
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">{row.songs.slice(0, 3).map((song, index) => <span key={song.slug}>{index > 0 && " · "}<Link href={`/songs/${song.slug}`} className="text-accent hover:underline">{song.title}</Link></span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {data && (
        <section className="mb-12" aria-labelledby="motif-emotion-title">
          <h2 id="motif-emotion-title" className="text-lg font-bold">모티프 어휘와 함께 남은 정서</h2>
          <p className="mt-1 text-xs text-muted">현재 번역문에서 어휘를 다시 찾아 계산한다. 감정 기록 {motifEmotions.minSample}곡 이상인 어휘만 해석한다.</p>
          {motifEmotions.included.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {motifEmotions.included.map((row) => (
                <div key={row.word} className=" border border-line bg-surface px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <strong className="text-sm">{row.word}</strong>
                    <span className="text-xs tabular-nums text-muted">{row.sample}곡</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">이 말과 함께 남은 기록 · {row.type}</p>
                  <p className="mt-1 text-[11px] tabular-nums text-muted">밝기 {row.center.v.toFixed(1)} · 각성 {row.center.a.toFixed(1)}</p>
                </div>
              ))}
            </div>
          ) : <p className="mt-4 text-sm text-muted">해석할 만큼 표본이 모인 어휘가 아직 없다.</p>}
          <p className="mt-3 text-xs text-muted">표본 부족으로 제외한 어휘 {motifEmotions.excluded.length}개</p>
        </section>
      )}

      {motifs.length === 0 ? (
        <div className=" border border-dashed border-line px-6 py-16 text-center text-sm text-muted">
          아직 모티프가 없습니다.
          <br />
          관리자 → 등록된 곡에서 “모티프 생성”을 누르면 가사 전체를 분석해 여기에 그립니다.
        </div>
      ) : (
        <div className="space-y-10">
          {/* 각 섹션의 id는 곡 상세의 모티프 링크가 도착하는 앵커 — scroll-mt로 헤더에 안 가리게 */}
          {motifs.map((m) => (
            <section key={m.name} id={`motif-${m.name}`} className="scroll-mt-24 border border-line bg-surface/50 px-5 py-5">
              <h2 className="text-lg font-bold">{m.name}</h2>
              {m.description && <p className="mt-1 text-sm text-muted">{m.description}</p>}
              {m.keywords?.length > 0 && (
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                  {m.keywords.map((k) => (
                    <Link
                      key={k}
                      href={`/?q=${encodeURIComponent(k)}`}
                      className=" border border-dashed border-line px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent"
                    >
                      #{k}
                    </Link>
                  ))}
                </p>
              )}
              <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {m.songs.map(({ slug, quote }) => {
                  const s = songs.get(slug);
                  return (
                    // 링크는 앨범 이미지에만 — 텍스트는 자르지 않고 줄바꿈으로 다 보여준다
                    <div key={slug} className="flex min-w-0 items-start gap-3">
                      <Link href={`/songs/${slug}`} aria-label={`${s.title} 보기`} className="group shrink-0">
                        <CoverImage
                          src={s.artwork}
                          alt=""
                          label={s.title}
                          loading="lazy"
                          className="h-12 w-12  border border-line object-cover transition group-hover:opacity-80 group-hover:ring-2 group-hover:ring-accent/40"
                        />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium leading-snug">
                          {s.title} <span className="font-normal text-muted">· {s.artist}</span>
                        </p>
                        {quote && (
                          <p className="mt-0.5 break-words text-xs italic leading-snug text-muted">“{quote}”</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
