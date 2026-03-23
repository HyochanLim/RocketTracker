from __future__ import annotations

import argparse
import json
from math import cos, radians
from pathlib import Path
from typing import Dict, List, Tuple

import matplotlib.pyplot as plt


def geodetic_to_local_m(lat: float, lon: float, lat0: float, lon0: float) -> Tuple[float, float]:
    r_earth = 6378137.0
    d_lat = radians(lat - lat0)
    d_lon = radians(lon - lon0)
    mean_lat = radians((lat + lat0) * 0.5)
    north = r_earth * d_lat
    east = r_earth * cos(mean_lat) * d_lon
    return east, north


def parse_float(value: object) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def extract_xyz(records: List[Dict[str, object]]) -> Tuple[List[float], List[float], List[float]]:
    first_lat = None
    first_lon = None
    first_alt = None
    xs: List[float] = []
    ys: List[float] = []
    zs: List[float] = []

    for row in records:
        lat = parse_float(row.get("latitude"))
        lon = parse_float(row.get("longitude"))
        # z-axis uses barometric altitude only.
        alt = parse_float(row.get("altitude", row.get("abs_alt")))
        if lat is None or lon is None or alt is None:
            continue

        if first_lat is None:
            first_lat = lat
            first_lon = lon
            first_alt = alt

        east, north = geodetic_to_local_m(lat, lon, first_lat, first_lon)  # type: ignore[arg-type]
        xs.append(east)
        ys.append(north)
        zs.append(alt - float(first_alt))

    return xs, ys, zs


def plot_3d(xs: List[float], ys: List[float], zs: List[float], output_path: Path, z_scale: float, show: bool) -> None:
    z_vis = [z * z_scale for z in zs]
    fig = plt.figure(figsize=(10, 8))
    ax = fig.add_subplot(111, projection="3d")
    colors = list(range(len(xs)))
    ax.scatter(xs, ys, z_vis, c=colors, cmap="viridis", s=8, alpha=0.85)
    ax.plot(xs, ys, z_vis, color="royalblue", linewidth=1.0, alpha=0.55, label="GPS XY + Baro Z")
    ax.scatter(xs[0], ys[0], z_vis[0], color="green", s=70, label="Start")
    ax.scatter(xs[-1], ys[-1], z_vis[-1], color="red", s=70, label="End")

    # Add projected traces so trajectory shape is easier to read.
    z_floor = min(z_vis)
    x_wall = min(xs)
    y_wall = max(ys)
    ax.plot(xs, ys, [z_floor] * len(xs), color="gray", linewidth=0.8, alpha=0.35)
    ax.plot([x_wall] * len(xs), ys, z_vis, color="gray", linewidth=0.8, alpha=0.25)
    ax.plot(xs, [y_wall] * len(xs), z_vis, color="gray", linewidth=0.8, alpha=0.25)

    ax.set_xlabel("X East (m)")
    ax.set_ylabel("Y North (m)")
    ax.set_zlabel(f"Z Baro Alt Rel x{z_scale:.1f} (m)")
    ax.set_title("3D Trajectory from Raw TeleMega Data")
    ax.view_init(elev=24, azim=-132)
    ax.legend(loc="upper right")
    plt.tight_layout()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_path, dpi=150)
    if show:
        plt.show()
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser(description="Plot 3D trajectory using GPS XY and barometric Z.")
    parser.add_argument(
        "--input",
        type=str,
        default=r"c:\Users\user\Desktop\rocket.tracking\data\rawdata\2025-02-23-serial-10970-flight-0000-via-12064.json",
        help="Input raw TeleMega JSON path",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=r"c:\Users\user\Desktop\rocket.tracking\data\filtereddata\raw_gpsxy_baroz_3d.png",
        help="Output PNG path",
    )
    parser.add_argument(
        "--z-scale",
        type=float,
        default=4.0,
        help="Visual exaggeration for Z axis (baro altitude).",
    )
    parser.add_argument(
        "--show",
        action="store_true",
        help="Show interactive plot window.",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    with input_path.open("r", encoding="utf-8") as f:
        records: List[Dict[str, object]] = json.load(f)

    xs, ys, zs = extract_xyz(records)
    if len(xs) < 2:
        raise SystemExit("Not enough valid points to plot.")

    plot_3d(xs, ys, zs, output_path, z_scale=args.z_scale, show=args.show)
    print(f"Saved plot: {output_path}")
    print(f"Points used: {len(xs)}")


if __name__ == "__main__":
    main()
