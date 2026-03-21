from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List

from nav_filter import MinimalNavFilter


def run(input_path: Path, output_path: Path) -> None:
    with input_path.open("r", encoding="utf-8") as f:
        records: List[Dict[str, float]] = json.load(f)

    records = sorted(records, key=lambda r: float(r.get("time", 0.0)))

    filt = MinimalNavFilter()
    outputs = filt.process_records(records)

    enriched: List[Dict[str, object]] = []
    for src, out in zip(records, outputs):
        row = dict(src)
        row["attitude_quaternion"] = out["quaternion"]
        row["velocity"] = out["velocity"]
        row["speed_est"] = out["speed"]
        row["acceleration_world"] = out["acceleration_world"]
        row["acceleration_body"] = out["acceleration_body"]
        row["position_world"] = out["position_world"]
        enriched.append(row)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(enriched, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run EKF-style filter on raw flight JSON")
    parser.add_argument("--input", type=str, default="", help="Input raw JSON file path")
    parser.add_argument("--output", type=str, default="", help="Output JSON file path")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    if args.input:
        src = Path(args.input)
        if not src.is_absolute():
            src = root / src
    else:
        raw_dir = root / "data" / "raw"
        raw_files = sorted(raw_dir.glob("*.json"))
        if not raw_files:
            raise SystemExit("No raw json files in data/raw")
        src = raw_files[-1]

    if args.output:
        dst = Path(args.output)
        if not dst.is_absolute():
            dst = root / dst
    else:
        dst = root / "data" / "processed" / f"{src.stem}-filtered.json"

    run(src, dst)
    print(f"Wrote filtered output: {dst}")
