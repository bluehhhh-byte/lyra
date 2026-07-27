"use client";

import { useMemo, useState } from "react";

async function api(action, body) {
  const response = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

const EMPTY = {
  originalSlug: "",
  title: "",
  description: "",
  visibility: "public",
  movieSlugs: [],
};

export default function CollectionManager({ movies, collections }) {
  const [form, setForm] = useState(EMPTY);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [removed, setRemoved] = useState([]);
  const bySlug = useMemo(() => new Map(movies.map((movie) => [movie.slug, movie])), [movies]);
  const selected = form.movieSlugs.map((slug) => bySlug.get(slug)).filter(Boolean);
  const available = movies.filter(
    (movie) =>
      !form.movieSlugs.includes(movie.slug) &&
      (!query || `${movie.title} ${movie.director}`.toLowerCase().includes(query.toLowerCase()))
  );

  const patch = (value) => setForm((current) => ({ ...current, ...value }));
  const edit = (collection) => {
    setForm({
      originalSlug: collection.slug,
      title: collection.title,
      description: collection.description,
      visibility: collection.visibility,
      movieSlugs: collection.movieSlugs,
    });
    setMessage("");
  };
  const add = (slug) => patch({ movieSlugs: [...form.movieSlugs, slug] });
  const remove = (slug) => patch({ movieSlugs: form.movieSlugs.filter((item) => item !== slug) });
  const move = (index, offset) => {
    const next = [...form.movieSlugs];
    const target = index + offset;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    patch({ movieSlugs: next });
  };

  const save = async () => {
    setBusy("save");
    setMessage("");
    try {
      const { slug } = await api("collectionSave", form);
      setMessage(`저장됨: ${slug}`);
      patch({ originalSlug: slug });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  };
  const del = async (collection) => {
    if (!confirm(`"${collection.title}" 컬렉션을 삭제할까요?`)) return;
    setBusy(collection.slug);
    setMessage("");
    try {
      await api("collectionDelete", { slug: collection.slug });
      setRemoved((current) => [...current, collection.slug]);
      if (form.originalSlug === collection.slug) setForm(EMPTY);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{form.originalSlug ? "컬렉션 편집" : "새 컬렉션"}</h3>
          {form.originalSlug && (
            <button onClick={() => setForm(EMPTY)} className="text-xs text-muted hover:text-accent">새로 만들기</button>
          )}
        </div>
        <div className="space-y-3">
          <input
            value={form.title}
            onChange={(event) => patch({ title: event.target.value })}
            placeholder="컬렉션 제목"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-base outline-none focus:border-accent sm:text-sm"
          />
          <textarea
            value={form.description}
            onChange={(event) => patch({ description: event.target.value })}
            placeholder="이 컬렉션을 설명하는 짧은 글"
            className="h-20 w-full rounded-lg border border-line bg-surface px-3 py-2 text-base outline-none focus:border-accent sm:text-sm"
          />
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={form.visibility === "public"}
              onChange={(event) => patch({ visibility: event.target.checked ? "public" : "private" })}
            />
            공개 컬렉션
          </label>
        </div>

        <h4 className="mb-2 mt-6 text-xs font-semibold text-muted">선택한 작품 · {selected.length}편</h4>
        <ol className="min-h-20 divide-y divide-line border-y border-line">
          {selected.map((movie, index) => (
            <li key={movie.slug} className="flex items-center gap-2 py-2">
              <span className="w-6 font-mono text-xs tabular-nums text-muted">{index + 1}</span>
              <img src={movie.poster} alt="" className="h-10 w-7 rounded object-cover" />
              <span className="min-w-0 flex-1 truncate text-sm">{movie.title}</span>
              <button
                onClick={() => move(index, -1)}
                disabled={index === 0}
                title="위로 이동"
                aria-label={`${movie.title} 위로 이동`}
                className="h-7 w-7 text-muted hover:text-accent disabled:opacity-20"
              >↑</button>
              <button
                onClick={() => move(index, 1)}
                disabled={index === selected.length - 1}
                title="아래로 이동"
                aria-label={`${movie.title} 아래로 이동`}
                className="h-7 w-7 text-muted hover:text-accent disabled:opacity-20"
              >↓</button>
              <button
                onClick={() => remove(movie.slug)}
                title="컬렉션에서 제거"
                aria-label={`${movie.title} 제거`}
                className="h-7 w-7 text-muted hover:text-red-400"
              >×</button>
            </li>
          ))}
          {!selected.length && <li className="py-8 text-center text-xs text-muted">오른쪽에서 작품을 추가하세요.</li>}
        </ol>
        <button
          onClick={save}
          disabled={busy || !form.title || !selected.length}
          className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40"
        >
          {busy === "save" ? "저장 중…" : form.originalSlug ? "변경 저장" : "컬렉션 만들기"}
        </button>
        {message && <span className="ml-3 text-xs text-muted">{message}</span>}
      </section>

      <section>
        <h3 className="mb-4 text-sm font-semibold">작품 추가</h3>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="제목·감독 검색"
          className="mb-3 w-full rounded-lg border border-line bg-surface px-3 py-2 text-base outline-none focus:border-accent sm:text-sm"
        />
        <ul className="max-h-[520px] divide-y divide-line overflow-y-auto border-y border-line">
          {available.map((movie) => (
            <li key={movie.slug}>
              <button onClick={() => add(movie.slug)} className="flex w-full items-center gap-3 py-2 text-left hover:text-accent">
                <img src={movie.poster} alt="" loading="lazy" className="h-12 w-8 rounded object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{movie.title}</span>
                  <span className="block truncate text-xs text-muted">{movie.director} · {movie.year}</span>
                </span>
                <span className="text-lg text-muted">+</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {collections.filter((collection) => !removed.includes(collection.slug)).length > 0 && (
        <section className="lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">저장된 컬렉션</h3>
          <ul className="divide-y divide-line border-y border-line">
            {collections.filter((collection) => !removed.includes(collection.slug)).map((collection) => (
              <li key={collection.slug} className="flex items-center gap-3 py-3 text-sm">
                <button onClick={() => edit(collection)} className="min-w-0 flex-1 text-left hover:text-accent">
                  <span className="font-medium">{collection.title}</span>
                  <span className="ml-2 text-xs text-muted">
                    {collection.movieSlugs.length}편 · {collection.visibility === "private" ? "비공개" : "공개"}
                  </span>
                </button>
                {collection.visibility === "public" && (
                  <a href={`/collections/${collection.slug}`} className="text-xs text-muted hover:text-accent">보기</a>
                )}
                <button
                  onClick={() => del(collection)}
                  disabled={busy === collection.slug}
                  className="text-xs text-red-400 hover:underline disabled:opacity-40"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
