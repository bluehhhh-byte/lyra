import Link from "next/link";
import { getAllCollections } from "../../lib/collections";
import { getAllMovies } from "../../lib/movies";

export const metadata = {
  title: "컬렉션 | Syno.",
  description: "주제와 취향으로 엮은 영화·드라마 컬렉션",
};

export default function CollectionsPage() {
  const collections = getAllCollections();
  const movies = new Map(getAllMovies().map((movie) => [movie.slug, movie]));

  return (
    <>
      <div className="mb-10 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">컬렉션</h1>
          <p className="mt-1 text-sm text-muted">주제와 취향으로 엮은 영화·드라마</p>
        </div>
        <Link href="/movies" className="text-sm text-muted hover:text-accent">전체 작품 →</Link>
      </div>

      {collections.length ? (
        <div className="divide-y divide-line border-y border-line">
          {collections.map((collection) => {
            const items = collection.movieSlugs.map((slug) => movies.get(slug)).filter(Boolean);
            return (
              <Link
                key={collection.slug}
                href={`/collections/${collection.slug}`}
                className="group grid gap-5 py-7 sm:grid-cols-[minmax(0,1fr)_280px] sm:items-center"
              >
                <div>
                  <p className="text-xs tabular-nums text-muted">{items.length}편</p>
                  <h2 className="mt-1 text-xl font-bold group-hover:text-accent">{collection.title}</h2>
                  {collection.description && (
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{collection.description}</p>
                  )}
                </div>
                <div className="flex h-24 justify-end -space-x-3 overflow-hidden">
                  {items.slice(0, 5).map((movie, index) => (
                    <img
                      key={movie.slug}
                      src={movie.poster}
                      alt=""
                      loading="lazy"
                      className="aspect-[2/3] h-full rounded border border-line object-cover shadow-lg"
                      style={{ zIndex: 5 - index }}
                    />
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="border-y border-line py-20 text-center text-sm text-muted">공개된 컬렉션이 없습니다.</p>
      )}
    </>
  );
}
