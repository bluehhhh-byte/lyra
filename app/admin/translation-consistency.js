import Link from "next/link";

export default function TranslationConsistency({ items }) {
  return (
    <section className="mt-16" aria-labelledby="translation-consistency-title">
      <h2 id="translation-consistency-title" className="text-lg font-bold">아티스트별 번역 일관성 ({items.length})</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">같은 아티스트의 여러 곡에서 같은 원문을 다르게 옮긴 경우입니다. 문맥 차이일 수 있어 자동 수정하지 않습니다.</p>
      {items.length ? (
        <div className="mt-4 max-h-[32rem] space-y-2 overflow-y-auto pr-2">
          {items.map((item) => (
            <details key={`${item.artist}:${item.original}`} className="rounded-lg border border-line bg-surface px-4 py-3">
              <summary className="cursor-pointer text-sm"><b>{item.artist}</b> · “{item.original}” <span className="text-muted">({item.songCount}곡)</span></summary>
              <ul className="mt-3 space-y-3 text-xs">
                {item.variants.map((variant) => (
                  <li key={variant.translation}>
                    <p className="text-muted">→ {variant.translation}</p>
                    <p className="mt-1 flex flex-wrap gap-2">
                      {variant.songs.map((song) => <Link key={song.slug} href={`/admin/edit/${song.slug}`} className="text-accent hover:underline">{song.title}</Link>)}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      ) : <p className="mt-4 rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">곡 사이 번역 불일치가 없습니다.</p>}
    </section>
  );
}
