import Link from "next/link";

const pageHref = (page) => page === 1 ? "/translations" : `/translations/${page}`;

export default function TranslationPage({ data }) {
  return (
    <>
      <header className="mb-10">
        <h1 className="text-2xl font-bold">번역만 읽기</h1>
        <p className="mt-1 text-sm text-muted">{data.totalLines.toLocaleString("ko-KR")}줄 중 {data.page} / {data.totalPages}페이지</p>
      </header>
      <ol className="divide-y divide-line border-y border-line">
        {data.lines.map((line) => (
          <li key={line.key} className="py-5">
            <p lang={/[가-힣]/.test(line.text) ? "ko" : "en"} className="font-batang text-base leading-relaxed sm:text-lg">{line.text}</p>
            <Link href={`/songs/${line.slug}#v${line.stanzaIndex}`} className="mt-2 inline-block text-xs text-muted hover:text-accent">
              {line.artist} — {line.title} →
            </Link>
          </li>
        ))}
      </ol>
      <nav className="mt-8 flex items-center justify-between text-sm" aria-label="번역 페이지 이동">
        {data.page > 1 ? <Link href={pageHref(data.page - 1)} className="text-accent hover:underline">← 이전</Link> : <span />}
        {data.page < data.totalPages ? <Link href={pageHref(data.page + 1)} className="text-accent hover:underline">다음 →</Link> : <span />}
      </nav>
    </>
  );
}
