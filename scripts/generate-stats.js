/**
 * generate-stats.js
 *
 * Pulls language + contribution data straight from the GitHub API and renders
 * a dark-themed SVG. Runs entirely inside your own GitHub Action — nothing is
 * sent to or fetched from any third-party stats service.
 *
 * Requires Node 18+ (built-in fetch).
 */

const fs = require("fs");
const path = require("path");

const USERNAME = process.env.GH_USERNAME || "alicmerjem";
const TOKEN = process.env.GH_TOKEN;
// Languages you don't want counted in the breakdown (case-insensitive).
const EXCLUDED_LANGUAGES = (process.env.EXCLUDE_LANGUAGES || "HTML,CSS")
  .split(",")
  .map((s) => s.trim().toLowerCase());

if (!TOKEN) {
  console.error("Missing GH_TOKEN environment variable.");
  process.exit(1);
}

const API_HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "User-Agent": USERNAME,
};

async function ghREST(pathname) {
  const res = await fetch(`https://api.github.com${pathname}`, { headers: API_HEADERS });
  if (!res.ok) throw new Error(`REST ${pathname} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function ghGraphQL(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { ...API_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
  return json.data;
}

async function getAllRepos() {
  let repos = [];
  let pageNum = 1;
  while (true) {
    const page = await ghREST(
      `/users/${USERNAME}/repos?per_page=100&page=${pageNum}&type=owner`
    );
    repos = repos.concat(page);
    if (page.length < 100) break;
    pageNum += 1;
  }
  return repos.filter((r) => !r.fork);
}

async function getLanguageTotals(repos) {
  const totals = {};
  for (const repo of repos) {
    let langs = {};
    try {
      langs = await ghREST(`/repos/${USERNAME}/${repo.name}/languages`);
    } catch (e) {
      continue; // skip repos we can't read (e.g. empty repos)
    }
    for (const [lang, bytes] of Object.entries(langs)) {
      if (EXCLUDED_LANGUAGES.includes(lang.toLowerCase())) continue;
      totals[lang] = (totals[lang] || 0) + bytes;
    }
  }
  return totals;
}

async function getContributionStats() {
  const query = `
    query ($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;
  const data = await ghGraphQL(query, { login: USERNAME });
  const calendar = data.user.contributionsCollection.contributionCalendar;
  const days = calendar.weeks.flatMap((w) => w.contributionDays);

  // Current streak: count backwards from today while contributions > 0.
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (days[i].contributionCount > 0) streak += 1;
    else if (new Date(days[i].date).toDateString() === new Date().toDateString()) {
      continue; // don't break streak just because today has no contributions yet
    } else break;
  }

  return {
    totalContributions: calendar.totalContributions,
    currentStreak: streak,
  };
}

function topLanguages(totals, limit = 6) {
  const total = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, bytes]) => ({ name, pct: (bytes / total) * 100 }));
}

const LANG_COLORS = {
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  Python: "#3572A5",
  Kotlin: "#A97BFF",
  JavaScript: "#f1e05a",
  PHP: "#4F5D95",
  Cuda: "#3A4E3A",
  Jupyter: "#DA5B0B",
  Shell: "#89e051",
  Dockerfile: "#384d54",
};

function renderSVG({ totalContributions, currentStreak, repoCount, stars, langs }) {
  const barWidth = 300;
  const barHeight = 10;
  const rowGap = 30;
  const langRows = langs
    .map((l, i) => {
      const y = 60 + i * rowGap;
      const filled = Math.max(4, (l.pct / 100) * barWidth);
      const color = LANG_COLORS[l.name] || "#8fa3ff";
      return `
        <text x="0" y="${y - 6}" class="lang-name">${l.name}</text>
        <text x="${barWidth}" y="${y - 6}" text-anchor="end" class="lang-pct">${l.pct.toFixed(1)}%</text>
        <rect x="0" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" fill="#2a2a45"/>
        <rect x="0" y="${y}" width="${filled}" height="${barHeight}" rx="5" fill="${color}">
          <animate attributeName="width" from="0" to="${filled}" dur="1s" fill="freeze"/>
        </rect>
      `;
    })
    .join("\n");

  const height = 90 + langs.length * rowGap + 20;

  return `<svg width="900" height="${height}" viewBox="0 0 900 ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .card { fill: #14141f; stroke: #2a2a45; stroke-width: 1; }
      .title { font: 700 18px 'Segoe UI', Ubuntu, sans-serif; fill: #ffffff; }
      .stat-label { font: 400 13px 'Segoe UI', Ubuntu, sans-serif; fill: #9aa4c7; }
      .stat-value { font: 700 22px 'Segoe UI', Ubuntu, sans-serif; fill: #00f5d4; }
      .lang-name { font: 600 13px 'Segoe UI', Ubuntu, sans-serif; fill: #cfd8ff; }
      .lang-pct { font: 400 12px 'Segoe UI', Ubuntu, sans-serif; fill: #8fa3ff; }
    </style>
  </defs>

  <rect x="0" y="0" width="430" height="${height}" rx="12" class="card"/>
  <text x="20" y="30" class="title">Top Languages</text>
  <g transform="translate(20, 30)">
    ${langRows}
  </g>

  <rect x="450" y="0" width="450" height="${height}" rx="12" class="card"/>
  <text x="470" y="30" class="title">GitHub Stats</text>

  <text x="470" y="70" class="stat-label">Total Contributions</text>
  <text x="470" y="95" class="stat-value">${totalContributions.toLocaleString()}</text>

  <text x="470" y="130" class="stat-label">Current Streak</text>
  <text x="470" y="155" class="stat-value">${currentStreak} day${currentStreak === 1 ? "" : "s"}</text>

  <text x="700" y="70" class="stat-label">Public Repos</text>
  <text x="700" y="95" class="stat-value">${repoCount}</text>

  <text x="700" y="130" class="stat-label">Total Stars</text>
  <text x="700" y="155" class="stat-value">${stars}</text>
</svg>`;
}

async function main() {
  const repos = await getAllRepos();
  const [langTotals, contrib] = await Promise.all([
    getLanguageTotals(repos),
    getContributionStats(),
  ]);
  const stars = repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
  const langs = topLanguages(langTotals);

  const svg = renderSVG({
    totalContributions: contrib.totalContributions,
    currentStreak: contrib.currentStreak,
    repoCount: repos.length,
    stars,
    langs,
  });

  const outDir = path.join(__dirname, "..", "assets");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "stats.svg"), svg);
  console.log("Wrote assets/stats.svg");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
