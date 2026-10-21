import { db } from "@/lib/db";
import { isAuthed, unauthorized } from "@/lib/auth";

const FIELDS = ["title", "hook", "body", "pillar", "status", "scheduled_for", "impressions"] as const;
const STATUSES = ["idea", "drafting", "scheduled", "posted"];

function clean(input: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS) {
    if (!(f in input)) continue;
    const v = input[f];
    if (f === "impressions") out[f] = v === "" || v == null ? null : Math.max(0, Math.round(Number(v)) || 0);
    else if (f === "scheduled_for") out[f] = v ? String(v).slice(0, 10) : null;
    else if (f === "status") out[f] = STATUSES.includes(String(v)) ? String(v) : "idea";
    else out[f] = String(v ?? "").slice(0, 10000);
  }
  return out;
}

export async function GET() {
  if (!(await isAuthed())) return unauthorized();
  const { data, error } = await db().from("posts").select("*").order("updated_at", { ascending: false }).limit(300);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(req: Request) {
  if (!(await isAuthed())) return unauthorized();
  const row = clean(await req.json());
  if (!String(row.title || "").trim()) return Response.json({ error: "A post needs a title." }, { status: 400 });
  const { data, error } = await db().from("posts").insert(row).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function PATCH(req: Request) {
  if (!(await isAuthed())) return unauthorized();
  const body = await req.json();
  if (!body.id) return Response.json({ error: "Missing id." }, { status: 400 });
  const { data, error } = await db()
    .from("posts")
    .update({ ...clean(body), updated_at: new Date().toISOString() })
    .eq("id", body.id)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(req: Request) {
  if (!(await isAuthed())) return unauthorized();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id." }, { status: 400 });
  const { error } = await db().from("posts").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
