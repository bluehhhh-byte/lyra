"use client";

import { useEffect, useState } from "react";

// Neon이 대답하지 않으면 읽기는 파일 백업으로 내려앉고 쓰기는 그냥 실패한다.
// 그 상태를 화면이 말해 주지 않으면, 저장 버튼이 안 먹는 이유를 찾느라 사람이
// 헤맨다 — 곡을 다시 쓰거나 브라우저를 의심하면서.
//
// /api/version의 contentFallback은 "최근 10분 안에 폴백 read가 있었나"다.
// 5분마다 본다 — 이 배너 때문에 함수를 깨우는 비용이 의미 있어지면 안 되고,
// 관리자 화면은 한 사람만 연다.
const POLL_MS = 5 * 60 * 1000;

export default function FallbackBanner() {
  const [state, setState] = useState(null);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        const body = await response.json();
        if (alive) setState(body);
      } catch {
        // 버전조차 못 읽는 상황은 이 배너가 판정할 일이 아니다. 사이트 전체가
        // 죽었다면 관리자 화면도 안 열린다.
      }
    };
    check();
    const timer = setInterval(check, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  if (!state?.contentFallback) return null;

  return (
    <div role="alert" className="mb-5 border-2 border-danger bg-danger/10 px-4 py-3 text-sm">
      <p className="font-bold text-danger">Neon 응답 없음 — 파일 백업에서 읽는 중입니다 (옛 데이터)</p>
      {/* "무엇이 막혔나"를 먼저 적는다. 상태 이름만으로는 지금 해도 되는 일과
          안 되는 일을 가를 수 없다. */}
      <ul className="mt-2 space-y-0.5 text-xs text-muted">
        <li>· 저장·등록·수정이 실패합니다 — 쓰기에는 폴백이 없습니다.</li>
        <li>· 최근에 등록한 곡·영화가 목록에서 빠져 보일 수 있습니다.</li>
        <li>· 사용량 대시보드 수치가 갱신되지 않습니다.</li>
      </ul>
      <p className="mt-2 text-xs text-muted">
        복구 절차는 <a href="https://github.com/bluehhhh-byte/lyra/blob/main/docs/runbook-free-tier.md" className="text-accent underline">무료티어 런북</a>에 있습니다.
        {state.contentStore ? ` (저장소 모드: ${state.contentStore})` : ""}
      </p>
    </div>
  );
}
