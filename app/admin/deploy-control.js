"use client";
import { useRef, useState } from "react";

const terminal = new Set(["READY", "ERROR", "CANCELED"]);
const label = {
  INITIALIZING: "배포 준비 중",
  QUEUED: "배포 대기 중",
  BUILDING: "빌드 중",
  READY: "반영 완료",
  ERROR: "배포 실패",
  CANCELED: "배포 취소됨",
};

async function json(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function DeployControl() {
  const [state, setState] = useState("");
  const [error, setError] = useState("");
  const running = useRef(false);

  const deploy = async () => {
    if (running.current) return;
    running.current = true;
    setError("");
    setState("INITIALIZING");
    try {
      let { deployment } = await json(await fetch("/api/admin/deploy", { method: "POST" }));
      setState(deployment.state);
      for (let i = 0; i < 90 && !terminal.has(deployment.state); i++) {
        await wait(3000);
        ({ deployment } = await json(
          await fetch(`/api/admin/deploy?id=${encodeURIComponent(deployment.id)}`, { cache: "no-store" })
        ));
        setState(deployment.state);
      }
      if (!terminal.has(deployment.state)) throw new Error("배포 상태 확인 시간이 초과됐습니다");
      if (deployment.state !== "READY") throw new Error(label[deployment.state] || deployment.state);
    } catch (e) {
      setState("ERROR");
      setError(e.message);
    } finally {
      running.current = false;
    }
  };

  const busy = !!state && !terminal.has(state);
  return (
    <div className="flex min-h-9 items-center gap-2">
      <button
        type="button"
        onClick={deploy}
        disabled={busy}
        className="rounded-lg border border-line px-3 py-2 text-sm font-semibold transition hover:border-accent hover:text-accent disabled:opacity-40"
      >
        {busy ? "배포 중…" : "변경사항 배포"}
      </button>
      {(state || error) && (
        <span className={`max-w-64 text-xs ${state === "ERROR" ? "text-red-500" : "text-muted"}`} role="status" aria-live="polite">
          {error || label[state] || state}
        </span>
      )}
    </div>
  );
}
