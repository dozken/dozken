// Rewrites the "recent projects" block in README.md between two anchor lines.
// No deps — uses Node built-in fetch (Node 18+). Token via GITHUB_TOKEN.
import { readFileSync, writeFileSync } from "node:fs";

const USER = "dozken";
const COUNT = 5;
const INDENT = " ".repeat(36); // matches neofetch right column
const README = "README.md";
const token = process.env.GITHUB_TOKEN;

const res = await fetch(
  `https://api.github.com/users/${USER}/repos?sort=pushed&per_page=100`,
  {
    headers: {
      "User-Agent": "readme-bot",
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  }
);
if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);

const repos = await res.json();
const picked = repos
  .filter((r) => !r.fork && !r.archived && r.description && r.name !== USER)
  .slice(0, COUNT);

if (picked.length === 0) throw new Error("no repos matched filter");

const namew = Math.max(...picked.map((r) => r.name.length)) + 3;
const short = (d) => {
  // first clause only, then hard cap so the neofetch box stays tidy
  let s = d.split(/\s+[·—–-]\s+|\.\s|,\s/)[0].trim();
  if (s.length > 34) s = s.slice(0, 33).trimEnd() + "…";
  return s;
};
const lines = picked
  .map((r) => `${INDENT}${r.name.padEnd(namew)}${short(r.description)}`)
  .join("\n");

const readme = readFileSync(README, "utf8");
// anchor on the prompt lines; [ ]* (not \s*) so the blank line before contact isn't swallowed
const re = /(\$ ls ~\/projects --recent\n)[\s\S]*?(\n[ ]*\$ contact --list)/;
if (!re.test(readme)) throw new Error("anchors not found in README");

const next = readme.replace(re, `$1${lines}\n$2`);

if (next === readme) {
  console.log("no change");
} else {
  writeFileSync(README, next);
  console.log(`updated with ${picked.length} repos`);
}
