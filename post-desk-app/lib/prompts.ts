import { db } from "./db";

export const DEFAULT_ABOUT = `WHO I AM
- Sahil Jain, AI APM at Stratzi.ai: shipped a conversational booking assistant for Maharashtra Tourism (60+ properties, 7-step flow cut to 3, 350+ bookings/month, 4 backend systems with state handling and fallback paths). Also scoped Paytm POS front-desk payments and ran QA on a government tender product (Flownix).
- Previously Product Associate at Nerve Solutions (fintech, capital markets): AUM & Risk dashboard (-40% response time), 10+ enterprise onboardings (-30% go-live), -20% support tickets via self-serve.
- Side builds: CardIQ (rules-first RAG credit card recommender), DerivAI (options strategy builder), Suno (Hindi/English PDF to audiobook), open-source AI writing assistant for Google Sheets.
- Job-hunting for PM roles in Bengaluru. Audience: PMs, recruiters, hiring managers, founders.

WHAT PERFORMED ON MY PROFILE
- 23,192 impressions: "The founder was rude enough to not even interview me" (ghosted after an assignment, turned it into portfolio proof).
- 22,042: "The interviewer stopped me after 20 seconds. 'You're answering like an analyst.'" (Flipkart food delivery = battle for daily attention).
- 2,615: Spider-Man movie to product lesson.
- 300-800: long numbered frameworks, teardowns with 5+ points, launch-style build posts.
Pattern: a real moment of tension in 1-2 lines, what I did, ONE memorable insight, a genuine question.`;

export const DEFAULT_RULES = `STYLE
- Short lines, white space. Casual, confident, slightly self-deprecating, Gen Z humour ok.
- Max 2 emojis (I use 💀 and 😭). 120-200 words.
- At least one specific detail only I would know. Explain technical points in plain language.
- Never use: "game-changer", "leverage", "unlock", "excited to share", "humbled", "thrilled", "here's the thing", "let that sink in", em dashes, more than 3 hashtags, links in the post body.
- Never invent facts, numbers or events. Use only what is given.`;

export async function getProfile(): Promise<{ about: string; rules: string }> {
  const { data } = await db().from("profile").select("about, rules").eq("id", 1).maybeSingle();
  return {
    about: data?.about?.trim() ? data.about : DEFAULT_ABOUT,
    rules: data?.rules?.trim() ? data.rules : DEFAULT_RULES,
  };
}

// Everything the agent should know before it writes: profile, voice rules,
// saved patterns and the real numbers of posts already published from this app.
export async function context(): Promise<string> {
  const [{ about, rules }, patterns, posted] = await Promise.all([
    getProfile(),
    db().from("patterns").select("name, how").order("created_at", { ascending: false }).limit(15),
    db()
      .from("posts")
      .select("title, hook, impressions")
      .eq("status", "posted")
      .not("impressions", "is", null)
      .order("impressions", { ascending: false })
      .limit(10),
  ]);

  let out = about + "\n\n" + rules;
  if (patterns.data?.length) {
    out +=
      "\n\nPATTERNS I WANT TO BORROW (structure only, never copy wording):\n" +
      patterns.data.map((p) => `- ${p.name}: ${p.how}`).join("\n");
  }
  if (posted.data?.length) {
    out +=
      "\n\nMY RECENT POSTS AND HOW THEY DID (learn from this):\n" +
      posted.data.map((p) => `- ${p.impressions} impressions: "${p.hook || p.title}"`).join("\n");
  }
  return out;
}
