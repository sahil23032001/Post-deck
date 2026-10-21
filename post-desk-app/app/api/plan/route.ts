import { db } from "@/lib/db";
import { isAuthed, unauthorized } from "@/lib/auth";

// Returns today's saved plan, or null if the agent hasn't run today yet.
export async function GET() {
  if (!(await isAuthed())) return unauthorized();
  const day = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); // India date
  const { data, error } = await db().from("plans").select("finds, created_at").eq("day", day).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? null);
}
