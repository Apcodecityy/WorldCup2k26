const fs = require('fs');
const path = require('path');
const { syncBracketToMatches } = require('./sync-bracket-to-matches');

const MATCHES_FILE = path.resolve(__dirname, 'matches.json');
const DATA_FILE = path.resolve(__dirname, 'matches-data.js');

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function run() {
  const raw = fs.readFileSync(MATCHES_FILE, 'utf8');
  const data = JSON.parse(raw);
  let changed = false;

  for (const m of data.matches) {
    const hasScore = m.homeScore != null && m.awayScore != null;
    if (hasScore && m.status !== 'completed') {
      console.log(`[finalize] marking match ${m.id} (${m.homeTeam?.name} vs ${m.awayTeam?.name}) as completed`);
      m.status = 'completed';
      changed = true;
    }
  }

  if (!changed) {
    console.log('[finalize] no changes needed');
    return;
  }

  data.lastUpdated = todayISO();
  fs.writeFileSync(MATCHES_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
  const js = `// Auto-generated from matches.json by finalize-results.js\nwindow.__MATCHES_DATA__ = ${JSON.stringify(data, null, 2)};\n`;
  fs.writeFileSync(DATA_FILE, js, 'utf8');
  console.log('[finalize] wrote updates to matches.json and matches-data.js');
}

try {
  run();
  // Sync bracket placeholders to matches after finalizing results
  console.log('\n🔄 Syncing bracket data to matches...');
  syncBracketToMatches();
  console.log('✅ Bracket sync complete\n');
} catch (err) {
  console.error('[finalize] error:', err && err.message ? err.message : err);
  process.exit(1);
}
