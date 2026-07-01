// Rewrites the projects list and language bars in README.md between anchor lines.
// No deps — uses Node built-in fetch (Node 18+). Token via GITHUB_TOKEN.
// GitHub-only: renders ASCII bars, no external image service.
import { readFileSync, writeFileSync } from "node:fs";

const USER = "dozken";
const INDENT = " ".repeat(36); // matches neofetch right column
const README = "README.md";
const token = process.env.GITHUB_TOKEN;

// curated picks, most-interesting first — hand-ordered, not star-ranked
// (star-ranking surfaced a tutorial repo). name → one-line blurb.
const PROJECTS = {
  "ibkr-trader-core": "Shariah-compliant IBKR bot",
  "thymeleaf_ls": "Thymeleaf LSP, written in Rust",
  "wunder": "LOB prediction, quant comp",
  "multy-tenant-go-app": "Multi-tenant Go, DB per tenant",
  "billing-engine": "NestJS payments microservices",
};

// repos the language list is computed over — real work only, no tutorials
const LANG_REPOS = [
  "ibkr-trader-core", "thymeleaf_ls", "wunder", "multy-tenant-go-app",
  "billing-engine", "route-finder", "SwapMatch", "translate-ai-pdf",
];
const LANG_N = 6; // languages listed, ordered by bytes

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

// --- projects list (curated order) ---
const names = Object.keys(PROJECTS);
const namew = Math.max(...names.map((n) => n.length)) + 3;
const projectLines = names
  .map((n) => `${INDENT}${n.padEnd(namew)}${PROJECTS[n]}`)
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
const ranked = Object.entries(totals)
  .sort((a, b) => b[1] - a[1])
  .slice(0, LANG_N); // top-N by bytes
const langLines = `${INDENT}${ranked.map(([k]) => k).join(" · ")}`;

// --- splice both regions; [ ]* keeps the blank separator lines intact ---
let readme = readFileSync(README, "utf8");
const projRe = /(\$ ls ~\/projects --picks\n)[\s\S]*?(\n[ ]*\$ tokei --flagships)/;
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
  console.log(`updated: ${names.length} repos, ${ranked.length} langs`);
}
