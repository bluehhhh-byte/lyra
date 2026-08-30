import Link from "next/link";
import { getAllSongsRuntime } from "../../../lib/songs";
import { readRuntimeData } from "../../../lib/store";
import CoverImage from "../../cover-image";
import { lyricVocabulary } from "../../../lib/lyric-vocabulary";
import { motifEmotionProfiles } from "../../../lib/motif-emotions";

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
  const vocabulary = lyricVocabulary(allSongs);
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
        <h2 id="vocabulary-title" className="text-lg font-bold">자주 등장하는 번역 가사 어휘</h2>
        <p className="mt-1 text-xs text-muted">AI 없이 현재 번역문을 같은 규칙으로 계산한 상위 {vocabulary.length}개 어휘입니다.</p>
        <div className="mt-4 overflow-x-auto  border border-line">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-surface/70 text-muted"><tr><th className="px-3 py-2">어휘</th><th className="px-3 py-2 text-right">횟수</th><th className="px-3 py-2 text-right">곡</th><th className="px-3 py-2">주요 연도</th><th className="px-3 py-2">근거 곡</th></tr></thead>
            <tbody className="divide-y divide-line/60">
              {vocabulary.map((row) => (
                <tr key={row.word}>
                  <th className="px-3 py-2.5 font-semibold">{row.word}</th>
                  <td className="px-3 py-2.5 text-right tabular-nums">{row.count}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{row.songCount}</td>
                  <td className="px-3 py-2.5 text-muted">{row.years.slice(0, 3).map((year) => `${year.year} ${year.count}`).join(" · ")}</td>
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
                  <p className="mt-1 text-[11px] tabular-nums text-muted/80">밝기 {row.center.v.toFixed(1)} · 각성 {row.center.a.toFixed(1)}</p>
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
          {motifs.map((m) => (
            <section key={m.name} className=" border border-line bg-surface/50 px-5 py-5">
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
                          <p className="mt-0.5 break-words text-xs italic leading-snug text-muted/80">“{quote}”</p>
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
