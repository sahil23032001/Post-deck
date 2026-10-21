// Calls Google's Gemini API (free tier) over plain HTTPS. No SDK needed.
// If a model is busy (503) or rate-limited (429), it waits briefly and tries the next model.

export class AIError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

const FALLBACKS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"];

function models(): string[] {
  const main = process.env.GEMINI_MODEL || FALLBACKS[0];
  return [main, ...FALLBACKS.filter((m) => m !== main)];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callModel(model: string, prompt: string, json: boolean, key: string) {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          ...(json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    }
  );
}

export async function generate(prompt: string, json = false): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AIError("GEMINI_API_KEY is not set on the server.", 500);

  let lastStatus = 0;
  for (const model of models()) {
    // Two tries per model: one immediate, one after a short wait.
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await callModel(model, prompt, json, key);

      if (res.ok) {
        const data = await res.json();
        const text: string =
          data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
        if (!text.trim()) throw new AIError("Gemini returned an empty answer. Try rephrasing.");
        return text;
      }

      lastStatus = res.status;
      const busy = res.status === 503 || res.status === 500 || res.status === 429;
      if (res.status === 404) break; // model retired: skip to the next one
      if (!busy) {
        const detail = await res.text().catch(() => "");
        throw new AIError(`Gemini returned ${res.status}. ${detail.slice(0, 200)}`);
      }
      if (attempt === 0) await sleep(1500);
    }
  }

  if (lastStatus === 429) throw new AIError("Free Gemini limit reached for today. Try again later.", 429);
  throw new AIError("Gemini is busy right now. Wait a minute and try again.", 503);
}

export async function generateJSON<T>(prompt: string): Promise<T> {
  const text = await generate(prompt, true);
  try {
    return JSON.parse(text) as T;
  } catch {
    const start = text.search(/[\[{]/);
    const end = Math.max(text.lastIndexOf("]"), text.lastIndexOf("}"));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as T;
      } catch {}
    }
    throw new AIError("The answer came back in the wrong shape. Try again.");
  }
}
