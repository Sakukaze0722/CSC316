# CSC316 Esports Data Visualization - Five-Color Squad

## 1) What This Submission Contains

This repository is the final hand-in for a browser-based CS2 data visualization project.  
The main deliverable is a single scrolling site (`index.html`) with five connected views:

1. World map dashboard (country-level pro player distribution)
2. Map control replay (frame-by-frame territory pressure)
3. Team movement heatmap animation
4. Utility lane evolution (throw-to-land trajectories)
5. Kill vector field and round economy analysis board

The project narrative focuses on **Team Vitality vs The MongolZ** in BLAST.tv Austin Major 2025, while the world map view uses broader player-country data.

## 2) Team Members

- Xiaowu Wu - mika.wu@mail.utoronto.ca
- Ruike Hou - ruike.hou@mail.utoronto.ca
- Tianyi Mao - tianyi.mao@mail.utoronto.ca
- Yiding Jin - yiding.jin@mail.utoronto.ca
- Yihan Wang - yihanwang.wang@mail.utoronto.ca

## 3) Project Links (Website + Screencast)

> Replace the placeholder links below with your final submission links before turning in.

- Live project website: [DEPLOYED_URL](https://sakukaze0722.github.io/CSC316/)
- Screencast video: [ADD_VIDEO_URL_HERE](https://youtu.be/ooL0xdgOUvE)
- Process book: [Google Doc](https://docs.google.com/document/d/1NKH5xZR5wIj18D-olm01dzN4KouP6KCWZSJSmoghnYo/edit?tab=t.811dyplrep1e#heading=h.1em731hdludi)

Local run URLs for graders:
- `http://localhost:8000/index.html` (main narrative page)
- `http://localhost:8000/eco_board.html` (standalone economy board)

## 4) Code Ownership and Third-Party Components

### 4.1 Our Team Code (in this repository)

- Front-end app structure and UI: `index.html`, `eco_board.html`
- Front-end logic:
  - `js/dashboard.js` (world map, country panel, player modal, theme/sound state, Dota/CS data wiring)
  - `js/main.js` (map control, heatmap animation, utility lanes, kill vectors)
  - `js/eco_board.js` (round economy board, aftershock highlighting, buy-tier tooltips)
- Styling:
  - `css/style.css`, `css/dashboard.css`, `css/eco_board.css`
- Data-processing scripts used to generate visualization assets:
  - `code/parse_demos.py`
  - `code/parse_map_control_v3.py`
  - `code/parse_heatmap_timeslice.py`
  - `code/parse_grenades.py`
  - `code/parse_kills.py`
  - `code/viz_heatmap_combined.py`
  - plus helper scripts in `code/`
- Processed datasets and generated assets under `data/processed/` and `output/`

### 4.2 External Libraries / Services We Use

- [D3.js v7](https://d3js.org/) for SVG/canvas data visualization
- [TopoJSON Client v3](https://github.com/topojson/topojson-client) for world geometry conversion
- [world-atlas](https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json) country topology source
- [HLTV API mirror](https://hltv-api.vercel.app/api/player.json) as optional enrichment only
- Flag images from [flagcdn.com](https://flagcdn.com/) for country visuals

### 4.3 Python Libraries in Data Pipelines

The offline preprocessing scripts in `code/` use:
- `demoparser2`
- `pandas`
- `numpy`
- `scipy`
- `Pillow`
- `matplotlib`

## 5) Data Sources
- [Google Drive Link for Demo Files](https://drive.google.com/drive/folders/1K7tRsF2z__KyZB2qSvbW7rDYv4qn9IVb)
- [HLTV Match Page: Vitality vs The MongolZ, BLAST.tv Austin Major 2025](https://www.hltv.org/matches/2382619/vitality-vs-the-mongolz-blasttv-austin-major-2025)
- `data/player_data_csgo/hltv_playerStats-complete.csv` (country and player-level CS stats)
- `data/player_data_dota2/` (supporting Dota roster/player files used by the map dashboard mode)
- `data/processed/*.json` (frontend-ready trajectories, kill lines, economy timeline, etc.)
- `output/map_control/` and `output/heatmaps_combined/` (derived assets from Python scripts)

## 6) Non-Obvious Interface Features (Important for Grading)

1. **Run with HTTP, not `file://`**  
   The site uses `fetch` for CSV/JSON files. Opening HTML directly from disk breaks data loading.

2. **Economy board is embedded and standalone**  
   Visualization 5 is shown inside an iframe in `index.html`, but also works directly via `eco_board.html`.  
   It supports an `?embedded=1` mode and synchronizes theme state with the parent page.

3. **Theme-aware radar rendering**  
   For light mode, radar backgrounds are dynamically processed on canvas to remove dark edge artifacts.

4. **Map control uses browser-side Voronoi control, not pre-rendered video**  
   `output/map_control/*_control.json` stores player positions by frame; control regions are computed live in JS.

5. **Heatmap animation is cumulative by round**  
   In the heatmap view, frame N represents accumulated presence from rounds `1..N`, with cross-fade transitions.

6. **Utility and kill tooltips are contextual, not static**  
   Hover zones are clustered on the fly (utility hotspots / kill neighborhoods), and tooltip summaries change with active filters.

7. **Country club chips in world map panel are interactive filters**  
   Clicking a club chip filters player lists by team context; hovering can highlight cross-country club presence.

8. **Optional external enrichment is non-blocking**  
   If HLTV enrichment is unavailable (network/CORS), the app still runs from bundled local CSV/JSON data.

## 7) Repository Structure

```text
CSC316-1/
|- index.html
|- eco_board.html
|- README.md
|- css/
|  |- style.css
|  |- dashboard.css
|  |- eco_board.css
|- js/
|  |- main.js
|  |- dashboard.js
|  |- eco_board.js
|- data/
|  |- maps/
|  |- processed/
|  |- player_data_csgo/
|  |- player_data_dota2/
|- output/
|  |- map_control/
|  |- heatmaps_combined/
|- code/
|  |- parse_*.py
|  |- viz_*.py
|  |- download_*.py
```

## 8) How to Run

1. Open a terminal at repo root.
2. Start a static server:
   ```bash
   python -m http.server 8000
   ```
   If `python` is unavailable, use:
   ```bash
   python3 -m http.server 8000
   ```
3. Open `http://localhost:8000/index.html`.

## 9) Notes for Reproducibility

- Some scripts in `code/` currently contain absolute local Windows paths and expect local `.dem` files; adjust paths before rerunning pipelines on another machine.
- Raw demo files are intentionally not committed due to size constraints.
- Front-end deliverable works from committed processed outputs without requiring raw demo parsing.
