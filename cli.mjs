#!/usr/bin/env node
/**
 * cc-peak — When are you actually most focused with Claude Code?
 *
 * Shows your peak hours and peak days based on real session timestamps.
 * Find your optimal Claude Code working window.
 *
 * Zero dependencies. Node.js 18+. ESM.
 */

import { readdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();
const PROJECTS_DIR = join(HOME, '.claude', 'projects');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const helpFlag = args.includes('--help') || args.includes('-h');
const jsonFlag = args.includes('--json');
const daysFlag = args.find(a => a.startsWith('--days='));
const DAYS = daysFlag ? Math.max(7, parseInt(daysFlag.replace('--days=', '')) || 90) : 90;

if (helpFlag) {
  console.log(`cc-peak — Find your peak Claude Code hours

USAGE
  npx cc-peak [options]

OPTIONS
  --days=N    Look back N days (default: 90, minimum 7)
  --json      Output JSON
  --help      Show this help

OUTPUT
  Hour-of-day heatmap (which hours you do the most work)
  Day-of-week breakdown (which days are most productive)
  Peak window recommendation ("Your best window: Tue–Thu 9am–1pm")

EXAMPLE
  npx cc-peak
  npx cc-peak --days=30
`);
  process.exit(0);
}

// ── Session parser (same methodology as cc-session-stats) ────────────────────
const SESSION_GAP_HOURS = 0.5;
const MAX_SESSION_HOURS = 8; // exclude autonomous sessions

async function parseSessions() {
  const cutoff = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  const sessions = [];

  let projectDirs;
  try { projectDirs = await readdir(PROJECTS_DIR); } catch { return sessions; }

  for (const projDir of projectDirs) {
    const projPath = join(PROJECTS_DIR, projDir);
    let files;
    try { files = await readdir(projPath); } catch { continue; }
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

    for (const file of jsonlFiles) {
      const filePath = join(projPath, file);
      let fh;
      try {
        fh = await open(filePath, 'r');
        const CHUNK = 4096;
        const buf = Buffer.alloc(CHUNK);

        // First timestamp
        const { bytesRead: r1 } = await fh.read(buf, 0, CHUNK, 0);
        if (!r1) { await fh.close(); continue; }
        const firstLine = buf.toString('utf8', 0, r1).split('\n')[0];
        const firstTs = extractTs(firstLine);
        if (!firstTs || firstTs < cutoff) { await fh.close(); continue; }

        // Last timestamp
        const stat = await fh.stat();
        const readSize = Math.min(CHUNK, stat.size);
        const { bytesRead: r2 } = await fh.read(buf, 0, readSize, stat.size - readSize);
        const lastChunk = buf.toString('utf8', 0, r2);
        const lastLine = lastChunk.split('\n').filter(l => l.trim()).pop() || firstLine;
        const lastTs = extractTs(lastLine) || firstTs;

        const durationHours = (lastTs - firstTs) / 3600000;
        if (durationHours > MAX_SESSION_HOURS) { await fh.close(); continue; }
        if (durationHours < 0) { await fh.close(); continue; }

        sessions.push({ start: firstTs, end: lastTs, durationHours });
        await fh.close();
      } catch {
        if (fh) try { await fh.close(); } catch {}
      }
    }
  }
  return sessions;
}

function extractTs(line) {
  if (!line) return null;
  const m = line.match(/"timestamp"\s*:\s*"([^"]+)"/);
  if (!m) return null;
  const d = new Date(m[1]);
  return isNaN(d.getTime()) ? null : d;
}

// ── Analysis ──────────────────────────────────────────────────────────────────
function analyze(sessions) {
  // Hour-of-day: 0-23
  const hourH = new Array(24).fill(0);    // total hours
  const hourC = new Array(24).fill(0);    // session count

  // Day-of-week: 0=Sun,1=Mon,...,6=Sat
  const dowH = new Array(7).fill(0);
  const dowC = new Array(7).fill(0);
  const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (const s of sessions) {
    const h = s.start.getHours();
    const d = s.start.getDay();
    hourH[h] += s.durationHours;
    hourC[h]++;
    dowH[d] += s.durationHours;
    dowC[d]++;
  }

  // Find peak hour block (4h window with most activity)
  let bestBlock = 0, bestBlockH = 0;
  for (let start = 0; start < 24; start++) {
    let blockH = 0;
    for (let i = 0; i < 4; i++) blockH += hourH[(start + i) % 24];
    if (blockH > bestBlockH) { bestBlockH = blockH; bestBlock = start; }
  }

  // Find peak day
  const peakDayIdx = dowH.indexOf(Math.max(...dowH));

  // Find top 3 hours
  const topHours = [...hourH.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([h]) => h);

  return {
    hourH, hourC, dowH, dowC,
    DOW_NAMES,
    bestBlock,
    bestBlockEnd: (bestBlock + 4) % 24,
    peakDayIdx,
    peakDay: DOW_NAMES[peakDayIdx],
    topHours,
    totalHours: sessions.reduce((s, x) => s + x.durationHours, 0),
    totalSessions: sessions.length,
  };
}

function fmtHour(h) {
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
if (!jsonFlag) process.stdout.write('  Scanning sessions...  \r');
const sessions = await parseSessions();

if (sessions.length === 0) {
  console.log('  No sessions found. Run Claude Code for a while first.');
  process.exit(0);
}

const stats = analyze(sessions);

if (jsonFlag) {
  console.log(JSON.stringify({
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    days: DAYS,
    totalSessions: stats.totalSessions,
    peakDay: stats.peakDay,
    peakHourBlock: { start: stats.bestBlock, end: stats.bestBlockEnd },
    topHours: stats.topHours,
    hourlyDistribution: stats.hourH.map((h, i) => ({ hour: i, hours: Math.round(h * 10) / 10 })),
    dowDistribution: stats.dowH.map((h, i) => ({ day: stats.DOW_NAMES[i], hours: Math.round(h * 10) / 10 })),
  }, null, 2));
  process.exit(0);
}

// ── Terminal output ───────────────────────────────────────────────────────────
const bold  = '\x1b[1m';
const dim   = '\x1b[2m';
const cyan  = '\x1b[36m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const orange = '\x1b[33m';
const reset = '\x1b[0m';

const maxH = Math.max(...stats.hourH, 0.01);
const maxD = Math.max(...stats.dowH, 0.01);

console.log('');
console.log(`  ${bold}${cyan}cc-peak v1.0.0${reset}`);
console.log(`  ${'═'.repeat(39)}`);
console.log(`  ${dim}When are you most focused? Last ${DAYS} days.${reset}`);
console.log('');

// ── Peak window recommendation ────────────────────────────────────────────────
const startStr = fmtHour(stats.bestBlock);
const endStr   = fmtHour((stats.bestBlock + 4) % 24);
console.log(`  ${bold}▸ Your Peak Window${reset}`);
console.log(`    ${bold}${yellow}${stats.peakDay}  ·  ${startStr}–${endStr}${reset}`);
console.log(`    ${dim}(highest combined session hours in any 4h block)${reset}`);
console.log('');

// ── Hour-of-day heatmap ───────────────────────────────────────────────────────
console.log(`  ${bold}▸ Hour-of-Day Heatmap${reset}  ${dim}(when sessions start)${reset}`);
for (let h = 0; h < 24; h += 6) {
  const label = fmtHour(h).padStart(4);
  const bars = [];
  for (let i = h; i < h + 6; i++) {
    const v = stats.hourH[i];
    const barLen = Math.round(v / maxH * 12);
    const bar = '▓'.repeat(barLen).padEnd(12);
    const isPeak = i >= stats.bestBlock && i < stats.bestBlock + 4;
    const color = isPeak ? yellow : dim;
    bars.push(`  ${color}${fmtHour(i).padStart(4)}${reset} ${color}${bar}${reset}${dim}${v > 0 ? ' ' + v.toFixed(1) + 'h' : ''}${reset}`);
  }
  bars.forEach(b => console.log(b));
}
console.log('');

// ── Day-of-week bar chart ──────────────────────────────────────────────────────
console.log(`  ${bold}▸ Day-of-Week Breakdown${reset}`);
for (let d = 0; d < 7; d++) {
  const v = stats.dowH[d];
  const barLen = Math.round(v / maxD * 20);
  const bar = '█'.repeat(barLen).padEnd(20);
  const isPeak = d === stats.peakDayIdx;
  const color = isPeak ? yellow : '';
  const marker = isPeak ? ` ${yellow}← peak${reset}` : '';
  console.log(`    ${color}${stats.DOW_NAMES[d]}${reset}  ${color}${bar}${reset}  ${dim}${v.toFixed(1)}h${reset}${marker}`);
}
console.log('');

// ── Insight ───────────────────────────────────────────────────────────────────
console.log(`  ${bold}▸ Insights${reset}`);

// Night owl vs early bird
const nightH = [22,23,0,1,2,3,4,5].reduce((s,h) => s + stats.hourH[h], 0);
const dayH   = [6,7,8,9,10,11,12].reduce((s,h) => s + stats.hourH[h], 0);
const eveH   = [17,18,19,20,21].reduce((s,h) => s + stats.hourH[h], 0);
const maxPart = Math.max(nightH, dayH, eveH);
if (maxPart === nightH && nightH > 0) console.log(`    🦉 ${bold}Night owl${reset}${dim} — most activity between 10pm–5am${reset}`);
else if (maxPart === dayH && dayH > 0) console.log(`    🌅 ${bold}Early bird${reset}${dim} — most activity between 6am–12pm${reset}`);
else if (eveH > 0) console.log(`    🌆 ${bold}Evening worker${reset}${dim} — most activity between 5pm–10pm${reset}`);

// Weekend vs weekday
const weekdayH = [1,2,3,4,5].reduce((s,d) => s + stats.dowH[d], 0);
const weekendH = [0,6].reduce((s,d) => s + stats.dowH[d], 0);
const weekendRatio = weekendH / (weekdayH + weekendH);
if (weekendRatio > 0.35) console.log(`    📅 ${bold}Weekend builder${reset}${dim} — ${Math.round(weekendRatio*100)}% of work on weekends${reset}`);
else console.log(`    🗓️  ${bold}Weekday focused${reset}${dim} — ${Math.round((1-weekendRatio)*100)}% of work on weekdays${reset}`);

// Consistency
const activeDays = new Set(sessions.map(s => s.start.toLocaleDateString('en-CA'))).size;
const coverageRatio = activeDays / DAYS;
if (coverageRatio > 0.8) console.log(`    ⚡ ${bold}Highly consistent${reset}${dim} — active ${Math.round(coverageRatio*100)}% of days${reset}`);
else if (coverageRatio > 0.5) console.log(`    📈 ${bold}Regular rhythm${reset}${dim} — active ${Math.round(coverageRatio*100)}% of days${reset}`);
else console.log(`    🎯 ${bold}Burst worker${reset}${dim} — concentrated sessions, ${Math.round(coverageRatio*100)}% of days active${reset}`);

console.log('');
console.log(`  ${dim}Based on ${stats.totalSessions} sessions over ${DAYS} days.${reset}`);
console.log(`  ${dim}Pair with ${reset}${bold}npx cc-session-stats${reset}${dim} for totals.${reset}`);
console.log('');
