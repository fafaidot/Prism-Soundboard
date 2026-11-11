---
name: distribute
description: >-
  Complete end-to-end distribution pipeline for Prism Soundboard.
  Bumps version, updates app version strings, builds installer executables, commits and pushes to GitHub, and publishes a new GitHub Release.
  Triggered when the user invokes /distribute or asks for a full release distribution.
---

# Distribute Skill (Full Pipeline)

This skill executes the entire release process in a single automated pipeline:
1. Version bump and in-app synchronization
2. Production build and NSIS installer packaging
3. Git commit & push to GitHub `main`
4. Git tag creation & GitHub Release publishing with binary assets

## Complete Execution Sequence

Execute the four stages in order:

### Stage 1: Bump Version & Sync
```powershell
node scripts/bump-version.js
```
*(Optionally specify a target version: `node scripts/bump-version.js <version>`)*

### Stage 2: Build & Package
```powershell
npm run dist
```
Verify that `dist-release/Prism Soundboard Setup <version>.exe` was successfully built.

### Stage 3: Git Commit & Push
```powershell
git add .
$ver = (Get-Content package.json | ConvertFrom-Json).version
git commit -m "release: v$ver production build and updates"
git push origin main
```

### Stage 4: Tag & Publish Release
```powershell
$ver = (Get-Content package.json | ConvertFrom-Json).version
git tag "v$ver"
git push origin "v$ver"
node scripts/github-release.js
```
Confirm the release is published on `https://github.com/fafaidot/Prism-Soundboard/releases`.
