"use client";
import { useState } from "react";
import AdminErrorMessage from "./error-message";

// 「영어 번역 없음」만 골라 AI로 채운다.
//
// 형식 검사(lint)의 자동 수정은 이걸 못 했다. 그쪽 선택 로직에 "이미 한글인
// 줄에 한국어 번역을 붙이지 않는다"는 규칙이 있는데, 외국곡 속 한국어 가사를
// 지키는 그 규칙이 한국 곡의 한국어 줄까지 통째로 제외해 버린다. 그래서 이
// 대기열은 형식 검사를 아무리 돌려도 줄지 않았다.
//
// 한 곡씩 부른다 — 곡마다 커밋 하나이고, 한 번의 요청이 타임아웃에 걸리지 않는다.
async function api(action, body) {
  const response = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.slice(0, 200) }; }
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

export default function EnTranslationGap() {
  const [queue, setQueue] = useState(null);
  const [log, setLog] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const scan = async () => {
    setBusy("scan");
    setError("");
    setLog({});
    try { setQueue(await api("enTranslateQueue", {})); }
    catch (reason) { setError(reason.message); }
    finally { setBusy(""); }
  };

  const fillAll = async () => {
    if (!window.confirm(
      `${queue.count}곡 ${queue.lines}줄에 영어 번역을 생성해 곡마다 바로 저장합니다.\n` +
      "원문 가사는 건드리지 않고 번역 줄만 추가합니다. 진행할까요?",
    )) return;
    setBusy("fill");
    setError("");
    const note = (slug, message) => setLog((current) => ({ ...current, [slug]: message }));
    for (const item of queue.items) {
      note(item.slug, "생성 중…");
      try {
        const done = await api("enTranslate", { slug: item.slug });
        note(item.slug, done.filled
          ? `✓ ${done.filled}줄 채움${done.rejected?.length ? ` · ${done.rejected.length}줄 거절(영어가 아님)` : ""}`
          : "채운 줄 없음");
      } catch (reason) {
        note(item.slug, `✗ ${reason.message}`);
      }
    }
    setBusy("");
    // 채운 뒤 다시 세어 남은 줄을 보여 준다
    try { setQueue(await api("enTranslateQueue", {})); } catch {}
  };

  const button = "border border-line px-3 py-1.5 text-sm hover:bg-surface disabled:opacity-50";

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        한국 곡의 한국어 줄에 붙일 영어 번역만 채웁니다. 원문 가사와 frontmatter는 그대로 두고
        <code> &gt; </code> 줄만 추가하며, 이미 있는 번역은 건드리지 않습니다.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={scan} disabled={Boolean(busy)}>
          {busy === "scan" ? "세는 중…" : "영어 번역 없음 세기"}
        </button>
        {queue?.count > 0 && (
          <button type="button" className={button} onClick={fillAll} disabled={Boolean(busy)}>
            {busy === "fill" ? "채우는 중…" : `${queue.count}곡 ${queue.lines}줄 AI로 채우기`}
          </button>
        )}
      </div>

      {queue && (
        <p className="text-sm text-muted">
          전 {queue.total}곡 중 <strong className="text-ink">{queue.count}곡</strong>이 영어 번역을 기다립니다
          {queue.count > 0 ? <> · 모두 {queue.lines}줄</> : " — 남은 줄이 없습니다 ✓"}
        </p>
      )}

      {queue?.count > 0 && (
        <ul className="divide-y divide-line border border-line text-sm">
          {queue.items.map((item) => (
            <li key={item.slug} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
              <span className="min-w-0">
                <span className="font-medium">{item.title}</span>
                <span className="text-muted"> — {item.artist}</span>
                {log[item.slug] && <span className="block text-xs text-accent">{log[item.slug]}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted">{item.lines}줄</span>
            </li>
          ))}
        </ul>
      )}

      <AdminErrorMessage message={error} />
    </div>
  );
}
