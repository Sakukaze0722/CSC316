"""
Parse all demos to extract Vitality grenade throw + landing trajectories.
Outputs a single JSON file: data/processed/grenade_trajectories.json
"""
import os
import json
from pathlib import Path
from demoparser2 import DemoParser
import pandas as pd

RAW_DIR = Path(r"C:\Users\Nemo\CSC316-1\data\raw")
OUT_PATH = Path(r"C:\Users\Nemo\CSC316-1\data\processed\grenade_trajectories.json")
META_PATH = Path(r"C:\Users\Nemo\CSC316-1\data\maps\map_metadata.json")

# Known Vitality roster for BLAST Austin Major 2025
VITALITY_PLAYERS = {"apEX", "ZywOo", "flameZ", "mezii", "Mzinho"}

# All demos to parse: (folder, filename, match_label)
DEMOS = [
    ("blasttv-austin-major-2025-mouz-vs-vitality-bo3-pYxpz34IEN-t8y4DgB-MSD",
     "mouz-vs-vitality-m1-mirage.dem", "vs MOUZ"),
    ("blasttv-austin-major-2025-mouz-vs-vitality-bo3-pYxpz34IEN-t8y4DgB-MSD",
     "mouz-vs-vitality-m2-inferno.dem", "vs MOUZ"),
    ("blasttv-austin-major-2025-mouz-vs-vitality-bo3-pYxpz34IEN-t8y4DgB-MSD",
     "mouz-vs-vitality-m3-train.dem", "vs MOUZ"),
    ("blasttv-austin-major-2025-natus-vincere-vs-vitality-bo3-D2GHSXPY280Fxfg3mxzNtx",
     "natus-vincere-vs-vitality-m1-mirage.dem", "vs NAVI"),
    ("blasttv-austin-major-2025-virtuspro-vs-vitality-bo3-8Ft8K1evi_LZ8kW_kkrYdB",
     "virtus-pro-vs-vitality-m1-train.dem", "vs VP"),
    ("blasttv-austin-major-2025-virtuspro-vs-vitality-bo3-8Ft8K1evi_LZ8kW_kkrYdB",
     "virtus-pro-vs-vitality-m2-dust2.dem", "vs VP"),
    ("blasttv-austin-major-2025-vitality-vs-mongolz",
     "vitality-vs-the-mongolz-m1-mirage.dem", "vs MongolZ"),
    ("blasttv-austin-major-2025-vitality-vs-mongolz",
     "vitality-vs-the-mongolz-m2-dust2.dem", "vs MongolZ"),
    ("blasttv-austin-major-2025-vitality-vs-mongolz",
     "vitality-vs-the-mongolz-m3-inferno.dem", "vs MongolZ"),
    ("blasttv-austin-major-2025-vitality-vs-nemiga-dust2-F0_F6LVqwv3B66oDRDL3l0",
     "vitality-vs-nemiga-dust2.dem", "vs Nemiga"),
]

# Weapon to detonation event mapping
WEAPON_TO_DET = {
    "smokegrenade": "smokegrenade_detonate",
    "flashbang": "flashbang_detonate",
    "hegrenade": "hegrenade_detonate",
    "molotov": "inferno_startburn",
    "incgrenade": "inferno_startburn",
}

# Grenade type normalization for visualization
WEAPON_TO_TYPE = {
    "smokegrenade": "smoke",
    "flashbang": "flash",
    "hegrenade": "he",
    "molotov": "molotov",
    "incgrenade": "molotov",
}

HALFTIME_ROUND = 12


def get_map_name(demo_path):
    """Extract map name from demo header."""
    parser = DemoParser(str(demo_path))
    header = parser.parse_header()
    return header.get("map_name", "unknown")


def parse_demo_grenades(demo_path, match_label):
    """Parse a single demo and return list of grenade trajectory dicts."""
    parser = DemoParser(str(demo_path))
    header = parser.parse_header()
    map_name = header.get("map_name", "unknown")
    print(f"  Map: {map_name}, Match: {match_label}")

    # Parse grenade_thrown
    try:
        thrown_df = parser.parse_event(
            "grenade_thrown",
            player=["X", "Y", "Z", "team_name"],
            other=["total_rounds_played"]
        )
    except Exception as e:
        print(f"    Error parsing grenade_thrown: {e}")
        return [], map_name

    # Filter Vitality players only
    vit_thrown = thrown_df[thrown_df["user_name"].isin(VITALITY_PLAYERS)].copy()
    print(f"    Vitality throws: {len(vit_thrown)} / {len(thrown_df)} total")

    # Parse all detonation events
    det_dfs = {}
    for det_event in ["smokegrenade_detonate", "flashbang_detonate",
                      "hegrenade_detonate", "inferno_startburn"]:
        try:
            df = parser.parse_event(
                det_event,
                player=["X", "Y", "Z", "team_name"],
                other=["total_rounds_played"]
            )
            det_dfs[det_event] = df
            print(f"    {det_event}: {len(df)} events")
        except Exception as e:
            print(f"    {det_event}: Error - {e}")
            det_dfs[det_event] = pd.DataFrame()

    trajectories = []

    for _, throw in vit_thrown.iterrows():
        weapon = throw.get("weapon", "")
        if weapon not in WEAPON_TO_DET:
            continue

        det_event = WEAPON_TO_DET[weapon]
        grenade_type = WEAPON_TO_TYPE[weapon]
        det_df = det_dfs.get(det_event, pd.DataFrame())

        if det_df.empty:
            continue

        # Find matching detonation: same player, tick > throw tick
        player_name = throw["user_name"]
        throw_tick = throw["tick"]
        throw_round = throw["total_rounds_played"]

        candidates = det_df[
            (det_df["user_name"] == player_name) &
            (det_df["tick"] > throw_tick) &
            (det_df["total_rounds_played"] == throw_round)
        ]

        if candidates.empty:
            # Relax: same player, next tick after throw (any round)
            candidates = det_df[
                (det_df["user_name"] == player_name) &
                (det_df["tick"] > throw_tick)
            ]
            if not candidates.empty:
                candidates = candidates.iloc[:1]

        if candidates.empty:
            continue

        # Take the closest detonation
        det = candidates.iloc[
            (candidates["tick"] - throw_tick).abs().argmin()
        ] if len(candidates) > 1 else candidates.iloc[0]

        # Determine side: CT or T
        side = throw.get("user_team_name", "")
        if side == "TERRORIST":
            side = "T"

        trajectories.append({
            "throw_x": float(throw["user_X"]),
            "throw_y": float(throw["user_Y"]),
            "land_x": float(det["x"]),
            "land_y": float(det["y"]),
            "type": grenade_type,
            "side": side,
            "player": player_name,
            "round": int(throw_round),
            "match": match_label,
            "tick": int(throw_tick),
        })

    print(f"    Matched trajectories: {len(trajectories)}")
    return trajectories, map_name


def main():
    # Load map metadata for coordinate conversion
    with open(META_PATH) as f:
        map_meta = json.load(f)

    # Result: {map_name: [trajectories]}
    result = {}

    for folder, filename, match_label in DEMOS:
        demo_path = RAW_DIR / folder / filename
        if not demo_path.exists():
            print(f"SKIP (not found): {demo_path}")
            continue

        print(f"\nParsing: {filename}")
        trajs, map_name = parse_demo_grenades(demo_path, match_label)

        if map_name not in result:
            result[map_name] = []
        result[map_name].extend(trajs)

    # Convert game coordinates to pixel coordinates (1024x1024 radar image)
    IMG_SIZE = 1024
    for map_name, trajs in result.items():
        meta = map_meta.get(map_name, None)
        if meta is None:
            print(f"WARNING: No metadata for {map_name}, skipping coordinate conversion")
            continue

        pos_x = meta["pos_x"]
        pos_y = meta["pos_y"]
        scale = meta["scale"]

        for t in trajs:
            t["throw_px"] = round((t["throw_x"] - pos_x) / scale, 2)
            t["throw_py"] = round((pos_y - t["throw_y"]) / scale, 2)
            t["land_px"] = round((t["land_x"] - pos_x) / scale, 2)
            t["land_py"] = round((pos_y - t["land_y"]) / scale, 2)

        print(f"\n{map_name}: {len(trajs)} trajectories")

    # Summary
    print("\n=== Summary ===")
    total = 0
    map_info = {}
    for map_name, trajs in result.items():
        matches = sorted(set(t["match"] for t in trajs))
        types = {}
        sides = {"CT": 0, "T": 0}
        for t in trajs:
            types[t["type"]] = types.get(t["type"], 0) + 1
            sides[t["side"]] = sides.get(t["side"], 0) + 1
        print(f"  {map_name}: {len(trajs)} trajectories, matches: {matches}")
        print(f"    Types: {types}")
        print(f"    Sides: {sides}")
        total += len(trajs)
        map_info[map_name] = {
            "matches": matches,
            "count": len(trajs)
        }

    print(f"\n  Total: {total} trajectories")

    # Build output JSON
    output = {
        "maps": {},
        "map_meta": map_meta,
    }

    for map_name, trajs in result.items():
        matches = sorted(set(t["match"] for t in trajs))
        output["maps"][map_name] = {
            "matches": matches,
            "trajectories": trajs,
        }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(output, f)
    print(f"\nSaved to {OUT_PATH} ({OUT_PATH.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
