# Post Desk

Your personal LinkedIn content planner with an AI agent.

- **Today:** a daily plan (post days Tue/Thu, comment days, Sunday planning) and a moments log
- **Planner:** a board of posts by status (Ideas → Drafting → Scheduled → Posted) with dates and impressions
- **Ideas:** turns this week's moments into 6 ranked post ideas
- **Draft:** writes 3 hooks, the post, hashtags and a first comment in your voice
- **Review:** scores a draft out of 10 and lists fixes
- **Inspiration:** learns techniques from posts you admire
- **Profile:** edit what the agent knows about you and your voice rules

The agent also learns from your own results: log impressions on posted posts and it uses your best performers as examples.

**Stack (all free):** Next.js (frontend + API) on Vercel, Supabase Postgres (database), Google Gemini free tier (agent).

---

## Setup (about 15 minutes)

### 1. Get a free Gemini key
Go to https://aistudio.google.com/apikey and create a key.

Note: Google may use free-tier inputs to improve its models. Don't paste confidential client details.

### 2. Create the database
1. Sign up at https://supabase.com and create a new project (free plan).
2. Open **SQL Editor → New query**, paste everything from `supabase/schema.sql`, and press **Run**.
3. Open **Project Settings → API** and copy the **Project URL** and the **service_role** key.

Keep the service_role key secret. It only goes into server environment variables, never into code you share.

### 3. Run it on your computer
```bash
npm install
cp .env.example .env.local   # then fill in the four values
npm run dev
```
Open http://localhost:3000 and sign in with your `APP_PASSWORD`.

### 4. Put it online (Vercel)
1. Push this folder to a **private** GitHub repo.
2. At https://vercel.com, **Add New → Project**, import the repo.
3. Under **Environment Variables**, add the same values as `.env.local`:
   `APP_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`.
4. Press **Deploy**. Bookmark the URL on your phone and laptop.

---

## Notes
- **Model:** `GEMINI_MODEL` defaults to `gemini-3.8-flash`. If Google retires it, change the variable to another free model listed at https://ai.google.dev/gemini-api/docs/pricing.
- **Limits:** the free Gemini tier has daily request caps. If you hit one, the app tells you to wait.
- **Security:** it's a single-user app behind one password. Use a long one. Changing `APP_PASSWORD` signs you out everywhere.
- **No LinkedIn login:** the app never touches your LinkedIn account, so there's no risk of a restriction.
