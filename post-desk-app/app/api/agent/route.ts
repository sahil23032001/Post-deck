import { db } from "@/lib/db";
import { isAuthed, unauthorized } from "@/lib/auth";
import { context } from "@/lib/prompts";
import { AIError, generate, generateJSON } from "@/lib/ai";

export const maxDuration = 60;

type Idea = { title: string; pillar: string; hook: string; moment: string; insight: string; why: string };
type Pattern = { type: string; name: string; how: string; example: string };
type Review = { score: number; verdict: string; word_count: number; fixes: string[]; better_hook: string };

const FOCUS: Record<string, string> = {
  any: "a mix of interview/job-hunt stories, build stories and single-idea teardowns",
  story: "interview and job-hunt stories",
  build: "build stories told as stories, not launches",
  teardown: "teardowns with exactly one big idea each",
};

export async function POST(req: Request) {
  if (!(await isAuthed())) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const ctx = await context();

  try {
    switch (body.action) {
      case "ideas": {
        // Default to the last 7 days of the moments log.
        let moments = String(body.moments || "").trim();
        if (!moments) {
          const since = new Date(Date.now() - 7 * 864e5).toISOString();
          const { data } = await db().from("moments").select("text").gte("created_at", since).order("created_at", { ascending: false });
          moments = (data || []).map((m) => m.text).join("\n");
        }
        const ideas = await generateJSON<Idea[]>(
          `${ctx}\n\nRecent real moments from my work:\n${moments || "(none logged; use only my known work above)"}\n\n` +
            `Suggest 6 LinkedIn post ideas focused on ${FOCUS[body.focus] || FOCUS.any}. Base every idea on a real moment or known fact above; never invent events. Rank by likely reach using what performed.\n\n` +
            `Reply with only a JSON array of 6 objects: {"title": short name, "pillar": "Interview story"|"Build story"|"Teardown", "hook": first 1-2 lines exactly as posted, "moment": the real moment to write from, "insight": the one insight, "why": one sentence on why it should perform}.`
        );
        return Response.json(Array.isArray(ideas) ? ideas : []);
      }

      case "draft": {
        const moment = String(body.moment || "").trim();
        if (!moment) return Response.json({ error: "Add a real moment first." }, { status: 400 });
        const text = await generate(
          `You are ghostwriting a LinkedIn post in my voice.\n\n${ctx}\n\nTHIS POST\nReal moment: ${moment}\nInsight: ${
            String(body.insight || "").trim() || "(find the strongest one in the moment)"
          }\nGoal: ${String(body.goal || "Job search")}\n\n` +
            `Output plain text with these headings exactly:\nHOOK OPTIONS\n1. ...\n2. ...\n3. ...\n\nPOST\n(full post using the strongest hook)\n\nHASHTAGS\n(3)\n\nFIRST COMMENT\n(only if a link or context helps, else "None")\n\n` +
            `Before answering, check: would a recruiter get it from the first 2 lines alone? Is there exactly one insight? Rewrite if not.`
        );
        return Response.json({ text });
      }

      case "review": {
        const draft = String(body.draft || "").trim();
        if (!draft) return Response.json({ error: "Paste a draft first." }, { status: 400 });
        const r = await generateJSON<Review>(
          `${ctx}\n\nReview this LinkedIn draft honestly against my best performers. Do not flatter.\n\nDRAFT:\n${draft.slice(0, 8000)}\n\n` +
            `Reply with only JSON: {"score": integer 1-10, "verdict": one sentence, "word_count": integer, "fixes": [up to 5 specific fixes], "better_hook": a stronger first 1-2 lines using only facts in the draft}.`
        );
        return Response.json(r);
      }

      case "patterns": {
        const posts = String(body.posts || "").trim();
        if (!posts) return Response.json({ error: "Paste at least one post first." }, { status: 400 });
        const found = await generateJSON<Pattern[]>(
          `${ctx}\n\nHere are LinkedIn posts I admire:\n\n${posts.slice(0, 20000)}\n\n` +
            `Identify up to 5 reusable patterns that make these posts work (hook types, structures, pacing, endings). Describe each as a technique, never by quoting. For each, show how I could apply it using only my real work above.\n\n` +
            `Reply with only a JSON array: [{"type": "Hook"|"Structure"|"Ending"|"Voice", "name": short name, "how": one sentence, "example": one line applied to my work}].`
        );
        const rows = (Array.isArray(found) ? found : []).slice(0, 5).map((p) => ({
          type: String(p.type || "Pattern"),
          name: String(p.name || "").slice(0, 200),
          how: String(p.how || "").slice(0, 1000),
          example: String(p.example || "").slice(0, 1000),
        })).filter((p) => p.name && p.how);
        if (rows.length) await db().from("patterns").insert(rows);
        return Response.json(rows);
      }

      default:
        return Response.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    const status = e instanceof AIError ? e.status : 500;
    return Response.json({ error: e instanceof Error ? e.message : "Something went wrong." }, { status });
  }
}
