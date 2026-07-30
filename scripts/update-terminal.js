const fs = require('fs');
const path = require('path');
const https = require('https');

const USERNAME = 'vardzz';
const SVG_PATH = path.join(__dirname, '..', 'terminal.svg');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function updateStats() {
  try {
    console.log('Fetching stats for user:', USERNAME);

    // 1. Fetch Streak & Total Contributions
    let streakSvg = '';
    try {
      streakSvg = await fetchUrl(`https://github-readme-streak-stats.herokuapp.com/?user=${USERNAME}`);
    } catch (e) {
      console.warn('Could not fetch streak SVG, using fallbacks', e.message);
    }

    const longestStreakMatch = streakSvg.match(/translate\(412\.5,\s*48\)[\s\S]*?<text[\s\S]*?>\s*(\d+)\s*<\/text>/i);
    const longestStreak = longestStreakMatch ? parseInt(longestStreakMatch[1]) : 60; // floor/fallback to 60 as requested

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

    console.log('Stats gathered:');
    console.log('- Longest Streak:', longestStreak);
    console.log('- Top Languages:', topLangs);
    console.log('- Total Contributions:', totalContribs);
    console.log('- Total Commits:', commits);
    console.log('- Total PRs:', prs);

    // Read SVG
    let svgContent = fs.readFileSync(SVG_PATH, 'utf8');

    // Replace lines using regex to make it robust
    svgContent = svgContent.replace(
      /(<text x="638" y="517" [^>]*>Streak\s+)\d+ days \(longest\)(<\/text>)/i,
      `$1${longestStreak} days (longest)$2`
    );
    svgContent = svgContent.replace(
      /(<text x="638" y="536" [^>]*>Languages\s+)[^<]+(<\/text>)/i,
      `$1${topLangs}$2`
    );
    svgContent = svgContent.replace(
      /(<text x="638" y="555" [^>]*>Contributions\s+)[^<]+(<\/text>)/i,
      `$1${totalContribs} (last year)$2`
    );
    svgContent = svgContent.replace(
      /(<text x="638" y="574" [^>]*>Commits\s+)[^<]+(<\/text>)/i,
      `$1${commits}$2`
    );
    svgContent = svgContent.replace(
      /(<text x="638" y="593" [^>]*>PRs\s+)[^<]+(<\/text>)/i,
      `$1${prs}$2`
    );

    fs.writeFileSync(SVG_PATH, svgContent, 'utf8');
    console.log('Successfully updated terminal.svg!');

  } catch (error) {
    console.error('Error updating stats:', error);
  }
}

updateStats();
