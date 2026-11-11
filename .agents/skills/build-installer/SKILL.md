---
name: build-installer
description: >-
  Increment version, update app version strings, and build the production setup installer and standalone binaries.
  Triggered when the user invokes /build-installer, asks to build the setup exe, or bump and compile a new version.
---

# Build Installer Skill

This skill increments the project version, synchronizes version numbers across all files in the app, and builds the production NSIS Setup installer.

## Workflow Instructions

1. **Bump Version & Update Version Strings:**
   Run the version bump helper script:
   ```powershell
   node scripts/bump-version.js
   ```
   *(Optional: Pass a specific version like `node scripts/bump-version.js 1.4.1` if requested)*.

   This automatically synchronizes:
   - `package.json` (`version`)
   - `electron/main.cjs` (`currentVersion`)
   - `src/components/SettingsModal.tsx` (`currentVersion`, version badge, footer label)

2. **Run Production Build & Packaging:**
   Execute the full packaging command:
   ```powershell
   npm run dist
   ```

3. **Verify Generated Binaries:**
   Inspect the output in `dist-release/`:
   ```powershell
   Get-ChildItem -Path "dist-release" | Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-10) }
   ```
   Ensure `Prism Soundboard Setup <version>.exe` is present and non-empty.
