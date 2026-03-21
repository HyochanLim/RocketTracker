import json
import sys, os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from filtering import MinimalNavFilter

raw_data = json.load(open('data/rawdata/FC1_DATA_LOG05.json', 'r')) # 파일 경로는 실제 위치에 맞게 조정

# FC1_DATA_LOG05.json에서 필요한 데이터만 뽑아 새로운 리스트에 저장
def raw_data_converter(raw_data):
	result = []
	for row in raw_data:
		new_row = {
			"time": float(row.get("time", 0.0)),
			# 가속도
			"accel_x": float(row.get("ax", 0.0)),
			"accel_y": float(row.get("ay", 0.0)),
			"accel_z": float(row.get("az", 0.0)),
			# 자이로
			"gyro_roll": float(row.get("gx", 0.0)),
			"gyro_pitch": float(row.get("gy", 0.0)),
			"gyro_yaw": float(row.get("gz", 0.0)),
			# GPS/위치 (없으면 None)
			"latitude": row.get("latitude"),
			"longitude": row.get("longitude"),
			# 고도 (baro)
			"altitude": float(row.get("abs_alt", 0.0)),
			# 위성수 (없으면 0)
			"nsat": int(row.get("nsat", 0)),
		}
		result.append(new_row)
	return result

raw_converted_data = raw_data_converter(raw_data)

filtered_data = MinimalNavFilter().process_records(raw_converted_data)

json.dump(filtered_data, open('data/filtereddata/filtered_data.json', 'w'), ensure_ascii=False, indent=2)