#!/usr/bin/env python3
"""
Convert warehouse_amazon.pcd into flat binary files for fast Three.js loading:
1. assets/data/warehouse_points_f32.bin:
   - Header: uint32 pointCount, uint32 hasIntensity
   - Data: Float32Array of positions (x, y, z), then Float32Array of intensities
2. assets/data/warehouse_points_i16.bin:
   - Header: uint32 pointCount, float32 scale (0.01 = 1 cm precision), uint32 hasIntensity
   - Data: Int16Array of positions (x, y, z), then Uint8Array of intensities (0-255)
"""

import os
import sys
import struct

def convert():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pcd_path = os.path.join(base_dir, "assets", "data", "warehouse_amazon.pcd")
    f32_path = os.path.join(base_dir, "assets", "data", "warehouse_points_f32.bin")
    i16_path = os.path.join(base_dir, "assets", "data", "warehouse_points_i16.bin")

    if not os.path.exists(pcd_path):
        print(f"Error: {pcd_path} not found.")
        sys.exit(1)

    print(f"Reading {pcd_path}...")
    with open(pcd_path, "rb") as f:
        header_lines = []
        while True:
            line = f.readline().decode("ascii", errors="ignore").strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            header_lines.append((parts[0], parts[1:]))
            if parts[0] == "DATA":
                break

        header = dict(header_lines)
        num_points = int(header["POINTS"][0])
        fields = [f.lower() for f in header["FIELDS"]]
        print(f"PCD Header: {num_points:,} points | Fields: {fields} | Data mode: {header['DATA'][0]}")

        raw_data = f.read()

    stride = len(fields)
    floats_per_point = stride
    total_floats = num_points * floats_per_point
    raw_floats = struct.unpack(f"<{total_floats}f", raw_data[: total_floats * 4])

    x_idx = fields.index("x") if "x" in fields else 0
    y_idx = fields.index("y") if "y" in fields else 1
    z_idx = fields.index("z") if "z" in fields else 2
    has_i = "intensity" in fields
    i_idx = fields.index("intensity") if has_i else -1

    positions = []
    intensities = []

    for p in range(num_points):
        offset = p * floats_per_point
        x = raw_floats[offset + x_idx]
        y = raw_floats[offset + y_idx]
        z = raw_floats[offset + z_idx]
        intensity = raw_floats[offset + i_idx] if has_i else 0.0

        # Filter out NaN/Inf
        if (x == x and y == y and z == z and
            abs(x) != float('inf') and abs(y) != float('inf') and abs(z) != float('inf')):
            positions.extend([x, y, z])
            if has_i:
                intensities.append(intensity if (intensity == intensity and abs(intensity) != float('inf')) else 0.0)

    valid_points = len(positions) // 3
    print(f"Extracted {valid_points:,} valid points (out of {num_points:,})")

    # 1. Write Float32 Binary File
    print(f"Writing Float32 binary to {f32_path}...")
    with open(f32_path, "wb") as f_out:
        # Header: uint32 pointCount, uint32 hasIntensity (1 or 0)
        f_out.write(struct.pack("<II", valid_points, 1 if has_i else 0))
        # Float32 positions (xyz)
        f_out.write(struct.pack(f"<{len(positions)}f", *positions))
        # Float32 intensities
        if has_i:
            f_out.write(struct.pack(f"<{len(intensities)}f", *intensities))

    f32_size_mb = os.path.getsize(f32_path) / (1024 * 1024)
    print(f"-> Created {f32_path}: {f32_size_mb:.2f} MB")

    # 2. Write Quantized Int16 Binary File (1 cm resolution = scale 0.01)
    scale = 0.01
    print(f"Writing Quantized Int16 binary (scale={scale}m) to {i16_path}...")
    quantized_pos = []
    for val in positions:
        q = int(round(val / scale))
        q = max(-32768, min(32767, q))
        quantized_pos.append(q)

    # Quantize intensity to 0-255 uint8
    quantized_inten = []
    if has_i and intensities:
        max_i = max(intensities) if max(intensities) > 0 else 1.0
        for i_val in intensities:
            norm_i = int(round(max(0.0, min(1.0, i_val / max_i)) * 255.0))
            quantized_inten.append(norm_i)

    with open(i16_path, "wb") as f_out:
        # Header: uint32 pointCount, float32 scale, uint32 hasIntensity
        f_out.write(struct.pack("<IfI", valid_points, scale, 1 if has_i else 0))
        # Int16 positions (xyz)
        f_out.write(struct.pack(f"<{len(quantized_pos)}h", *quantized_pos))
        # Uint8 intensities
        if has_i:
            f_out.write(struct.pack(f"<{len(quantized_inten)}B", *quantized_inten))

    i16_size_mb = os.path.getsize(i16_path) / (1024 * 1024)
    print(f"-> Created {i16_path}: {i16_size_mb:.2f} MB (60% smaller than raw PCD!)")

if __name__ == "__main__":
    convert()
