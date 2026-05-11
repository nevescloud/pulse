#!/usr/bin/env node
// One-time bootstrap: walks git history of data/*.json and emits data/history.json.
// After running this, scripts/fetch.js keeps history.json fresh by appending each run.
// Safe to re-run — it overwrites history.json from scratch.

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const DATA_DIR  = path.join(REPO_ROOT, 'data');
const MAX_DAYS  = 90;

const SOURCES = [
  { file: 'github.json',      key: 'github',      extract: extractGitHub },
  { file: 'huggingface.json', key: 'huggingface', extract: extractHuggingFace },
  { file: 'spaces.json',      key: 'spaces',      extract: extractSpaces },
];

function extractGitHub(data) {
  return (data.repos || []).map(r => ({ id: r.fullName, v: r.stars, r: r.rank }));
}

function extractHuggingFace(data) {
  const out = [];
  for (const m of (data.models || []))      out.push({ id: m.id, v: m.downloads, r: m.rank });
  for (const m of (data.smallModels || [])) out.push({ id: m.id, v: m.downloads, r: m.rank });
  return out;
}

function extractSpaces(data) {
  const out = [];
  for (const s of (data.trending || [])) out.push({ id: s.id, v: s.likes, r: s.rank });
  for (const s of (data.webml || []))    out.push({ id: s.id, v: s.likes, r: s.rank });
  return out;
}

function isoDay(iso) { return iso.slice(0, 10); }

function sh(cmd) {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function commitsFor(file) {
  // Newest first. Each line: <hash>|<committer ISO date>
  const out = sh(`git log --pretty=format:"%H|%cI" -- data/${file}`).trim();
  if (!out) return [];
  return out.split('\n').map(l => {
    const [hash, iso] = l.split('|');
    return { hash, iso };
  });
}

function readAtCommit(hash, file) {
  try {
    const txt = sh(`git show ${hash}:data/${file}`);
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function buildSourceHistory(source) {
  // Map of id → Map of day → { v, r } (keeps latest observation of each day)
  const perItem = new Map();
  const commits = commitsFor(source.file);
  if (commits.length === 0) return {};

  // Track which (id, day) we've already filled — newest-first walk wins
  for (const { hash, iso } of commits) {
    const data = readAtCommit(hash, source.file);
    if (!data) continue;
    const day  = isoDay(iso);
    const obs  = source.extract(data);
    for (const { id, v, r } of obs) {
      if (!perItem.has(id)) perItem.set(id, new Map());
      const byDay = perItem.get(id);
      if (!byDay.has(day)) byDay.set(day, { d: day, v, r });
    }
  }

  // Drop observations older than MAX_DAYS, sort oldest→newest per item
  const cutoff = new Date(Date.now() - MAX_DAYS * 86_400_000);
  const cutoffDay = isoDay(cutoff.toISOString());

  const out = {};
  for (const [id, byDay] of perItem) {
    const arr = [...byDay.values()].filter(o => o.d >= cutoffDay).sort((a, b) => a.d.localeCompare(b.d));
    if (arr.length > 0) out[id] = arr;
  }
  return out;
}

function main() {
  const history = { updated: new Date().toISOString() };
  for (const source of SOURCES) {
    console.log(`Building history for ${source.file}…`);
    history[source.key] = buildSourceHistory(source);
    const itemCount = Object.keys(history[source.key]).length;
    const obsCount  = Object.values(history[source.key]).reduce((s, a) => s + a.length, 0);
    console.log(`  ${itemCount} items, ${obsCount} observations`);
  }

  const outPath = path.join(DATA_DIR, 'history.json');
  fs.writeFileSync(outPath, JSON.stringify(history));
  console.log(`Wrote ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
}

main();
