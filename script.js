/**
 * FIFA World Cup 2026 — script.js
 * ─────────────────────────────────────────────────────────
 * HOW TO MAINTAIN:
 *   1. All match data lives in matches.json — edit that file.
 *   2. To add a new stage colour, add a CSS class to .card-stage-bar in style.css
 *      and map it in getStageBarClass() below.
 *   3. Countdown auto-targets the next upcoming match by date/time.
 *   4. Status auto-computes from current time vs match date/time.
 * ─────────────────────────────────────────────────────────
 */

// ── STATE ──────────────────────────────────────────────────────────────────
let allMatches = [];       // full data from matches.json
let allStandings = {};     // group standings data from matches.json
let filteredMatches = [];  // current view after filters
let countdownInterval = null;

// ── DOM REFS ───────────────────────────────────────────────────────────────
const matchesGrid     = document.getElementById('matchesGrid');
const noResults       = document.getElementById('noResults');
const resultsInfo     = document.getElementById('resultsInfo');
const nextMatchCard   = document.getElementById('nextMatchCard');
const searchInput     = document.getElementById('searchInput');
const stageFilter     = document.getElementById('stageFilter');
const groupFilter     = document.getElementById('groupFilter');
const statusFilter    = document.getElementById('statusFilter');
const dateFilter      = document.getElementById('dateFilter');
const resetBtn        = document.getElementById('resetFilters');
const noResultsReset  = document.getElementById('noResultsReset');
const themeToggle     = document.getElementById('themeToggle');
const themeIcon       = document.getElementById('themeIcon');
const lastUpdated     = document.getElementById('lastUpdated');
const standingsWrap   = document.getElementById('standingsWrap');
const standingsTitle  = document.getElementById('standingsTitle');
const standingsBody   = document.getElementById('standingsBody');
const liveSection     = document.getElementById('liveSection');
const liveGrid        = document.getElementById('liveGrid');

let liveScorePollTimer = null;

// ── BOOT ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  fetchMatches();
  startLiveScorePolling();
  initRevealObserver();
  themeToggle.addEventListener('click', toggleTheme);
  searchInput.addEventListener('input', applyFilters);
  stageFilter.addEventListener('change', applyFilters);
  groupFilter.addEventListener('change', applyFilters);
  statusFilter.addEventListener('change', applyFilters);
  dateFilter.addEventListener('change', applyFilters);
  resetBtn.addEventListener('click', clearFilters);
  noResultsReset.addEventListener('click', clearFilters);
});

// ── SCROLL REVEAL ────────────────────────────────────────────────────────
/**
 * Fades/slides .reveal sections into view as they enter the viewport
 * (see .reveal / .reveal.is-visible in style.css). Without this, sections
 * marked "reveal" stay permanently at opacity:0 and never appear.
 */
function initRevealObserver() {
  const revealEls = document.querySelectorAll('.reveal');
  if (!revealEls.length) return;

  if (!('IntersectionObserver' in window)) {
    // Fallback for very old browsers: just show everything immediately.
    revealEls.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  revealEls.forEach(el => observer.observe(el));
}

// ── LIVE SCORES (via /api/livescore, proxying football-data.org) ───────────
/**
 * Polls the Vercel serverless proxy for live World Cup 2026 matches.
 * The "Live Sekarang" section stays hidden whenever nothing is live.
 * Polling interval is 30s — gentle enough for football-data.org's rate
 * limits while still feeling live.
 */
function startLiveScorePolling() {
  fetchLiveScores();
  liveScorePollTimer = setInterval(fetchLiveScores, 30000);
}

async function fetchLiveScores() {
  if (!liveSection || !liveGrid) return; // markup not present on this page
  try {
    const res = await fetch('/api/livescore');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderLiveScores(data.matches || []);
    mergeLiveScoresIntoSchedule(data.matches || []);
  } catch (err) {
    // Fail silently in the UI — live scores are a nice-to-have, not core
    // functionality, so a hiccup here shouldn't disrupt the schedule.
    console.warn('Live score fetch failed:', err.message);
  }
}

// ── LIVE SCORE → SCHEDULE MERGE ─────────────────────────────────────────
/**
 * The /api/livescore feed and matches.json are two separate data sources.
 * This takes whatever the live feed reports (score, penalties, in-play/
 * finished status) and writes it into the matching entry in `allMatches`,
 * so the schedule grid, next-match card, and (via the same matches.json
 * shape) the knockout bracket's "completed" check all reflect real results
 * — not just the separate "🔴 Live Sekarang" ticker at the top of the page.
 */
function normalizeTeamName(name) {
  if (!name) return '';
  // A few common name variants between football-data.org and matches.json.
  const aliases = {
    'usa': 'united states', 'us': 'united states',
    'ivory coast': 'cote divoire', "cote d'ivoire": 'cote divoire',
    'dr congo': 'congo dr', 'congo dr': 'congo dr',
    'south korea': 'korea republic', 'korea republic': 'korea republic',
    'bosnia and herzegovina': 'bosnia', 'bosnia herzegovina': 'bosnia',
  };
  const key = name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
  return aliases[key] || key;
}

function findMatchingScheduleEntry(live, candidates) {
  if (!live?.home || !live?.away) return null;

  const liveHome = normalizeTeamName(live.home.name);
  const liveAway = normalizeTeamName(live.away.name);
  const liveHomeCode = String(live.home?.code || '').toLowerCase();
  const liveAwayCode = String(live.away?.code || '').toLowerCase();

  return candidates.find((m) => {
    const homeName = normalizeTeamName(m.homeTeam?.name);
    const awayName = normalizeTeamName(m.awayTeam?.name);
    const homeCode = String(m.homeTeam?.code || '').toLowerCase();
    const awayCode = String(m.awayTeam?.code || '').toLowerCase();

    const directName = homeName === liveHome && awayName === liveAway;
    const swappedName = homeName === liveAway && awayName === liveHome;
    const directCode = !!(homeCode && awayCode && homeCode === liveHomeCode && awayCode === liveAwayCode);
    const swappedCode = !!(homeCode && awayCode && homeCode === liveAwayCode && awayCode === liveHomeCode);

    return directName || swappedName || directCode || swappedCode;
  });
}

function isMeaningfulLiveMatch(live, scheduleMatch) {
  const status = String(live.status || '').toUpperCase();
  if (status === 'FINISHED') return true;
  if (status !== 'IN_PLAY' && status !== 'PAUSED') return false;

  const minute = Number.isFinite(live.minute) ? live.minute : null;
  const hasScore = typeof live.score?.home === 'number' || typeof live.score?.away === 'number';
  if (minute == null && !hasScore) return false;

  if (!scheduleMatch?._date) return false;

  const now = new Date();
  const startWindow = new Date(scheduleMatch._date.getTime() - 90 * 60 * 1000);
  const endWindow = new Date(scheduleMatch._date.getTime() + 240 * 60 * 1000);
  return now >= startWindow && now <= endWindow;
}

function mergeLiveScoresIntoSchedule(liveMatches) {
  if (!liveMatches.length || !allMatches.length) return;

  let changed = false;

  for (const live of liveMatches) {
    if (!live.home || !live.away) continue;

    const target = findMatchingScheduleEntry(live, allMatches);
    if (!target) {
      console.warn('Live score: no matching schedule entry for', live.home.name, 'vs', live.away.name);
      continue;
    }

    if (String(live.status || '').toUpperCase() === 'FINISHED') {
      const scoreChanged = target.homeScore !== (live.score?.home ?? null)
        || target.awayScore !== (live.score?.away ?? null)
        || target.status !== 'finished';

      if (scoreChanged) {
        target.homeScore = live.score?.home ?? null;
        target.awayScore = live.score?.away ?? null;
        target.penaltyHomeScore = live.score?.penHome ?? null;
        target.penaltyAwayScore = live.score?.penAway ?? null;
        target.status = 'finished';
        changed = true;
      }
      continue;
    }

    if (!isMeaningfulLiveMatch(live, target)) continue;

    const newStatus = 'live';
    const scoreChanged = target.homeScore !== (live.score?.home ?? null)
      || target.awayScore !== (live.score?.away ?? null)
      || target.status !== newStatus;

    if (scoreChanged) {
      target.homeScore = live.score?.home ?? null;
      target.awayScore = live.score?.away ?? null;
      target.penaltyHomeScore = live.score?.penHome ?? null;
      target.penaltyAwayScore = live.score?.penAway ?? null;
      target.status = newStatus;
      changed = true;
    }
  }

  // Re-render only if something actually changed, so we're not re-painting
  // the grid every 30s for no reason.
  if (changed) {
    applyFilters();
    renderNextMatch();
  }
}

function renderLiveScores(matches) {
  if (!matches.length) {
    liveSection.classList.add('hidden');
    liveGrid.innerHTML = '';
    return;
  }

  // Only display live matches that are confidently matched to our
  // scheduled `allMatches` entries _and_ are meaningful (have a minute
  // or a reported score). This prevents noisy upstream results from
  // appearing in the live ticker when they aren't actually in-play for
  // our schedule.
  const visible = matches.filter(m => {
    if (!m.home || !m.away) return false;
    const target = findMatchingScheduleEntry(m, allMatches);
    if (!target) return false;
    return isMeaningfulLiveMatch(m, target);
  });

  if (!visible.length) {
    // No matches in the feed correspond to our schedule — hide the
    // live section to avoid confusing users with unrelated results.
    console.warn('[live] no visible live matches matched to schedule; hiding live section');
    liveSection.classList.add('hidden');
    liveGrid.innerHTML = '';
    return;
  }

  liveGrid.innerHTML = visible.map(liveScoreCardHtml).join('');
  liveSection.classList.remove('hidden');
}

function liveScoreCardHtml(m) {
  const st = String(m.status || '').toUpperCase();
  let minuteLabel = 'LIVE';
  if (st === 'FINISHED' || st === 'FINISH') minuteLabel = 'FT';
  else if (st === 'PAUSED') minuteLabel = 'HT';
  else if (typeof m.minute === 'number') minuteLabel = `${m.minute}'`;

  const hasPens = m.score.penHome != null && m.score.penAway != null;
  const penNote = hasPens
    ? `<span class="live-pen">🥅 Pen ${m.score.penHome}–${m.score.penAway}</span>`
    : '';

  const home = m.home, away = m.away;
  const hs = m.score.home ?? 0;
  const as = m.score.away ?? 0;

  return `
    <div class="live-card">
      <div class="live-card-top">
        <span class="live-dot"></span>
        <span class="live-minute">${minuteLabel}</span>
        ${m.stage ? `<span class="live-stage">${formatStageLabel(m.stage)}</span>` : ''}
      </div>
      <div class="live-card-teams">
        <div class="live-team">
          ${home.crest ? `<img class="live-crest" src="${home.crest}" alt="" aria-hidden="true">` : ''}
          <span class="live-team-name">${home.name}</span>
        </div>
        <span class="live-score">${hs} – ${as}</span>
        <div class="live-team">
          ${away.crest ? `<img class="live-crest" src="${away.crest}" alt="" aria-hidden="true">` : ''}
          <span class="live-team-name">${away.name}</span>
        </div>
      </div>
      ${penNote ? `<div class="live-card-foot">${penNote}</div>` : ''}
    </div>
  `;
}

function formatStageLabel(stage) {
  return String(stage)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── FETCH DATA ─────────────────────────────────────────────────────────────
/**
 * Loads matches.json (same folder) and initialises the page.
 * To add matches: edit matches.json — no JS changes needed.
 */
async function fetchMatches() {
  try {
    // Prefer the embedded copy (matches-data.js) — this makes the page work
    // even when opened directly from disk (file://), where fetch() is
    // blocked by CORS. Falls back to fetch('matches.json') for setups that
    // don't load matches-data.js (e.g. a server where fetch works fine).
    let data = window.__MATCHES_DATA__;
    if (!data) {
      const res = await fetch('matches.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    }

    allMatches = data.matches.map(enrichMatch);
    allStandings = data.standings || {};

    // Show last-updated date from JSON
    if (data.lastUpdated && lastUpdated) {
      lastUpdated.textContent = formatDate(data.lastUpdated);
    }

    applyFilters();
    renderNextMatch();
  } catch (err) {
    console.error('Could not load matches.json:', err);
    matchesGrid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted)">
        <p>⚠️ Unable to load match data. Please check that <code>matches.json</code> is in the same folder.</p>
        <p style="margin-top:8px;font-size:13px;">${err.message}</p>
      </div>`;
  }
}

// ── ENRICH MATCH ───────────────────────────────────────────────────────────
/**
 * Computes live status (upcoming / live / finished) and a JS Date object
 * from the match's date/time strings. This runs at page-load time.
 */
function enrichMatch(match) {
  // Parse datetime: assume Eastern Time (UTC-5 / UTC-4 DST)
  // For real-world use, replace with proper timezone handling (e.g. Luxon)
  const matchDate = parseMatchDate(match.date, match.time, match.timezone);
  const now = new Date();
  const endTime = new Date(matchDate.getTime() + 120 * 60 * 1000); // 120 min live window
  const hasScore = match.homeScore != null && match.awayScore != null;

  // Respect explicit completed status from matches.json first.
  if (match.status === 'completed') {
    return { ...match, _date: matchDate, status: 'finished' };
  }

  // Do not force a match to "live" purely by its scheduled time window.
  // The authoritative live indicator comes from the live feed (`/api/livescore`) which
  // updates entries via `mergeLiveScoresIntoSchedule()`; that prevents many
  // matches from appearing live incorrectly when a user opens the page.
  let status = 'upcoming';
  if (now > endTime) status = hasScore ? 'finished' : 'pending';
  else if (now >= matchDate) status = 'upcoming';

  return { ...match, _date: matchDate, status };
}

/**
 * Converts date "YYYY-MM-DD" + time "HH:MM" to a local Date object.
 * The JSON stores times in ET; we approximate by treating them as local time
 * for broad demo purposes. Adjust offset logic for production.
 */
function parseMatchDate(dateStr, timeStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min]  = timeStr.split(':').map(Number);
  // If a timezone label is provided in the match (e.g. 'WITA'), interpret
  // the stored time as local to that timezone. We compute the UTC instant
  // by applying an hour adjustment (UTC = local + adj).
  const tzAdjMap = {
    'WITA': -8, // local UTC+8 -> UTC = local -8
    'WIB': -7,  // UTC+7
    'WIT': -9,  // UTC+9
  };

  if (tz && typeof tz === 'string') {
    const key = tz.trim().toUpperCase();
    if (key in tzAdjMap) {
      const adj = tzAdjMap[key];
      const utcMillis = Date.UTC(y, m - 1, d, h + adj, min, 0);
      return new Date(utcMillis);
    }
  }

  // Fallback: assume times are in WITA (Central Indonesia Time, UTC+8)
  // unless an explicit timezone is provided. This project primarily uses
  // Indonesian-local times for display, so default to WITA.
  const DEFAULT_TZ = 'WITA';
  const defaultAdj = tzAdjMap[DEFAULT_TZ] ?? -8;
  const utcMillis = Date.UTC(y, m - 1, d, h + defaultAdj, min, 0);
  return new Date(utcMillis);
}

// ── FILTERING ──────────────────────────────────────────────────────────────
/**
 * applyFilters() is called whenever any filter input changes.
 * All filtering happens on the already-loaded allMatches array — no re-fetch.
 */
function applyFilters() {
  const query  = searchInput.value.trim().toLowerCase();
  const stage  = stageFilter.value;
  const group  = groupFilter.value;
  const status = statusFilter.value;
  const date   = dateFilter.value;   // "YYYY-MM-DD" or ""

  filteredMatches = allMatches.filter(m => {
    // Search: team names or city
    if (query) {
      const haystack = [
        m.homeTeam.name, m.awayTeam.name,
        m.homeTeam.code, m.awayTeam.code,
        m.city, m.stadium
      ].join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    // Stage
    if (stage !== 'all' && m.stage !== stage) return false;
    // Group
    if (group !== 'all' && m.group !== group) return false;
    // Status
    if (status === 'finished' && m.status !== 'finished') return false;
    if (status === 'pending' && m.status !== 'pending') return false;
    if (status === 'upcoming' && (m.status === 'finished' || m.status === 'pending')) return false;
    // Date
    if (date && m.date !== date) return false;

    return true;
  });

  renderMatches(filteredMatches);
  updateResultsInfo(filteredMatches.length, allMatches.length);
  renderStandings(group);
}

// ── GROUP STANDINGS ──────────────────────────────────────────────────────────
/**
 * Shows the standings table when a specific group (A-L) is selected.
 * Standings data comes from matches.json -> "standings": { "A": [...], ... }
 * To change team order (e.g. tie-breaker by head-to-head), simply reorder
 * the array for that group in matches.json — no code changes needed.
 */
function renderStandings(group) {
  if (group === 'all' || !allStandings[group]) {
    standingsWrap.classList.add('hidden');
    return;
  }

  const teams = allStandings[group];
  standingsTitle.textContent = `Group ${group} Standings`;
  standingsBody.innerHTML = '';

  teams.forEach((t, i) => {
    const tr = document.createElement('tr');
    // Top 2 advance to Round of 32
    if (i < 2) tr.classList.add('st-qualify');
    tr.innerHTML = `
      <td class="st-pos">${i + 1}</td>
      <td class="st-team">
        <span class="st-flag" aria-hidden="true">${t.flag}</span>
        <span class="st-name">${t.name}</span>
        <span class="st-code">${t.code}</span>
      </td>
      <td class="st-pts">${t.points}</td>
      <td>${t.played}</td>
      <td>${t.won}</td>
      <td>${t.drawn}</td>
      <td>${t.lost}</td>
      <td>${t.gf}</td>
      <td>${t.ga}</td>
      <td>${t.gd > 0 ? '+' + t.gd : t.gd}</td>
    `;
    standingsBody.appendChild(tr);
  });

  standingsWrap.classList.remove('hidden');
}

// ── CLEAR FILTERS ──────────────────────────────────────────────────────────
function clearFilters() {
  searchInput.value   = '';
  stageFilter.value   = 'all';
  groupFilter.value   = 'all';
  statusFilter.value  = 'all';
  dateFilter.value    = '';
  applyFilters();
}

// ── RENDER MATCHES ─────────────────────────────────────────────────────────
function renderMatches(matches) {
  matchesGrid.innerHTML = '';

  if (matches.length === 0) {
    noResults.classList.remove('hidden');
    return;
  }
  noResults.classList.add('hidden');

  // Sort: finished/live matches first (newest → oldest), then upcoming (soonest → latest)
  const sorted = [...matches].sort((a, b) => {
    const aDone = a.status === 'finished' || a.status === 'live' || a.status === 'pending';
    const bDone = b.status === 'finished' || b.status === 'live' || b.status === 'pending';

    if (aDone && bDone) return b._date - a._date; // newest finished first
    if (!aDone && !bDone) return a._date - b._date; // soonest upcoming first
    return aDone ? -1 : 1; // finished/live group comes before upcoming
  });

  sorted.forEach((match, i) => {
    const card = buildMatchCard(match, i);
    matchesGrid.appendChild(card);
  });
}

/**
 * buildMatchCard() creates a DOM element for a single match.
 * To change card layout: edit this function and the .match-card CSS.
 */
function buildMatchCard(match, index) {
  const article = document.createElement('article');
  article.className = 'match-card' + (match.stage === 'Final' ? ' is-final' : '');
  article.setAttribute('role', 'listitem');
  article.setAttribute('aria-label', `${match.homeTeam.name} vs ${match.awayTeam.name}, ${match.stage}`);
  // Stagger animation delay
  article.style.animationDelay = `${Math.min(index * 0.04, 0.6)}s`;

  const stageBar = `<div class="card-stage-bar ${getStageBarClass(match.stage)}" aria-hidden="true"></div>`;

  const groupBadge = match.group
    ? `<span class="card-group-badge">Group ${match.group}</span>`
    : '';

  const statusHtml = `<span class="status-pill status-${match.status}" role="status">${match.status === 'finished' ? 'FT' : match.status === 'live' ? 'Live' : match.status === 'pending' ? 'Awaiting Result' : capitalise(match.status)}</span>`;

  const hasScore = (match.status === 'finished' || match.status === 'live')
    && typeof match.homeScore === 'number'
    && typeof match.awayScore === 'number';

  // Penalty shootout: only relevant when regulation/ET score is level and
  // both penalty scores are present (set by matches.json after the match).
  const hasPens = hasScore
    && match.status === 'finished'
    && match.homeScore === match.awayScore
    && typeof match.penaltyHomeScore === 'number'
    && typeof match.penaltyAwayScore === 'number';

  const homeWonPens = hasPens && match.penaltyHomeScore > match.penaltyAwayScore;
  const awayWonPens = hasPens && match.penaltyAwayScore > match.penaltyHomeScore;

  const penNote = hasPens
    ? `<span class="card-pen">🥅 On Penalty ${match.penaltyHomeScore}–${match.penaltyAwayScore}</span>`
    : '';

  const centerHtml = hasScore
    ? `<div class="card-score-wrap">
        <span class="card-score" aria-hidden="true">${match.homeScore} – ${match.awayScore}</span>
        ${penNote}
      </div>`
    : `<span class="card-vs" aria-hidden="true">VS</span>`;

  article.innerHTML = `
    ${stageBar}
    <div class="card-body">
      <div class="card-header">
        <div>
          <div class="card-stage">${match.stage}</div>
          ${groupBadge}
        </div>
        ${statusHtml}
      </div>
      <div class="card-teams">
        <div class="card-team${homeWonPens ? ' is-pen-winner' : ''}">
          <span class="card-flag" aria-hidden="true">${match.homeTeam.flag}</span>
          <span class="card-team-name">${match.homeTeam.name}</span>
          <span class="card-team-code">${match.homeTeam.code}</span>
        </div>
        ${centerHtml}
        <div class="card-team${awayWonPens ? ' is-pen-winner' : ''}">
          <span class="card-flag" aria-hidden="true">${match.awayTeam.flag}</span>
          <span class="card-team-name">${match.awayTeam.name}</span>
          <span class="card-team-code">${match.awayTeam.code}</span>
        </div>
      </div>
    </div>
    <div class="card-footer">
      <div class="card-datetime">
        <span class="card-date">${formatDate(match.date)}</span>
        <span class="card-time">${match.time} ${match.timezone}</span>
      </div>
      <div class="card-venue">
        <div class="card-stadium">📍 ${match.stadium}</div>
        <div class="card-city">${match.city}</div>
      </div>
    </div>
  `;

  return article;
}

// ── NEXT MATCH FEATURED CARD ───────────────────────────────────────────────
/**
 * Finds the earliest upcoming (or live) match and renders it in the hero card.
 * Also kicks off the countdown timer.
 */
function renderNextMatch() {
  const now = new Date();
  const upcoming = allMatches
    .filter(m => m.status === 'upcoming' || m.status === 'live')
    .sort((a, b) => a._date - b._date);

  if (upcoming.length === 0) {
    nextMatchCard.innerHTML = '<p style="color:var(--text-muted);padding:20px 0">All matches have been played. 🏆</p>';
    return;
  }

  const match = upcoming[0];

  nextMatchCard.innerHTML = `
    <div>
      <div class="nm-stage">${match.stage}${match.group ? ' · Group ' + match.group : ''}</div>
      <div class="nm-teams">
        <div class="nm-team home">
          <span class="nm-flag" aria-hidden="true">${match.homeTeam.flag}</span>
          <span class="nm-name">${match.homeTeam.name}</span>
        </div>
        <span class="nm-vs" aria-hidden="true">VS</span>
        <div class="nm-team away">
          <span class="nm-flag" aria-hidden="true">${match.awayTeam.flag}</span>
          <span class="nm-name">${match.awayTeam.name}</span>
        </div>
      </div>
    </div>
    <div class="nm-meta">
      <div class="nm-date">${formatDate(match.date)}</div>
      <div class="nm-time">${match.time} ${match.timezone}</div>
      <div class="nm-venue">📍 ${match.stadium}, ${match.city}</div>
    </div>
  `;

  startCountdown(match._date, match.id);
}

// ── COUNTDOWN ──────────────────────────────────────────────────────────────
/**
 * Ticks every second and updates the four countdown units.
 * Clears automatically when the target time passes.
 */
function startCountdown(targetDate, matchId) {
  if (countdownInterval) clearInterval(countdownInterval);

  // Guard: if the target time is already in the past when called,
  // don't start a ticking interval that will immediately recurse.
  if (targetDate - new Date() <= 0) {
    setCountdown(0, 0, 0, 0);
    // Immediately mark as live when countdown has already passed.
    if (typeof matchId !== 'undefined') {
      const m = allMatches.find(x => x.id === matchId);
      if (m && m.status !== 'finished' && m.status !== 'live') {
        m.status = 'live';
        applyFilters();
        renderNextMatch();
      }
    }
    return;
  }

  function tick() {
    const diff = targetDate - new Date();
    if (diff <= 0) {
      clearInterval(countdownInterval);
      setCountdown(0, 0, 0, 0);
      // Mark the target match as live when the countdown reaches zero.
      if (typeof matchId !== 'undefined') {
        const m = allMatches.find(x => x.id === matchId);
        if (m && m.status !== 'finished' && m.status !== 'live') {
          m.status = 'live';
        }
      }
      applyFilters();
      renderNextMatch();
      return;
    }
    const days    = Math.floor(diff / 86400000);
    const hours   = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000)  / 60000);
    const seconds = Math.floor((diff % 60000)    / 1000);
    setCountdown(days, hours, minutes, seconds);
  }

  tick();
  countdownInterval = setInterval(tick, 1000);
}

function setCountdown(d, h, m, s) {
  document.querySelector('#cd-days    .cd-num').textContent = pad(d);
  document.querySelector('#cd-hours   .cd-num').textContent = pad(h);
  document.querySelector('#cd-minutes .cd-num').textContent = pad(m);
  document.querySelector('#cd-seconds .cd-num').textContent = pad(s);
}

// ── THEME TOGGLE ───────────────────────────────────────────────────────────
/**
 * Persists theme choice to localStorage so it survives page refresh.
 */
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  themeIcon.textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem('wc2026-theme', isDark ? 'light' : 'dark');
}

function loadTheme() {
  const saved = localStorage.getItem('wc2026-theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
    themeIcon.textContent = saved === 'light' ? '☀️' : '🌙';
  }
}

// ── RESULTS INFO ───────────────────────────────────────────────────────────
function updateResultsInfo(shown, total) {
  if (shown === total) {
    resultsInfo.textContent = `Showing all ${total} matches`;
  } else {
    resultsInfo.textContent = `Showing ${shown} of ${total} matches`;
  }
}

// ── HELPERS ────────────────────────────────────────────────────────────────
/** Maps stage name to a CSS modifier class for the colour bar on each card */
function getStageBarClass(stage) {
  const map = {
    'Final':            'final',
    'Third Place Match':'semi',
    'Semi-finals':      'semi',
    'Quarter-finals':   'quarter',
    'Round of 16':      'r16',
    'Round of 32':      'r32',
    'Group Stage':      ''
  };
  return map[stage] || '';
}

/** Format "YYYY-MM-DD" → "Mon DD, YYYY" */
function formatDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

/** Zero-pad single digits */
function pad(n) { return String(n).padStart(2, '0'); }

/** Capitalise first letter */
function capitalise(str) { return str.charAt(0).toUpperCase() + str.slice(1); }
