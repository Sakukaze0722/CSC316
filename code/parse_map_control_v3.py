"""
Export player positions per frame for client-side Voronoi map control.
Instead of precomputing heavy grids, store lightweight player positions
and let the browser compute + render the control map in real-time.
"""
import os
import json
import numpy as np
import pandas as pd
from demoparser2 import DemoParser

RAW_DIR = r"C:\Users\Nemo\CSC316-1\data\raw"
OUTPUT_DIR = r"C:\Users\Nemo\CSC316-1\output\map_control"

DEMOS = {
    "de_mirage": "vitality-vs-the-mongolz-m1-mirage.dem",
    "de_dust2": "vitality-vs-the-mongolz-m2-dust2.dem",
    "de_inferno": "vitality-vs-the-mongolz-m3-inferno.dem",
}

MAP_META = {
    "de_mirage":  {"pos_x": -3230, "pos_y": 1713, "scale": 5.00},
    "de_dust2":   {"pos_x": -2476, "pos_y": 3239, "scale": 4.4},
    "de_inferno": {"pos_x": -2087, "pos_y": 3870, "scale": 4.9},
}

TICK_INTERVAL = 32   # ~0.5 seconds between frames (4x higher than before)

def game_to_pixel(x, y, meta, img_size=1024):
    px = (x - meta["pos_x"]) / meta["scale"]
    py = (meta["pos_y"] - y) / meta["scale"]
    return round(px, 1), round(py, 1)

def process_map(map_name, filename):
    print(f"\n{'='*50}")
    print(f"Processing {map_name} (lightweight positions)")
    print(f"{'='*50}")
    
    demo_path = os.path.join(RAW_DIR, filename)
    meta = MAP_META[map_name]
    parser = DemoParser(demo_path)
    
    print("  Parsing tick data...")
    ticks = parser.parse_ticks(["X", "Y", "health", "team_name",
                                 "total_rounds_played", "is_warmup_period"])
    ticks = ticks[ticks["is_warmup_period"] == False]
    
    print("  Loading kill events...")
    kills_path = os.path.join(r"C:\Users\Nemo\CSC316-1\data\processed", map_name, "kills.parquet")
    kills = pd.read_parquet(kills_path)
    
    rounds = sorted(ticks["total_rounds_played"].unique())
    print(f"  Rounds: {len(rounds)}")
    
    map_data = {
        "map": map_name,
        "rounds": {},
    }
    
    total_frames = 0
    
    for rnd in rounds:
        round_ticks = ticks[ticks["total_rounds_played"] == rnd]
        unique_ticks = sorted(round_ticks["tick"].unique())
        sampled_ticks = unique_ticks[::TICK_INTERVAL]
        
        if len(sampled_ticks) == 0:
            continue
        
        round_frames = []
        frame_ticks = []
        prev_positions = None
        frozen_count = 0
        
        for tick_val in sampled_ticks:
            tick_data = round_ticks[round_ticks["tick"] == tick_val]
            
            # Extract alive player positions by team
            ct_pos = []
            t_pos = []
            
            for _, row in tick_data.iterrows():
                if row["health"] <= 0:
                    continue
                px, py = game_to_pixel(row["X"], row["Y"], meta)
                # Skip players outside map bounds
                if px < 0 or px > 1024 or py < 0 or py > 1024:
                    continue
                if row["team_name"] == "CT":
                    ct_pos.append([px, py])
                elif row["team_name"] == "TERRORIST":
                    t_pos.append([px, py])
            
            # Detect freeze/warmup: check if positions changed
            cur_positions = sorted(ct_pos + t_pos)
            if prev_positions is not None and cur_positions == prev_positions:
                frozen_count += 1
                continue  # Skip duplicate frozen frames
            prev_positions = cur_positions
            
            # Compact format: [ct_positions, t_positions]
            round_frames.append([ct_pos, t_pos])
            frame_ticks.append(tick_val)
        
        if len(round_frames) == 0:
            continue
        
        # Trim stale frames from previous round at the start.
        # For rounds > 0, the first ~14 frames show survivors from the
        # previous round before all 10 players respawn at freeze time.
        trim_count = 0
        if rnd > 0:
            trim_idx = 0
            for fi, (ct_p, t_p) in enumerate(round_frames):
                if len(ct_p) >= 5 and len(t_p) >= 5:
                    trim_idx = fi
                    break
            if trim_idx > 0:
                trim_count = trim_idx
                round_frames = round_frames[trim_idx:]
                frame_ticks = frame_ticks[trim_idx:]
        
        if len(round_frames) == 0:
            continue
        
        # Extract kills for this round and map to frame index
        round_kills_raw = kills[kills["total_rounds_played"] == rnd]
        round_kill_list = []
        for _, krow in round_kills_raw.iterrows():
            kill_tick = krow["tick"]
            # Find which frame this kill belongs to (last frame with tick <= kill_tick)
            frame_idx = 0
            for fi, ft in enumerate(frame_ticks):
                if ft <= kill_tick:
                    frame_idx = fi
                else:
                    break
            # Victim position
            try:
                vx = float(krow["user_X"])
                vy = float(krow["user_Y"])
            except (ValueError, TypeError):
                continue
            if pd.isna(vx) or pd.isna(vy):
                continue
            px, py = game_to_pixel(vx, vy, meta)
            if px < 0 or px > 1024 or py < 0 or py > 1024:
                continue
            # Victim team
            vteam = "CT" if krow.get("user_team_name", "") == "CT" else "T"
            round_kill_list.append([frame_idx, round(px, 1), round(py, 1), vteam])
        
        map_data["rounds"][str(rnd)] = {
            "frames": round_frames,
            "kills": round_kill_list,
        }
        total_frames += len(round_frames)
        skipped_msg = f" (skipped {frozen_count} frozen)" if frozen_count > 0 else ""
        trim_msg = f" (trimmed {trim_count} stale)" if trim_count > 0 else ""
        print(f"    Round {rnd}: {len(round_frames)} frames, {len(round_kill_list)} kills{skipped_msg}{trim_msg}, "
              f"sample: CT={len(round_frames[0][0])} T={len(round_frames[0][1])} alive")
    
    print(f"  Total frames: {total_frames}")
    return map_data

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    for map_name, filename in DEMOS.items():
        map_data = process_map(map_name, filename)
        
        out_path = os.path.join(OUTPUT_DIR, f"{map_name}_control.json")
        with open(out_path, "w") as f:
            json.dump(map_data, f, separators=(",", ":"))
        
        size_kb = os.path.getsize(out_path) / 1024
        print(f"  Saved: {out_path} ({size_kb:.0f} KB)")
    
    print("\n=== DONE ===")

if __name__ == "__main__":
    main()
