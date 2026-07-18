# LighthouseTerror

A static dashboard for tracking a Dalamud custom plugin repository — downloads, version drift, API-level conformance, build/CI health, and 90 days of trends. Default target: [MTVirux/SeaOfTerror](https://github.com/MTVirux/SeaOfTerror).

**Live dashboard:** https://mtvirux.github.io/LighthouseTerror/

## How it works

A GitHub Actions cron runs every 6 hours, fetches the configured `repo.json`, walks each plugin's source repository via the GitHub API, and writes a snapshot to a `repo/<tracked-name>` orphan branch. The static dashboard (this repo's `main` branch, served by GitHub Pages) reads those snapshots at runtime via `raw.githubusercontent.com`.

## Fork it for your own plugin repo

1. Click **Use this template** at the top of this page.
2. Edit `config.js` and replace the `REPO_JSON_URL` value with the raw URL of your `repo.json`:
   ```js
   export const REPO_JSON_URL = "https://raw.githubusercontent.com/<owner>/<repo>/main/repo.json";
   ```
3. Repo **Settings → Pages → Source**: select *GitHub Actions*.
4. (Recommended) Repo **Settings → Secrets and variables → Actions → New repository secret**: add `GH_PAT` set to a fine-grained personal access token with public-repo read scope. Without a PAT, the workflow falls back to the default `GITHUB_TOKEN`, which has a much smaller cross-repo budget.
5. Done. The first snapshot will run on the next cron tick, or trigger it from the **Actions** tab → *snapshot* → *Run workflow*.

The data branch (`repo/<tracked-name>`) is created automatically on first run.

## Local development

Requires Node 20+.

```bash
# Run the unit tests
npm test

# Dry-run the snapshot against fixtures (no network, no commits)
node scripts/snapshot.mjs --dry-run --fixtures > /tmp/snap.json

# Serve the dashboard locally
npx -y http-server -p 8000
```

## What's tracked

- **Downloads** (per plugin + current stable/testing release + repo total + downloads-over-time)
- **Versions, API level, freshness** (stable vs testing drift, conformance, age)
- **Issues & releases** (per plugin + the group repo)
- **Build / CI health** (latest workflow run status)

## What's not

- Stars (deliberately omitted)
- Multiple repos in one instance (one dashboard tracks one repo)
- Discovery / community-wide indexing
