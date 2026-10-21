import { db } from "@/lib/db";
import { isAuthed, unauthorized } from "@/lib/auth";

export async function GET() {
  if (!(await isAuthed())) return unauthorized();
  const { data, error } = await db().from("moments").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(req: Request) {
  if (!(await isAuthed())) return unauthorized();
  const { text } = await req.json();
  if (!String(text || "").trim()) return Response.json({ error: "Write one line first." }, { status: 400 });
  const { data, error } = await db().from("moments").insert({ text: String(text).trim().slice(0, 2000) }).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(req: Request) {
  if (!(await isAuthed())) return unauthorized();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id." }, { status: 400 });
  const { error } = await db().from("moments").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
