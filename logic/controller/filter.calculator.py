import json
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from filtering import MinimalNavFilter

RAW_CANDIDATES = [
	"data/rawdata/raw_data.json",
	"data/rawdata/2025-02-23-serial-10970-flight-0000-via-12064.json",
	"data/rawdata/FC1_DATA_LOG05.json",
]

# Normalize required fields from raw JSON for filter input.
def _coalesce_value(row, keys):
	for key in keys:
		if key in row and row.get(key) is not None:
			return row.get(key)
	return None


def _coalesce_float(row, keys, default=0.0):
	value = _coalesce_value(row, keys)
	if value is None:
		return default
	try:
		return float(value)
	except (TypeError, ValueError):
		return default


def _coalesce_int(row, keys, default=0):
	value = _coalesce_value(row, keys)
	if value is None:
		return default
	try:
		return int(float(value))
	except (TypeError, ValueError):
		return default


def raw_data_converter(raw_data):
	result = []
	for row in raw_data:
		course_value = _coalesce_value(row, ["course", "track", "heading"])
		speed_value = _coalesce_value(row, ["speed", "gps_speed", "ground_speed", "spd"])
		time_value = _coalesce_value(row, ["time", "current_time"])
		try:
			time_f = float(time_value)
		except (TypeError, ValueError):
			time_f = 0.0
		if "current_time" in row and "time" not in row:
			time_f /= 1000.0
		new_row = {
			"time": time_f,
			# Acceleration
			"accel_x": _coalesce_float(row, ["accel_x", "ax"], 0.0),
			"accel_y": _coalesce_float(row, ["accel_y", "ay"], 0.0),
			"accel_z": _coalesce_float(row, ["accel_z", "az"], 0.0),
			# Gyroscope
			"gyro_roll": _coalesce_float(row, ["gyro_roll", "gx"], 0.0),
			"gyro_pitch": _coalesce_float(row, ["gyro_pitch", "gy"], 0.0),
			"gyro_yaw": _coalesce_float(row, ["gyro_yaw", "gz"], 0.0),
			# Magnetometer
			"mag_x": _coalesce_float(row, ["mag_x", "mx"], 0.0),
			"mag_y": _coalesce_float(row, ["mag_y", "my"], 0.0),
			"mag_z": _coalesce_float(row, ["mag_z", "mz"], 0.0),
			# GPS position (None if missing)
			"latitude": _coalesce_value(row, ["latitude", "lat"]),
			"longitude": _coalesce_value(row, ["longitude", "lon", "lng"]),
			# GPS speed/course (keep None if missing)
			"speed": speed_value,
			"course": course_value,
			# Keep barometric/GPS altitude separately
			"baro_altitude": _coalesce_float(row, ["altitude", "abs_alt", "rel_alt"], 0.0),
			"gps_altitude": _coalesce_float(row, ["altitude.1", "gps_altitude"], 0.0),
			# For compatibility with existing filter logic
			"altitude": _coalesce_float(row, ["altitude", "abs_alt", "rel_alt"], 0.0),
			# Satellite count (0 if missing)
			"nsat": _coalesce_int(row, ["nsat", "sat_count"], 0),
			# GPS quality
			"hdop": _coalesce_float(row, ["hdop"], 99.0),
			"vdop": _coalesce_float(row, ["vdop"], 99.0),
			"state_name": str(_coalesce_value(row, ["state_name", "state"]) or "").strip(),
		}
		result.append(new_row)
	return result

raw_path = None
for candidate in RAW_CANDIDATES:
	if os.path.exists(candidate):
		raw_path = candidate
		break
if raw_path is None:
	raise FileNotFoundError(f"Cannot find raw input json. Tried: {RAW_CANDIDATES}")

raw_data = json.load(open(raw_path, "r", encoding="utf-8"))
raw_converted_data = raw_data_converter(raw_data)

filtered_data = MinimalNavFilter().process_records(raw_converted_data)

json.dump(filtered_data, open("data/filtereddata/filtered_data.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)