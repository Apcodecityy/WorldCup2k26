#!/usr/bin/env node

/**
 * Sync Bracket Data to Matches
 * 
 * Reads the bracket data (r16, qf, sf, final) and resolves all placeholder references
 * (W89, W90, etc.) in the main matches array, keeping the schedules synchronized.
 */

const fs = require('fs');
const path = require('path');

const MATCHES_FILE = path.resolve(__dirname, 'matches.json');
const DATA_FILE = path.resolve(__dirname, 'matches-data.js');

/**
 * Resolves placeholder references (W89, L101, etc.) to actual team data
 */
function resolveTeam(placeholder, bracket, resolvedCache = {}) {
  if (!placeholder || !placeholder.name) return placeholder;
  
  const name = placeholder.name;
  
  // Already cached
  if (resolvedCache[name]) {
    return resolvedCache[name];
  }
  
  // Not a placeholder
  if (!name.match(/^[WL]\d+$/)) {
    return placeholder;
  }
  
  const kind = name[0]; // 'W' for winner, 'L' for loser
  const matchId = parseInt(name.slice(1), 10);
  
  // Find the match
  let srcMatch = null;
  
  // Search in bracket
  for (const stage of ['r32', 'r16', 'qf', 'sf']) {
    if (bracket[stage]) {
      srcMatch = bracket[stage].find(m => m.id === matchId);
      if (srcMatch) break;
    }
  }
  if (!srcMatch && bracket.final && bracket.final.id === matchId) {
    srcMatch = bracket.final;
  }
  if (!srcMatch && bracket.third && bracket.third.id === matchId) {
    srcMatch = bracket.third;
  }
  
  if (!srcMatch) {
    console.warn(`⚠️ Could not find match ${matchId} for placeholder ${name}`);
    return placeholder;
  }
  
  // Recursively resolve source match teams
  const home = resolveTeam(srcMatch.homeTeam, bracket, resolvedCache);
  const away = resolveTeam(srcMatch.awayTeam, bracket, resolvedCache);
  
  // Determine winner/loser
  if (kind === 'W') {
    // For upcoming matches, return home; for completed matches, return actual winner
    if (srcMatch.status === 'completed' || srcMatch.status === 'live') {
      // This is simplified; in real scenario, check scores
      const homeWon = (srcMatch.homeScore || 0) > (srcMatch.awayScore || 0);
      const result = homeWon ? home : away;
      resolvedCache[name] = result;
      return result;
    } else {
      // Upcoming: default to home (will be updated when match completes)
      resolvedCache[name] = home;
      return home;
    }
  } else if (kind === 'L') {
    // Loser - opposite of winner
    if (srcMatch.status === 'completed' || srcMatch.status === 'live') {
      const homeWon = (srcMatch.homeScore || 0) > (srcMatch.awayScore || 0);
      const result = homeWon ? away : home;
      resolvedCache[name] = result;
      return result;
    } else {
      // Upcoming: default to away
      resolvedCache[name] = away;
      return away;
    }
  }
  
  return placeholder;
}

/**
 * Main sync function
 */
function syncBracketToMatches() {
  try {
    // Read matches.json
    const rawData = fs.readFileSync(MATCHES_FILE, 'utf8');
    const data = JSON.parse(rawData);
    
    const bracket = data.bracket || {};
    let updated = 0;
    
    // Process all matches in the main array
    for (const match of data.matches) {
      const homeTeam = match.homeTeam;
      const awayTeam = match.awayTeam;
      
      // Check if either team is a placeholder
      const homeIsPlaceholder = homeTeam && homeTeam.name && homeTeam.name.match(/^[WL]\d+$/);
      const awayIsPlaceholder = awayTeam && awayTeam.name && awayTeam.name.match(/^[WL]\d+$/);
      
      if (homeIsPlaceholder || awayIsPlaceholder) {
        console.log(`\n🔄 Match ${match.id} (${match.stage})`);
        
        if (homeIsPlaceholder) {
          const oldHome = match.homeTeam.name;
          match.homeTeam = resolveTeam(match.homeTeam, bracket);
          console.log(`   HOME: ${oldHome} → ${match.homeTeam.name} (${match.homeTeam.code})`);
          updated++;
        }
        
        if (awayIsPlaceholder) {
          const oldAway = match.awayTeam.name;
          match.awayTeam = resolveTeam(match.awayTeam, bracket);
          console.log(`   AWAY: ${oldAway} → ${match.awayTeam.name} (${match.awayTeam.code})`);
          updated++;
        }
      }
    }
    
    // Write back to matches.json
    fs.writeFileSync(MATCHES_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`\n✅ Updated ${updated} team reference(s) in matches.json`);
    
    // Generate matches-data.js
    const jsContent = `// Auto-generated from matches.json so the site works even when opened directly (file://) without a local server, avoiding fetch()/CORS issues.\nwindow.__MATCHES_DATA__ = ${JSON.stringify(data, null, 2)};\n`;
    fs.writeFileSync(DATA_FILE, jsContent, 'utf8');
    console.log(`✅ Generated matches-data.js from matches.json`);
    
  } catch (err) {
    console.error('❌ Error syncing bracket to matches:', err);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  syncBracketToMatches();
}

module.exports = { syncBracketToMatches, resolveTeam };
