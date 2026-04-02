# CSC316 Esports Data Visualization — Five-Color Squad

## Overview

This project is a single-page **esports analytics dashboard** that works at two scales:

- **Macro:** An interactive world map compares how professional talent is distributed across regions for **Counter-Strike** (real roster statistics) and **Dota 2** (illustrative regional metrics for contrast).
- **Micro:** Match-level **Counter-Strike 2** views explore spatial control, movement, utility, and kills using data from the **BLAST.tv Austin Major 2025** grand final (**Vitality vs The MongolZ**).

Together, these views connect global player ecosystems to concrete in-round tactics.

## Team Members

- **Xiaowu Wu** — mika.wu@mail.utoronto.ca  
- **Ruike Hou** — ruike.hou@mail.utoronto.ca  
- **Tianyi Mao** — tianyi.mao@mail.utoronto.ca  
- **Yiding Jin** — yiding.jin@mail.utoronto.ca  
- **Yihan Wang** — yihanwang.wang@mail.utoronto.ca  

## Process Book

[Process book (Google Doc)](https://docs.google.com/document/d/1NKH5xZR5wIj18D-olm01dzN4KouP6KCWZSJSmoghnYo/edit?tab=t.811dyplrep1e#heading=h.1em731hdludi)

## Data Sources

| Source | Role in the project |
|--------|---------------------|
| [HLTV — Vitality vs The MongolZ, BLAST.tv Austin Major 2025](https://www.hltv.org/matches/2382619/vitality-vs-the-mongolz-blasttv-austin-major-2025) | Reference match for map control, heatmaps, utility trajectories, and kill vectors. |
| `data/player_data_csgo/hltv_playerStats-complete.csv` | Country-level CS pro statistics (nick, country, teams, maps/rounds, K/D, rating, per-round stats, etc.) for the **world map** and **player modal**. |
| `data/processed/*.json` | Precomputed grenade trajectories and kill lines for canvas visualizations. |
| `output/map_control/`, `output/heatmaps_combined/` | Pre-rendered radar assets and heatmap images from Python pipelines. |
| `data/player_data_dota2/` | Dota 2 roster / player CSVs and related JSON for optional Dota-facing work. |

Demo parsing and visualization scripts live under `code/` (e.g. `parse_demos.py`, `parse_map_control_v3.py`, `viz_heatmap_combined.py`).

## Project Structure

```
CSC316/
├── index.html                 # Main SPA: world map + all CS2 visualizations
├── eco_board.html             # Standalone economy board (if used in your branch)
├── css/
│   ├── style.css              # Vis blocks, map control, heatmaps, utilities, kill vectors
│   ├── dashboard.css          # World map layout, detail panel, modals, theme
│   └── eco_board.css          # Economy board styling
├── js/
│   ├── dashboard.js           # D3 world map, CS/Dota toggle, player CSV, club ↔ map linking
│   ├── main.js                # Map control, heatmaps, utility lanes, kill vectors
│   └── eco_board.js           # Economy board logic
├── data/
│   ├── player_data_csgo/      # HLTV-style player stats CSV
│   ├── player_data_dota2/     # Dota 2 datasets
│   ├── maps/                  # Radar images + metadata
│   └── processed/             # JSON for front-end vis (grenades, kills, …)
├── output/                    # Generated map control frames + heatmap PNGs
├── assets/                    # Weapon / UI images
├── code/                      # Python: demo parse, heatmaps, map downloads
└── README.md
```

## Features

### 1. Esports World Map (D3 + TopoJSON)

- Pan and zoom the map; pick **Counter-Strike** or **Dota 2**.
- **CS mode:** Choropleth-style emphasis by player count; click a country for KPIs, sparkline, searchable/sortable player list, and per-player modal (radar + impact bars). **Club chips** show which organizations appear in that country; hovering highlights all countries where that club appears in the dataset; clicking filters the list to players whose primary listed team matches.
- **Dota 2 mode:** Stylized regional metrics for narrative contrast (not driven by the same CSV pipeline as CS).
- **Top Countries** drawer, achievements for explored countries, day/night theme, optional UI sounds.

### 2. CS2 Map Control & Heatmaps

- Round-by-round **territorial control** on Mirage / Dust II / Inferno using a **Voronoi nearest-player** model over precomputed frames.
- **Combined team movement heatmaps** (Vitality vs MongolZ) per map.

### 3. Utility Lane Evolution

- Animated grenade arcs (throw → land) on radar, with filters by map, side, match, type, and player.

### 4. Kill Vector Field

- Sequential “laser” traces from attacker to victim death location, filterable by map, side, player, and weapon class.

### 5. Story

- Scroll-linked story cards anchor the narrative for the course deliverable.

## Libraries & APIs

- [D3.js v7](https://d3js.org/) — world map, paths, scales, CSV.  
- [TopoJSON Client v3](https://github.com/topojson/topojson-client) — world atlas features.  
- World atlas served from [world-atlas on jsDelivr](https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json).  
- Optional live enrichment from `hltv-api.vercel.app` (may fail offline or behind strict CORS); core CS stats always come from the bundled CSV.

## Non-Obvious Behavior

- **Always use a local HTTP server** for `index.html`. Opening the file as `file://` will block `fetch` for the player CSV and break CS map data.
- **CS “current team” in the modal** is inferred as the **first** team string in the CSV `teams` list for consistent grouping; the same rule drives club aggregation in the country panel.
- **Dota 2** map styling does not use `hltv_playerStats-complete.csv`; keep modes mentally separate when demoing.

## How to Run Locally

1. Clone the repository and `cd` into the project root.

2. Start a static server (macOS often provides `python3` but not `python`):

   ```bash
   python3 -m http.server 8000
   ```

3. Open **http://localhost:8000/index.html** in your browser.

If you use another port, replace `8000` accordingly.

## Acknowledgments

- [HLTV](https://www.hltv.org/) for match pages and public-facing player statistics culture that informed our CS dataset design.  
- [Natural Earth / world-atlas](https://github.com/topojson/world-atlas) for lightweight world geography.  
- Course staff and teammates for feedback on visualization narrative and implementation.
