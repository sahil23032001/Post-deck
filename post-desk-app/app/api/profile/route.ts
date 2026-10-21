import { db } from "@/lib/db";
import { isAuthed, unauthorized } from "@/lib/auth";
import { getProfile } from "@/lib/prompts";

export async function GET() {
  if (!(await isAuthed())) return unauthorized();
  return Response.json(await getProfile());
}

export async function PUT(req: Request) {
  if (!(await isAuthed())) return unauthorized();
  const { about, rules } = await req.json();
  const { error } = await db()
    .from("profile")
    .upsert({ id: 1, about: String(about || "").slice(0, 20000), rules: String(rules || "").slice(0, 10000), updated_at: new Date().toISOString() });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
