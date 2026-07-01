// Rewrites the projects list and language bars in README.md between anchor lines.
// No deps — uses Node built-in fetch (Node 18+). Token via GITHUB_TOKEN.
// GitHub-only: renders ASCII bars, no external image service.
import { readFileSync, writeFileSync } from "node:fs";

const USER = "dozken";
const COUNT = 5;
const INDENT = " ".repeat(36); // matches neofetch right column
const BARW = 10; // language bar width in chars
const README = "README.md";
const token = process.env.GITHUB_TOKEN;

// crisp hand-written blurbs; repos not listed fall back to auto-shorten
const BLURB = {
  "leptos-htmx": "Leptos + HTMX, server-driven UI",
  "ibkr-trader-core": "Shariah-compliant IBKR bot",
  "translate-ai-pdf": "LLM multi-language PDF xlate",
  "route-finder": "BFS land routes across borders",
  "thymeleaf_ls": "Thymeleaf LSP, written in Rust",
};

// repos the language bars are computed over — your polyglot flagships,
// decoupled from the star-ranked project list so the mix stays representative
const LANG_REPOS = [
  "leptos-htmx", "ibkr-trader-core", "translate-ai-pdf", "route-finder",
  "wunder", "thymeleaf_ls", "SwapMatch", "billing-engine", "multy-tenant-go-app",
];
const LANG_N = 5; // languages shown in the bar chart (all forced in, min 1 block)

// vendored / generated / templating / non-code — excluded from the language mix
const NOISE = /^(XSLT|Makefile|Dockerfile|Batchfile|Roff|Shell|HTML|CSS|SCSS|Mako|Smarty|Jinja|Tcl|JavaScript|Objective-C\+*|C\+\+)$/;

const gh = async (path) => {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      "User-Agent": "readme-bot",
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} on ${path}: ${await res.text()}`);
  return res.json();
};

const repos = await gh(`/users/${USER}/repos?sort=pushed&per_page=100`);
const picked = repos
  .filter((r) => !r.fork && !r.archived && r.description && r.name !== USER)
  .sort((a, b) => b.stargazers_count - a.stargazers_count) // most-starred first
  .slice(0, COUNT);

if (picked.length === 0) throw new Error("no repos matched filter");

// --- projects list ---
const namew = Math.max(...picked.map((r) => r.name.length)) + 3;
const short = (d) => {
  let s = d.split(/\s+[·—–-]\s+|\.\s|,\s/)[0].trim();
  if (s.length > 34) s = s.slice(0, 33).trimEnd() + "…";
  return s;
};
const blurb = (r) => BLURB[r.name] ?? short(r.description);
const projectLines = picked
  .map((r) => `${INDENT}${r.name.padEnd(namew)}${blurb(r)}`)
  .join("\n");

// --- language bars, aggregated over the curated flagship set ---
const totals = {};
for (const name of LANG_REPOS) {
  let langs;
  try {
    langs = await gh(`/repos/${USER}/${name}/languages`);
  } catch {
    continue; // repo renamed/removed — skip, don't fail the whole run
  }
  for (const [k, v] of Object.entries(langs)) {
    if (NOISE.test(k)) continue;
    totals[k] = (totals[k] || 0) + v;
  }
}
const grand = Object.values(totals).reduce((a, b) => a + b, 0);
const ranked = Object.entries(totals)
  .sort((a, b) => b[1] - a[1])
  .slice(0, LANG_N); // top-N by bytes, small langs kept as slivers
const max = ranked[0]?.[1] || 1;
const langw = Math.max(...ranked.map(([k]) => k.length)) + 1;
const langLines = ranked
  .map(([k, v]) => {
    const pct = Math.round((v * 100) / grand);
    const fill = Math.max(1, Math.round((v / max) * BARW)); // scale to leader
    const bar = "█".repeat(fill) + "░".repeat(BARW - fill);
    const label = pct < 1 ? "<1%" : `${pct}%`;
    return `${INDENT}${k.padEnd(langw)}${bar} ${label.padStart(3)}`;
  })
  .join("\n");

// --- splice both regions; [ ]* keeps the blank separator lines intact ---
let readme = readFileSync(README, "utf8");
const projRe = /(\$ ls ~\/projects --top\n)[\s\S]*?(\n[ ]*\$ tokei --flagships)/;
const langRe = /(\$ tokei --flagships\n)[\s\S]*?(\n[ ]*\$ contact --list)/;
if (!projRe.test(readme)) throw new Error("projects anchors not found");
if (!langRe.test(readme)) throw new Error("tokei anchors not found");

const next = readme
  .replace(projRe, `$1${projectLines}\n$2`)
  .replace(langRe, `$1${langLines}\n$2`);

if (next === readme) {
  console.log("no change");
} else {
  writeFileSync(README, next);
  console.log(`updated: ${picked.length} repos, ${ranked.length} langs`);
}
