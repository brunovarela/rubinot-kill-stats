# rubinot-kill-stats

Daily snapshot of the `/api/killstats` page for every RubinOT world.

A GitHub Actions workflow runs once a day, crawls each world via a Playwright
browser (to bypass Cloudflare + the site's XHR-only API check), and commits
one JSON file per world to `data/{world}/{YYYY-MM-DD}.json`.

Mirror of [tibia-kill-stats](https://github.com/brunovarela/tibia-kill-stats)
for RubinOT.

## Structure

```
data/
├── auroria/
│   ├── 2026-04-17.json
│   └── 2026-04-18.json
├── bellum/
│   └── 2026-04-17.json
└── ...
```

## File format

```json
{
  "killstatistics": {
    "world": "Auroria",
    "date": "2026-04-18",
    "entries": [
      {
        "race": "Abyssador",
        "last_day_players_killed": 0,
        "last_day_killed": 2,
        "last_week_players_killed": 7,
        "last_week_killed": 86
      }
    ]
  }
}
```

Fields mirror the Tibia killstatistics format so downstream importers can
treat Tibia and RubinOT data with the same code path.

## Running locally

```
cd crawler
npm install
npx playwright install chromium
node crawl.js
```

## Schedule

Runs daily at `06:00 UTC` (`03:00 BRT`). Can be triggered manually via
**Actions → Crawl daily killstats → Run workflow**.

## Worlds

See [`crawler/worlds.json`](crawler/worlds.json). 14 worlds total, each
mapped by the RubinOT numeric `external_id`.
