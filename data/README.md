# Data directory

Runtime and reference data for the app.

## Layout

- `database.js` — MongoDB connection helper.
- `rawdata/`, `filtereddata/` — legacy/reference datasets (optional).
- `users/<USER_OBJECT_ID>/` — **per-account workspace** (gitignored):
  - `raw/` — uploaded flight source files (csv, json, xls, xlsx).
  - `parsed/` — normalized / AI-standardized JSON derived from `raw/`.
  - `chat/` — agent conversation transcripts (`default.json`, or `<flightFileId>.json`).
  - `profile/` — avatar images (served at `/profile-media/<userId>/<filename>`).

## Legacy paths

Older installs may still have files under `storage/raw_uploads/<userId>/` and `storage/parsed_json/<userId>/`. The app still reads those paths for existing database records; new uploads use `users/<id>/` only.

## Notes

- Keep parsers and business logic in `logic/`, not under `data/`.
- Do not commit per-user contents; only `.gitkeep` files where needed.
