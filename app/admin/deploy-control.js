"use client";
import { useEffect, useRef, useState } from "react";
import { delayAt, MAX_POLLS, MAX_ELAPSED_MS, trackPlan } from "../../lib/deploy-poll";
import AdminErrorMessage from "./error-message";

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
  const [deploymentStatus, setDeploymentStatus] = useState(null);
  // 루프 단일 실행 보장 — running은 "돌고 있는가", generation은 "지금 루프가
  // 최신인가"다. 재진입 복구와 버튼 클릭이 겹쳐도 루프는 하나만 남는다.
  const running = useRef(false);
  const generation = useRef(0);

  const refreshStatus = async () => {
    const data = await json(await fetch("/api/admin/deploy", { cache: "no-store" }));
    setStatus(data.status || null);
    setDeploymentStatus(data.deploymentStatus || null);
    return data;
  };

  // 하나의 추적 루프가 두 국면을 오간다:
  //   poll-ledger      deploymentId가 아직 없다(다른 탭이 claim만 한 상태) — 장부 재조회
  //   poll-deployment  Vercel 배포 상태 조회 (서버가 heartbeat·검증·종결을 겸한다)
  // 조회 예산(MAX_POLLS / MAX_ELAPSED_MS)은 국면 전환과 무관하게 하나로 센다.
  const track = async (initialJob, gen) => {
    let job = initialJob;
    const started = Date.now();
    for (let i = 0; i < MAX_POLLS && Date.now() - started < MAX_ELAPSED_MS; i++) {
      if (gen !== generation.current) return; // 더 새 루프가 떠 있다 — 이 루프는 조용히 죽는다
      const plan = trackPlan(job);
      if (plan.step === "done") {
        setState("READY");
        void refreshStatus().catch(() => {});
        return;
      }
      if (plan.step === "error" || plan.step === "give-up") throw new Error(plan.reason);
      await wait(delayAt(i));
      if (gen !== generation.current) return;
      if (plan.step === "poll-ledger") {
        ({ job } = await json(await fetch("/api/admin/deploy", { cache: "no-store" })));
        setState(job?.status === "BUILDING" ? "QUEUED" : job?.status || "QUEUED");
      } else {
        const { deployment, job: served } = await json(
          await fetch(`/api/admin/deploy?id=${encodeURIComponent(plan.id)}`, { cache: "no-store" })
        );
        job = served || job;
        const s = job?.status === "READY" ? "READY" : deployment.state;
        setState(s);
        if (s === "READY") {
          void refreshStatus().catch(() => {});
          return;
        }
        if (terminal.has(s)) throw new Error(job?.error || label[s] || s);
      }
    }
    throw new Error("5분 안에 완료를 확인하지 못했습니다. 잠시 뒤 이 화면을 다시 열면 이어서 확인합니다");
  };

  const startLoop = (job, noteText) => {
    if (running.current) return;
    running.current = true;
    const gen = ++generation.current;
    if (noteText) setNote(noteText);
    setState(job?.deploymentId ? "BUILDING" : "QUEUED");
    track(job, gen)
      .catch((e) => {
        if (gen !== generation.current) return;
        setState("ERROR");
        setError(e.message);
      })
      .finally(() => {
        if (gen === generation.current) running.current = false;
      });
  };

  // 화면 재진입 — 다른 탭/기기에서 시작한 배포도 이어서 보인다.
  // deploymentId가 아직 없어도(claim 직후) 같은 루프가 장부를 따라간다.
  useEffect(() => {
    refreshStatus()
      .then((d) => {
        if (d.job?.status === "BUILDING") startLoop(d.job, "진행 중인 배포를 이어서 확인합니다");
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deploy = async () => {
    if (running.current) return;
    setError("");
    setNote("");
    setState("CHECKING");
    try {
      const data = await json(await fetch("/api/admin/deploy", { method: "POST" }));
      if (data.alreadyDeployed) {
        setState("READY");
        setNote("이미 배포된 커밋입니다 — 새 배포를 만들지 않았습니다");
        void refreshStatus().catch(() => {});
        return;
      }
      if (data.inProgress) return startLoop(data.job, "이미 진행 중인 배포가 있어 이어서 확인합니다");
      startLoop({ ...data.job, deploymentId: data.deployment?.id || data.job?.deploymentId });
    } catch (e) {
      setState("ERROR");
      setError(e.message);
    }
  };

  const busy = !!state && !terminal.has(state);
  const setup = {
    source: { text: "모바일 직접 배포 사용", tone: "text-muted" },
    none: { text: "모바일 배포 설정이 필요합니다", tone: "text-red-500" },
  }[status?.mode];
  return (
    <div>
      <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1">
        <button
          type="button"
          onClick={deploy}
          disabled={busy}
          className=" border border-line px-3 py-2 text-sm font-semibold transition hover:border-accent hover:text-accent disabled:opacity-40"
        >
          {busy ? "배포 중…" : contentInDatabase ? "코드 변경 배포" : "변경사항 배포"}
        </button>
        <AdminErrorMessage message={error} compact className="max-w-64" />
        {!error && (state || note) && (
          <span className="max-w-64 text-xs text-muted" role="status" aria-live="polite">{note || label[state] || state}</span>
        )}
        {!state && !error && setup && (
          <span className={`text-xs ${setup.tone}`}>{setup.text}</span>
        )}
      </div>
      {deploymentStatus?.lastDeployedAt && (
        <p className="mt-1 text-xs text-muted">
          마지막 배포 {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(deploymentStatus.lastDeployedAt))}
          {deploymentStatus.deployedSha && ` · ${deploymentStatus.deployedSha.slice(0, 7)}`}
        </p>
      )}
      {deploymentStatus?.matches === true && <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">현재 코드와 운영 배포가 같습니다.</p>}
      {deploymentStatus?.matches === false && (
        <p role="status" className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
          미배포 변경이 있습니다 · 현재 {deploymentStatus.sourceSha.slice(0, 7)} / 운영 {deploymentStatus.deployedSha.slice(0, 7)}
        </p>
      )}
    </div>
  );
}
