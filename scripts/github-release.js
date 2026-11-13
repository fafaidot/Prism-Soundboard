import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = `v${pkg.version}`;
const owner = 'fafaidot';
const repo = 'Prism-Soundboard';

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

async function request(url, options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      if (Buffer.isBuffer(postData)) {
        req.write(postData);
      } else {
        req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
      }
    }
    req.end();
  });
}

async function uploadAsset(uploadUrlTemplate, filePath, fileName) {
  const uploadUrl = uploadUrlTemplate.replace(/\{.*?\}$/, `?name=${encodeURIComponent(fileName)}`);
  const fileBytes = fs.readFileSync(filePath);
  const parsed = new URL(uploadUrl);

  return new Promise((resolve, reject) => {
    const req = https.request(
      uploadUrl,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'Prism-Soundboard-Uploader',
          'Content-Type': 'application/octet-stream',
          'Content-Length': fileBytes.length,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[OK] Successfully uploaded asset: ${fileName}`);
            resolve(true);
          } else {
            console.error(`[Error] Failed uploading ${fileName} (${res.statusCode}): ${body}`);
            resolve(false);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(fileBytes);
    req.end();
  });
}

async function run() {
  if (!token) {
    console.log(`\n======================================================`);
    console.log(`GitHub release files ready for ${version}!`);
    console.log(`No GITHUB_TOKEN environment variable found.`);
    console.log(`You can create the release directly at:`);
    console.log(`https://github.com/${owner}/${repo}/releases/new?tag=${version}&title=Prism+Soundboard+${version}`);
    console.log(`And drag & drop these files:`);
    console.log(`- dist-release/Prism Soundboard Setup ${pkg.version}.exe`);
    console.log(`- dist-release/Prism Soundboard ${pkg.version}.exe`);
    console.log(`======================================================\n`);
    return;
  }

  console.log(`Creating GitHub Release ${version} for ${owner}/${repo}...`);
  const createRes = await request(
    `https://api.github.com/repos/${owner}/${repo}/releases`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Prism-Soundboard-Uploader',
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
    },
    {
      tag_name: version,
      target_commitish: 'main',
      name: `Prism Soundboard ${version}`,
      body: `### Prism Soundboard ${version} Release Notes

#### 🎬 Instant Replay & Video Clipper Enhancements
- **Edge-to-Edge True Fullscreen Video Player:** Removed layout boundary restrictions (\`max-w-5xl\` and \`max-h-[64vh]\`). The player now seamlessly expands to 100% monitor dimensions edge-to-edge.
- **Fit vs. Fill Screen Toggle:** Added a dedicated toggle in playback controls to switch between Fit (exact aspect ratio) and Fill (zero black bars on ultra-wide or 16:10 monitors).
- **Auto-Hiding Floating Controls:** Header and scrubber overlay automatically fade out after 2.5 seconds of mouse idle during playback.
- **Reliable 30s Rolling Replay Buffer:** Resolved slot-wiping on duration checks and extended recorder slot lifespan to guarantee mature slots with full configured footage without 1-second blank clips.
- **In-Game HUD Video Clipping:** Synchronized durations and wired IPC commands so triggering instant replay from the in-game overlay captures full 30-second clips.

#### 🎛️ Audio Engine & Overlay Modernization
- **Modern Obsidian & Cyan Palette:** Refined styling across all modal dialogues and submenus to match the core design language.
- **Waveform Trimmer:** Enhanced progress tracking and trimmer controls for audio precision.
- **Key Hook Repeat Prevention:** Improved GlobalKeyHook handling so holding a key does not re-trigger sounds repeatedly until released.
- **JSON Metadata Protection:** Strengthened storage manager checks to preserve soundboard library files upon app startup.`,
      draft: false,
      prerelease: false,
    }
  );

  if (createRes.status !== 201) {
    console.error(`Failed to create release:`, createRes);
    return;
  }

  const uploadUrl = createRes.body.upload_url;
  const distDir = path.join(rootDir, 'dist-release');

  const setupFile = `Prism Soundboard Setup ${pkg.version}.exe`;
  const setupPath = path.join(distDir, setupFile);
  if (fs.existsSync(setupPath)) {
    console.log(`Uploading ${setupFile}...`);
    await uploadAsset(uploadUrl, setupPath, setupFile);
  }

  const portableFile = `Prism Soundboard ${pkg.version}.exe`;
  const portablePath = path.join(distDir, portableFile);
  if (fs.existsSync(portablePath)) {
    console.log(`Uploading ${portableFile}...`);
    await uploadAsset(uploadUrl, portablePath, portableFile);
  }

  console.log(`\n[SUCCESS] Release published: ${createRes.body.html_url}`);
}

run().catch((err) => {
  console.error('[Error] Exception during release:', err);
});
