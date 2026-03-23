# Data Directory Guide

This folder is used for runtime and reference data only.

## Structure

- `database.js`: MongoDB connection helper.
- `rawdata/`, `filtereddata/`: legacy/reference datasets.
- `storage/raw_uploads/`: temporary uploaded source files (`csv/json/xls/xlsx`).
- `storage/parsed_json/`: normalized JSON generated from uploaded files.

## Notes

- Parsed JSON files are the canonical input for analysis pipelines.
- Keep parser/business logic in `logic/` (not in `data/`).
- Runtime-generated files inside `storage/` are ignored by Git except `.gitkeep`.
