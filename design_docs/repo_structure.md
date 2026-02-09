# Repository Structure

## Purpose
Define a repo layout that keeps design docs at the root, and places the published
web app under `public/` for GitHub Pages and other static hosting targets.

## Root layout
- `design_docs/` — design and implementation documentation.
- `public/` — the deployable web app.
- `.github/workflows/` — CI/CD workflows, including GitHub Pages deployment.

## `public/` layout (skeleton)
- `public/package.json` — project dependencies and scripts (`dev`, `build`, `preview`).
- `public/package-lock.json` — locked dependency versions for reproducible installs.
- `public/assets/` — source images and other static assets.
- `public/src/` — application code (PixiJS app and game logic).
  - `public/src/core/` — grid, coordinates, operators, and move logic.
  - `public/src/render/` — tile baking and view/render helpers.
  - `public/src/ui/` — input handling and UI wiring.

## Notes
- Keep the web app self-contained under `public/` to simplify static hosting.
- Use npm-managed dependencies; do not commit `public/node_modules/`.
- Build output `public/dist/` is generated and not committed.
- GitHub Pages deployment uses a manual GitHub Actions workflow (`workflow_dispatch`).
