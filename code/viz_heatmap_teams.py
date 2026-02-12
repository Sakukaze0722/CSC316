"""
Generate 4 heatmaps per map showing team movement by side:
  - Vitality as CT, Vitality as T
  - The MongolZ as CT, The MongolZ as T

Uses tick data from csgo_dp project, outputs to CSC316-1/output/heatmaps/
"""
import os
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap, PowerNorm
from PIL import Image
from scipy.ndimage import gaussian_filter

# Data source (csgo_dp has ticks_sampled.parquet)
TICK_DIR = r"C:\Users\Nemo\csgo_dp\data\processed"
MAPS_DIR = r"C:\Users\Nemo\CSC316-1\data\maps"
OUTPUT_DIR = r"C:\Users\Nemo\CSC316-1\output\heatmaps"

MAP_META = {
    "de_mirage":  {"pos_x": -3230, "pos_y": 1713, "scale": 5.00},
    "de_dust2":   {"pos_x": -2476, "pos_y": 3239, "scale": 4.4},
    "de_inferno": {"pos_x": -2087, "pos_y": 3870, "scale": 4.9},
}

MAP_DISPLAY = {
    "de_mirage": "Mirage",
    "de_dust2": "Dust II",
    "de_inferno": "Inferno",
}

# All three maps: Vitality starts CT, MongolZ starts T
# Halftime swap at round 12
HALFTIME_ROUND = 12

def game_to_pixel(x, y, meta):
    px = (x - meta["pos_x"]) / meta["scale"]
    py = (meta["pos_y"] - y) / meta["scale"]
    return px, py

def build_heatmap(px, py, img_w, img_h, bins=512, sigma=6):
    heatmap, _, _ = np.histogram2d(px, py, bins=bins, range=[[0, img_w], [0, img_h]])
    heatmap = heatmap.T
    heatmap = gaussian_filter(heatmap, sigma=sigma)
    return heatmap

# CT colormap (blue)
CT_CMAP = LinearSegmentedColormap.from_list("ct", [
    (0, 0, 0, 0),
    (0.3, 0.76, 0.97, 0.15),
    (0.2, 0.6, 0.9, 0.4),
    (0.1, 0.4, 0.85, 0.65),
    (0.05, 0.2, 0.8, 0.85),
    (0.0, 0.1, 0.6, 0.95),
], N=512)

# T colormap (red/orange)
T_CMAP = LinearSegmentedColormap.from_list("t", [
    (0, 0, 0, 0),
    (1, 1, 0, 0.15),
    (1, 0.7, 0, 0.4),
    (1, 0.4, 0, 0.65),
    (1, 0.1, 0, 0.85),
    (0.8, 0, 0, 0.95),
], N=512)

def generate_heatmaps(map_name):
    meta = MAP_META[map_name]
    radar_img = Image.open(os.path.join(MAPS_DIR, f"{map_name}.png")).convert("RGBA")
    img_w, img_h = radar_img.size

    ticks = pd.read_parquet(os.path.join(TICK_DIR, map_name, "ticks_sampled.parquet"))
    ticks = ticks[ticks["health"] > 0].copy()

    # Determine team identity per tick based on round number
    # Rounds 0-11: Vitality=CT, MongolZ=T
    # Rounds 12+:  Vitality=T, MongolZ=CT
    first_half = ticks["total_rounds_played"] < HALFTIME_ROUND

    # 4 subsets
    subsets = {
        "vitality_ct": ticks[(first_half) & (ticks["team_name"] == "CT")],
        "vitality_t":  ticks[(~first_half) & (ticks["team_name"] == "TERRORIST")],
        "mongolz_ct":  ticks[(~first_half) & (ticks["team_name"] == "CT")],
        "mongolz_t":   ticks[(first_half) & (ticks["team_name"] == "TERRORIST")],
    }

    configs = {
        "vitality_ct": {"title": "Vitality (CT Side)", "cmap": CT_CMAP, "color": "#4fc3f7"},
        "vitality_t":  {"title": "Vitality (T Side)",  "cmap": T_CMAP,  "color": "#ff7043"},
        "mongolz_ct":  {"title": "The MongolZ (CT Side)", "cmap": CT_CMAP, "color": "#4fc3f7"},
        "mongolz_t":   {"title": "The MongolZ (T Side)",  "cmap": T_CMAP,  "color": "#ff7043"},
    }

    for key, data in subsets.items():
        cfg = configs[key]
        px, py = game_to_pixel(data["X"].values, data["Y"].values, meta)
        mask = (px >= 0) & (px < img_w) & (py >= 0) & (py < img_h)
        px, py = px[mask], py[mask]

        heatmap = build_heatmap(px, py, img_w, img_h)

        fig, ax = plt.subplots(1, 1, figsize=(10, 10))
        ax.imshow(radar_img, extent=[0, img_w, img_h, 0], alpha=0.85)
        if heatmap.max() > 0:
            ax.imshow(heatmap, extent=[0, img_w, img_h, 0], cmap=cfg["cmap"],
                      norm=PowerNorm(gamma=0.4, vmin=0, vmax=heatmap.max()),
                      interpolation="bilinear")
        ax.set_title(f"{cfg['title']}\n{MAP_DISPLAY[map_name]} — BLAST.tv Austin Major 2025",
                     fontsize=16, fontweight="bold", color=cfg["color"], pad=12)
        ax.axis("off")
        plt.tight_layout()

        out_path = os.path.join(OUTPUT_DIR, f"{map_name}_{key}.png")
        fig.savefig(out_path, dpi=120, bbox_inches="tight", facecolor="#1a1a1a")
        plt.close(fig)
        print(f"  Saved: {out_path} ({os.path.getsize(out_path) / 1024:.0f} KB)")

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    plt.style.use("dark_background")

    for map_name in ["de_mirage", "de_dust2", "de_inferno"]:
        print(f"\nGenerating heatmaps for {MAP_DISPLAY[map_name]}...")
        generate_heatmaps(map_name)

    print("\n=== ALL HEATMAPS GENERATED ===")

if __name__ == "__main__":
    main()
