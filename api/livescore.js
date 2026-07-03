/**
 * /api/livescore.js
 * ─────────────────────────────────────────────────────────
 * Vercel Serverless Function — proxies football-data.org so the
 * FOOTBALL_DATA_API_KEY never reaches the browser.
 *
 * Deploy: just having this file inside /api at the repo root is enough,
 * Vercel auto-detects it as a Node serverless function.
 *
 * Env var required (set in Vercel → Settings → Environment Variables):
 *   FOOTBALL_DATA_API_KEY = <key from your football-data.org account email>
 *
 * Usage from the frontend:
 *   GET /api/livescore                -> live matches for competition "WC" (World Cup)
 *   GET /api/livescore?competition=WC -> same, explicit
 *
 * Response:
 * {
 *   "updatedAt": "2026-07-05T01:23:45.000Z",
 *   "matches": [
 *     {
 *       "id": 12345,
 *       "status": "IN_PLAY" | "PAUSED" | "FINISHED" | ...,
 *       "minute": 63,                 // best-effort, may be null
 *       "utcDate": "2026-07-05T01:00:00Z",
 *       "stage": "ROUND_16",
 *       "home": { "name": "...", "code": "CAN", "crest": "https://..." },
 *       "away": { "name": "...", "code": "MAR", "crest": "https://..." },
 *       "score": { "home": 1, "away": 0, "penHome": null, "penAway": null }
 *     }
 *   ]
 * }
 *
 * NOTE: football-data.org's free tier may not include full World Cup 2026
 * fixture/live data — check your plan on football-data.org/coverage if
 * this keeps returning an empty "matches" array during a match you know
 * is live.
 */

const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';

module.exports = async (req, res) => {
  // Public, read-only proxy — safe to allow any origin.
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Cache briefly at the edge so we don't hammer football-data.org
  // (rate limits are tight on the free tier) but still feel "live".
  res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=40');

  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'FOOTBALL_DATA_API_KEY belum diset di Environment Variables Vercel.',
    });
    return;
  }

  const competition = (req.query.competition || 'WC').toString();

  try {
    const upstream = await fetch(
      `${FOOTBALL_DATA_BASE}/competitions/${encodeURIComponent(competition)}/matches?status=LIVE,FINISHED`,
      { headers: { 'X-Auth-Token': apiKey } }
    );

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      res.status(upstream.status).json({
        error: `football-data.org merespon ${upstream.status}`,
        detail: text.slice(0, 300),
      });
      return;
    }

    const data = await upstream.json();

    const matches = (data.matches || []).map((m) => ({
      id: m.id,
      status: m.status,
      minute: m.minute ?? null,
      utcDate: m.utcDate,
      stage: m.stage,
      home: {
        name: m.homeTeam?.name || 'TBD',
        code: m.homeTeam?.tla || '',
        crest: m.homeTeam?.crest || null,
      },
      away: {
        name: m.awayTeam?.name || 'TBD',
        code: m.awayTeam?.tla || '',
        crest: m.awayTeam?.crest || null,
      },
      score: {
        home: m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? null,
        away: m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? null,
        penHome: m.score?.penalties?.home ?? null,
        penAway: m.score?.penalties?.away ?? null,
      },
    }));

    res.status(200).json({ updatedAt: new Date().toISOString(), matches });
  } catch (err) {
    res.status(502).json({
      error: 'Gagal menghubungi football-data.org',
      detail: String(err && err.message ? err.message : err),
    });
  }
};
