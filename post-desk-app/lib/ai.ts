// Calls Google's Gemini API (free tier) over plain HTTPS. No SDK needed.

export class AIError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export async function generate(prompt: string, json = false): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  if (!key) throw new AIError("GEMINI_API_KEY is not set on the server.", 500);

  const res = await fetch(
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

  if (res.status === 429) throw new AIError("Free Gemini limit reached. Wait a minute and try again.", 429);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new AIError(`Gemini returned ${res.status}. ${detail.slice(0, 200)}`);
  }

  const data = await res.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
  if (!text.trim()) throw new AIError("Gemini returned an empty answer. Try rephrasing.");
  return text;
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
