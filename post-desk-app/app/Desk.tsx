"use client";
import { useCallback, useEffect, useState } from "react";

type Status = "idea" | "drafting" | "scheduled" | "posted";
type Post = { id: string; title: string; hook: string; body: string; pillar: string; status: Status; scheduled_for: string | null; impressions: number | null };
type Moment = { id: string; text: string; created_at: string };
type Pattern = { id: string; type: string; name: string; how: string; example: string };
type Idea = { title: string; pillar: string; hook: string; moment: string; insight: string; why: string };
type Review = { score: number; verdict: string; word_count: number; fixes: string[]; better_hook: string };

const TABS = ["Today", "Planner", "Ideas", "Draft", "Review", "Inspiration", "Profile"] as const;
type Tab = (typeof TABS)[number];
const COLUMNS: { key: Status; label: string; color: string }[] = [
  { key: "idea", label: "Ideas", color: "var(--muted)" },
  { key: "drafting", label: "Drafting", color: "var(--warn)" },
  { key: "scheduled", label: "Scheduled", color: "var(--accent)" },
  { key: "posted", label: "Posted", color: "var(--good)" },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Sign in again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data as T;
}
const post = <T,>(url: string, body: unknown, method = "POST") => api<T>(url, { method, body: JSON.stringify(body) });

function postSection(text: string) {
  const m = text.match(/POST\s*\n([\s\S]*?)(\n\s*HASHTAGS|$)/);
  return (m ? m[1] : text).trim();
}
function firstHook(text: string) {
  const m = text.match(/HOOK OPTIONS[\s\S]*?\n\s*1\.\s*(.+)/);
  return m ? m[1].trim() : "";
}
const fmtDate = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "");

export default function Desk() {
  const [tab, setTab] = useState<Tab>("Today");
  const [posts, setPosts] = useState<Post[]>([]);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [editing, setEditing] = useState<Post | null>(null);
  const [loadError, setLoadError] = useState("");

  // Shared draft inputs so Ideas and Today can hand a moment to Draft.
  const [moment, setMoment] = useState("");
  const [insight, setInsight] = useState("");
  const [reviewText, setReviewText] = useState("");

  const load = useCallback(async () => {
    try {
      const [p, m, pt] = await Promise.all([api<Post[]>("/api/posts"), api<Moment[]>("/api/moments"), api<Pattern[]>("/api/patterns")]);
      setPosts(p); setMoments(m); setPatterns(pt); setLoadError("");
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const draftFrom = (m: string, i = "") => { setMoment(m); setInsight(i); setTab("Draft"); };
  const savePost = async (p: Partial<Post>) => {
    const saved = p.id ? await post<Post>("/api/posts", p, "PATCH") : await post<Post>("/api/posts", p);
    setPosts((all) => [saved, ...all.filter((x) => x.id !== saved.id)]);
    return saved;
  };

  const posted = posts.filter((p) => p.status === "posted" && p.impressions != null);
  const best = posted.reduce((m, p) => Math.max(m, p.impressions || 0), 0);

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <h1>Post Desk</h1>
          <p className="placeholder">Plan, draft and review your LinkedIn posts.</p>
        </div>
        <div className="row">
          <span className="chip">{posts.filter((p) => p.status === "scheduled").length} scheduled</span>
          <span className="chip">{posts.filter((p) => p.status === "posted").length} posted</span>
          {best > 0 && <span className="chip">Best {best.toLocaleString()}</span>}
          <button className="btn small" onClick={async () => { await fetch("/api/login", { method: "DELETE" }); window.location.href = "/login"; }}>Sign out</button>
        </div>
      </header>

      {loadError && <div className="panel status err">{loadError} Check your Supabase settings in the README.</div>}

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>
        ))}
      </nav>

      {tab === "Today" && <Today posts={posts} moments={moments} setMoments={setMoments} draftFrom={draftFrom} go={setTab} open={setEditing} />}
      {tab === "Planner" && <Planner posts={posts} open={setEditing} />}
      {tab === "Ideas" && <Ideas moments={moments} draftFrom={draftFrom} savePost={savePost} />}
      {tab === "Draft" && (
        <Draft moment={moment} setMoment={setMoment} insight={insight} setInsight={setInsight} savePost={savePost}
          toReview={(t) => { setReviewText(t); setTab("Review"); }} />
      )}
      {tab === "Review" && <ReviewTab text={reviewText} setText={setReviewText} />}
      {tab === "Inspiration" && <Inspiration patterns={patterns} setPatterns={setPatterns} />}
      {tab === "Profile" && <Profile />}

      {editing && (
        <Editor post={editing} close={() => setEditing(null)}
          save={async (p) => { await savePost(p); setEditing(null); }}
          remove={async (id) => { await api(`/api/posts?id=${id}`, { method: "DELETE" }); setPosts((a) => a.filter((x) => x.id !== id)); setEditing(null); }}
          review={(t) => { setReviewText(t); setEditing(null); setTab("Review"); }} />
      )}
    </div>
  );
}

/* ---------- Today ---------- */
function Today({ posts, moments, setMoments, draftFrom, go, open }: {
  posts: Post[]; moments: Moment[]; setMoments: React.Dispatch<React.SetStateAction<Moment[]>>;
  draftFrom: (m: string) => void; go: (t: Tab) => void; open: (p: Post) => void;
}) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState({ text: "", err: false });
  const now = new Date();
  const dow = now.getDay();
  const today = now.toISOString().slice(0, 10);
  const upcoming = posts
    .filter((p) => p.status === "scheduled" && p.scheduled_for && p.scheduled_for >= today)
    .sort((a, b) => (a.scheduled_for! < b.scheduled_for! ? -1 : 1))
    .slice(0, 4);

  let title: string; let tasks: string[]; let actions: [string, Tab][];
  if (dow === 2 || dow === 4) {
    title = "Post day. Publish one post between 9 and 10 am.";
    tasks = ["Pick a scheduled post or a moment and finish the draft", "Run it through Review and fix the hook", "Reply to every comment in the first hour", "After 48 hours, log the impressions in Planner"];
    actions = [["Draft today's post", "Draft"], ["Review a draft", "Review"]];
  } else if (dow === 0) {
    title = "Planning day. Pick next week's two posts.";
    tasks = ["Find ideas from this week's moments", "Schedule the two strongest for Tuesday and Thursday", "Add one post you admired to Inspiration"];
    actions = [["Find ideas", "Ideas"], ["Open planner", "Planner"]];
  } else {
    title = "Comment day. 15 minutes, 5 to 10 thoughtful comments.";
    tasks = ["Comment on posts by PM leaders, AI founders and recruiters", "Add a real point or experience, never just praise", "Connect with anyone who engaged with your last post", "Log one thing that happened at work today"];
    actions = [];
  }

  async function add() {
    if (!text.trim()) return setMsg({ text: "Write one line first.", err: true });
    try {
      const m = await post<Moment>("/api/moments", { text });
      setMoments((a) => [m, ...a]); setText(""); setMsg({ text: "Added.", err: false });
    } catch (e) { setMsg({ text: (e as Error).message, err: true }); }
  }
  async function remove(id: string) {
    await api(`/api/moments?id=${id}`, { method: "DELETE" }).catch(() => {});
    setMoments((a) => a.filter((m) => m.id !== id));
  }

  return (
    <section className="grid">
      <div className="panel">
        <span className="eyebrow">{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</span>
        <h2>{title}</h2>
        <ul className="tasks">{tasks.map((t) => <li key={t}>{t}</li>)}</ul>
        {actions.length > 0 && <div className="row">{actions.map(([l, t], i) => <button key={l} className={"btn" + (i === 0 ? " primary" : "")} onClick={() => go(t)}>{l}</button>)}</div>}
        <span className="eyebrow">Coming up</span>
        {upcoming.length ? (
          <div className="list">
            {upcoming.map((p) => (
              <button key={p.id} className="card" onClick={() => open(p)}>
                <span className="chip">{fmtDate(p.scheduled_for)}</span>
                <h3>{p.title}</h3>
              </button>
            ))}
          </div>
        ) : <p className="placeholder">Nothing scheduled. Pick two ideas in Planner and give them dates.</p>}
      </div>

      <div className="panel">
        <span className="eyebrow">Moments log</span>
        <label htmlFor="new-moment">What happened at work today? <span className="hint">One line is enough. These become your post ideas.</span>
          <textarea id="new-moment" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Client asked why the bot said 'no rooms' when there were rooms" />
        </label>
        <div className="row">
          <button className="btn primary" onClick={add}>Add to log</button>
          <button className="btn" onClick={() => go("Ideas")}>Find ideas from this week</button>
        </div>
        <div className={"status" + (msg.err ? " err" : "")}>{msg.text}</div>
        <div className="list">
          {moments.length === 0 && <p className="placeholder">Your log is empty. Add one thing that happened today.</p>}
          {moments.slice(0, 20).map((m) => (
            <div key={m.id} className="card">
              <span className="chip">{new Date(m.created_at).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</span>
              <p style={{ color: "var(--ink)" }}>{m.text}</p>
              <div className="row">
                <button className="btn small primary" onClick={() => draftFrom(m.text)}>Draft this</button>
                <button className="btn small" onClick={() => remove(m.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Planner ---------- */
function Planner({ posts, open }: { posts: Post[]; open: (p: Post) => void }) {
  const blank: Post = { id: "", title: "", hook: "", body: "", pillar: "Interview story", status: "idea", scheduled_for: null, impressions: null };
  return (
    <section className="panel">
      <div className="row between">
        <span className="eyebrow">Content plan</span>
        <button className="btn small primary" onClick={() => open(blank)}>New post</button>
      </div>
      <div className="board">
        {COLUMNS.map((c) => {
          const items = posts
            .filter((p) => p.status === c.key)
            .sort((a, b) => (a.scheduled_for || "9") < (b.scheduled_for || "9") ? -1 : 1);
          return (
            <div key={c.key} className="col">
              <div className="col-head">
                <h3><span className="dot" style={{ background: c.color }} />{c.label}</h3>
                <span className="count">{items.length}</span>
              </div>
              {items.length === 0 && <p className="placeholder" style={{ fontSize: 13 }}>None yet</p>}
              {items.map((p) => (
                <button key={p.id} className="card" onClick={() => open(p)}>
                  <div className="row">
                    <span className="chip">{p.pillar}</span>
                    {p.scheduled_for && <span className="count">{fmtDate(p.scheduled_for)}</span>}
                  </div>
                  <h3>{p.title}</h3>
                  {p.hook && <p>{p.hook}</p>}
                  {p.impressions != null && <span className="count">{p.impressions.toLocaleString()} impressions</span>}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Editor({ post: initial, close, save, remove, review }: {
  post: Post; close: () => void; save: (p: Partial<Post>) => Promise<void>; remove: (id: string) => Promise<void>; review: (t: string) => void;
}) {
  const [p, setP] = useState<Post>(initial);
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(false);
  const set = <K extends keyof Post>(k: K, v: Post[K]) => setP((x) => ({ ...x, [k]: v }));
  async function onSave() {
    if (!p.title.trim()) return setErr("Give the post a title.");
    try { await save(p.id ? p : { ...p, id: undefined }); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <div className="editor" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="panel" role="dialog" aria-label="Edit post">
        <div className="row between">
          <h2>{p.id ? "Edit post" : "New post"}</h2>
          <button className="btn small" onClick={close}>Close</button>
        </div>
        <label htmlFor="ed-title">Title<input id="ed-title" value={p.title} onChange={(e) => set("title", e.target.value)} /></label>
        <label htmlFor="ed-hook">Hook <span className="hint">First 1 to 2 lines</span><input id="ed-hook" value={p.hook} onChange={(e) => set("hook", e.target.value)} /></label>
        <label htmlFor="ed-body">Post<textarea id="ed-body" rows={9} value={p.body} onChange={(e) => set("body", e.target.value)} /></label>
        <div className="two">
          <label htmlFor="ed-status">Status
            <select id="ed-status" value={p.status} onChange={(e) => set("status", e.target.value as Status)}>
              {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
          <label htmlFor="ed-date">Post on<input id="ed-date" type="date" value={p.scheduled_for || ""} onChange={(e) => set("scheduled_for", e.target.value || null)} /></label>
          <label htmlFor="ed-imp">Impressions<input id="ed-imp" type="number" min={0} value={p.impressions ?? ""} onChange={(e) => set("impressions", e.target.value === "" ? null : Number(e.target.value))} /></label>
        </div>
        <label htmlFor="ed-pillar">Pillar
          <select id="ed-pillar" value={p.pillar} onChange={(e) => set("pillar", e.target.value)}>
            <option>Interview story</option><option>Build story</option><option>Teardown</option>
          </select>
        </label>
        <div className={"status" + (err ? " err" : "")}>{err || (p.status === "posted" ? "Log impressions after 48 hours. The agent learns from them." : "")}</div>
        <div className="row between">
          <div className="row">
            <button className="btn primary" onClick={onSave}>Save</button>
            {p.body && <button className="btn" onClick={() => review(p.body)}>Review</button>}
            {p.body && <button className="btn" onClick={() => navigator.clipboard?.writeText(p.body).catch(() => {})}>Copy post</button>}
          </div>
          {p.id && (confirm
            ? <div className="row"><span className="hint">Delete for good?</span><button className="btn small danger" onClick={() => remove(p.id)}>Delete</button><button className="btn small" onClick={() => setConfirm(false)}>Keep</button></div>
            : <button className="btn small danger" onClick={() => setConfirm(true)}>Delete</button>)}
        </div>
      </div>
    </div>
  );
}

/* ---------- Ideas ---------- */
function Ideas({ moments, draftFrom, savePost }: { moments: Moment[]; draftFrom: (m: string, i?: string) => void; savePost: (p: Partial<Post>) => Promise<Post> }) {
  const weekAgo = Date.now() - 7 * 864e5;
  const [text, setText] = useState(moments.filter((m) => new Date(m.created_at).getTime() >= weekAgo).map((m) => m.text).join("\n"));
  const [focus, setFocus] = useState("any");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: "", err: false });
  const [added, setAdded] = useState<Record<number, boolean>>({});

  async function run() {
    setBusy(true); setMsg({ text: "Thinking…", err: false }); setAdded({});
    try { setIdeas(await post<Idea[]>("/api/agent", { action: "ideas", moments: text, focus })); setMsg({ text: "", err: false }); }
    catch (e) { setMsg({ text: (e as Error).message, err: true }); }
    finally { setBusy(false); }
  }

  return (
    <section className="grid">
      <div className="panel">
        <span className="eyebrow">What happened lately</span>
        <label htmlFor="idea-moments">Real moments <span className="hint">Pre-filled from this week's log. One per line.</span>
          <textarea id="idea-moments" rows={7} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <label htmlFor="idea-focus">Focus
          <select id="idea-focus" value={focus} onChange={(e) => setFocus(e.target.value)}>
            <option value="any">Mix of all three</option>
            <option value="story">Interview and job-hunt stories</option>
            <option value="build">Build stories</option>
            <option value="teardown">Teardowns (one idea each)</option>
          </select>
        </label>
        <button className="btn primary" onClick={run} disabled={busy}>Find 6 post ideas</button>
        <div className={"status" + (msg.err ? " err" : "")}>{msg.text}</div>
      </div>
      <div className="panel">
        <span className="eyebrow">Ideas</span>
        {ideas.length === 0 && <p className="placeholder">Ideas appear here, ranked by likely reach. Add the good ones to your planner.</p>}
        <div className="list">
          {ideas.map((i, n) => (
            <div key={n} className="card">
              <span className="chip">{i.pillar}</span>
              <h3>{i.title}</h3>
              <p>Hook: {i.hook}</p>
              <p>{i.why}</p>
              <div className="row">
                <button className="btn small primary" onClick={() => draftFrom(i.moment || i.hook, i.insight)}>Draft now</button>
                <button className="btn small" disabled={added[n]} onClick={async () => {
                  await savePost({ title: i.title, hook: i.hook, body: `Moment: ${i.moment}\nInsight: ${i.insight}`, pillar: i.pillar, status: "idea" });
                  setAdded((a) => ({ ...a, [n]: true }));
                }}>{added[n] ? "Added" : "Add to planner"}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Draft ---------- */
function Draft({ moment, setMoment, insight, setInsight, savePost, toReview }: {
  moment: string; setMoment: (v: string) => void; insight: string; setInsight: (v: string) => void;
  savePost: (p: Partial<Post>) => Promise<Post>; toReview: (t: string) => void;
}) {
  const [goal, setGoal] = useState("Job search");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: "", err: false });

  async function run() {
    if (!moment.trim()) return setMsg({ text: "Add a real moment first.", err: true });
    setBusy(true); setMsg({ text: "Writing…", err: false });
    try { const r = await post<{ text: string }>("/api/agent", { action: "draft", moment, insight, goal }); setOut(r.text); setMsg({ text: "", err: false }); }
    catch (e) { setMsg({ text: (e as Error).message, err: true }); }
    finally { setBusy(false); }
  }
  async function save() {
    await savePost({ title: insight || moment.slice(0, 60), hook: firstHook(out), body: postSection(out), status: "drafting", pillar: "Interview story" });
    setMsg({ text: "Saved to Planner under Drafting.", err: false });
  }

  return (
    <section className="grid">
      <div className="panel">
        <span className="eyebrow">The post</span>
        <label htmlFor="d-moment">Real moment <span className="hint">Who said or did what. Be specific.</span>
          <textarea id="d-moment" rows={4} value={moment} onChange={(e) => setMoment(e.target.value)} />
        </label>
        <label htmlFor="d-insight">The one insight <span className="hint">Rough is fine</span>
          <input id="d-insight" value={insight} onChange={(e) => setInsight(e.target.value)} />
        </label>
        <label htmlFor="d-goal">Goal
          <select id="d-goal" value={goal} onChange={(e) => setGoal(e.target.value)}>
            <option>Job search</option><option>Build credibility</option><option>Showcase a build</option>
          </select>
        </label>
        <button className="btn primary" onClick={run} disabled={busy}>Write the post</button>
        <div className={"status" + (msg.err ? " err" : "")}>{msg.text}</div>
      </div>
      <div className="panel">
        <div className="row between">
          <span className="eyebrow">Draft</span>
          <div className="row">
            <button className="btn small" disabled={!out} onClick={() => navigator.clipboard?.writeText(postSection(out)).then(() => setMsg({ text: "Post copied.", err: false })).catch(() => {})}>Copy</button>
            <button className="btn small" disabled={!out} onClick={save}>Save to planner</button>
            <button className="btn small" disabled={!out} onClick={() => toReview(postSection(out))}>Review this</button>
          </div>
        </div>
        <div className={"out" + (out ? "" : " placeholder")}>{out || "Fill in a real moment and press Write the post. You'll get three hooks, the full post, hashtags and a first comment."}</div>
      </div>
    </section>
  );
}

/* ---------- Review ---------- */
function ReviewTab({ text, setText }: { text: string; setText: (v: string) => void }) {
  const [r, setR] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: "", err: false });
  async function run() {
    setBusy(true); setMsg({ text: "Reviewing…", err: false });
    try { setR(await post<Review>("/api/agent", { action: "review", draft: text })); setMsg({ text: "", err: false }); }
    catch (e) { setMsg({ text: (e as Error).message, err: true }); }
    finally { setBusy(false); }
  }
  const s = Number(r?.score) || 0;
  return (
    <section className="grid">
      <div className="panel">
        <span className="eyebrow">Check a draft</span>
        <label htmlFor="rv-text">Paste any draft<textarea id="rv-text" rows={12} value={text} onChange={(e) => setText(e.target.value)} /></label>
        <button className="btn primary" onClick={run} disabled={busy || !text.trim()}>Review it</button>
        <div className={"status" + (msg.err ? " err" : "")}>{msg.text}</div>
      </div>
      <div className="panel">
        <span className="eyebrow">Verdict</span>
        {!r ? <p className="placeholder">Get an honest score out of 10 against your best posts, plus what to fix.</p> : (
          <>
            <div className="score" style={{ color: s >= 8 ? "var(--good)" : s >= 5 ? "var(--warn)" : "var(--bad)" }}>{s}/10</div>
            <p style={{ fontWeight: 600 }}>{r.verdict}</p>
            {r.word_count ? <p className="hint">{r.word_count} words</p> : null}
            <span className="eyebrow">Fix</span>
            <ul className="tasks">{(r.fixes || []).map((f, i) => <li key={i}>{String(f)}</li>)}</ul>
            <span className="eyebrow">Stronger hook</span>
            <p className="out">{r.better_hook}</p>
          </>
        )}
      </div>
    </section>
  );
}

/* ---------- Inspiration ---------- */
function Inspiration({ patterns, setPatterns }: { patterns: Pattern[]; setPatterns: React.Dispatch<React.SetStateAction<Pattern[]>> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: "", err: false });
  async function run() {
    setBusy(true); setMsg({ text: "Reading the posts…", err: false });
    try {
      await post("/api/agent", { action: "patterns", posts: text });
      setPatterns(await api<Pattern[]>("/api/patterns"));
      setText(""); setMsg({ text: "Patterns saved. They'll shape your next ideas and drafts.", err: false });
    } catch (e) { setMsg({ text: (e as Error).message, err: true }); }
    finally { setBusy(false); }
  }
  return (
    <section className="grid">
      <div className="panel">
        <span className="eyebrow">Learn from posts you like</span>
        <label htmlFor="in-text">Paste 1 to 5 posts <span className="hint">Separate posts with a line of three dashes: ---</span>
          <textarea id="in-text" rows={12} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <button className="btn primary" onClick={run} disabled={busy || !text.trim()}>Find what works</button>
        <div className={"status" + (msg.err ? " err" : "")}>{msg.text}</div>
      </div>
      <div className="panel">
        <span className="eyebrow">Saved patterns</span>
        {patterns.length === 0 && <p className="placeholder">No patterns yet.</p>}
        <div className="list">
          {patterns.map((p) => (
            <div key={p.id} className="card">
              <span className="chip">{p.type}</span>
              <h3>{p.name}</h3>
              <p>{p.how}</p>
              {p.example && <p>For you: {p.example}</p>}
              <div className="row"><button className="btn small" onClick={async () => {
                await api(`/api/patterns?id=${p.id}`, { method: "DELETE" }).catch(() => {});
                setPatterns((a) => a.filter((x) => x.id !== p.id));
              }}>Remove</button></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Profile ---------- */
function Profile() {
  const [about, setAbout] = useState("");
  const [rules, setRules] = useState("");
  const [msg, setMsg] = useState({ text: "Loading…", err: false });
  useEffect(() => {
    api<{ about: string; rules: string }>("/api/profile")
      .then((p) => { setAbout(p.about); setRules(p.rules); setMsg({ text: "", err: false }); })
      .catch((e) => setMsg({ text: e.message, err: true }));
  }, []);
  async function save() {
    try { await post("/api/profile", { about, rules }, "PUT"); setMsg({ text: "Saved. Every new idea and draft uses this.", err: false }); }
    catch (e) { setMsg({ text: (e as Error).message, err: true }); }
  }
  return (
    <section className="panel">
      <span className="eyebrow">What the agent knows about you</span>
      <label htmlFor="pf-about">About you and what performed <span className="hint">Update this when your role, numbers or best posts change.</span>
        <textarea id="pf-about" rows={14} value={about} onChange={(e) => setAbout(e.target.value)} />
      </label>
      <label htmlFor="pf-rules">Voice rules<textarea id="pf-rules" rows={8} value={rules} onChange={(e) => setRules(e.target.value)} /></label>
      <div className="row"><button className="btn primary" onClick={save}>Save profile</button></div>
      <div className={"status" + (msg.err ? " err" : "")}>{msg.text}</div>
    </section>
  );
}
