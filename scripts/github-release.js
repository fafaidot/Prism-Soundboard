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

#### 🎮 In-Game HUD & Overlay Overhaul
- **Custom Sliders:** Replaced all native sliders across the HUD (Speaker, Mic, Sound Volume, Speed, and Scrubber) with custom cyan sliders and hollow circular thumbs matching the main app.
- **Unified Now Playing Pill:** Integrated the horizontal Now Playing Pill dock directly into the HUD bottom bar with full cover artwork, title/subtitle, scrubber timeline, and quick transport controls.
- **Duplicate Sound Button:** Added the Duplicate (<kbd>Copy</kbd>) action button to the HUD properties panel and wired cross-window synchronization.
- **Inline Sound Renaming:** Added pencil (<kbd>✏️</kbd>) rename buttons directly beside sound titles in both the main app Control Panel and HUD.
- **Audio Trimmer Stability:** Resolved backdrop pointer capture issue where clicking inside the trimmer modal closed the overlay.
- **Cleaned Navigation:** Removed the redundant HUD clip button and dropdown.`,
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
