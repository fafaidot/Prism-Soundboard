---
name: github-publish
description: >-
  Stage all modified files, create a structured Git commit with the current version, and push commits to GitHub.
  Triggered when the user invokes /github-publish, asks to push code to GitHub, or sync git changes.
---

# GitHub Publish Skill

This skill stages code modifications, creates a version-tagged commit, and pushes changes upstream to `origin/main`.

## Workflow Instructions

1. **Check Git Status:**
   ```powershell
   git status
   ```

2. **Stage All Changes:**
   ```powershell
   git add .
   ```

3. **Commit with Version Details:**
   Read current version from `package.json` and commit:
   ```powershell
   $ver = (Get-Content package.json | ConvertFrom-Json).version
   git commit -m "chore: release and updates for v$ver"
   ```

4. **Push to Remote:**
   ```powershell
   git push origin main
   ```

5. **Verify Upstream Status:**
   ```powershell
   git log -1 --stat
   ```
