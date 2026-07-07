"use client";
import { useState } from "react";

export default function Login() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) {
      location.href = new URLSearchParams(location.search).get("next") || "/admin";
    } else {
      setErr("비밀번호가 틀렸습니다");
    }
  };

  return (
    <div className="mx-auto max-w-xs pt-24">
      <h1 className="mb-6 text-xl font-bold">관리자 로그인</h1>
      <input
        type="password"
        autoFocus
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="비밀번호"
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <button
        onClick={submit}
        className="mt-3 w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg"
      >
        로그인
      </button>
      {err && <p className="mt-3 text-sm text-red-400">{err}</p>}
    </div>
  );
}
