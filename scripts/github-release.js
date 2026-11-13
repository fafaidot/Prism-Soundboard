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

#### 🎮 Mainstream In-Game HUD Overhaul
- **Unified Main Window:** Transformed the HUD into a single, cohesive, modern desktop overlay dashboard matching Prism's core design system.
- **Streamlined Top Bar:** Features a unified edge-to-edge header with instant search (\`Search sounds, clips, tags...\`), quick filter tabs (\`All\`, \`Favorites\`, \`Clips\`, \`YouTube\`), Stop All panic key, headphone monitor toggle, and quick YouTube ripper launcher.
- **Integrated 2-Column Dashboard:** Sound library grid with **SORT BY** options on the left, and an integrated properties panel with volume/speed sliders, playback modes, and playback options on the right.
- **Dual-Pod Dock:** Volume sliders and interactive Now Playing pill with timeline scrubber and transport controls docked seamlessly at the bottom.

#### ⚙️ Settings Modal & Menu Overhauls
- **Two-Pane Desktop Settings:** Replaced horizontal tab strip with a structured left navigation sidebar categorized into Audio & Voice, Controls & Keys, and System & Storage.
- **Sleek Controls:** Built with custom \`<Slider>\` components, iOS/macOS-style \`<ToggleSwitch>\` pills, and subtle Obsidian & Cyan device routing cards.
- **Subtle VB-Cable Status Card:** Replaced saturated green banner with a clean, low-profile Obsidian indicator card.

#### ✏️ Direct Sound Editing
- **Pencil Edit Button:** The pencil icon beside sound titles in both the main app Control Panel and in-game HUD now opens \`EditSoundModal\` directly to edit sound title, artist credits, and cover artwork in one click.

#### 🗑️ Clean Single-Pane Modals
- **Archive & YouTube Menus:** Streamlined Deleted Sounds Archive and YouTube Music Downloader by removing sidebars and creating focused, responsive single-pane interfaces with full audio preview and batch downloads.`,
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
