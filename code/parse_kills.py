"""
Parse all demos to extract Vitality kill lines (attacker → victim positions).
Outputs: data/processed/kill_lines.json
"""
import os
import json
from pathlib import Path
from demoparser2 import DemoParser
import pandas as pd

RAW_DIR = Path(r"C:\Users\Nemo\CSC316-1\data\raw")
OUT_PATH = Path(r"C:\Users\Nemo\CSC316-1\data\processed\kill_lines.json")
META_PATH = Path(r"C:\Users\Nemo\CSC316-1\data\maps\map_metadata.json")

VITALITY_PLAYERS = {"apEX", "ZywOo", "flameZ", "mezii", "Mzinho"}

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

# Weapon classification: weapon_name -> weapon_class
WEAPON_CLASS = {
    # Pistols
    "glock": "pistol", "usp_silencer": "pistol", "hkp2000": "pistol",
    "elite": "pistol", "p250": "pistol", "tec9": "pistol",
    "fiveseven": "pistol", "cz75_auto": "pistol", "deagle": "pistol",
    "revolver": "pistol",
    # SMGs
    "mac10": "smg", "mp9": "smg", "mp7": "smg", "mp5sd": "smg",
    "ump45": "smg", "p90": "smg", "bizon": "smg",
    # Rifles
    "ak47": "rifle", "m4a1": "rifle", "m4a1_silencer": "rifle",
    "galilar": "rifle", "famas": "rifle", "sg556": "rifle",
    "aug": "rifle",
    # Snipers
    "ssg08": "sniper", "awp": "sniper", "scar20": "sniper",
    "g3sg1": "sniper",
    # Machine guns
    "m249": "mg", "negev": "mg",
    # Shotguns
    "nova": "shotgun", "xm1014": "shotgun", "sawedoff": "shotgun",
    "mag7": "shotgun",
    # Knife / other
    "knife": "knife", "knife_t": "knife",
    "hegrenade": "grenade", "molotov": "grenade", "incgrenade": "grenade",
    "inferno": "grenade",
    "planted_c4": "bomb",
}

# Map name extraction from demo filename
MAP_PATTERNS = {
    "mirage": "de_mirage",
    "dust2": "de_dust2",
    "inferno": "de_inferno",
    "train": "de_train",
}


def extract_map_name(filename):
    fn = filename.lower()
    for pattern, map_name in MAP_PATTERNS.items():
        if pattern in fn:
            return map_name
    return None


def game_to_pixel(x, y, meta):
    """Convert in-game coordinates to 1024x1024 pixel coordinates."""
    px = (x - meta["pos_x"]) / meta["scale"]
    py = (meta["pos_y"] - y) / meta["scale"]
    return round(px, 2), round(py, 2)


def parse_demo_kills(folder, filename, match_label, map_meta):
    demo_path = RAW_DIR / folder / filename
    print(f"\nParsing: {filename}")

    parser = DemoParser(str(demo_path))
    map_name = extract_map_name(filename)
    print(f"  Map: {map_name}, Match: {match_label}")

    meta = map_meta.get(map_name)
    if not meta:
        print(f"  WARNING: No metadata for {map_name}, skipping")
        return [], map_name

    # Parse kill events with positions
    df = parser.parse_event(
        "player_death",
        player=["X", "Y", "Z", "team_name"],
        other=["total_rounds_played"],
    )
    print(f"  Total kills: {len(df)}")

    # Filter: attacker must be a Vitality player
    vit_kills = df[df["attacker_name"].isin(VITALITY_PLAYERS)].copy()
    print(f"  Vitality kills: {len(vit_kills)}")

    kills = []
    for _, row in vit_kills.iterrows():
        weapon = row.get("weapon", "")
        wclass = WEAPON_CLASS.get(weapon, "other")

        # Skip non-gun kills (grenades, bomb, world)
        if wclass in ("grenade", "bomb", "other"):
            continue

        attacker_x = row.get("attacker_X")
        attacker_y = row.get("attacker_Y")
        victim_x = row.get("user_X")
        victim_y = row.get("user_Y")

        # Skip if positions are missing
        if pd.isna(attacker_x) or pd.isna(victim_x):
            continue

        # Determine attacker side
        side = row.get("attacker_team_name", "")
        if side == "TERRORIST":
            side = "T"

        att_px, att_py = game_to_pixel(attacker_x, attacker_y, meta)
        vic_px, vic_py = game_to_pixel(victim_x, victim_y, meta)

        kills.append({
            "att_px": att_px,
            "att_py": att_py,
            "vic_px": vic_px,
            "vic_py": vic_py,
            "weapon": weapon,
            "weapon_class": wclass,
            "player": row["attacker_name"],
            "victim": row["user_name"],
            "side": side,
            "headshot": bool(row.get("headshot", False)),
            "round": int(row.get("total_rounds_played", 0)),
            "match": match_label,
            "tick": int(row["tick"]),
        })

    print(f"  Gun kills with positions: {len(kills)}")
    return kills, map_name


def main():
    with open(META_PATH) as f:
        map_meta = json.load(f)

    result = {}

    for folder, filename, match_label in DEMOS:
        kills, map_name = parse_demo_kills(folder, filename, match_label, map_meta)
        if map_name not in result:
            result[map_name] = []
        result[map_name].extend(kills)

    # Build final JSON
    output = {"maps": {}}
    for map_name, kills in sorted(result.items()):
        matches = sorted(set(k["match"] for k in kills))
        weapon_classes = sorted(set(k["weapon_class"] for k in kills))
        players = sorted(set(k["player"] for k in kills))

        output["maps"][map_name] = {
            "kills": kills,
            "matches": matches,
            "weapon_classes": weapon_classes,
            "players": players,
        }

        print(f"\n{map_name}: {len(kills)} kills")

    # Summary
    print("\n=== Summary ===")
    total = 0
    for map_name, data in output["maps"].items():
        kills = data["kills"]
        total += len(kills)
        wc_counts = {}
        for k in kills:
            wc_counts[k["weapon_class"]] = wc_counts.get(k["weapon_class"], 0) + 1
        print(f"  {map_name}: {len(kills)} kills, matches: {data['matches']}")
        print(f"    Weapon classes: {wc_counts}")
        print(f"    Players: {data['players']}")
    print(f"\n  Total: {total} kills")

    # Save
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(output, f)
    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"\nSaved to {OUT_PATH} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
