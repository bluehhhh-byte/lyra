import Link from "next/link";
import { getAllMoviesRuntime } from "../../../lib/movies";
import { publishCandidates } from "../../../lib/publish-candidates";

export const metadata = { title: "발행 후보 | Cyno" };
export const dynamic = "force-dynamic";

function CandidateCard({ item }) {
  return (
    <li>
      <Link
        href={`/admin/cyno-carousel?movie=${encodeURIComponent(item.slug)}`}
        className="group grid h-full grid-cols-[64px_minmax(0,1fr)] gap-3 rounded-2xl border border-line bg-surface p-3 transition hover:border-accent/60"
      >
        <img src={item.poster} alt="" className="aspect-[2/3] w-16 rounded-lg border border-line object-cover" />
        <span className="min-w-0 self-center">
          <span className="block truncate font-semibold group-hover:text-accent">{item.title}</span>
          <span className="mt-0.5 block truncate text-xs text-muted">
            {[item.director, item.rating == null ? "" : `★${item.rating.toFixed(1)}`].filter(Boolean).join(" · ")}
          </span>
          <span className="mt-2 block text-xs leading-relaxed text-muted">{item.reason}</span>
          <span className="mt-2 block text-xs font-semibold text-accent">이 작품으로 만들기 →</span>
        </span>
      </Link>
    </li>
  );
}

function CandidateSection({ title, description, items }) {
  if (!items.length) return null;
  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => <CandidateCard key={item.slug} item={item} />)}
      </ul>
    </section>
  );
}

export default async function PublishQueuePage() {
  const candidates = publishCandidates(await getAllMoviesRuntime());
  return (
    <>
      <header className="mb-8 flex flex-wrap items-end gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Cyno admin</p>
          <h1 className="mt-1 text-2xl font-bold">오늘의 발행 후보</h1>
        </div>
        <Link href="/admin/movie" className="text-sm text-muted transition hover:text-accent sm:ml-auto">← 영화 관리로</Link>
      </header>
      <p className="max-w-3xl rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-muted">
        최근 기록과 높은 별점, 반복되는 테마만으로 고른다. 발행 이력은 따로 저장하지 않으므로 이미 올린 작품인지 마지막 판단은 사람이 한다.
      </p>

      <CandidateSection
        title="최근 기록"
        description="포스터와 코멘트가 준비된 작품 중 가장 최근에 기록한 순서다."
        items={candidates.recent}
      />
      <CandidateSection
        title="다시 꺼낼 작품"
        description="최근 후보 밖에 있는 ★4.5 이상 작품이다. 좋은 기록이 아래로 묻히지 않게 다시 보여준다."
        items={candidates.rediscovery}
      />

      {candidates.themes.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-bold">테마로 묶기</h2>
          <p className="mt-1 text-sm text-muted">준비된 작품이 많은 주제다. 제작실에는 콘셉트만 채워 넘기고 작품 선정은 다시 확인한다.</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {candidates.themes.map((item) => (
              <li key={item.theme}>
                <Link href={`/admin/cyno-carousel?concept=${encodeURIComponent(item.theme)}`} className="group block h-full rounded-2xl border border-line bg-surface p-4 transition hover:border-accent/60">
                  <span className="text-lg font-bold group-hover:text-accent">#{item.theme}</span>
                  <span className="mt-1 block text-xs text-muted">{item.reason}</span>
                  <span className="mt-3 block text-sm leading-relaxed">{item.examples.join(" · ")}</span>
                  <span className="mt-3 block text-xs font-semibold text-accent">이 테마로 만들기 →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
