import os
import json
import pandas as pd
from demoparser2 import DemoParser

RAW_DIR = r"C:\Users\Nemo\CSC316-1\data\raw"
PROCESSED_DIR = r"C:\Users\Nemo\CSC316-1\data\processed"

DEMOS = {
    "de_mirage": "vitality-vs-the-mongolz-m1-mirage.dem",
    "de_dust2": "vitality-vs-the-mongolz-m2-dust2.dem",
    "de_inferno": "vitality-vs-the-mongolz-m3-inferno.dem",
}

# Tick sampling: keep every Nth tick (original ~64 tick/s, sample to ~2/s)
TICK_SAMPLE_RATE = 32

def parse_demo(map_name, filename):
    demo_path = os.path.join(RAW_DIR, filename)
    print(f"\n{'='*60}")
    print(f"Parsing: {map_name} ({filename})")
    print(f"{'='*60}")
    
    parser = DemoParser(demo_path)
    output = {}
    
    # 1. Parse tick data (player positions) - sampled
    print("  Parsing tick data...")
    tick_fields = ["X", "Y", "Z", "health", "armor", "is_alive", "team_name",
                   "total_rounds_played", "is_warmup_period"]
    ticks_df = parser.parse_ticks(tick_fields)
    
    # Filter out warmup
    if "is_warmup_period" in ticks_df.columns:
        ticks_df = ticks_df[ticks_df["is_warmup_period"] == False]
    
    # Filter alive players only for heatmap
    if "is_alive" in ticks_df.columns:
        ticks_alive = ticks_df[ticks_df["is_alive"] == True]
    else:
        ticks_alive = ticks_df[ticks_df["health"] > 0]
    
    # Sample every Nth tick
    unique_ticks = sorted(ticks_alive["tick"].unique())
    sampled_ticks = set(unique_ticks[::TICK_SAMPLE_RATE])
    ticks_sampled = ticks_alive[ticks_alive["tick"].isin(sampled_ticks)]
    
    print(f"    Total ticks: {len(ticks_df):,} -> Alive: {len(ticks_alive):,} -> Sampled: {len(ticks_sampled):,}")
    output["ticks"] = ticks_sampled
    
    # 2. Parse kill events
    print("  Parsing kill events...")
    kills_df = parser.parse_event("player_death", player=["X", "Y", "Z", "team_name"], 
                                   other=["total_rounds_played"])
    print(f"    Kills: {len(kills_df)}")
    output["kills"] = kills_df
    
    # 3. Parse grenade events
    print("  Parsing grenade events...")
    grenade_events = {}
    
    for event_name in ["smokegrenade_detonate", "flashbang_detonate", 
                       "hegrenade_detonate", "inferno_startburn"]:
        try:
            df = parser.parse_event(event_name, player=["team_name"], 
                                     other=["total_rounds_played"])
            if len(df) > 0:
                grenade_events[event_name] = df
                print(f"    {event_name}: {len(df)} events")
        except Exception as e:
            print(f"    {event_name}: Error - {e}")
    
    output["grenades"] = grenade_events
    
    # 4. Parse grenade_thrown for throw positions
    print("  Parsing grenade throws...")
    try:
        thrown_df = parser.parse_event("grenade_thrown", player=["X", "Y", "Z", "team_name"],
                                       other=["total_rounds_played"])
        print(f"    Grenade throws: {len(thrown_df)}")
        output["grenade_thrown"] = thrown_df
    except Exception as e:
        print(f"    Grenade throws: Error - {e}")
        output["grenade_thrown"] = pd.DataFrame()
    
    # 5. Parse bomb events
    print("  Parsing bomb events...")
    for event_name in ["bomb_planted", "bomb_defused", "bomb_exploded"]:
        try:
            df = parser.parse_event(event_name, player=["X", "Y", "Z"], 
                                     other=["total_rounds_played"])
            output[event_name] = df
            print(f"    {event_name}: {len(df)}")
        except Exception as e:
            print(f"    {event_name}: Error - {e}")
    
    # 6. Parse round events
    print("  Parsing round events...")
    try:
        rounds_df = parser.parse_event("round_end", player=[], other=[])
        output["rounds"] = rounds_df
        print(f"    Rounds: {len(rounds_df)}")
    except Exception as e:
        print(f"    Rounds: Error - {e}")
    
    return output

def save_data(map_name, data):
    map_dir = os.path.join(PROCESSED_DIR, map_name)
    os.makedirs(map_dir, exist_ok=True)
    
    # Save ticks
    ticks_path = os.path.join(map_dir, "ticks_sampled.parquet")
    data["ticks"].to_parquet(ticks_path, index=False)
    print(f"  Saved ticks: {ticks_path} ({len(data['ticks']):,} rows)")
    
    # Save kills
    kills_path = os.path.join(map_dir, "kills.parquet")
    data["kills"].to_parquet(kills_path, index=False)
    print(f"  Saved kills: {kills_path}")
    
    # Save grenades
    for event_name, df in data["grenades"].items():
        path = os.path.join(map_dir, f"{event_name}.parquet")
        df.to_parquet(path, index=False)
        print(f"  Saved {event_name}: {path}")
    
    # Save grenade throws
    if len(data["grenade_thrown"]) > 0:
        path = os.path.join(map_dir, "grenade_thrown.parquet")
        data["grenade_thrown"].to_parquet(path, index=False)
        print(f"  Saved grenade_thrown: {path}")
    
    # Save bomb events
    for event_name in ["bomb_planted", "bomb_defused", "bomb_exploded"]:
        if event_name in data and len(data[event_name]) > 0:
            path = os.path.join(map_dir, f"{event_name}.parquet")
            data[event_name].to_parquet(path, index=False)
            print(f"  Saved {event_name}: {path}")
    
    # Save rounds
    if "rounds" in data:
        path = os.path.join(map_dir, "rounds.parquet")
        data["rounds"].to_parquet(path, index=False)
        print(f"  Saved rounds: {path}")

def main():
    os.makedirs(PROCESSED_DIR, exist_ok=True)
    
    for map_name, filename in DEMOS.items():
        data = parse_demo(map_name, filename)
        
        print(f"\n  Saving processed data for {map_name}...")
        save_data(map_name, data)
    
    print("\n=== ALL DEMOS PARSED SUCCESSFULLY ===")

if __name__ == "__main__":
    main()
