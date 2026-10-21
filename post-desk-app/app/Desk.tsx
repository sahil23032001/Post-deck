"use client";
import { useEffect, useRef, useState } from "react";

type Find = { title: string; url: string; summary: string; why_it_works: string; your_angle: string; hook: string };
type Pattern = { id: string; name: string; how: string };
type Review = { score: number; verdict: string; fixes: string[]; better_hook: string };
type Tab = "Plan" | "Create";
type Note = { text: string; err: boolean };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  if (res.status === 401) { window.location.href = "/login"; throw new Error("Sign in again."); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Something went wrong.");
  return data as T;
}
const send = <T,>(url: string, body: unknown, method = "POST") => api<T>(url, { method, body: JSON.stringify(body) });
const postSection = (t: string) => (t.match(/POST\s*\n([\s\S]*?)(\n\s*HASHTAGS|$)/)?.[1] ?? t).trim();

// Next Tuesday and Thursday (today counts if it's one of them).
function nextPostDays(): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; out.length < 2 && i < 14; i++) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
    if (x.getDay() === 2 || x.getDay() === 4) out.push(x.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" }));
  }
  return out;
}

function Msg({ msg }: { msg: Note }) {
  return <div className={"status" + (msg.err ? " err" : "")}>{msg.text}</div>;
}

export default function Desk() {
  const [tab, setTab] = useState<Tab>("Plan");
  const [settings, setSettings] = useState(false);
  const [idea, setIdea] = useState("");
  const [reference, setReference] = useState("");

  const create = (text: string, ref: string) => { setIdea(text); setReference(ref); setTab("Create"); };

  return (
    <div className="wrap">
      <header className="top">
        <h1>Post Desk</h1>
        <div className="row">
          <button className="btn small" onClick={() => setSettings(true)}>Settings</button>
          <button className="btn small" onClick={async () => { await fetch("/api/login", { method: "DELETE" }); window.location.href = "/login"; }}>Sign out</button>
        </div>
      </header>

      <nav className="tabs" role="tablist">
        {(["Plan", "Create"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>
        ))}
      </nav>

      {/* Plan stays mounted so switching tabs doesn't re-run the search */}
      <div hidden={tab !== "Plan"}><Plan create={create} /></div>
      {tab === "Create" && <Create idea={idea} setIdea={setIdea} reference={reference} setReference={setReference} />}
      {settings && <Settings close={() => setSettings(false)} />}
    </div>
  );
}

/* ---------- Plan: runs on open, once per day ---------- */
function Plan({ create }: { create: (text: string, ref: string) => void }) {
  const [finds, setFinds] = useState<Find[]>([]);
  const [busy, setBusy] = useState(true);
  const [msg, setMsg] = useState<Note>({ text: "Loading today's plan…", err: false });
  const started = useRef(false);
  const days = nextPostDays();

  async function discover() {
    setBusy(true); setMsg({ text: "Finding this week's posts in your domain… (about 20 seconds)", err: false });
    try {
      const f = await send<Find[]>("/api/agent", { action: "discover" });
      setFinds(f);
      setMsg({ text: f.length ? "" : "Nothing found this week. Try broader topics in Settings.", err: false });
    } catch (e) { setMsg({ text: (e as Error).message, err: true }); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api<{ finds: Find[] } | null>("/api/plan")
      .then((plan) => {
        if (plan?.finds?.length) { setFinds(plan.finds); setMsg({ text: "", err: false }); setBusy(false); }
        else discover();
      })
      .catch((e) => { setMsg({ text: (e as Error).message, err: true }); setBusy(false); });
  }, []);

  return (
    <section className="list" style={{ gap: 16 }}>
      <div className="row between">
        <div style={{ display: "grid", gap: 4 }}>
          <span className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</span>
          <h2>Your posting plan</h2>
        </div>
        <button className="btn small" onClick={discover} disabled={busy}>Refresh</button>
      </div>
      <Msg msg={msg} />

      <div className="list">
        {finds.map((f, n) => (
          <div key={n} className="panel" style={n < 2 ? { borderColor: "var(--accent)" } : undefined}>
            <span className="chip">{n < 2 ? `Post on ${days[n]}` : "Backup idea"}</span>
            <h3 style={{ fontSize: 17 }}>{f.hook}</h3>
            <p className="placeholder">{f.your_angle}</p>
            <p style={{ fontSize: 14 }}><b>Why it works:</b> {f.why_it_works}</p>
            <div className="row">
              <button className="btn primary" onClick={() =>
                create(f.your_angle, `${f.summary} Technique: ${f.why_it_works} Suggested opening: ${f.hook}`)}>Write this post</button>
              {f.url && <a className="btn small" href={f.url} target="_blank" rel="noopener noreferrer">See what inspired it</a>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Create: anything you want to share → a post ---------- */
function Create({ idea, setIdea, reference, setReference }: {
  idea: string; setIdea: (v: string) => void; reference: string; setReference: (v: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Note>({ text: "", err: false });

  async function run(fn: () => Promise<void>, label: string) {
    setBusy(true); setMsg({ text: label, err: false });
    try { await fn(); setMsg({ text: "", err: false }); }
    catch (e) { setMsg({ text: (e as Error).message, err: true }); }
    finally { setBusy(false); }
  }
  const writeIt = () => run(async () => {
    const r = await send<{ text: string }>("/api/agent", { action: "draft", moment: idea, reference });
    setDraft(r.text); setReview(null);
  }, "Writing…");
  const checkIt = () => run(async () => setReview(await send<Review>("/api/agent", { action: "review", draft: postSection(draft) })), "Checking…");
  const s = Number(review?.score) || 0;

  return (
    <section className="grid">
      <div className="panel">
        <label htmlFor="c-idea">What do you want to share?
          <span className="hint">Something that happened, an opinion, a lesson, a build. A rough line is enough.</span>
          <textarea id="c-idea" rows={6} value={idea} onChange={(e) => setIdea(e.target.value)}
            placeholder="e.g. Our booking bot said 'no rooms' when there were 12 free. The bug was in how we read the date." />
        </label>
        {reference && (
          <div className="card">
            <span className="chip">Using a technique that's working this week</span>
            <p>{reference}</p>
            <div className="row"><button className="btn small" onClick={() => setReference("")}>Don't use it</button></div>
          </div>
        )}
        <button className="btn primary" onClick={writeIt} disabled={busy || !idea.trim()}>Make it a post</button>
        <Msg msg={msg} />
      </div>

      <div className="panel">
        {!draft ? <p className="placeholder">Your post appears here with three hook options. Pick the hook you like, then copy and post.</p> : (
          <>
            <div className="out">{draft}</div>
            <div className="row">
              <button className="btn primary" onClick={async () => {
                await navigator.clipboard?.writeText(postSection(draft)).catch(() => {});
                window.open("https://www.linkedin.com/feed/", "_blank", "noopener");
                setMsg({ text: "Copied. On LinkedIn, click Start a post and paste.", err: false });
              }}>Copy & open LinkedIn</button>
              <button className="btn" onClick={checkIt} disabled={busy}>Check it</button>
              <button className="btn" onClick={writeIt} disabled={busy}>Try again</button>
            </div>
          </>
        )}
        {review && (
          <div className="card">
            <div className="row">
              <span className="score" style={{ color: s >= 8 ? "var(--good)" : s >= 5 ? "var(--warn)" : "var(--bad)" }}>{s}/10</span>
              <p style={{ fontWeight: 600, color: "var(--ink)", flex: "1 1 200px" }}>{review.verdict}</p>
            </div>
            <ul className="tasks">{(review.fixes || []).map((f, i) => <li key={i}>{String(f)}</li>)}</ul>
            {review.better_hook && <p><b>Try this hook:</b> {review.better_hook}</p>}
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------- Settings ---------- */
function Settings({ close }: { close: () => void }) {
  const [about, setAbout] = useState("");
  const [rules, setRules] = useState("");
  const [topics, setTopics] = useState("");
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [inspo, setInspo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Note>({ text: "Loading…", err: false });

  useEffect(() => {
    Promise.all([api<{ about: string; rules: string; topics: string }>("/api/profile"), api<Pattern[]>("/api/patterns")])
      .then(([p, pt]) => { setAbout(p.about); setRules(p.rules); setTopics(p.topics); setPatterns(pt); setMsg({ text: "", err: false }); })
      .catch((e) => setMsg({ text: e.message, err: true }));
  }, []);

  async function learn() {
    setBusy(true); setMsg({ text: "Reading the posts…", err: false });
    try {
      await send("/api/agent", { action: "patterns", posts: inspo });
      setPatterns(await api<Pattern[]>("/api/patterns")); setInspo("");
      setMsg({ text: "Learned. New posts will use these techniques.", err: false });
    } catch (e) { setMsg({ text: (e as Error).message, err: true }); }
    finally { setBusy(false); }
  }

  return (
    <div className="editor" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="panel" role="dialog" aria-label="Settings">
        <div className="row between">
          <h2>Settings</h2>
          <button className="btn small" onClick={close}>Close</button>
        </div>
        <Msg msg={msg} />

        <label htmlFor="pf-topics">Your topics <span className="hint">One per line, up to 4. The plan searches these.</span>
          <textarea id="pf-topics" rows={4} value={topics} onChange={(e) => setTopics(e.target.value)} />
        </label>
        <label htmlFor="pf-about">About you <span className="hint">Your work, numbers and best posts. Update when they change.</span>
          <textarea id="pf-about" rows={8} value={about} onChange={(e) => setAbout(e.target.value)} />
        </label>
        <label htmlFor="pf-rules">How you write<textarea id="pf-rules" rows={5} value={rules} onChange={(e) => setRules(e.target.value)} /></label>
        <button className="btn primary" onClick={async () => {
          try { await send("/api/profile", { about, rules, topics }, "PUT"); setMsg({ text: "Saved. Press Refresh on Plan to use new topics.", err: false }); }
          catch (e) { setMsg({ text: (e as Error).message, err: true }); }
        }}>Save</button>

        <label htmlFor="in-text">Posts you admire <span className="hint">Paste any. The agent learns the technique, never the wording.</span>
          <textarea id="in-text" rows={4} value={inspo} onChange={(e) => setInspo(e.target.value)} />
        </label>
        <button className="btn" onClick={learn} disabled={busy || !inspo.trim()}>Learn from these</button>
        <div className="list">
          {patterns.map((p) => (
            <div key={p.id} className="card">
              <h3>{p.name}</h3>
              <p>{p.how}</p>
              <div className="row"><button className="btn small" onClick={async () => {
                await api(`/api/patterns?id=${p.id}`, { method: "DELETE" }).catch(() => {});
                setPatterns((a) => a.filter((x) => x.id !== p.id));
              }}>Remove</button></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
