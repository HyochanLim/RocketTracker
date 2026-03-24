import json
import numpy as np
import matplotlib.pyplot as plt

# raw 데이터 파일 경로 (예시: 실제 파일명에 맞게 수정 필요)
RAW_JSON_PATH = "data/rawdata/2025-02-23-serial-10970-flight-0000-via-12064.json"

def load_raw_data(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def main():
    data = load_raw_data(RAW_JSON_PATH)
    # GPS(lat, lon) + 기압고도계(altitude, abs_alt, rel_alt) 기반으로 추출
    gps_points = [
        (
            row.get("latitude"),
            row.get("longitude"),
            row.get("altitude") or row.get("abs_alt") or row.get("rel_alt")
        )
        for row in data
        if row.get("latitude") is not None and row.get("longitude") is not None
    ]
    if not gps_points:
        print("No valid GPS+Baro data found.")
        return

    # 기준점(첫 점)으로부터 상대 좌표 계산 (단순 평면 근사)
    lat0, lon0, alt0 = map(float, gps_points[0])
    r_earth = 6378137.0
    east_list, north_list, up_list = [], [], []
    for lat, lon, alt in gps_points:
        lat = float(lat)
        lon = float(lon)
        alt = float(alt) if alt is not None else 0.0
        d_lat = np.radians(lat - lat0)
        d_lon = np.radians(lon - lon0)
        mean_lat = np.radians((lat + lat0) * 0.5)
        north = r_earth * d_lat
        east = r_earth * np.cos(mean_lat) * d_lon
        up = alt - alt0
        east_list.append(east)
        north_list.append(north)
        up_list.append(up)

    # --- smoothing (이동평균) ---
    def moving_average(a, n=7):
        return np.convolve(a, np.ones(n)/n, mode='same')

    east_smooth = moving_average(np.array(east_list), n=7)
    north_smooth = moving_average(np.array(north_list), n=7)
    up_smooth = moving_average(np.array(up_list), n=7)

    # apogee(최고점) 찾기
    apogee_idx = int(np.argmax(up_smooth))
    apogee_east = east_smooth[apogee_idx]
    apogee_north = north_smooth[apogee_idx]
    apogee_up = up_smooth[apogee_idx]

    fig = plt.figure(figsize=(10, 7))
    ax = fig.add_subplot(111, projection="3d")
    ax.plot(east_smooth, north_smooth, up_smooth, label="Smoothed Trajectory")
    ax.scatter([0], [0], [0], color="red", label="Start Point (Origin)")
    ax.scatter([apogee_east], [apogee_north], [apogee_up], color="purple", s=60, label=f"Apogee ({apogee_up:.1f} m)")
    ax.set_xlabel("East [m]")
    ax.set_ylabel("North [m]")
    ax.set_zlabel("Up [m]")
    ax.set_title("Rocket Trajectory (Baro Altitude, Smoothed, Apogee Marked)")
    ax.legend()
    plt.tight_layout()
    plt.show()

if __name__ == "__main__":
    main()
