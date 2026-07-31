const fs = require('fs');
const path = require('path');
const https = require('https');

const USERNAME = 'vardzz';
const SVG_PATH = path.join(__dirname, '..', 'terminal.svg');
const TOKEN = process.env.GITHUB_TOKEN;

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function requestGithub(path, method, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: path,
      method: method,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      }
    };
    if (path.includes('/search/commits')) {
      options.headers['Accept'] = 'application/vnd.github.cloak-preview';
    }
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function fetchStatsWithToken() {
  console.log('Fetching stats using GitHub API (Authenticated)...');

  const query = `
    query($username: String!) {
      user(login: $username) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
              }
            }
          }
        }
        repositories(first: 100, ownerAffiliations: OWNER, orderBy: {field: PUSHED_AT, direction: DESC}) {
          nodes {
            languages(first: 5, orderBy: {field: SIZE, direction: DESC}) {
              edges {
                size
                node {
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  const gqlResponse = await requestGithub('/graphql', 'POST', { query, variables: { username: USERNAME } });
  
  if (gqlResponse.errors) {
    throw new Error(`GraphQL Errors: ${JSON.stringify(gqlResponse.errors)}`);
  }

  const user = gqlResponse.data?.user;
  if (!user) {
    throw new Error('User not found in GraphQL response');
  }

  // 1. Longest Streak
  const calendar = user.contributionsCollection.contributionCalendar;
  let longestStreak = 0;
  let currentStreak = 0;
  for (const week of calendar.weeks) {
    for (const day of week.contributionDays) {
      if (day.contributionCount > 0) {
        currentStreak++;
        if (currentStreak > longestStreak) {
          longestStreak = currentStreak;
        }
      } else {
        currentStreak = 0;
      }
    }
  }
  if (longestStreak === 0) longestStreak = 60; 

  // 2. Total Contributions (last year)
  const totalContribs = calendar.totalContributions.toLocaleString();

  // 3. Top Languages
  const langSizes = {};
  for (const repo of user.repositories.nodes) {
    if (!repo.languages) continue;
    for (const edge of repo.languages.edges) {
      const name = edge.node.name;
      langSizes[name] = (langSizes[name] || 0) + edge.size;
    }
  }
  const topLangs = Object.entries(langSizes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(entry => entry[0])
    .join(', ') || "JavaScript, TypeScript, Dart";

  // 4. Commits & PRs (All-time via Search API)
  let commits = "1.2k";
  let prs = "29";
  try {
    const commitSearch = await requestGithub(`/search/commits?q=author:${USERNAME}`, 'GET');
    if (commitSearch.total_count !== undefined) {
      const totalCommits = commitSearch.total_count;
      commits = totalCommits >= 1000 ? (totalCommits / 1000).toFixed(1) + 'k' : totalCommits.toString();
    }
  } catch (e) {
    console.warn('Could not fetch all-time commits, using default', e.message);
  }

  try {
    const prSearch = await requestGithub(`/search/issues?q=author:${USERNAME}+type:pr`, 'GET');
    if (prSearch.total_count !== undefined) {
      prs = prSearch.total_count.toString();
    }
  } catch (e) {
    console.warn('Could not fetch all-time PRs, using default', e.message);
  }

  return {
    longestStreak,
    topLangs,
    totalContribs,
    commits,
    prs
  };
}

async function fetchStatsFallback() {
  console.log('Fetching stats using fallbacks (Unauthenticated)...');
  
  // 1. Fetch Streak & Total Contributions
  let streakSvg = '';
  try {
    streakSvg = await fetchUrl(`https://github-readme-streak-stats.herokuapp.com/?user=${USERNAME}`);
  } catch (e) {
    console.warn('Could not fetch streak SVG, using fallbacks', e.message);
  }

  const longestStreakMatch = streakSvg.match(/translate\(412\.5,\s*48\)[\s\S]*?<text[\s\S]*?>\s*(\d+)\s*<\/text>/i);
  const longestStreak = longestStreakMatch ? parseInt(longestStreakMatch[1]) : 60;

  const totalContribsMatch = streakSvg.match(/translate\(82\.5,\s*48\)[\s\S]*?<text[\s\S]*?>\s*([\d,]+)\s*<\/text>/i);
  const totalContribs = totalContribsMatch ? totalContribsMatch[1].trim() : "1,353";

  // 2. Fetch Commits & PRs
  let statsSvg = '';
  try {
    statsSvg = await fetchUrl(`https://github-stats-extended.vercel.app/api?username=${USERNAME}`);
  } catch (e) {
    console.warn('Could not fetch stats SVG, using fallbacks', e.message);
  }

  const commitsMatch = statsSvg.match(/data-testid="commits"[\s\S]*?>\s*([\w.,]+)\s*<\/text>/i);
  const commits = commitsMatch ? commitsMatch[1].trim() : "1.2k";

  const prsMatch = statsSvg.match(/data-testid="prs"[\s\S]*?>\s*([\d,]+)\s*<\/text>/i);
  const prs = prsMatch ? prsMatch[1].trim() : "29";

  // 3. Fetch Top Languages
  let langsSvg = '';
  try {
    langsSvg = await fetchUrl(`https://github-stats-extended.vercel.app/api/top-langs/?username=${USERNAME}&layout=compact`);
  } catch (e) {
    console.warn('Could not fetch languages SVG, using fallbacks', e.message);
  }

  const langNameMatches = [...langsSvg.matchAll(/data-testid="lang-name"[\s\S]*?>\s*([a-zA-Z#++]+)/g)];
  const topLangs = langNameMatches.length > 0 
    ? langNameMatches.map(m => m[1]).slice(0, 3).join(', ') 
    : "JavaScript, TypeScript, Dart";

  return {
    longestStreak,
    topLangs,
    totalContribs,
    commits,
    prs
  };
}

async function updateStats() {
  try {
    console.log('Fetching stats for user:', USERNAME);

    let stats;
    if (TOKEN) {
      try {
        stats = await fetchStatsWithToken();
      } catch (err) {
        console.error('Failed to fetch stats with token, trying fallback:', err.message);
        stats = await fetchStatsFallback();
      }
    } else {
      stats = await fetchStatsFallback();
    }

    console.log('Stats gathered:');
    console.log('- Longest Streak:', stats.longestStreak);
    console.log('- Top Languages:', stats.topLangs);
    console.log('- Total Contributions:', stats.totalContribs);
    console.log('- Total Commits:', stats.commits);
    console.log('- Total PRs:', stats.prs);

    // Read SVG
    let svgContent = fs.readFileSync(SVG_PATH, 'utf8');

    // Replace lines using regex to make it robust (matching any y-coordinate)
    svgContent = svgContent.replace(
      /(<text x="638" y="\d+" [^>]*>Streak\s+)\d+ days \(longest\)(<\/text>)/i,
      `$1${stats.longestStreak} days (longest)$2`
    );
    svgContent = svgContent.replace(
      /(<text x="638" y="\d+" [^>]*>Languages\s+)[^<]+(<\/text>)/i,
      `$1${stats.topLangs}$2`
    );
    svgContent = svgContent.replace(
      /(<text x="638" y="\d+" [^>]*>Contributions\s+)[^<]+(<\/text>)/i,
      `$1${stats.totalContribs} (last year)$2`
    );
    svgContent = svgContent.replace(
      /(<text x="638" y="\d+" [^>]*>Commits\s+)[^<]+(<\/text>)/i,
      `$1${stats.commits}$2`
    );
    svgContent = svgContent.replace(
      /(<text x="638" y="\d+" [^>]*>PRs\s+)[^<]+(<\/text>)/i,
      `$1${stats.prs}$2`
    );

    fs.writeFileSync(SVG_PATH, svgContent, 'utf8');
    console.log('Successfully updated terminal.svg!');

  } catch (error) {
    console.error('Error updating stats:', error);
  }
}

updateStats();
