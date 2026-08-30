"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminErrorMessage from "../error-message";

const blank = (today) => ({
  title: "", body: "", startDate: today, endDate: "", emotions: [], keywords: [], published: true, links: [],
});

export default function MomentForm({ initialMoment, catalog, today }) {
  const router = useRouter();
  const [form, setForm] = useState(initialMoment || blank(today));
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("song");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selectedKeys = useMemo(() => new Set(form.links.map((link) => `${link.targetKind}:${link.targetSlug}`)), [form.links]);
  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ko");
    if (!q) return [];
    return catalog.filter((item) => item.kind === kind && !selectedKeys.has(`${item.kind}:${item.slug}`)
      && `${item.title} ${item.subtitle}`.toLocaleLowerCase("ko").includes(q)).slice(0, 8);
  }, [catalog, kind, query, selectedKeys]);
  const catalogMap = useMemo(() => new Map(catalog.map((item) => [`${item.kind}:${item.slug}`, item])), [catalog]);

  const field = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  const add = (item) => {
    field("links", [...form.links, { targetKind: item.kind, targetSlug: item.slug, excerpt: "", note: "" }]);
    setQuery("");
  };
  const updateLink = (index, name, value) => field("links", form.links.map((link, i) => i === index ? { ...link, [name]: value } : link));
  const removeLink = (index) => field("links", form.links.filter((_, i) => i !== index));

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setMessage("저장 중…"); setError("");
    try {
      const response = await fetch("/api/admin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "momentSave", previousSlug: initialMoment?.slug || "", ...form }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "저장하지 못했습니다");
      setMessage("저장했습니다. 공개 화면에 즉시 반영됩니다.");
      router.push(`/admin/moments?edit=${encodeURIComponent(data.slug)}`);
      router.refresh();
    } catch (caught) { setMessage(""); setError(caught.message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!initialMoment || !confirm(`‘${initialMoment.title}’ 장면을 삭제할까요?`)) return;
    setBusy(true); setMessage("삭제 중…"); setError("");
    try {
      const response = await fetch("/api/admin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "momentDelete", slug: initialMoment.slug }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "삭제하지 못했습니다");
      router.push("/admin/moments"); router.refresh();
    } catch (caught) { setMessage(""); setError(caught.message); setBusy(false); }
  }

  const input = "w-full  border border-line bg-surface px-3 py-3 text-base outline-none focus:border-accent";
  return (
    <form onSubmit={submit} className="max-w-2xl space-y-6">
      <label className="block"><span className="mb-2 block text-xs text-muted">장면 제목</span><input className={input} value={form.title} onChange={(e) => field("title", e.target.value)} required placeholder="2021년 겨울, 귀가하던 밤" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label><span className="mb-2 block text-xs text-muted">시작</span><input type="date" className={input} value={form.startDate} onChange={(e) => field("startDate", e.target.value)} required /></label>
        <label><span className="mb-2 block text-xs text-muted">끝 · 선택</span><input type="date" className={input} value={form.endDate || ""} min={form.startDate} onChange={(e) => field("endDate", e.target.value)} /></label>
      </div>
      <label className="block"><span className="mb-2 block text-xs text-muted">기억</span><textarea className={`${input} min-h-48 leading-relaxed`} value={form.body} onChange={(e) => field("body", e.target.value)} required placeholder="이 음악과 영화가 같은 시기에 남은 이유를 적습니다." /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="mb-2 block text-xs text-muted">감정 · 쉼표로 구분</span><input className={input} value={(form.emotions || []).join(", ")} onChange={(e) => field("emotions", e.target.value.split(",").map((v) => v.trim()).filter(Boolean))} placeholder="불안, 고독, 위로" /></label>
        <label><span className="mb-2 block text-xs text-muted">키워드 · 쉼표로 구분</span><input className={input} value={(form.keywords || []).join(", ")} onChange={(e) => field("keywords", e.target.value.split(",").map((v) => v.trim()).filter(Boolean))} placeholder="겨울, 귀가, 밤" /></label>
      </div>

      <fieldset className=" border border-line p-4">
        <legend className="px-2 text-sm font-semibold">작품 연결</legend>
        <div className="mb-3 flex gap-2">
          {[["song", "노래"], ["movie", "영화"]].map(([value, label]) => <button key={value} type="button" onClick={() => { setKind(value); setQuery(""); }} className={` px-3 py-1.5 text-xs ${kind === value ? "bg-accent text-white" : "bg-surface text-muted"}`}>{label}</button>)}
        </div>
        <input className={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`${kind === "song" ? "곡·가수" : "영화·감독"} 검색`} />
        {results.length > 0 && <div className="mt-2 overflow-hidden  border border-line">{results.map((item) => <button key={`${item.kind}:${item.slug}`} type="button" onClick={() => add(item)} className="flex w-full items-center justify-between border-b border-line px-3 py-3 text-left text-sm last:border-0 hover:bg-surface"><span>{item.title}</span><span className="ml-3 truncate text-xs text-muted">{item.subtitle} ＋</span></button>)}</div>}

        <div className="mt-5 space-y-4">
          {form.links.map((link, index) => {
            const item = catalogMap.get(`${link.targetKind}:${link.targetSlug}`);
            return <div key={`${link.targetKind}:${link.targetSlug}`} className=" bg-surface p-3">
              <div className="mb-3 flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{item?.title || link.targetSlug}</p><p className="text-xs text-muted">{link.targetKind === "song" ? "노래" : "영화"} · {item?.subtitle}</p></div><button type="button" onClick={() => removeLink(index)} className="text-xs text-muted hover:text-red-400">제거</button></div>
              {link.targetKind === "song" && <input className={`${input} mb-2`} value={link.excerpt || ""} onChange={(e) => updateLink(index, "excerpt", e.target.value)} placeholder="선택한 가사 구절 · 선택" />}
              <input className={input} value={link.note || ""} onChange={(e) => updateLink(index, "note", e.target.value)} placeholder="이 작품이 연결되는 이유 · 선택" />
            </div>;
          })}
          {!form.links.length && <p className="py-4 text-center text-xs text-muted">노래나 영화를 검색해 하나 이상 연결하세요.</p>}
        </div>
      </fieldset>

      <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={form.published !== false} onChange={(e) => field("published", e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />공개하기</label>
      <div className="flex flex-wrap items-center gap-3"><button disabled={busy} className=" ink-action px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{initialMoment ? "장면 수정" : "장면 저장"}</button>{initialMoment && <button type="button" disabled={busy} onClick={remove} className=" border border-line px-4 py-3 text-sm text-muted hover:border-red-400 hover:text-red-400">삭제</button>}<span role="status" className="text-xs text-muted">{message}</span><AdminErrorMessage message={error} compact /></div>
    </form>
  );
}
