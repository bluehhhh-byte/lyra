"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { USAGE_SAMPLE_RATE } from "../lib/usage-metrics-core";

const SAMPLE_KEY = "lyra_usage_sample_v1";

function sampledSession() {
  try {
    const saved = sessionStorage.getItem(SAMPLE_KEY);
    if (saved != null) return saved === "1";
    const sampled = Math.random() < USAGE_SAMPLE_RATE;
    sessionStorage.setItem(SAMPLE_KEY, sampled ? "1" : "0");
    return sampled;
  } catch {
    return false;
  }
}

function observedTransfer(after) {
  let bytes = 0;
  if (after === 0) {
    const navigation = performance.getEntriesByType("navigation")[0];
    bytes += Number(navigation?.transferSize || 0);
  }
  for (const entry of performance.getEntriesByType("resource")) {
    if (entry.startTime <= after) continue;
    try {
      if (new URL(entry.name).origin === location.origin)
        bytes += Number(entry.transferSize || 0);
    } catch {}
  }
  return { bytes, cacheStatus: bytes === 0 ? "HIT" : "MISS" };
}

export default function UsageReporter() {
  const pathname = usePathname();
  const lastMark = useRef(0);

  useEffect(() => {
    if (!sampledSession()) return;
    const timer = setTimeout(() => {
      const startedAfter = lastMark.current;
      const { bytes, cacheStatus } = observedTransfer(startedAfter);
      lastMark.current = performance.now();
      const body = JSON.stringify({ bytes, path: pathname, cacheStatus });
      const blob = new Blob([body], { type: "application/json" });
      if (!navigator.sendBeacon?.("/api/usage", blob))
        fetch("/api/usage", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [pathname]);

  return null;
}
