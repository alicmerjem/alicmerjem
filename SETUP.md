# Setup guide

## 1. Create the special repo (if you haven't already)
On GitHub, create a new **public** repo named exactly `alicmerjem` (must match your username). GitHub auto-detects this and shows its README on your profile.

## 2. Upload these files
Push everything in this folder into that repo, keeping the structure:

```
alicmerjem/
├── README.md
├── SETUP.md
├── assets/
│   └── header.svg
├── scripts/
│   └── generate-stats.js
└── .github/
    └── workflows/
        ├── update-stats.yml
        └── snake.yml
```

## 3. Fix the placeholder email
In `README.md`, replace `youremail@example.com` in the mailto link with your real email.

## 4. Add a Personal Access Token (recommended)
The default `GITHUB_TOKEN` that Actions provides can read public repo/language data fine, but the contribution calendar query works more reliably with a personal token that has `read:user` scope:

1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token
2. Scope: `read:user` (that's the only one you need)
3. Copy the token
4. In your `alicmerjem` repo: Settings → Secrets and variables → Actions → New repository secret
   - Name: `STATS_TOKEN`
   - Value: paste the token

If you skip this, the workflow falls back to the default token — it may just give less complete contribution numbers.

## 5. Enable the snake workflow's output branch (optional)
The `snake.yml` workflow pushes the generated animation to a branch called `output`. First run will create it automatically — just make sure Actions has permission to push (Settings → Actions → General → Workflow permissions → **Read and write permissions**).

If you'd rather skip the snake animation, just delete `.github/workflows/snake.yml` and remove the "Contribution Graph" section from `README.md`.

## 6. Trigger it
Go to the **Actions** tab in your repo → select "Update README stats" → **Run workflow** to generate the first version of `assets/stats.svg` instead of waiting for the daily schedule.

## Customizing later
- Change colors: edit the gradient stops in `assets/header.svg`, or the `LANG_COLORS` map in `scripts/generate-stats.js`
- Change which languages are excluded: edit the `EXCLUDE_LANGUAGES` line in `update-stats.yml`
- Change how often stats refresh: edit the `cron` line in `update-stats.yml`
