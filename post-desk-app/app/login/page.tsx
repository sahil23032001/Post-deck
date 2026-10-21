"use client";
import { useState } from "react";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) window.location.href = "/";
    else {
      setError((await res.json().catch(() => ({}))).error || "Couldn't sign in.");
      setBusy(false);
    }
  }

  return (
    <form className="panel login" onSubmit={submit}>
      <h1>Post Desk</h1>
      <label htmlFor="pw">
        Password
        <input id="pw" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <button className="btn primary" disabled={busy || !password}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <div className={"status" + (error ? " err" : "")}>{error}</div>
    </form>
  );
}
