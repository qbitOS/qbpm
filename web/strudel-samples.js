/** Build Strudel sample maps from public GitHub repos (no strudel.json required). */

const AUDIO_RE = /\.(wav|mp3|ogg|flac|aiff?)$/i;

export function parseGithubRepo(input) {
  const s = String(input || "").trim();
  const m = s.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

async function listGithubDir(url) {
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`github listing ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Walk a repo /samples tree and emit a `samples({...}, base)` prefix.
 * Handles repos like Fail-safe where samples are folders of wav files.
 */
export async function githubSamplesPrefix(owner, repo, opts = {}) {
  const { samplesDir = "samples", branch = "main" } = opts;
  const base = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${samplesDir}/`;
  const rootUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${samplesDir}?ref=${branch}`;
  const entries = await listGithubDir(rootUrl);
  const map = {};

  await Promise.all(
    entries
      .filter((e) => e.type === "dir")
      .map(async (dir) => {
        const files = await listGithubDir(dir.url);
        const audio = files.filter((f) => f.type === "file" && AUDIO_RE.test(f.name));
        if (!audio.length) return;
        const rel = (f) => `${dir.name}/${f.name}`;
        if (audio.length === 1) map[dir.name] = rel(audio[0]);
        else map[dir.name] = audio.map(rel);
      }),
  );

  if (!Object.keys(map).length) {
    throw new Error(`no audio samples under ${owner}/${repo}/${samplesDir}`);
  }

  const json = JSON.stringify(map);
  return `samples(${json}, '${base}')\n`;
}

export async function samplesPrefixForProject(urlOrRepo) {
  const parsed = parseGithubRepo(urlOrRepo);
  if (!parsed) return "";
  try {
    return await githubSamplesPrefix(parsed.owner, parsed.repo);
  } catch (err) {
    console.warn("strudel samples manifest:", err);
    return `samples('github:${parsed.owner}/${parsed.repo}/samples')\n`;
  }
}

export function ensureSamplesInCode(code, samplesPrefix) {
  if (!samplesPrefix?.trim()) return code;
  const body = samplesPrefix.trim();
  if (code.includes(body)) return code;
  const githubShort = body.match(/samples\('github:[^']+'\)/)?.[0];
  if (githubShort && code.includes(githubShort)) {
    return code.replace(githubShort, body);
  }
  return `${body}\n${code}`;
}