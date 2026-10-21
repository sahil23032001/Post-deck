import { db } from "@/lib/db";
import { isAuthed, unauthorized } from "@/lib/auth";

export async function GET() {
  if (!(await isAuthed())) return unauthorized();
  const { data, error } = await db().from("patterns").select("*").order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(req: Request) {
  if (!(await isAuthed())) return unauthorized();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id." }, { status: 400 });
  const { error } = await db().from("patterns").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
