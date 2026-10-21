// Web search via Tavily (free: 1,000 searches/month). https://tavily.com
import { AIError } from "./ai";

export type SearchResult = { title: string; url: string; content: string; published_date?: string | null };

export async function search(
  query: string,
  opts: { linkedinOnly?: boolean; max?: number; range?: "day" | "week"; news?: boolean } = {}
): Promise<SearchResult[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new AIError("TAVILY_API_KEY is not set on the server. Add it to find posts.", 500);

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      query,
      time_range: opts.range ?? "week",
      ...(opts.news ? { topic: "news" } : {}),
      search_depth: "basic",
      max_results: opts.max ?? 8,
      ...(opts.linkedinOnly ? { include_domains: ["linkedin.com"] } : {}),
    }),
  });

  if (res.status === 429 || res.status === 432) throw new AIError("Free search limit reached for this month.", 429);
  if (!res.ok) throw new AIError(`Search returned ${res.status}.`);
  const data = await res.json();
  return (data.results || []).map((r: SearchResult) => ({
    title: String(r.title || ""),
    url: String(r.url || ""),
    content: String(r.content || "").slice(0, 1200),
    published_date: r.published_date ?? null,
  }));
}
