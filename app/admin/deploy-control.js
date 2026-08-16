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
  TRIGGERED: "빌드 중 — 반영되면 알려준다",
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

  // Deploy Hook 경로는 진행 상태를 조회할 수 없다(토큰이 있어야 한다). 대신 지금
  // 서빙 중인 빌드가 바뀌는지를 본다 — 바뀌면 그게 곧 반영 완료다.
  const buildId = async () => {
    try {
      const v = await (await fetch("/api/version", { cache: "no-store" })).json();
      return `${v.sha}:${v.deploymentId}`;
    } catch {
      return "";
    }
  };

  const deploy = async () => {
    if (running.current) return;
    running.current = true;
    setError("");
    setState("INITIALIZING");
    try {
      const before = await buildId();
      let { deployment } = await json(await fetch("/api/admin/deploy", { method: "POST" }));
      setState(deployment.state);
      if (deployment.pollable === false) {
        // 최대 5분. 빌드가 끝나 새 빌드가 응답하기 시작하면 값이 달라진다.
        for (let i = 0; i < 100; i++) {
          await wait(3000);
          const now = await buildId();
          if (now && before && now !== before) return setState("READY");
        }
        throw new Error("배포가 5분 안에 반영되지 않았습니다. Vercel 대시보드에서 확인해 주세요");
      }
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
