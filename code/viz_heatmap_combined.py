"""
Generate combined heatmaps per map:
  1. Vitality (T) + MongolZ (CT) overlaid — second half perspective
  2. Vitality (CT) + MongolZ (T) overlaid — first half perspective

Each image shows both teams' heatmaps on the same radar map.
Output: 6 images (3 maps x 2 combos) -> output/heatmaps_combined/
"""
import os
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap, PowerNorm
from PIL import Image
from scipy.ndimage import gaussian_filter

TICK_DIR = r"C:\Users\Nemo\csgo_dp\data\processed"
MAPS_DIR = r"C:\Users\Nemo\CSC316-1\data\maps"
OUTPUT_DIR = r"C:\Users\Nemo\CSC316-1\output\heatmaps_combined"

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

CT_CMAP = LinearSegmentedColormap.from_list("ct", [
    (0, 0, 0, 0),
    (0.3, 0.76, 0.97, 0.15),
    (0.2, 0.6, 0.9, 0.4),
    (0.1, 0.4, 0.85, 0.65),
    (0.05, 0.2, 0.8, 0.85),
    (0.0, 0.1, 0.6, 0.95),
], N=512)

T_CMAP = LinearSegmentedColormap.from_list("t", [
    (0, 0, 0, 0),
    (1, 1, 0, 0.15),
    (1, 0.7, 0, 0.4),
    (1, 0.4, 0, 0.65),
    (1, 0.1, 0, 0.85),
    (0.8, 0, 0, 0.95),
], N=512)

def generate_combined(map_name):
    meta = MAP_META[map_name]
    radar_img = Image.open(os.path.join(MAPS_DIR, f"{map_name}.png")).convert("RGBA")
    img_w, img_h = radar_img.size

    ticks = pd.read_parquet(os.path.join(TICK_DIR, map_name, "ticks_sampled.parquet"))
    ticks = ticks[ticks["health"] > 0].copy()

    first_half = ticks["total_rounds_played"] < HALFTIME_ROUND

    # Combo 1: Vitality CT + MongolZ T (first half rounds 0-11)
    vitality_ct = ticks[(first_half) & (ticks["team_name"] == "CT")]
    mongolz_t   = ticks[(first_half) & (ticks["team_name"] == "TERRORIST")]

    # Combo 2: Vitality T + MongolZ CT (second half rounds 12+)
    vitality_t  = ticks[(~first_half) & (ticks["team_name"] == "TERRORIST")]
    mongolz_ct  = ticks[(~first_half) & (ticks["team_name"] == "CT")]

    combos = [
        {
            "filename": f"{map_name}_vitality_ct_mongolz_t.png",
            "title": f"Vitality (CT) vs The MongolZ (T)\n{MAP_DISPLAY[map_name]} — 1st Half (Rounds 1-12)",
            "ct_data": vitality_ct,
            "t_data": mongolz_t,
        },
        {
            "filename": f"{map_name}_vitality_t_mongolz_ct.png",
            "title": f"Vitality (T) vs The MongolZ (CT)\n{MAP_DISPLAY[map_name]} — 2nd Half (Rounds 13+)",
            "ct_data": mongolz_ct,
            "t_data": vitality_t,
        },
    ]

    for combo in combos:
        fig, ax = plt.subplots(1, 1, figsize=(12, 12))
        ax.imshow(radar_img, extent=[0, img_w, img_h, 0], alpha=0.85)

        # CT heatmap (blue)
        ct_px, ct_py = game_to_pixel(combo["ct_data"]["X"].values, combo["ct_data"]["Y"].values, meta)
        mask = (ct_px >= 0) & (ct_px < img_w) & (ct_py >= 0) & (ct_py < img_h)
        ct_px, ct_py = ct_px[mask], ct_py[mask]
        ct_hm = build_heatmap(ct_px, ct_py, img_w, img_h)
        if ct_hm.max() > 0:
            ax.imshow(ct_hm, extent=[0, img_w, img_h, 0], cmap=CT_CMAP,
                      norm=PowerNorm(gamma=0.4, vmin=0, vmax=ct_hm.max()),
                      interpolation="bilinear")

        # T heatmap (red/orange)
        t_px, t_py = game_to_pixel(combo["t_data"]["X"].values, combo["t_data"]["Y"].values, meta)
        mask = (t_px >= 0) & (t_px < img_w) & (t_py >= 0) & (t_py < img_h)
        t_px, t_py = t_px[mask], t_py[mask]
        t_hm = build_heatmap(t_px, t_py, img_w, img_h)
        if t_hm.max() > 0:
            ax.imshow(t_hm, extent=[0, img_w, img_h, 0], cmap=T_CMAP,
                      norm=PowerNorm(gamma=0.4, vmin=0, vmax=t_hm.max()),
                      interpolation="bilinear")

        ax.set_title(combo["title"], fontsize=16, fontweight="bold", color="white", pad=12)
        ax.axis("off")
        plt.tight_layout()

        out_path = os.path.join(OUTPUT_DIR, combo["filename"])
        fig.savefig(out_path, dpi=120, bbox_inches="tight", facecolor="#1a1a1a")
        plt.close(fig)
        print(f"  Saved: {out_path} ({os.path.getsize(out_path) / 1024:.0f} KB)")

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    plt.style.use("dark_background")

    for map_name in ["de_mirage", "de_dust2", "de_inferno"]:
        print(f"\nGenerating combined heatmaps for {MAP_DISPLAY[map_name]}...")
        generate_combined(map_name)

    print("\n=== ALL COMBINED HEATMAPS GENERATED ===")

if __name__ == "__main__":
    main()
