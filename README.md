# CSC316 Esports Data Visualization — Five-Color Squad

## Overview

At a macro level, we'd like to study how esports ecosystems demonstrate distinct regional dominance patterns across titles.

At a micro level, we'd like to look into detailed match-level analysis to reveal how competitive success emerges from structured roles, spatial control, and coordinated utility usage.

We chose these messages because together they reflect both the global structure and tactical depth of professional esports competition.

## Team Members

- **Xiaowu Wu** — mika.wu@mail.utoronto.ca
- **Ruike Hou** — ruike.hou@mail.utoronto.ca
- **Tianyi Mao** — tianyi.mao@mail.utoronto.ca
- **Yiding Jin** — yiding.jin@mail.utoronto.ca
- **Yihan Wang** — yihanwang.wang@mail.utoronto.ca

## Process Book
https://docs.google.com/document/d/1NKH5xZR5wIj18D-olm01dzN4KouP6KCWZSJSmoghnYo/edit?tab=t.811dyplrep1e#heading=h.1em731hdludi

## Data
- **Source 1**: https://www.hltv.org/matches/2382619/vitality-vs-the-mongolz-blasttv-austin-major-2025
- **Description**: 2025 Austin Major Final Match — Vitality vs The MongolZ

- **Source 2**: [Link to data source]
- **Description**: [Brief description of the dataset]

## Project Structure
```
CSC316/
├── index.html              # Main entry point (all visualizations inline)
├── css/
│   ├── style.css           # Visualization component styles + theme variables
│   └── dashboard.css       # Dashboard layout + day/night mode
├── js/
│   ├── main.js             # Map control & heatmap visualization logic
│   └── dashboard.js        # World map, game toggle, theme toggle, interactions
├── data/                   # Cleaned datasets
├── output/                 # Pre-rendered maps, heatmaps, and control data
└── README.md
```

## Features
- **Innovative Visualization 1 — Esports World Map**: An interactive D3 world map with country-level esports data, game-specific overlays (CS / DOTA 2), country detail panels, and a ranking drawer. Supports day/night theme toggle.
- **Innovative Visualization 2 — CS2 Map Control & Heatmaps**: Frame-by-frame territorial control visualization using Voronoi nearest-player distance, plus combined team movement heatmaps across three maps (Mirage, Dust II, Inferno) from the BLAST.tv Austin Major 2025 Grand Final.

## Libraries Used
- [D3.js v7](https://d3js.org/)
- [TopoJSON Client v3](https://github.com/topojson/topojson-client)

## Non-Obvious Features
[Describe any non-obvious features of the interface here.]

## How to Run Locally
1. Clone this repository
2. Open `index.html` in a browser, or serve with a local server:
   ```
   python -m http.server 8000
   ```
3. Navigate to `http://localhost:8000`

## Acknowledgments
[Any references, inspirations, or credits.]
