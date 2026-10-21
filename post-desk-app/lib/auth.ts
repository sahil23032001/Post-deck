import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "crypto";

export const COOKIE = "pd_session";

// The cookie holds a hash of the password, so changing APP_PASSWORD logs everyone out.
export function sessionToken(): string {
  const pw = process.env.APP_PASSWORD || "";
  return createHash("sha256").update("post-desk:" + pw).digest("hex");
}

export function passwordMatches(input: string): boolean {
  const pw = process.env.APP_PASSWORD || "";
  if (!pw) return false;
  const a = Buffer.from(createHash("sha256").update(input).digest("hex"));
  const b = Buffer.from(createHash("sha256").update(pw).digest("hex"));
  return timingSafeEqual(a, b);
}

export async function isAuthed(): Promise<boolean> {
  const jar = await cookies();
  const v = jar.get(COOKIE)?.value;
  if (!v || !process.env.APP_PASSWORD) return false;
  const a = Buffer.from(v);
  const b = Buffer.from(sessionToken());
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unauthorized() {
  return Response.json({ error: "Sign in again." }, { status: 401 });
}
