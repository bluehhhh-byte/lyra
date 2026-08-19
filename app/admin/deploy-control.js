"use client";
import { useEffect, useRef, useState } from "react";
import { delayAt, MAX_POLLS, MAX_ELAPSED_MS } from "../../lib/deploy-poll";

const terminal = new Set(["READY", "ERROR", "CANCELED"]);
const label = {
  CHECKING: "GitHub 확인 중",
  REQUESTED: "빌드 요청",
  INITIALIZING: "빌드 요청",
  QUEUED: "빌드 대기 중",
  BUILDING: "Vercel 빌드 중",
  VERIFYING: "검증 중 — 운영 반영 확인",
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

export default function DeployControl({ contentInDatabase = false }) {
  const [state, setState] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState(null);
  const running = useRef(false);

  // 진행 중 배포 상태 폴링 — 처음엔 촘촘히, 이후 느리게. 5분 동안 최대 15회.
  // 예전에는 3초 고정 × 100회였다. 빌드는 보통 3~5분이라 대부분 헛돌았다.
  const poll = async (deploymentId) => {
    const started = Date.now();
    for (let i = 0; i < MAX_POLLS && Date.now() - started < MAX_ELAPSED_MS; i++) {
      await wait(delayAt(i));
      const { deployment, job } = await json(
        await fetch(`/api/admin/deploy?id=${encodeURIComponent(deploymentId)}`, { cache: "no-store" })
      );
      const s = job?.status === "READY" ? "READY" : deployment.state;
      setState(s);
      if (s === "READY") return;
      if (terminal.has(s)) throw new Error(job?.error || label[s] || s);
    }
    throw new Error("5분 안에 완료를 확인하지 못했습니다. 잠시 뒤 이 화면을 다시 열면 이어서 확인합니다");
  };

  // 화면 재진입 — 다른 탭/기기에서 시작한 배포도 여기서 이어서 보인다.
  useEffect(() => {
    fetch("/api/admin/deploy", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setStatus(d.status || null);
        if (d.job?.status === "BUILDING" && d.job.deploymentId && !running.current) {
          running.current = true;
          setNote("진행 중인 배포를 이어서 확인합니다");
          setState("BUILDING");
          poll(d.job.deploymentId)
            .catch((e) => {
              setState("ERROR");
              setError(e.message);
            })
            .finally(() => {
              running.current = false;
            });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deploy = async () => {
    if (running.current) return;
    running.current = true;
    setError("");
    setNote("");
    setState("CHECKING");
    try {
      const data = await json(await fetch("/api/admin/deploy", { method: "POST" }));
      // 서버 장부가 중복을 걸렀다 — 새 배포는 만들어지지 않았다
      if (data.alreadyDeployed) {
        setState("READY");
        setNote("이미 배포된 커밋입니다 — 새 배포를 만들지 않았습니다");
        return;
      }
      if (data.inProgress) {
        setNote("이미 진행 중인 배포가 있어 이어서 확인합니다");
        if (data.job?.deploymentId) {
          setState("BUILDING");
          return await poll(data.job.deploymentId);
        }
        setState("BUILDING");
        return;
      }
      const deployment = data.deployment;
      setState(deployment.state === "TRIGGERED" ? "TRIGGERED" : "REQUESTED");
      if (deployment.pollable === false) {
        // Deploy Hook 경로 — 진행 조회가 안 되므로 서빙 빌드가 바뀌는 것만 본다
        const before = await buildId();
        const started = Date.now();
        for (let i = 0; i < MAX_POLLS && Date.now() - started < MAX_ELAPSED_MS; i++) {
          await wait(delayAt(i));
          const now = await buildId();
          if (now && before && now !== before) return setState("READY");
        }
        throw new Error("배포가 5분 안에 반영되지 않았습니다. Vercel 대시보드에서 확인해 주세요");
      }
      setState("BUILDING");
      await poll(deployment.id);
    } catch (e) {
      setState("ERROR");
      setError(e.message);
    } finally {
      running.current = false;
    }
  };

  const buildId = async () => {
    try {
      const v = await (await fetch("/api/version", { cache: "no-store" })).json();
      return `${v.sha}:${v.deploymentId}`;
    } catch {
      return "";
    }
  };

  const busy = !!state && !terminal.has(state);
  const setup = {
    hook: { text: "Deploy Hook 사용", tone: "text-muted" },
    source: { text: "모바일 직접 배포 사용", tone: "text-muted" },
    none: { text: "모바일 배포 설정이 필요합니다", tone: "text-red-500" },
  }[status?.mode];
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1">
      <button
        type="button"
        onClick={deploy}
        disabled={busy}
        className="rounded-lg border border-line px-3 py-2 text-sm font-semibold transition hover:border-accent hover:text-accent disabled:opacity-40"
      >
        {busy ? "배포 중…" : contentInDatabase ? "코드 변경 배포" : "변경사항 배포"}
      </button>
      {(state || error || note) && (
        <span className={`max-w-64 text-xs ${state === "ERROR" ? "text-red-500" : "text-muted"}`} role="status" aria-live="polite">
          {error || note || label[state] || state}
        </span>
      )}
      {!state && !error && setup && (
        <span className={`text-xs ${setup.tone}`}>
          {setup.text}
          {status.hook === "invalid" && " (VERCEL_DEPLOY_HOOK 주소 형식이 잘못됨)"}
        </span>
      )}
    </div>
  );
}
