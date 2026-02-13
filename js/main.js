// Main entry point for D3 visualizations

// ============================================================
//  Visualization 2 — Placeholder
// ============================================================
function initVis2() {
  const container = d3.select('#vis3');
  container.html('');
  const svg = container
    .append('svg')
    .attr('width', 900)
    .attr('height', 400);
  svg.append('text')
    .attr('x', 450).attr('y', 200)
    .attr('text-anchor', 'middle')
    .attr('fill', '#aaa').attr('font-size', '1.2rem')
    .text('Visualization 3 — Coming Soon');
}

// ============================================================
//  Visualization 1 — Map Control Analysis
// ============================================================
(function initMapControl() {
  const DATA_BASE = "output/map_control/";

  const MAPS = {
    de_mirage:  { label: "Mirage",  img: DATA_BASE + "de_mirage.png"  },
    de_dust2:   { label: "Dust II", img: DATA_BASE + "de_dust2.png"   },
    de_inferno: { label: "Inferno", img: DATA_BASE + "de_inferno.png" },
  };
  const GRID = 128;
  const MAP_PX = 1024;
  const DISPLAY = 560;

  // Team side mapping: Vitality starts CT on all maps, swap at round 12
  const HALFTIME_ROUND = 12;
  function getTeamNames(roundNum) {
    if (roundNum < HALFTIME_ROUND) {
      return { ct: "Vitality", t: "The MongolZ" };
    } else {
      return { ct: "The MongolZ", t: "Vitality" };
    }
  }

  // State
  let currentMap = "de_mirage";
  let mapDataCache = {};
  let mapMaskCache = {};
  let mapBrightnessCache = {};
  let currentFrames = null;
  let currentKills = null;
  let currentMask = null;
  const MASK_THRESHOLDS = { de_mirage: 53, de_dust2: 53, de_inferno: 38 };
  const MASK_DILATE = 1;
  let frameIndex = 0;
  let playing = false;
  let playTimer = null;

  // Canvas setup
  const controlCanvas = document.getElementById("mcControlCanvas");
  const controlCtx = controlCanvas.getContext("2d", { willReadFrequently: true });
  const playerCanvas = document.getElementById("mcPlayerCanvas");
  const playerCtx = playerCanvas.getContext("2d");

  // Color LUT
  const COLOR_LUT = new Uint8ClampedArray(256 * 4);
  (function buildLUT() {
    for (let i = 0; i < 256; i++) {
      const v = (i / 255) * 2 - 1;
      const idx = i * 4;
      const absV = Math.abs(v);
      if (v <= 0) {
        const s = Math.min(absV, 1);
        const t = 1 - s;
        COLOR_LUT[idx]     = Math.round(218 + 37 * t);
        COLOR_LUT[idx + 1] = Math.round(54 + 69 * t);
        COLOR_LUT[idx + 2] = Math.round(51 + 63 * t);
        COLOR_LUT[idx + 3] = Math.round(15 + 195 * s);
      } else {
        const s = Math.min(v, 1);
        const t = 1 - s;
        COLOR_LUT[idx]     = Math.round(88 - 57 * s);
        COLOR_LUT[idx + 1] = Math.round(166 - 30 * s);
        COLOR_LUT[idx + 2] = 255;
        COLOR_LUT[idx + 3] = Math.round(15 + 195 * s);
      }
    }
  })();

  function drawLegend() {
    const bar = document.getElementById("mcLegendBar");
    let stops = [];
    for (let i = 0; i <= 40; i++) {
      const v = (i / 40) * 2 - 1;
      const li = Math.round(((v + 1) / 2) * 255);
      const r = COLOR_LUT[li * 4], g = COLOR_LUT[li * 4 + 1],
            b = COLOR_LUT[li * 4 + 2], a = COLOR_LUT[li * 4 + 3] / 255;
      stops.push(`rgba(${r},${g},${b},${Math.max(a, 0.2)})`);
    }
    bar.style.background = `linear-gradient(90deg, ${stops.join(",")})`;
  }

  // Map mask
  function loadMapBrightness(mapName) {
    return new Promise((resolve) => {
      if (mapBrightnessCache[mapName]) { resolve(mapBrightnessCache[mapName]); return; }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = GRID; c.height = GRID;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, GRID, GRID);
        const imgData = ctx.getImageData(0, 0, GRID, GRID);
        const brightness = new Float32Array(GRID * GRID);
        for (let i = 0; i < GRID * GRID; i++) {
          const r = imgData.data[i * 4];
          const g = imgData.data[i * 4 + 1];
          const b = imgData.data[i * 4 + 2];
          brightness[i] = r * 0.299 + g * 0.587 + b * 0.114;
        }
        mapBrightnessCache[mapName] = brightness;
        resolve(brightness);
      };
      img.onerror = () => {
        const brightness = new Float32Array(GRID * GRID).fill(255);
        mapBrightnessCache[mapName] = brightness;
        resolve(brightness);
      };
      img.src = MAPS[mapName].img;
    });
  }

  function buildMask(brightness, threshold, dilateRadius) {
    const raw = new Uint8Array(GRID * GRID);
    for (let i = 0; i < GRID * GRID; i++) {
      raw[i] = brightness[i] > threshold ? 1 : 0;
    }
    if (dilateRadius <= 0) return raw;
    const dilated = new Uint8Array(GRID * GRID);
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        let val = 0;
        for (let dy = -dilateRadius; dy <= dilateRadius && !val; dy++) {
          for (let dx = -dilateRadius; dx <= dilateRadius && !val; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < GRID && nx >= 0 && nx < GRID) {
              if (raw[ny * GRID + nx]) val = 1;
            }
          }
        }
        dilated[y * GRID + x] = val;
      }
    }
    return dilated;
  }

  async function loadMapMask(mapName) {
    const brightness = await loadMapBrightness(mapName);
    const threshold = MASK_THRESHOLDS[mapName] || 53;
    const cacheKey = mapName + "_" + threshold;
    if (mapMaskCache[cacheKey]) return mapMaskCache[cacheKey];
    const mask = buildMask(brightness, threshold, MASK_DILATE);
    mapMaskCache[cacheKey] = mask;
    return mask;
  }

  // Voronoi control compute
  function computeControlGrid(ctPos, tPos) {
    const grid = new Float32Array(GRID * GRID);
    const scale = MAP_PX / GRID;
    const nCT = ctPos.length;
    const nT = tPos.length;
    if (nCT === 0 && nT === 0) return grid;
    if (nCT === 0) { grid.fill(-1); return grid; }
    if (nT === 0) { grid.fill(1); return grid; }
    const ctX = new Float32Array(nCT), ctY = new Float32Array(nCT);
    const tX = new Float32Array(nT), tY = new Float32Array(nT);
    for (let i = 0; i < nCT; i++) { ctX[i] = ctPos[i][0] / scale; ctY[i] = ctPos[i][1] / scale; }
    for (let i = 0; i < nT; i++) { tX[i] = tPos[i][0] / scale; tY[i] = tPos[i][1] / scale; }
    for (let gy = 0; gy < GRID; gy++) {
      const cy = gy + 0.5;
      for (let gx = 0; gx < GRID; gx++) {
        const cx = gx + 0.5;
        let minCT = Infinity;
        for (let i = 0; i < nCT; i++) {
          const dx = cx - ctX[i], dy = cy - ctY[i];
          const d = dx * dx + dy * dy;
          if (d < minCT) minCT = d;
        }
        let minT = Infinity;
        for (let i = 0; i < nT; i++) {
          const dx = cx - tX[i], dy = cy - tY[i];
          const d = dx * dx + dy * dy;
          if (d < minT) minT = d;
        }
        minCT = Math.sqrt(minCT);
        minT = Math.sqrt(minT);
        const denom = minT + minCT;
        grid[gy * GRID + gx] = denom > 0.001 ? (minT - minCT) / denom : 0;
      }
    }
    return grid;
  }

  function blurGrid(grid, w, h, radius) {
    const tmp = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0, count = 0;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < w) { sum += grid[y * w + nx]; count++; }
        }
        tmp[y * w + x] = sum / count;
      }
    }
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0, count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const ny = y + dy;
          if (ny >= 0 && ny < h) { sum += tmp[ny * w + x]; count++; }
        }
        out[y * w + x] = sum / count;
      }
    }
    return out;
  }

  // Render
  function renderFrame(ctPos, tPos) {
    let grid = computeControlGrid(ctPos, tPos);
    grid = blurGrid(grid, GRID, GRID, 3);
    grid = blurGrid(grid, GRID, GRID, 2);
    const imgData = controlCtx.createImageData(GRID, GRID);
    const data = imgData.data;
    const opacity = parseFloat(document.getElementById("mcOpacitySelect").value);
    let ctCount = 0, tCount = 0, neutralCount = 0;
    for (let i = 0; i < GRID * GRID; i++) {
      const v = grid[i];
      const li = Math.round(((v + 1) / 2) * 255);
      const ci = Math.min(255, Math.max(0, li)) * 4;
      data[i * 4]     = COLOR_LUT[ci];
      data[i * 4 + 1] = COLOR_LUT[ci + 1];
      data[i * 4 + 2] = COLOR_LUT[ci + 2];
      const maskVal = currentMask ? currentMask[i] : 1;
      data[i * 4 + 3] = Math.round(COLOR_LUT[ci + 3] * opacity * maskVal);
      if (maskVal) {
        if (v > 0.05) ctCount++;
        else if (v < -0.05) tCount++;
        else neutralCount++;
      }
    }
    controlCtx.putImageData(imgData, 0, 0);

    // Player dots and death markers
    playerCtx.clearRect(0, 0, DISPLAY, DISPLAY);
    const s = DISPLAY / MAP_PX;
    if (currentKills) {
      currentKills.forEach(([killFrame, kx, ky, team]) => {
        if (killFrame > frameIndex) return;
        const sx = kx * s, sy = ky * s;
        const sz = 5;
        playerCtx.save();
        playerCtx.strokeStyle = team === "CT" ? "rgba(88,166,255,0.7)" : "rgba(255,123,114,0.7)";
        playerCtx.lineWidth = 2.5;
        playerCtx.lineCap = "round";
        playerCtx.beginPath();
        playerCtx.moveTo(sx - sz, sy - sz);
        playerCtx.lineTo(sx + sz, sy + sz);
        playerCtx.moveTo(sx + sz, sy - sz);
        playerCtx.lineTo(sx - sz, sy + sz);
        playerCtx.stroke();
        playerCtx.restore();
      });
    }
    ctPos.forEach(([px, py]) => {
      playerCtx.beginPath();
      playerCtx.arc(px * s, py * s, 5, 0, Math.PI * 2);
      playerCtx.fillStyle = "rgba(88,166,255,0.9)";
      playerCtx.fill();
      playerCtx.strokeStyle = "#fff";
      playerCtx.lineWidth = 1.5;
      playerCtx.stroke();
    });
    tPos.forEach(([px, py]) => {
      playerCtx.beginPath();
      playerCtx.arc(px * s, py * s, 5, 0, Math.PI * 2);
      playerCtx.fillStyle = "rgba(255,123,114,0.9)";
      playerCtx.fill();
      playerCtx.strokeStyle = "#fff";
      playerCtx.lineWidth = 1.5;
      playerCtx.stroke();
    });

    // Stats
    const total = ctCount + tCount + neutralCount;
    const ctPct = total > 0 ? Math.round(ctCount / total * 100) : 0;
    const tPct = total > 0 ? Math.round(tCount / total * 100) : 0;
    const nPct = 100 - ctPct - tPct;
    document.getElementById("mcCtBar").style.width = `${Math.max(ctPct, 3)}%`;
    document.getElementById("mcCtBar").textContent = `${ctPct}%`;
    document.getElementById("mcTBar").style.width = `${Math.max(tPct, 3)}%`;
    document.getElementById("mcTBar").textContent = `${tPct}%`;
    document.getElementById("mcCtPctLabel").textContent = `${ctPct}%`;
    document.getElementById("mcTPctLabel").textContent = `${tPct}%`;
    document.getElementById("mcNeutralPctLabel").textContent = `${nPct}%`;
    document.getElementById("mcCtAlive").textContent = ctPos.length;
    document.getElementById("mcTAlive").textContent = tPos.length;
  }

  // Frame navigation
  function setFrame(idx) {
    if (!currentFrames || currentFrames.length === 0) return;
    idx = Math.max(0, Math.min(idx, currentFrames.length - 1));
    frameIndex = idx;
    document.getElementById("mcTimeSlider").value = idx;
    document.getElementById("mcFrameLabel").textContent =
      `Frame ${idx + 1} / ${currentFrames.length}  (~${(idx * 0.5).toFixed(1)}s)`;
    const [ct, t] = currentFrames[idx];
    renderFrame(ct, t);
  }

  // Data loading
  async function loadMapData(mapName) {
    if (mapDataCache[mapName]) return mapDataCache[mapName];
    const container = document.getElementById("mcMapContainer");
    const loading = document.createElement("div");
    loading.className = "mc-loading";
    loading.innerHTML = '<div class="mc-spinner"></div>Loading data...';
    loading.style.position = "absolute";
    loading.style.top = "0"; loading.style.left = "0";
    loading.style.width = "100%"; loading.style.zIndex = "10";
    loading.style.background = "var(--vis-loading-bg)";
    container.appendChild(loading);
    const resp = await fetch(`${DATA_BASE}${mapName}_control.json`);
    const data = await resp.json();
    mapDataCache[mapName] = data;
    container.removeChild(loading);
    return data;
  }

  function updateRoundSelect(data) {
    const sel = document.getElementById("mcRoundSelect");
    sel.innerHTML = '';
    const rounds = Object.keys(data.rounds).sort((a, b) => +a - +b);
    rounds.forEach(r => {
      const rd = data.rounds[r];
      const n = rd.frames ? rd.frames.length : rd.length;
      const opt = document.createElement("option");
      opt.value = r;
      opt.textContent = `Round ${+r + 1} (${n} frames)`;
      sel.appendChild(opt);
    });
  }

  function switchRound(roundVal) {
    const data = mapDataCache[currentMap];
    if (!data) return;
    stopPlaying();
    const roundData = data.rounds[roundVal];
    if (!roundData) return;
    currentFrames = roundData.frames || roundData;
    currentKills = roundData.kills || null;
    const slider = document.getElementById("mcTimeSlider");
    slider.max = currentFrames.length - 1;
    slider.value = 0;
    frameIndex = 0;
    // Update team name labels based on round
    const teams = getTeamNames(+roundVal);
    document.getElementById("mcCtTeamName").textContent = teams.ct;
    document.getElementById("mcTTeamName").textContent = teams.t;
    setFrame(0);
  }

  async function switchMap(mapName) {
    stopPlaying();
    currentMap = mapName;
    document.querySelectorAll(".mc-map-tab").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.map === mapName);
    });
    document.getElementById("mcRadarImg").src = MAPS[mapName].img;
    const [data, mask] = await Promise.all([
      loadMapData(mapName),
      loadMapMask(mapName)
    ]);
    currentMask = mask;
    updateRoundSelect(data);
    const firstRound = Object.keys(data.rounds).sort((a, b) => +a - +b)[0];
    document.getElementById("mcRoundSelect").value = firstRound;
    switchRound(firstRound);
  }

  // Playback
  function startPlaying() {
    if (!currentFrames || currentFrames.length <= 1) return;
    playing = true;
    document.getElementById("mcPlayBtn").textContent = "\u23F8 Pause";
    document.getElementById("mcPlayBtn").classList.add("playing");
    const speed = parseInt(document.getElementById("mcSpeedSelect").value);
    playTimer = setInterval(() => {
      let next = frameIndex + 1;
      if (next >= currentFrames.length) next = 0;
      setFrame(next);
    }, speed);
  }
  function stopPlaying() {
    playing = false;
    if (playTimer) clearInterval(playTimer);
    playTimer = null;
    document.getElementById("mcPlayBtn").textContent = "\u25B6 Play";
    document.getElementById("mcPlayBtn").classList.remove("playing");
  }

  // Events
  document.querySelectorAll(".mc-map-tab").forEach(tab => {
    tab.addEventListener("click", () => switchMap(tab.dataset.map));
  });
  document.getElementById("mcRoundSelect").addEventListener("change", e => switchRound(e.target.value));
  document.getElementById("mcTimeSlider").addEventListener("input", e => setFrame(parseInt(e.target.value)));
  document.getElementById("mcPlayBtn").addEventListener("click", () => { playing ? stopPlaying() : startPlaying(); });
  document.getElementById("mcSpeedSelect").addEventListener("change", () => { if (playing) { stopPlaying(); startPlaying(); } });
  document.getElementById("mcOpacitySelect").addEventListener("change", () => {
    if (currentFrames) setFrame(frameIndex);
  });
  document.addEventListener("keydown", e => {
    if (e.key === " ") { e.preventDefault(); playing ? stopPlaying() : startPlaying(); }
    else if (e.key === "ArrowRight") setFrame(frameIndex + 1);
    else if (e.key === "ArrowLeft") setFrame(frameIndex - 1);
  });

  // Init
  drawLegend();
  switchMap("de_mirage");
})();

// ============================================================
//  Heatmap Gallery — Tab Switching
// ============================================================
(function initHeatmapGallery() {
  const HM_BASE = "output/heatmaps_combined/";

  function switchHeatmap(mapName) {
    document.querySelectorAll(".hm-map-tab").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.map === mapName);
    });
    document.getElementById("hmCombo1").src = HM_BASE + mapName + "_vitality_ct_mongolz_t.png";
    document.getElementById("hmCombo2").src = HM_BASE + mapName + "_vitality_t_mongolz_ct.png";
  }

  document.querySelectorAll(".hm-map-tab").forEach(tab => {
    tab.addEventListener("click", () => switchHeatmap(tab.dataset.map));
  });
})();

// ============================================================
//  Init Vis2
// ============================================================
initVis2();
