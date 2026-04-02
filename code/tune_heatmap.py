"""
Interactive heatmap + spawn-mask tuner.

Usage:  python code/tune_heatmap.py

Sliders:
  - Gamma / Sigma          — heatmap rendering params
  - Spawn Early Ticks      — how many of the earliest sampled ticks per round
                             define "spawn" positions (0 = no spawn removal)
  - Spawn Min Hits         — a cell must appear in at least this many rounds
                             to be considered spawn
  - Spawn Dilation         — how many pixels to expand the spawn mask
  - Show Mask              — toggle red overlay showing which cells are masked

Radio buttons let you pick map and view.
"""
import numpy as np
import pandas as pd
from scipy.ndimage import gaussian_filter, binary_dilation
from PIL import Image
import matplotlib.pyplot as plt
from matplotlib.widgets import Slider, RadioButtons, CheckButtons

# ── Config ──
TICK_DIR = r"C:\Users\Nemo\csgo_dp\data\processed"
MAP_IMG_DIR = r"C:\Users\Nemo\CSC316-1\data\maps"

MAP_META = {
    "de_mirage":  {"pos_x": -3230, "pos_y": 1713, "scale": 5.00},
    "de_dust2":   {"pos_x": -2476, "pos_y": 3239, "scale": 4.4},
    "de_inferno": {"pos_x": -2087, "pos_y": 3870, "scale": 4.9},
}

HALFTIME_ROUND = 12
TICK_RATE = 64
GRID_BINS = 256

CT_STOPS = np.array([
    [0, 0, 0, 0],
    [77, 195, 247, 50],
    [51, 153, 230, 120],
    [26, 102, 217, 180],
    [13, 51, 204, 230],
], dtype=np.float64)

T_STOPS = np.array([
    [0, 0, 0, 0],
    [255, 255, 0, 50],
    [255, 179, 0, 120],
    [255, 102, 0, 180],
    [255, 26, 0, 230],
], dtype=np.float64)


def game_to_pixel(x, y, meta):
    px = (x - meta["pos_x"]) / meta["scale"]
    py = (meta["pos_y"] - y) / meta["scale"]
    return px, py


def build_map_mask(map_name):
    img_path = f"{MAP_IMG_DIR}/{map_name}.png"
    img = Image.open(img_path).convert("RGBA")
    img_small = img.resize((GRID_BINS, GRID_BINS), Image.LANCZOS)
    arr = np.array(img_small)
    alpha = arr[:, :, 3].astype(float)
    brightness = (arr[:, :, 0].astype(float) * 0.299 +
                  arr[:, :, 1].astype(float) * 0.587 +
                  arr[:, :, 2].astype(float) * 0.114)
    mask = ((alpha > 30) & (brightness > 15)).astype(np.float64)
    mask = binary_dilation(mask, iterations=3).astype(np.float64)
    return mask


def grid_to_rgba(grid, stops, gamma):
    h, w = grid.shape
    maxv = grid.max()
    if maxv == 0:
        maxv = 1
    n = len(stops) - 1
    t = np.clip((grid / maxv) ** gamma, 0, 1)
    scaled = t * n
    idx = np.clip(np.floor(scaled).astype(int), 0, n - 1)
    frac = scaled - idx
    lo = stops[idx]
    hi = stops[np.clip(idx + 1, 0, n)]
    rgba_f = lo + (hi - lo) * frac[..., np.newaxis]
    rgba = np.clip(rgba_f, 0, 255).astype(np.uint8)
    rgba[grid <= 0] = 0
    return rgba


def load_data(map_name):
    meta = MAP_META[map_name]
    parquet_path = f"{TICK_DIR}/{map_name}/ticks_sampled.parquet"
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
    return df


def build_cumulative_grid(df, team, side):
    view_df = df[(df["team_label"] == team) & (df["side"] == side)]
    rounds = sorted(df["total_rounds_played"].unique())
    cumulative = np.zeros((GRID_BINS, GRID_BINS), dtype=np.float64)
    for rnd in rounds:
        rnd_data = view_df[view_df["total_rounds_played"] == rnd]
        if len(rnd_data) < 2:
            continue
        rnd_grid, _, _ = np.histogram2d(
            rnd_data["px"].values, rnd_data["py"].values,
            bins=GRID_BINS, range=[[0, 1024], [0, 1024]]
        )
        cumulative += rnd_grid.T
    return cumulative


def build_spawn_grid(side_df, rounds, early_n):
    """Per-round spawn histogram using the first `early_n` sampled ticks."""
    if early_n <= 0:
        return np.zeros((GRID_BINS, GRID_BINS), dtype=np.float64)
    sx, sy = [], []
    for rnd in rounds:
        rd = side_df[side_df["total_rounds_played"] == rnd]
        if len(rd) == 0:
            continue
        ticks = sorted(rd["tick"].unique())
        early = set(ticks[:early_n])
        ed = rd[rd["tick"].isin(early)]
        if len(ed) == 0:
            continue
        sx.extend(ed["px"].values)
        sy.extend(ed["py"].values)
    if not sx:
        return np.zeros((GRID_BINS, GRID_BINS), dtype=np.float64)
    g, _, _ = np.histogram2d(
        np.array(sx), np.array(sy),
        bins=GRID_BINS, range=[[0, 1024], [0, 1024]]
    )
    return g.T


def build_spawn_mask(spawn_grid, min_hits, dilation):
    mask = (spawn_grid >= max(1, min_hits)).astype(np.float64)
    if dilation > 0:
        mask = binary_dilation(mask, iterations=int(dilation)).astype(np.float64)
    return mask


def main():
    print("Loading map data...")
    map_data = {}
    map_masks = {}
    radar_imgs = {}
    for mn in MAP_META:
        map_data[mn] = load_data(mn)
        map_masks[mn] = build_map_mask(mn)
        radar_img = Image.open(f"{MAP_IMG_DIR}/{mn}.png").convert("RGBA")
        radar_imgs[mn] = np.array(radar_img.resize((GRID_BINS, GRID_BINS), Image.LANCZOS))
    print("Done loading.\n")

    print("Building cumulative grids (no freeze skip)...")
    grids = {}
    spawn_grids_cache = {}
    views = [("vitality", "ct"), ("vitality", "t"),
             ("mongolz", "ct"), ("mongolz", "t")]
    for mn in MAP_META:
        rounds = sorted(map_data[mn]["total_rounds_played"].unique())
        for team, side in views:
            key = f"{mn}_{team}_{side}"
            grids[key] = build_cumulative_grid(map_data[mn], team, side)
            print(f"  {key}: max={grids[key].max():.0f}")
        # Pre-cache per-side spawn grids for various early_n values
        for side_key in ["ct", "t"]:
            sdf = map_data[mn][map_data[mn]["side"] == side_key]
            cache_key = f"{mn}_{side_key}"
            spawn_grids_cache[cache_key] = {}
            for en in range(0, 21):
                spawn_grids_cache[cache_key][en] = build_spawn_grid(sdf, rounds, en)
    print("Done.\n")

    state = {"map": "de_mirage", "team": "vitality", "side": "ct", "show_mask": False}

    def get_key():
        return f"{state['map']}_{state['team']}_{state['side']}"

    fig, ax = plt.subplots(1, 1, figsize=(8, 10))
    plt.subplots_adjust(left=0.08, right=0.92, bottom=0.38, top=0.95)

    def render(gamma, sigma, early_n, min_hits, dilation):
        key = get_key()
        raw = grids[key]
        map_mask = map_masks[state["map"]]
        stops = CT_STOPS if state["side"] == "ct" else T_STOPS

        # Build spawn mask
        sg = spawn_grids_cache[f"{state['map']}_{state['side']}"][int(early_n)]
        smask = build_spawn_mask(sg, min_hits, dilation)
        effective_mask = map_mask * (1.0 - smask)

        smoothed = gaussian_filter(raw, sigma=sigma) * effective_mask
        rgba = grid_to_rgba(smoothed, stops, gamma)

        # Composite onto radar
        radar = radar_imgs[state["map"]].copy().astype(np.float64)
        heat = rgba.astype(np.float64)
        ha = heat[:, :, 3:4] / 255.0
        comp = radar.copy()
        comp[:, :, :3] = radar[:, :, :3] * (1 - ha) + heat[:, :, :3] * ha
        comp[:, :, 3] = np.clip(radar[:, :, 3] + heat[:, :, 3], 0, 255)

        # Optionally overlay spawn mask in red
        if state["show_mask"]:
            red_overlay = np.zeros_like(comp)
            red_overlay[:, :, 0] = 255
            red_overlay[:, :, 3] = smask * 120
            ra = red_overlay[:, :, 3:4] / 255.0
            comp[:, :, :3] = comp[:, :, :3] * (1 - ra) + red_overlay[:, :, :3] * ra
            comp[:, :, 3] = np.clip(comp[:, :, 3] + red_overlay[:, :, 3], 0, 255)

        mask_cells = int(smask.sum())
        return np.clip(comp, 0, 255).astype(np.uint8), mask_cells

    img0, mc0 = render(0.3, 1.5, 2, 2, 2)
    img_display = ax.imshow(img0)
    ax.set_axis_off()
    title = ax.set_title(
        f"{state['map']} | {state['team']}_{state['side']} | "
        f"gamma=0.30 sigma=1.5 | spawn mask: {mc0} cells",
        fontsize=10, fontweight="bold")

    # Sliders
    sl_args = dict(closedmax=True)
    ax_gamma   = plt.axes([0.15, 0.28, 0.65, 0.02])
    ax_sigma   = plt.axes([0.15, 0.24, 0.65, 0.02])
    ax_early   = plt.axes([0.15, 0.20, 0.65, 0.02])
    ax_minhits = plt.axes([0.15, 0.16, 0.65, 0.02])
    ax_dilate  = plt.axes([0.15, 0.12, 0.65, 0.02])

    sl_gamma   = Slider(ax_gamma,   "Gamma",        0.1, 1.5,  valinit=0.3,  valstep=0.05)
    sl_sigma   = Slider(ax_sigma,   "Sigma",        0.5, 10.0, valinit=1.5,  valstep=0.5)
    sl_early   = Slider(ax_early,   "Spawn Ticks",  0,   20,   valinit=2,    valstep=1)
    sl_minhits = Slider(ax_minhits, "Min Hits",     1,   15,   valinit=2,    valstep=1)
    sl_dilate  = Slider(ax_dilate,  "Dilation",     0,   10,   valinit=2,    valstep=1)

    # Checkbox for mask overlay
    ax_check = plt.axes([0.15, 0.07, 0.18, 0.04])
    chk = CheckButtons(ax_check, ["Show Mask"], [False])

    # Radio buttons
    ax_map  = plt.axes([0.02, 0.01, 0.22, 0.06])
    ax_view = plt.axes([0.26, 0.01, 0.42, 0.06])
    radio_map = RadioButtons(ax_map, list(MAP_META.keys()), active=0)
    radio_map.set_label_props({"fontsize": [8] * 3})
    view_labels = ["vitality_ct", "vitality_t", "mongolz_ct", "mongolz_t"]
    radio_view = RadioButtons(ax_view, view_labels, active=0)
    radio_view.set_label_props({"fontsize": [8] * 4})

    def update(_=None):
        g = sl_gamma.val
        s = sl_sigma.val
        en = int(sl_early.val)
        mh = int(sl_minhits.val)
        dl = int(sl_dilate.val)
        img, mc = render(g, s, en, mh, dl)
        img_display.set_data(img)
        title.set_text(
            f"{state['map']} | {state['team']}_{state['side']} | "
            f"gamma={g:.2f} sigma={s:.1f} | "
            f"spawn: ticks={en} min_hits={mh} dilate={dl} => {mc} cells"
        )
        fig.canvas.draw_idle()

    def on_check(label):
        state["show_mask"] = not state["show_mask"]
        update()

    def on_map(label):
        state["map"] = label
        update()

    def on_view(label):
        team, side = label.rsplit("_", 1)
        state["team"] = team
        state["side"] = side
        update()

    sl_gamma.on_changed(update)
    sl_sigma.on_changed(update)
    sl_early.on_changed(update)
    sl_minhits.on_changed(update)
    sl_dilate.on_changed(update)
    chk.on_clicked(on_check)
    radio_map.on_clicked(on_map)
    radio_view.on_clicked(on_view)

    print("=== Spawn Mask Tuner ===")
    print("Adjust 'Spawn Ticks' to control how many early ticks define spawn.")
    print("'Min Hits' = cell must appear in N+ rounds. 'Dilation' = mask expansion.")
    print("Toggle 'Show Mask' to see which cells are being zeroed (red overlay).")
    print("Once you find good values, tell me and I'll update parse_heatmap_timeslice.py.")
    plt.show()


if __name__ == "__main__":
    main()
