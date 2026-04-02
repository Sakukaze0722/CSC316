"""
Generate per-round CUMULATIVE heatmap data for animated heatmaps.

Each "frame" represents the heatmap after round N, containing the
accumulated player presence from rounds 0..N.  The browser plays
these frames sequentially with cross-fade transitions so the heatmap
grows organically — just like watching the match unfold.

Output is a smoothed (Gaussian-blurred) density grid stored as a
PNG-encoded base64 image per frame so the browser can render it at
full resolution with no blocky pixels.

Spawn positions are suppressed by skipping the first FREEZE_SKIP
seconds of each round.
"""
import os, json, base64, io
import numpy as np
import pandas as pd
from scipy.ndimage import gaussian_filter, binary_dilation
from PIL import Image

TICK_DIR = r"C:\Users\Nemo\csgo_dp\data\processed"
OUTPUT_DIR = r"C:\Users\Nemo\CSC316-1\data\processed"

MAP_META = {
    "de_mirage":  {"pos_x": -3230, "pos_y": 1713, "scale": 5.00},
    "de_dust2":   {"pos_x": -2476, "pos_y": 3239, "scale": 4.4},
    "de_inferno": {"pos_x": -2087, "pos_y": 3870, "scale": 4.9},
}

HALFTIME_ROUND = 12
TICK_RATE = 64
FREEZE_SKIP_SECONDS = 0

# Density grid resolution (higher = smoother, bigger file)
GRID_BINS = 256
# Gaussian blur sigma (in grid cells) for smooth rendering
SMOOTH_SIGMA = 2.0
# Output image size (pixels) for the PNG frames
# 256px is enough — browser scales up with CSS and the Gaussian blur
# keeps it smooth. Halving from 512 cuts file size ~4x.
IMG_SIZE = 256


# Path to radar map images used to build a playable-area mask
MAP_IMG_DIR = r"C:\Users\Nemo\CSC316-1\data\maps"


def game_to_pixel(x, y, meta, img_size=1024):
    px = (x - meta["pos_x"]) / meta["scale"]
    py = (meta["pos_y"] - y) / meta["scale"]
    return px, py


def build_map_mask(map_name):
    """Load the radar PNG and produce a (GRID_BINS x GRID_BINS) binary mask
    where 1 = playable area (non-black/non-transparent pixels).
    This prevents heatmap glow from bleeding outside the map boundary."""
    img_path = os.path.join(MAP_IMG_DIR, f"{map_name}.png")
    img = Image.open(img_path).convert("RGBA")
    # Resize to grid resolution
    img_small = img.resize((GRID_BINS, GRID_BINS), Image.LANCZOS)
    arr = np.array(img_small)  # (H, W, 4)
    # A pixel is "map" if it has meaningful alpha AND isn't very dark
    alpha = arr[:, :, 3].astype(float)
    brightness = (arr[:, :, 0].astype(float) * 0.299 +
                  arr[:, :, 1].astype(float) * 0.587 +
                  arr[:, :, 2].astype(float) * 0.114)
    mask = ((alpha > 30) & (brightness > 15)).astype(np.float64)
    mask = binary_dilation(mask, iterations=3).astype(np.float64)
    return mask


def build_spawn_mask(side_df, rounds):
    spawn_x = []
    spawn_y = []
    for rnd in rounds:
        rnd_data = side_df[side_df["total_rounds_played"] == rnd]
        if len(rnd_data) == 0:
            continue
        rnd_ticks = sorted(rnd_data["tick"].unique())
        early_ticks = set(rnd_ticks[:2])
        early_data = rnd_data[rnd_data["tick"].isin(early_ticks)]
        if len(early_data) == 0:
            continue
        spawn_x.extend(early_data["px"].values)
        spawn_y.extend(early_data["py"].values)

    if not spawn_x:
        return np.zeros((GRID_BINS, GRID_BINS), dtype=np.float64)

    spawn_grid, _, _ = np.histogram2d(
        np.array(spawn_x),
        np.array(spawn_y),
        bins=GRID_BINS,
        range=[[0, 1024], [0, 1024]]
    )
    spawn_mask = (spawn_grid.T >= 6).astype(np.float64)
    spawn_mask = binary_dilation(spawn_mask, iterations=9).astype(np.float64)
    return spawn_mask


def grid_to_rgba_png(grid, stops_list, gamma=0.45):
    """Convert a 2D density grid into a transparent RGBA PNG (base64).
    Fully vectorized with NumPy for speed."""
    h, w = grid.shape
    maxv = grid.max()
    if maxv == 0:
        maxv = 1

    stops = np.array(stops_list, dtype=np.float64)  # (N, 4)
    n = len(stops) - 1

    # Normalize and apply gamma
    t = np.clip((grid / maxv) ** gamma, 0, 1)  # (h, w)

    # Compute interpolation indices and fractions
    scaled = t * n
    idx = np.clip(np.floor(scaled).astype(int), 0, n - 1)
    frac = scaled - idx  # fractional part

    # Gather stop colors
    lo = stops[idx]            # (h, w, 4)
    hi = stops[np.clip(idx + 1, 0, n)]  # (h, w, 4)
    rgba_f = lo + (hi - lo) * frac[..., np.newaxis]

    rgba = np.clip(rgba_f, 0, 255).astype(np.uint8)

    # Zero out pixels where grid is zero
    mask = grid <= 0
    rgba[mask] = 0

    img = Image.fromarray(rgba, "RGBA")
    img = img.resize((IMG_SIZE, IMG_SIZE), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


# Color stops [R, G, B, A] for CT (blue) and T (red/orange)
CT_STOPS = [
    [0, 0, 0, 0],
    [77, 195, 247, 50],
    [51, 153, 230, 120],
    [26, 102, 217, 180],
    [13, 51, 204, 230],
]
T_STOPS = [
    [0, 0, 0, 0],
    [255, 255, 0, 50],
    [255, 179, 0, 120],
    [255, 102, 0, 180],
    [255, 26, 0, 230],
]


def process_map(map_name):
    meta = MAP_META[map_name]
    parquet_path = os.path.join(TICK_DIR, map_name, "ticks_sampled.parquet")
    print(f"\n{'='*50}")
    print(f"Processing {map_name}")
    print(f"  Reading: {parquet_path}")

    df = pd.read_parquet(parquet_path)
    df = df[df["health"] > 0].copy()

    px_arr, py_arr = game_to_pixel(df["X"].values, df["Y"].values, meta)
    df["px"] = px_arr
    df["py"] = py_arr
    df = df[(df["px"] >= 0) & (df["px"] < 1024) & (df["py"] >= 0) & (df["py"] < 1024)]

    first_half = df["total_rounds_played"] < HALFTIME_ROUND
    df["team_label"] = "unknown"
    df.loc[first_half & (df["team_name"] == "CT"), "team_label"] = "vitality"
    df.loc[first_half & (df["team_name"] == "TERRORIST"), "team_label"] = "mongolz"
    df.loc[~first_half & (df["team_name"] == "TERRORIST"), "team_label"] = "vitality"
    df.loc[~first_half & (df["team_name"] == "CT"), "team_label"] = "mongolz"
    df["side"] = df["team_name"].map({"CT": "ct", "TERRORIST": "t"})

    rounds = sorted(df["total_rounds_played"].unique())
    freeze_skip_ticks = FREEZE_SKIP_SECONDS * TICK_RATE
    print(f"  Rounds: {len(rounds)}, Total rows: {len(df):,}")

    map_mask = build_map_mask(map_name)
    print(f"  Map mask: {map_mask.sum():.0f}/{map_mask.size} cells are playable")
    spawn_masks = {
        "ct": build_spawn_mask(df[df["side"] == "ct"], rounds),
        "t": build_spawn_mask(df[df["side"] == "t"], rounds),
    }
    print(
        f"  Spawn mask: CT={spawn_masks['ct'].sum():.0f} cells, "
        f"T={spawn_masks['t'].sum():.0f} cells"
    )

    views = {
        "vitality_ct": {"team": "vitality", "side": "ct"},
        "vitality_t":  {"team": "vitality", "side": "t"},
        "mongolz_ct":  {"team": "mongolz",  "side": "ct"},
        "mongolz_t":   {"team": "mongolz",  "side": "t"},
    }

    map_result = {
        "map": map_name,
        "num_rounds": len(rounds),
        "round_labels": [int(r) for r in rounds],
        "halftime_round": HALFTIME_ROUND,
        "img_size": IMG_SIZE,
        "views": {},
    }

    for view_name, view_def in views.items():
        team = view_def["team"]
        side = view_def["side"]
        stops = CT_STOPS if side == "ct" else T_STOPS
        effective_mask = map_mask * (1.0 - spawn_masks[side])

        view_df = df[(df["team_label"] == team) & (df["side"] == side)]
        if len(view_df) == 0:
            print(f"  {view_name}: no data, skipping")
            continue

        cumulative_grid = np.zeros((GRID_BINS, GRID_BINS), dtype=np.float64)
        frames = []

        for rnd in rounds:
            rnd_data = view_df[view_df["total_rounds_played"] == rnd]
            if len(rnd_data) == 0:
                smoothed = gaussian_filter(cumulative_grid, sigma=SMOOTH_SIGMA) * effective_mask
                frames.append(grid_to_rgba_png(smoothed, stops, gamma=0.35))
                continue

            rnd_ticks = sorted(rnd_data["tick"].unique())
            if len(rnd_ticks) < 2:
                smoothed = gaussian_filter(cumulative_grid, sigma=SMOOTH_SIGMA) * effective_mask
                frames.append(grid_to_rgba_png(smoothed, stops, gamma=0.35))
                continue

            min_tick = rnd_ticks[0]
            active_start = min_tick + freeze_skip_ticks
            active_data = rnd_data[rnd_data["tick"] >= active_start]

            if len(active_data) < 2:
                smoothed = gaussian_filter(cumulative_grid, sigma=SMOOTH_SIGMA) * effective_mask
                frames.append(grid_to_rgba_png(smoothed, stops, gamma=0.35))
                continue

            rnd_grid, _, _ = np.histogram2d(
                active_data["px"].values,
                active_data["py"].values,
                bins=GRID_BINS,
                range=[[0, 1024], [0, 1024]]
            )
            cumulative_grid += rnd_grid.T

            smoothed = gaussian_filter(cumulative_grid, sigma=SMOOTH_SIGMA) * effective_mask
            frames.append(grid_to_rgba_png(smoothed, stops, gamma=0.35))

        map_result["views"][view_name] = frames
        print(f"  {view_name}: {len(view_df):,} ticks -> {len(frames)} cumulative frames")

    return map_result


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    all_maps = {}
    for map_name in ["de_mirage", "de_dust2", "de_inferno"]:
        result = process_map(map_name)
        all_maps[map_name] = result

    out_path = os.path.join(OUTPUT_DIR, "heatmap_timeslice.json")
    with open(out_path, "w") as f:
        json.dump(all_maps, f, separators=(",", ":"))

    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    print(f"\n  Saved: {out_path} ({size_mb:.2f} MB)")
    print("\n=== DONE ===")


if __name__ == "__main__":
    main()
