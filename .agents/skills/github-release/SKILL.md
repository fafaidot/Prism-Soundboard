---
name: github-release
description: >-
  Create a Git release tag, push tag to GitHub, and create a GitHub Release with uploaded installer and portable binaries.
  Triggered when the user invokes /github-release, asks to create a GitHub release, or publish release assets.
---

# GitHub Release Skill

This skill creates a Git tag for the current version, pushes it to GitHub, and publishes a new GitHub Release with the binary assets (`dist-release/Prism Soundboard Setup <version>.exe`).

## Workflow Instructions

1. **Tag the Commit:**
   ```powershell
   $ver = (Get-Content package.json | ConvertFrom-Json).version
   git tag "v$ver"
   git push origin "v$ver"
   ```

2. **Publish Release & Upload Assets:**
   Run the GitHub release helper script:
   ```powershell
   node scripts/github-release.js
   ```

   - **If `GITHUB_TOKEN` is present:** It automatically creates the release on `fafaidot/Prism-Soundboard` and uploads the Setup `.exe` and portable `.exe`.
   - **If no token is set:** It provides the direct release URL with exact files to drag & drop into GitHub Releases.
