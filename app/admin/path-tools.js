"use client";
import { useState } from "react";

async function api(action, body) {
  const res = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// 발견 경로 생성 — 다리(곡 A→B) 또는 주제 코스. /songs/paths에 쌓인다.
export default function PathTools({ songs }) {
  const [type, setType] = useState("bridge");
  const [from, setFrom] = useState(songs[0]?.slug || "");
  const [to, setTo] = useState(songs[1]?.slug || "");
  const [theme, setTheme] = useState("");
  const [msg, setMsg] = useState("");

  const go = async () => {
    setMsg("경로 생성 중… (Gemini + iTunes 매칭, ~30초)");
    try {
      const body = type === "bridge" ? { type, from, to } : { type, theme };
      const { title, steps } = await api("songPath", body);
      setMsg(`"${title}" ${steps}곡 경로 생성됨 — 재배포 후 /songs/paths 반영`);
    } catch (e) {
      setMsg(`실패: ${e.message}`);
    }
  };

  const select = "rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent";

  return (
    <div className="max-w-2xl rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="경로 형태" className={select}>
          <option value="bridge">두 곡 사이의 다리</option>
          <option value="theme">주제 코스</option>
        </select>
        {type === "bridge" ? (
          <>
            <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="시작 곡" className={`${select} max-w-44`}>
              {songs.map((s) => <option key={s.slug} value={s.slug}>{s.title} - {s.artist}</option>)}
            </select>
            <span className="text-xs text-muted">→</span>
            <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="도착 곡" className={`${select} max-w-44`}>
              {songs.map((s) => <option key={s.slug} value={s.slug}>{s.title} - {s.artist}</option>)}
            </select>
          </>
        ) : (
          <input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder='주제 (예: "고독에서 위로로 이동하는 8곡")'
            className="min-w-60 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs outline-none focus:border-accent"
          />
        )}
        <button
          onClick={go}
          disabled={msg.includes("분석 중") || msg.includes("생성 중") || (type === "bridge" ? !from || !to || from === to : !theme.trim())}
          className="rounded-lg border border-accent px-4 py-1.5 text-sm font-semibold text-accent hover:bg-accent hover:text-bg disabled:opacity-40"
        >
          경로 만들기
        </button>
        <button
          onClick={async () => {
            setMsg("흐름 분석 중… (최근 20곡 가사 연결)");
            try {
              const { links, songs: n } = await api("songThread", {});
              setMsg(`기록의 흐름 분석됨 — ${n}곡에서 연결 ${links}개, 재배포 후 반영`);
            } catch (e) {
              setMsg(`실패: ${e.message}`);
            }
          }}
          disabled={msg.includes("분석 중") || msg.includes("생성 중")}
          className="rounded-lg border border-line px-4 py-1.5 text-sm text-muted hover:border-accent hover:text-accent disabled:opacity-40"
        >
          기록의 흐름 분석
        </button>
      </div>
      {msg && <p className="mt-2 text-xs text-muted">{msg}</p>}
    </div>
  );
}
