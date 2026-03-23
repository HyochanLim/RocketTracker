import os
import json

def parse_and_save_raw(input_path, output_path):
    # Parse CSV headers and map data rows.
    parsed_data = []
    with open(input_path, 'r', encoding='utf-8') as f:
        raw_header = [h.strip() for h in f.readline().strip().split(',')]
        # Duplicate header names are disambiguated with suffixes (e.g. altitude, altitude.1).
        seen = {}
        header = []
        for name in raw_header:
            count = seen.get(name, 0)
            header.append(name if count == 0 else f"{name}.{count}")
            seen[name] = count + 1

        for line in f:
            values = [v.strip() for v in line.strip().split(',')]
            if len(values) != len(header):
                continue
            row = {}
            for k, v in zip(header, values):
                # Convert current_time to time (seconds); try float for others.
                if k == 'current_time':
                    try:
                        row['time'] = float(v) / 1000.0
                    except ValueError:
                        row['time'] = v
                else:
                    try:
                        row[k] = float(v)
                    except ValueError:
                        row[k] = v
            parsed_data.append(row)
    # Save as JSON file.
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(parsed_data, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    input_file = os.path.join(base_dir, 'data', 'rawdata', '2025-02-23-serial-10970-flight-0000-via-12064.csv')
    output_file = os.path.join(base_dir, 'data', 'rawdata', '2025-02-23-serial-10970-flight-0000-via-12064.json')
    parse_and_save_raw(input_file, output_file)