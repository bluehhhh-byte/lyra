import Link from "next/link";
import { getAllSongs } from "../../../lib/songs";
import { readData } from "../../../lib/store";
import CoverImage from "../../cover-image";

export const metadata = {
  title: "가사 모티프 | Lyra",
  description: "번역된 가사 전체에서 반복되는 이미지와 주제의 지도",
};

// admin '모티프 생성'이 저장한 data/motifs.json — 컬렉션 가사를 관통하는
// 이미지·주제 클러스터. 구절은 생성 시점에 실제 가사와 대조해 검증됐다.
export default function MotifsPage() {
  const data = readData("motifs.json", null);
  const songs = new Map(getAllSongs().map((s) => [s.slug, s]));
  const motifs = (data?.motifs || [])
    .map((m) => ({ ...m, songs: m.songs.filter((x) => songs.has(x.slug)) }))
    .filter((m) => m.songs.length >= 2);

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

      {motifs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-16 text-center text-sm text-muted">
          아직 모티프가 없습니다.
          <br />
          관리자 → 등록된 곡에서 “모티프 생성”을 누르면 가사 전체를 분석해 여기에 그립니다.
        </div>
      ) : (
        <div className="space-y-10">
          {motifs.map((m) => (
            <section key={m.name} className="rounded-xl border border-line bg-surface/50 px-5 py-5">
              <h2 className="text-lg font-bold">{m.name}</h2>
              {m.description && <p className="mt-1 text-sm text-muted">{m.description}</p>}
              {m.keywords?.length > 0 && (
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                  {m.keywords.map((k) => (
                    <Link
                      key={k}
                      href={`/?q=${encodeURIComponent(k)}`}
                      className="rounded-full border border-dashed border-line px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent"
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
                          className="h-12 w-12 rounded-lg border border-line object-cover transition group-hover:opacity-80 group-hover:ring-2 group-hover:ring-accent/40"
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
