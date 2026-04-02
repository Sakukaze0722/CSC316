// Main entry point for D3 visualizations

const THEMED_RADAR_CACHE = new Map();

function isDarkThemeActive() {
  return document.body?.dataset.theme !== "light";
}

function whitenEdgeBackgroundPixels(imageData, threshold = 18) {
  const { data, width, height } = imageData;
  const total = width * height;
  const dark = new Uint8Array(total);
  const bg = new Uint8Array(total);
  const queue = [];

  for (let i = 0; i < total; i++) {
    const a = data[i * 4 + 3];
    if (a < 8) continue;
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const brightness = r * 0.299 + g * 0.587 + b * 0.114;
    if (brightness < threshold) dark[i] = 1;
  }

  function enqueue(idx) {
    if (!dark[idx] || bg[idx]) return;
    bg[idx] = 1;
    queue.push(idx);
  }

  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    enqueue(y * width);
    enqueue(y * width + (width - 1));
  }

  while (queue.length) {
    const idx = queue.pop();
    const x = idx % width;
    const y = Math.floor(idx / width);
    if (x > 0) enqueue(idx - 1);
    if (x < width - 1) enqueue(idx + 1);
    if (y > 0) enqueue(idx - width);
    if (y < height - 1) enqueue(idx + width);
  }

  for (let i = 0; i < total; i++) {
    if (!bg[i]) continue;
    const base = i * 4;
    data[base] = 255;
    data[base + 1] = 255;
    data[base + 2] = 255;
    data[base + 3] = 255;
  }

  return imageData;
}

function setThemedRadarImage(imgEl, rawSrc) {
  if (!imgEl || !rawSrc) return Promise.resolve();
  imgEl.dataset.rawSrc = rawSrc;

  if (isDarkThemeActive()) {
    imgEl.src = rawSrc;
    return Promise.resolve();
  }

  const cacheKey = `${rawSrc}::light`;
  if (THEMED_RADAR_CACHE.has(cacheKey)) {
    imgEl.src = THEMED_RADAR_CACHE.get(cacheKey);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      whitenEdgeBackgroundPixels(imageData);
      ctx.putImageData(imageData, 0, 0);
      const themedSrc = canvas.toDataURL("image/png");
      THEMED_RADAR_CACHE.set(cacheKey, themedSrc);
      if (imgEl.dataset.rawSrc === rawSrc && !isDarkThemeActive()) {
        imgEl.src = themedSrc;
      }
      resolve();
    };
    img.onerror = () => {
      imgEl.src = rawSrc;
      resolve();
    };
    img.src = rawSrc;
  });
}

// ============================================================
//  Animated Heatmap (heatmap-section)
//  Per-round cumulative heatmaps. Team selector (Vitality / MongolZ).
//  Left canvas = CT side, Right canvas = T side.
//  No flash: draw new frame directly without visible clearRect gap.
// ============================================================
(function initAnimatedHeatmap() {
  const DATA_URL = "data/processed/heatmap_timeslice.json";
  const MAP_IMG_BASE = "data/maps/";
  const CANVAS_SIZE = 1024;

  let hmData = null;
  let currentMap = "de_mirage";
  let currentHalf = "first";
  let currentRound = 0;
  let numRounds = 0;
  let isPlaying = false;
  let playTimer = null;

  const canvas1 = document.getElementById("hmAnimCanvas1");
  const ctx1 = canvas1.getContext("2d");
  const canvas2 = document.getElementById("hmAnimCanvas2");
  const ctx2 = canvas2.getContext("2d");
  const radar1 = document.getElementById("hmAnimRadar1");
  const radar2 = document.getElementById("hmAnimRadar2");
  const slider = document.getElementById("hmAnimSlider");
  const badge = document.getElementById("hmAnimBadge");
  const playBtn = document.getElementById("hmAnimPlayBtn");
  const dotsContainer = document.getElementById("hmAnimDots");

  // Image cache: base64 -> decoded Image
  const imgCache = new Map();

  function loadImg(b64) {
    if (!b64) return Promise.resolve(null);
    if (imgCache.has(b64)) return Promise.resolve(imgCache.get(b64));
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { imgCache.set(b64, img); resolve(img); };
      img.onerror = () => resolve(null);
      img.src = "data:image/png;base64," + b64;
    });
  }

  function getViewKeys() {
    if (currentHalf === "first") {
      return { left: "vitality_ct", right: "mongolz_t" };
    } else {
      return { left: "mongolz_ct", right: "vitality_t" };
    }
  }

  function getMapData() { return hmData ? hmData[currentMap] : null; }

  function getHalfBounds(md) {
    const halftimeRound = md?.halftime_round ?? 12;
    const firstEnd = Math.min(halftimeRound, md?.num_rounds ?? 0) - 1;
    const secondStart = Math.min(halftimeRound, md?.num_rounds ?? 0);
    return {
      first: {
        start: 0,
        end: firstEnd,
      },
      second: {
        start: secondStart,
        end: (md?.num_rounds ?? 0) - 1,
      },
    };
  }

  function getActiveRange(md = getMapData()) {
    if (!md) return { start: 0, end: -1, count: 0 };
    const bounds = getHalfBounds(md)[currentHalf];
    const count = Math.max(0, bounds.end - bounds.start + 1);
    return { ...bounds, count };
  }

  function clampRoundToActiveHalf(md = getMapData()) {
    const range = getActiveRange(md);
    if (range.count === 0) {
      currentRound = 0;
      return range;
    }
    if (currentRound < range.start || currentRound > range.end) {
      currentRound = range.start;
    }
    return range;
  }

  // ── Cross-fade engine ──
  // Two offscreen canvases per visible canvas hold prev/next frames.
  // requestAnimationFrame interpolates between them over FADE_MS.
  const FADE_MS = 400;

  function makeOffscreen() {
    const c = document.createElement("canvas");
    c.width = CANVAS_SIZE; c.height = CANVAS_SIZE;
    return c;
  }
  // Per-canvas fade state: { prev, next, raf, startTime }
  const fadeState1 = { prev: makeOffscreen(), next: makeOffscreen(), raf: null };
  const fadeState2 = { prev: makeOffscreen(), next: makeOffscreen(), raf: null };

  function stampFrame(offCanvas, img) {
    const oc = offCanvas.getContext("2d");
    oc.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    if (isDarkThemeActive()) {
      oc.fillStyle = "rgba(0,0,0,0.25)";
      oc.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }
    if (img) oc.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }

  function crossFade(ctx, fs, newImg, instant) {
    if (fs.raf) { cancelAnimationFrame(fs.raf); fs.raf = null; }

    // Copy current "next" into "prev", then stamp new frame into "next"
    const prevCtx = fs.prev.getContext("2d");
    prevCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    prevCtx.drawImage(fs.next, 0, 0);
    stampFrame(fs.next, newImg);

    if (instant) {
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.drawImage(fs.next, 0, 0);
      return;
    }

    const t0 = performance.now();
    function tick(now) {
      const p = Math.min((now - t0) / FADE_MS, 1);
      // Ease-in-out
      const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.globalAlpha = 1 - ease;
      ctx.drawImage(fs.prev, 0, 0);
      ctx.globalAlpha = ease;
      ctx.drawImage(fs.next, 0, 0);
      ctx.globalAlpha = 1;
      if (p < 1) fs.raf = requestAnimationFrame(tick);
    }
    fs.raf = requestAnimationFrame(tick);
  }

  // Legacy helper kept for instant draws (initial load, map switch, etc.)
  function drawFrame(ctx, img) {
    const fs = ctx === ctx1 ? fadeState1 : fadeState2;
    stampFrame(fs.next, img);
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.drawImage(fs.next, 0, 0);
  }

  function updateLabels() {
    const md = getMapData();
    const keys = getViewKeys();
    const bounds = getHalfBounds(md);
    // Parse team and side from view key like "vitality_ct"
    function labelFor(key) {
      const [t, s] = key.split("_");
      const team = t === "vitality" ? "Vitality" : "MongolZ";
      const side = s.toUpperCase();
      const color = s === "ct" ? "#58a6ff" : "#ff7b72";
      const halfKey = ((t === "vitality" && s === "ct") || (t === "mongolz" && s === "t")) ? "first" : "second";
      const halfBounds = bounds[halfKey];
      const startRound = halfBounds.start + 1;
      const endRound = Math.max(halfBounds.start, halfBounds.end) + 1;
      const rounds = `${startRound}–${endRound}`;
      return `<strong style="color:${color}">${team}</strong> — ${side} Side (Rounds ${rounds})`;
    }
    document.getElementById("hmAnimLabel1").innerHTML = labelFor(keys.left);
    document.getElementById("hmAnimLabel2").innerHTML = labelFor(keys.right);
  }

  function updateDots() {
    const range = getActiveRange();
    const dots = dotsContainer.querySelectorAll(".hm-anim-dot");
    const localIndex = range.count > 0 ? currentRound - range.start : -1;
    dots.forEach((dot, i) => {
      dot.classList.toggle("active", i === localIndex);
      dot.classList.toggle("past", i < localIndex);
    });
  }

  function updateUI() {
    const md = getMapData();
    if (!md) return;
    const range = clampRoundToActiveHalf(md);
    const activeRoundNumber = currentRound + 1;
    const halfLabel = currentHalf === "first" ? "1st Half" : "2nd Half";
    const localIndex = range.count > 0 ? currentRound - range.start : 0;
    badge.textContent = `Round ${activeRoundNumber} / ${md.num_rounds}  ·  ${halfLabel}`;
    slider.value = localIndex;
    slider.max = Math.max(0, range.count - 1);
    const startLabel = document.querySelector("#heatmap-section .hm-anim-timeline .hm-anim-time-label");
    const endLabel = document.getElementById("hmAnimEndLabel");
    if (startLabel) startLabel.textContent = `Round ${range.count > 0 ? range.start + 1 : 1}`;
    if (endLabel) endLabel.textContent = `Round ${range.count > 0 ? range.end + 1 : 1}`;
    updateLabels();
    updateDots();
  }

  async function renderRound(roundIdx, instant) {
    const md = getMapData();
    if (!md) return;

    const keys = getViewKeys();
    const frames_left  = md.views[keys.left];
    const frames_right = md.views[keys.right];

    const [img1, img2] = await Promise.all([
      loadImg(frames_left  ? frames_left[roundIdx]  : null),
      loadImg(frames_right ? frames_right[roundIdx] : null),
    ]);

    crossFade(ctx1, fadeState1, img1, instant);
    crossFade(ctx2, fadeState2, img2, instant);
    updateUI();
  }

  function buildDots() {
    const range = getActiveRange();
    dotsContainer.innerHTML = "";
    for (let i = 0; i < range.count; i++) {
      const dot = document.createElement("div");
      dot.className = "hm-anim-dot";
      if (i === 0) dot.classList.add("active");
      dot.addEventListener("click", () => {
        stopPlay();
        currentRound = range.start + i;
        renderRound(currentRound, true);
      });
      dotsContainer.appendChild(dot);
    }
  }

  function stopPlay() {
    isPlaying = false;
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
    playBtn.textContent = "\u25B6 Play";
    playBtn.classList.remove("playing");
  }

  function startPlay() {
    const range = getActiveRange();
    if (range.count === 0) return;
    if (currentRound >= range.end) {
      currentRound = range.start;
    }
    isPlaying = true;
    playBtn.textContent = "\u23F8 Pause";
    playBtn.classList.add("playing");
    const speed = Math.max(parseInt(document.getElementById("hmAnimSpeed").value, 10) || 800, FADE_MS + 100);
    renderRound(currentRound, false);
    playTimer = setInterval(() => {
      currentRound++;
      if (currentRound > range.end) {
        currentRound = range.end;
        stopPlay();
        return;
      }
      renderRound(currentRound, false);
    }, speed);
  }

  function syncMapState() {
    const md = getMapData();
    if (!md) return;
    numRounds = md.num_rounds;
    clampRoundToActiveHalf(md);
    buildDots();
    updateUI();
  }

  async function init() {
    try {
      const resp = await fetch(DATA_URL);
      hmData = await resp.json();
    } catch (err) {
      console.error("[HM-Anim] Failed to load heatmap data:", err);
      return;
    }

    syncMapState();

    // Map tabs
    document.querySelectorAll("#heatmap-section .hm-map-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        stopPlay();
        currentMap = tab.dataset.map;
        document.querySelectorAll("#heatmap-section .hm-map-tab").forEach(t =>
          t.classList.toggle("active", t.dataset.map === currentMap));
        const src = MAP_IMG_BASE + currentMap + ".png";
        setThemedRadarImage(radar1, src);
        setThemedRadarImage(radar2, src);
        syncMapState();
        renderRound(currentRound, true);
      });
    });

    // Half tabs
    document.querySelectorAll(".hm-view-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        stopPlay();
        currentHalf = tab.dataset.half;
        document.querySelectorAll(".hm-view-tab").forEach(t =>
          t.classList.toggle("active", t.dataset.half === currentHalf));
        const range = clampRoundToActiveHalf();
        currentRound = range.start;
        buildDots();
        renderRound(currentRound, true);
      });
    });

    // Play/pause
    playBtn.addEventListener("click", () => {
      if (isPlaying) { stopPlay(); } else { startPlay(); }
    });

    // Speed change
    document.getElementById("hmAnimSpeed").addEventListener("change", () => {
      if (isPlaying) { stopPlay(); startPlay(); }
    });

    // Slider
    slider.addEventListener("input", () => {
      stopPlay();
      const range = getActiveRange();
      currentRound = range.start + parseInt(slider.value, 10);
      renderRound(currentRound, true);
    });

    // Theme change observer
    new MutationObserver(() => {
      const src = MAP_IMG_BASE + currentMap + ".png";
      setThemedRadarImage(radar1, src);
      setThemedRadarImage(radar2, src);
      renderRound(currentRound, true);
    }).observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });

    // Initial render
    const src = MAP_IMG_BASE + currentMap + ".png";
    await Promise.all([
      setThemedRadarImage(radar1, src),
      setThemedRadarImage(radar2, src),
    ]);
    renderRound(currentRound, true);
  }

  init();
})();

// ============================================================
//  Visualization 3 — Utility Lane Evolution
// ============================================================
(function initUtilityLane() {
  const DATA_URL = "data/processed/grenade_trajectories.json";
  const MAP_IMG_BASE = "data/maps/";
  const CANVAS_SIZE = 1024;

  // Grenade type colors (solid — opacity controlled via globalAlpha)
  const TYPE_COLORS = {
    smoke:  { line: "#4fc3f7", glow: "#4fc3f7", dot: "#4fc3f7" },
    flash:  { line: "#fff176", glow: "#fff176", dot: "#fff176" },
    he:     { line: "#ef5350", glow: "#ef5350", dot: "#ef5350" },
    molotov:{ line: "#ff9800", glow: "#ff9800", dot: "#ff9800" },
  };

  let allData = null;
  let currentMap = "de_mirage";
  let filters = { side: "all", match: "all", types: new Set(["smoke", "flash", "he", "molotov"]), player: "all" };
  let animRAF = null;
  let isSectionVisible = false;
  let hotspotPulseRAF = null;
  let currentClusters = [];
  let hoveredCluster = null;

  const canvas = document.getElementById("ulTrailCanvas");
  const ctx = canvas.getContext("2d");
  const hsCanvas = document.getElementById("ulHotspotCanvas");
  const hsCtx = hsCanvas.getContext("2d");
  const mapContainer = document.getElementById("ulMapContainer");
  const ulMapArea = mapContainer.closest(".ul-map-area");
  const tooltip = document.getElementById("ulTooltip");
  const radarImg = document.getElementById("ulRadarImg");

  function getFilteredTrajectories() {
    if (!allData || !allData.maps[currentMap]) return [];
    let trajs = allData.maps[currentMap].trajectories;
    if (filters.side !== "all") trajs = trajs.filter(t => t.side === filters.side);
    if (filters.match !== "all") trajs = trajs.filter(t => t.match === filters.match);
    if (filters.types.size < 4) trajs = trajs.filter(t => filters.types.has(t.type));
    if (filters.player !== "all") trajs = trajs.filter(t => t.player === filters.player);
    return trajs;
  }

  // Pre-compute control point for a trajectory
  function trajCP(t) {
    const tx = t.throw_px, ty = t.throw_py;
    const lx = t.land_px, ly = t.land_py;
    const mx = (tx + lx) / 2, my = (ty + ly) / 2;
    const dx = lx - tx, dy = ly - ty;
    const len = Math.sqrt(dx * dx + dy * dy);
    const perpX = -dy / (len || 1), perpY = dx / (len || 1);
    const bulge = Math.min(len * 0.2, 40);
    return { cpx: mx + perpX * bulge, cpy: my + perpY * bulge };
  }

  // Render one frame — two-pass for performance (arcs first, then glow dots with shadow)
  function renderFrame(trajs, progresses) {
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Darken map
    if (isDarkThemeActive()) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.restore();
    }

    // --- Pass 1: arcs, origin dots, moving heads (no shadowBlur) ---
    for (let i = 0; i < trajs.length; i++) {
      const p = progresses[i];
      if (p <= 0) continue;

      const t = trajs[i];
      const colors = TYPE_COLORS[t.type] || TYPE_COLORS.smoke;
      const tx = t.throw_px, ty = t.throw_py;
      const lx = t.land_px, ly = t.land_py;
      const { cpx, cpy } = trajCP(t);
      const pc = Math.min(p, 1);

      // Growing arc polyline
      const STEPS = Math.max(Math.ceil(pc * 24), 2);
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      for (let s = 1; s <= STEPS; s++) {
        const bt = (s / STEPS) * pc;
        const u = 1 - bt;
        ctx.lineTo(
          u * u * tx + 2 * u * bt * cpx + bt * bt * lx,
          u * u * ty + 2 * u * bt * cpy + bt * bt * ly
        );
      }
      ctx.stroke();
      ctx.restore();

      // Throw origin dot
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = colors.dot;
      ctx.beginPath();
      ctx.arc(tx, ty, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Moving head dot (while still in flight)
      if (pc < 1) {
        const u2 = 1 - pc;
        const hx = u2 * u2 * tx + 2 * u2 * pc * cpx + pc * pc * lx;
        const hy = u2 * u2 * ty + 2 * u2 * pc * cpy + pc * pc * ly;
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = colors.dot;
        ctx.beginPath();
        ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // --- Pass 2: landed glow dots (batch by color to minimize state changes) ---
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.shadowBlur = 12;
    for (const type of ["smoke", "flash", "he", "molotov"]) {
      const color = TYPE_COLORS[type].glow;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.beginPath();
      for (let i = 0; i < trajs.length; i++) {
        if (progresses[i] < 1 || trajs[i].type !== type) continue;
        const t = trajs[i];
        ctx.moveTo(t.land_px + 4, t.land_py);
        ctx.arc(t.land_px, t.land_py, 4, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.restore();
  }

  // ── Hotspot Clustering ──
  // Grid-based density clustering on landing positions
  const CLUSTER_CELL = 28;
  const CLUSTER_MIN_COUNT = 6;
  const MAX_CLUSTERS = 6;
  const HOTSPOT_RADIUS = 20;
  const TYPE_COLORS_FLAT = { smoke: "#4fc3f7", flash: "#fff176", he: "#ef5350", molotov: "#ff9800" };

  function computeClusters(trajs) {
    if (trajs.length === 0) return [];
    const grid = {};
    for (const t of trajs) {
      const gx = Math.floor(t.land_px / CLUSTER_CELL);
      const gy = Math.floor(t.land_py / CLUSTER_CELL);
      const key = gx + "," + gy;
      if (!grid[key]) grid[key] = { gx, gy, items: [] };
      grid[key].items.push(t);
    }
    // Merge neighboring cells into clusters using flood-fill
    const visited = new Set();
    const clusters = [];
    for (const key of Object.keys(grid)) {
      if (visited.has(key)) continue;
      const queue = [key];
      visited.add(key);
      const merged = [];
      while (queue.length) {
        const cur = queue.shift();
        merged.push(...grid[cur].items);
        const [cx, cy] = cur.split(",").map(Number);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const nk = (cx + dx) + "," + (cy + dy);
            if (grid[nk] && !visited.has(nk)) {
              visited.add(nk);
              queue.push(nk);
            }
          }
        }
      }
      if (merged.length >= CLUSTER_MIN_COUNT) {
        const cx = merged.reduce((s, t) => s + t.land_px, 0) / merged.length;
        const cy = merged.reduce((s, t) => s + t.land_py, 0) / merged.length;
        const typeCounts = {};
        for (const t of merged) typeCounts[t.type] = (typeCounts[t.type] || 0) + 1;
        const dominantType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "smoke";
        const tightness = merged.reduce((sum, t) => sum + Math.hypot(t.land_px - cx, t.land_py - cy), 0) / merged.length;
        clusters.push({
          cx,
          cy,
          items: merged,
          count: merged.length,
          dominantType,
          tightness,
          score: merged.length / Math.max(tightness, 10)
        });
      }
    }
    const filtered = clusters.filter(c => c.tightness < 38);
    const picked = [];
    filtered.sort((a, b) => b.score - a.score);
    for (const cluster of filtered) {
      const overlaps = picked.some(existing => Math.hypot(existing.cx - cluster.cx, existing.cy - cluster.cy) < 56);
      if (!overlaps) picked.push(cluster);
      if (picked.length >= MAX_CLUSTERS) break;
    }
    return picked;
  }

  // Draw pulsing ring indicators on hotspot canvas
  function startHotspotPulse() {
    if (hotspotPulseRAF) cancelAnimationFrame(hotspotPulseRAF);
    if (currentClusters.length === 0 || filters.types.size === 4) { hsCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE); return; }

    function draw(now) {
      hsCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      const pulse = 0.5 + 0.5 * Math.sin(now / 600);
      for (const c of currentClusters) {
        const isHovered = (c === hoveredCluster);
        const color = TYPE_COLORS_FLAT[c.dominantType] || "#58a6ff";
        const r = HOTSPOT_RADIUS + pulse * 5;
        const alpha = isHovered ? 0.82 : 0.28 + pulse * 0.14;
        hsCtx.save();
        hsCtx.globalAlpha = alpha;
        hsCtx.strokeStyle = isHovered ? "#ffffff" : color;
        hsCtx.lineWidth = isHovered ? 2.8 : 2;
        hsCtx.shadowColor = color;
        hsCtx.shadowBlur = isHovered ? 18 : 10;
        hsCtx.beginPath();
        hsCtx.arc(c.cx, c.cy, r, 0, Math.PI * 2);
        hsCtx.stroke();
        if (!isHovered) {
          hsCtx.globalAlpha = 0.48;
          hsCtx.fillStyle = "rgba(15,23,42,0.72)";
          hsCtx.beginPath();
          hsCtx.arc(c.cx, c.cy, 11, 0, Math.PI * 2);
          hsCtx.fill();
          hsCtx.globalAlpha = 0.96;
          hsCtx.fillStyle = color;
          hsCtx.font = "bold 11px sans-serif";
          hsCtx.textAlign = "center";
          hsCtx.textBaseline = "middle";
          hsCtx.fillText(c.count, c.cx, c.cy);
        }
        hsCtx.restore();
      }
      hotspotPulseRAF = requestAnimationFrame(draw);
    }
    hotspotPulseRAF = requestAnimationFrame(draw);
  }

  function stopHotspotPulse() {
    if (hotspotPulseRAF) { cancelAnimationFrame(hotspotPulseRAF); hotspotPulseRAF = null; }
    hsCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }

  // ── Tooltip helpers ──
  function buildPieSVG(svgEl, legendEl, items) {
    const counts = {};
    for (const t of items) counts[t.type] = (counts[t.type] || 0) + 1;
    const total = items.length;
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const colors = { smoke: "#4fc3f7", flash: "#fff176", he: "#ef5350", molotov: "#ff9800" };
    const labels = { smoke: "Smoke", flash: "Flash", he: "HE", molotov: "Molotov" };
    if (total === 0) {
      svgEl.innerHTML = "";
      legendEl.innerHTML = "";
      return;
    }

    let html = "";
    const cx = 40, cy = 40, r = 36;
    if (entries.length === 1) {
      html = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${colors[entries[0][0]] || "#888"}"/>`;
    } else {
      let angle = -Math.PI / 2;
      for (const [type, count] of entries) {
        const slice = (count / total) * Math.PI * 2;
        const x1 = cx + r * Math.cos(angle);
        const y1 = cy + r * Math.sin(angle);
        const x2 = cx + r * Math.cos(angle + slice);
        const y2 = cy + r * Math.sin(angle + slice);
        const large = slice > Math.PI ? 1 : 0;
        html += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z" fill="${colors[type] || '#888'}"/>`;
        angle += slice;
      }
    }
    svgEl.innerHTML = html;

    // Build legend
    legendEl.innerHTML = entries.map(([type, count]) => {
      const pct = ((count / total) * 100).toFixed(0);
      return `<div class="pie-leg-item"><span class="pie-leg-dot" style="background:${colors[type]}"></span><span>${labels[type] || type}</span><span class="pie-leg-pct">${pct}%</span></div>`;
    }).join("");
  }

  function buildStatsHTML(items, totalVisible, singleTypeMode) {
    const players = {};
    const sides = { CT: 0, T: 0 };
    for (const t of items) {
      players[t.player] = (players[t.player] || 0) + 1;
      if (t.side === "CT") sides.CT++;
      else sides.T++;
    }
    const topPlayer = Object.entries(players).sort((a, b) => b[1] - a[1])[0];
    const share = totalVisible > 0 ? Math.round((items.length / totalVisible) * 100) : 0;
    const cx = items.reduce((sum, t) => sum + t.land_px, 0) / Math.max(items.length, 1);
    const cy = items.reduce((sum, t) => sum + t.land_py, 0) / Math.max(items.length, 1);
    const spread = Math.round(items.reduce((sum, t) => sum + Math.hypot(t.land_px - cx, t.land_py - cy), 0) / Math.max(items.length, 1));
    const matchCount = new Set(items.map(t => t.match)).size;
    let html = `<div class="stat-row"><span>Total</span><span class="stat-val">${items.length} grenades</span></div>`;
    html += `<div class="stat-row"><span>CT / T</span><span class="stat-val">${sides.CT} / ${sides.T}</span></div>`;
    html += `<div class="stat-row"><span>Share</span><span class="stat-val">${share}%</span></div>`;
    if (topPlayer) html += `<div class="stat-row"><span>Top Thrower</span><span class="stat-val">${topPlayer[0]} (${topPlayer[1]})</span></div>`;
    if (singleTypeMode) {
      html += `<div class="stat-row"><span>Landing Spread</span><span class="stat-val">${spread}px</span></div>`;
      html += `<div class="stat-row"><span>Matches</span><span class="stat-val">${matchCount}</span></div>`;
    }
    return html;
  }

  function showTooltip(cluster, mouseX, mouseY) {
    const header = document.getElementById("ulTooltipHeader");
    const label = { smoke: "Smoke", flash: "Flash", he: "HE", molotov: "Molotov" }[cluster.dominantType] || "Utility";
    const singleTypeMode = filters.types.size === 1;
    header.textContent = `${label} Hotspot · ${cluster.count}`;
    const pieRow = tooltip.querySelector(".vis-tooltip-pie-row");
    const divider = tooltip.querySelector(".vis-tooltip-divider");
    pieRow.style.display = singleTypeMode ? "none" : "flex";
    divider.style.display = singleTypeMode ? "none" : "block";
    if (!singleTypeMode) {
      buildPieSVG(
        document.getElementById("ulTooltipPie"),
        document.getElementById("ulTooltipLegend"),
        cluster.items
      );
    }
    document.getElementById("ulTooltipStats").innerHTML = buildStatsHTML(cluster.items, getFilteredTrajectories().length, singleTypeMode);

    const rect = mapContainer.getBoundingClientRect();
    tooltip.style.display = "block";
    const tipWidth = tooltip.offsetWidth;
    const tipHeight = tooltip.offsetHeight;
    let left = mouseX + 16;
    if (left + tipWidth + 8 > rect.width) left = mouseX - tipWidth - 16;
    left = Math.max(8, Math.min(left, rect.width - tipWidth - 8));
    let top = mouseY - 18;
    top = Math.max(8, Math.min(top, rect.height - tipHeight - 8));
    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
  }

  function hideTooltip() {
    tooltip.style.display = "none";
    hoveredCluster = null;
  }

  function buildLocalCluster(mx, my, trajs) {
    const nearby = trajs
      .map(t => ({ t, d: Math.sqrt((mx - t.land_px) ** 2 + (my - t.land_py) ** 2) }))
      .filter(x => x.d < 54)
      .sort((a, b) => a.d - b.d)
      .slice(0, 12)
      .map(x => x.t);
    if (nearby.length < 5) return null;
    const cx = nearby.reduce((s, t) => s + t.land_px, 0) / nearby.length;
    const cy = nearby.reduce((s, t) => s + t.land_py, 0) / nearby.length;
    const typeCounts = {};
    for (const t of nearby) typeCounts[t.type] = (typeCounts[t.type] || 0) + 1;
    const dominantType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "smoke";
    return { cx, cy, items: nearby, count: nearby.length, dominantType };
  }

  // Mouse interaction on the map container
  ulMapArea.addEventListener("mousemove", (e) => {
    const rect = mapContainer.getBoundingClientRect();
    const scale = CANVAS_SIZE / rect.width;
    const mx = (e.clientX - rect.left) * scale;
    const my = (e.clientY - rect.top) * scale;

    let closest = null;
    let closestDist = Infinity;
    for (const c of currentClusters) {
      const d = Math.sqrt((mx - c.cx) ** 2 + (my - c.cy) ** 2);
      if (d < HOTSPOT_RADIUS + 32 && d < closestDist) {
        closest = c;
        closestDist = d;
      }
    }

    if (!closest) {
      closest = buildLocalCluster(mx, my, getFilteredTrajectories());
    }

    if (closest) {
      hoveredCluster = closest;
      mapContainer.style.cursor = "pointer";
      showTooltip(closest, e.clientX - ulMapArea.getBoundingClientRect().left, e.clientY - ulMapArea.getBoundingClientRect().top);
    } else {
      if (hoveredCluster) hideTooltip();
      hoveredCluster = null;
      mapContainer.style.cursor = "";
    }
  });

  ulMapArea.addEventListener("mouseleave", () => {
    hideTooltip();
    mapContainer.style.cursor = "";
  });

  // Sequential animation: grenades thrown one by one, each arc grows from throw→land
  function animateIn(trajs) {
    if (animRAF) cancelAnimationFrame(animRAF);
    stopHotspotPulse();
    currentClusters = computeClusters(trajs);
    startHotspotPulse();
    hideTooltip();

    if (trajs.length === 0) {
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      if (isDarkThemeActive()) {
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        ctx.restore();
      }
      return;
    }

    // Sort by tick to preserve throw order
    const sorted = trajs.slice().sort((a, b) => a.tick - b.tick);
    const n = sorted.length;

    // Timing: each arc takes ARC_DUR ms to grow; a new throw starts every INTERVAL ms
    // Total duration is controlled by the speed dropdown
    const speedSelect = document.getElementById("ulSpeedSelect");
    const maxTotal = speedSelect ? parseInt(speedSelect.value, 10) : 4500;
    const ARC_DUR = Math.max(150, maxTotal * 0.055);         // scale arc duration with speed
    const interval = Math.max(2, (maxTotal - ARC_DUR) / n);  // ms between successive throws
    const totalDuration = (n - 1) * interval + ARC_DUR;

    const startTime = performance.now();
    const progresses = new Float32Array(n);

    function step(now) {
      const elapsed = now - startTime;

      for (let i = 0; i < n; i++) {
        const throwStart = i * interval;
        if (elapsed <= throwStart) {
          progresses[i] = 0;
        } else {
          const arcElapsed = elapsed - throwStart;
          // Ease-out quad for smooth deceleration as arc "lands"
          const raw = Math.min(arcElapsed / ARC_DUR, 1);
          progresses[i] = 1 - (1 - raw) * (1 - raw);
        }
      }

      renderFrame(sorted, progresses);

      if (elapsed < totalDuration) {
        animRAF = requestAnimationFrame(step);
      }
    }
    animRAF = requestAnimationFrame(step);
  }

  function updateVisualization() {
    const trajs = getFilteredTrajectories();
    document.getElementById("ulStatBadge").textContent = `${trajs.length} trajectories`;
    
    if (isSectionVisible) {
      animateIn(trajs);
    } else {
      stopHotspotPulse();
      currentClusters = [];
      hideTooltip();
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      if (isDarkThemeActive()) {
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        ctx.restore();
      }
    }
  }

  function updateMatchFilter() {
    if (!allData || !allData.maps[currentMap]) return;
    const matches = allData.maps[currentMap].matches;
    const container = document.getElementById("ulMatchFilter");
    container.innerHTML = '<button class="ul-filter-btn active" data-value="all">All</button>';
    matches.forEach(m => {
      const btn = document.createElement("button");
      btn.className = "ul-filter-btn";
      btn.dataset.value = m;
      btn.textContent = m;
      container.appendChild(btn);
    });
    filters.match = "all";
  }

  // Bind once via event delegation — safe for dynamically rebuilt content
  function bindFilterGroup(containerId, filterKey) {
    const container = document.getElementById(containerId);
    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".ul-filter-btn");
      if (!btn) return;
      container.querySelectorAll(".ul-filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      filters[filterKey] = btn.dataset.value;
      updateVisualization();
    });
  }

  function switchMap(mapName) {
    currentMap = mapName;
    document.querySelectorAll(".ul-map-tab").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.map === mapName);
    });
    setThemedRadarImage(radarImg, MAP_IMG_BASE + mapName + ".png");
    // Reset filters
    filters.side = "all";
    filters.match = "all";
    filters.types = new Set(["smoke", "flash", "he", "molotov"]);
    filters.player = "all";
    document.querySelectorAll("#ulSideFilter .ul-filter-btn, #ulPlayerFilter .ul-filter-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.value === "all");
    });
    syncBuyCardUI();
    updateMatchFilter();
    updateVisualization();
  }

  async function init() {
    try {
      const resp = await fetch(DATA_URL);
      allData = await resp.json();
    } catch (err) {
      console.error("[UL] Failed to load grenade data:", err);
      return;
    }

    // Map tabs
    document.querySelectorAll(".ul-map-tab").forEach(tab => {
      tab.addEventListener("click", () => switchMap(tab.dataset.map));
    });

    // Replay button
    document.getElementById("ulReplayBtn").addEventListener("click", () => {
      updateVisualization();
    });

    // Speed control — replay animation when speed changes
    const ulSpeedSelect = document.getElementById("ulSpeedSelect");
    if (ulSpeedSelect) {
      ulSpeedSelect.addEventListener("change", () => {
        if (isSectionVisible) updateVisualization();
      });
    }

    // Bind sidebar filters (once)
    bindFilterGroup("ulSideFilter", "side");
    bindFilterGroup("ulMatchFilter", "match");
    bindFilterGroup("ulPlayerFilter", "player");

    // Buy-screen utility guide cards — multi-select with compact Select All toggle
    const ALL_TYPES = ["smoke", "flash", "he", "molotov"];
    const buyCards = document.getElementById("utilBuyCards");
    const selectAllBtn = document.getElementById("utilBuySelectAll");
    function syncBuyCardUI() {
      const allSelected = filters.types.size === 4;
      if (selectAllBtn) selectAllBtn.classList.toggle("active", allSelected);
      if (!buyCards) return;
      buyCards.querySelectorAll(".util-buy-card").forEach(c => {
        c.classList.toggle("active", filters.types.has(c.dataset.util));
      });
    }
    if (selectAllBtn) {
      selectAllBtn.addEventListener("click", () => {
        if (filters.types.size === 4) {
          filters.types.clear();
          filters.types.add("smoke");
        } else {
          ALL_TYPES.forEach(t => filters.types.add(t));
        }
        syncBuyCardUI();
        updateVisualization();
      });
    }
    if (buyCards) {
      buyCards.addEventListener("click", (e) => {
        const card = e.target.closest(".util-buy-card");
        if (!card) return;
        const utilValue = card.dataset.util;
        if (filters.types.has(utilValue)) {
          filters.types.delete(utilValue);
        } else {
          filters.types.add(utilValue);
        }
        if (filters.types.size === 0) {
          ALL_TYPES.forEach(t => filters.types.add(t));
        }
        syncBuyCardUI();
        updateVisualization();
      });
    }

    // Replay animation every time the section re-enters the viewport
    document.addEventListener("sectionVisible", (e) => {
      if (e.detail.id === "vis3Section") {
        isSectionVisible = true;
        updateVisualization();
      }
    });

    document.addEventListener("sectionHidden", (e) => {
      if (e.detail.id === "vis3Section") {
        isSectionVisible = false;
        if (animRAF) {
          cancelAnimationFrame(animRAF);
          animRAF = null;
        }
        stopHotspotPulse();
        currentClusters = [];
        hideTooltip();
      }
    });

    new MutationObserver(() => {
      setThemedRadarImage(radarImg, MAP_IMG_BASE + currentMap + ".png");
      updateVisualization();
    }).observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });

    // Initial load
    updateMatchFilter();
    setThemedRadarImage(radarImg, MAP_IMG_BASE + currentMap + ".png");
    syncBuyCardUI();
    updateVisualization();
  }

  init();
})();

// ============================================================
//  Visualization 4 — Kill Vector Field
// ============================================================
(function initKillVectorField() {
  const DATA_URL = "data/processed/kill_lines.json";
  const MAP_IMG_BASE = "data/maps/";
  const CANVAS_SIZE = 1024;

  // Weapon class colors
  const CLASS_COLORS = {
    pistol:  "#42a5f5",
    smg:     "#66bb6a",
    rifle:   "#ffa726",
    sniper:  "#ab47bc",
    shotgun: "#ef5350",
    knife:   "#78909c",
  };

  let allData = null;
  let currentMap = "de_mirage";
  let filters = { side: "all", player: "all", weapon_class: "all" };
  let animRAF = null;
  let isSectionVisible = false;
  let animDone = false;
  let lastFilteredKills = [];
  let hoveredKill = null;

  const canvas = document.getElementById("kvCanvas");
  const ctx = canvas.getContext("2d");
  const hoverCanvas = document.getElementById("kvHoverCanvas");
  const hoverCtx = hoverCanvas.getContext("2d");
  const kvMapContainer = document.getElementById("kvMapContainer");
  const kvMapArea = kvMapContainer.closest(".kv-map-area");
  const kvTooltip = document.getElementById("kvTooltip");
  const kvRadarImg = document.getElementById("kvRadarImg");

  function getFiltered() {
    if (!allData || !allData.maps[currentMap]) return [];
    let kills = allData.maps[currentMap].kills;
    if (filters.side !== "all") kills = kills.filter(k => k.side === filters.side);
    if (filters.player !== "all") kills = kills.filter(k => k.player === filters.player);
    if (filters.weapon_class !== "all") kills = kills.filter(k => k.weapon_class === filters.weapon_class);
    return kills;
  }

  // Draw a sharp death X at victim position (with optional headshot emphasis)
  function drawDeathX(vx, vy, headshot, alpha) {
    const sz = headshot ? 6 : 4;
    ctx.save();
    ctx.globalAlpha = alpha;
    
    // Headshot gets a brighter glow and thicker line, but no box
    if (headshot) {
      ctx.strokeStyle = "#ff1744"; // brighter red
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "#ff1744";
      ctx.shadowBlur = 10;
    } else {
      ctx.strokeStyle = "#e53935"; // normal red
      ctx.lineWidth = 2;
      ctx.shadowColor = "#e53935";
      ctx.shadowBlur = 6;
    }
    
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(vx - sz, vy - sz);
    ctx.lineTo(vx + sz, vy + sz);
    ctx.moveTo(vx + sz, vy - sz);
    ctx.lineTo(vx - sz, vy + sz);
    ctx.stroke();
    ctx.restore();
  }

  // Draw impact shockwave ripple
  function drawImpactRipple(vx, vy, p, color) {
    if (p < 1) return;
    // p goes from 1.0 to something larger over time. We need a time-based decay.
    // We'll compute ripple based on how far past 1.0 progress is.
    // Let's pass the "raw" elapsed time since land for the ripple.
  }

  // Render one frame
  function renderFrame(kills, progresses, elapsedTimes) {
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Darken map for contrast
    if (isDarkThemeActive()) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.50)";
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.restore();
    }

    // Set composite operation for additive blending (makes lasers look like glowing light)
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < kills.length; i++) {
      const p = progresses[i];
      if (p <= 0) continue;

      const k = kills[i];
      const color = CLASS_COLORS[k.weapon_class] || "#78909c";
      const ax = k.att_px, ay = k.att_py;
      const vx = k.vic_px, vy = k.vic_py;
      const dx = vx - ax, dy = vy - ay;
      
      const pc = Math.min(p, 1);

      // Current tip of the growing laser
      const cx = ax + dx * pc;
      const cy = ay + dy * pc;

      // 1. Muzzle Flash (only right at the start of the shot)
      if (p > 0 && p < 0.3) {
        const flashAlpha = 1 - (p / 0.3); // Fade out quickly
        ctx.save();
        ctx.globalAlpha = flashAlpha * 0.8;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(ax, ay, 6 + flashAlpha * 4, 0, Math.PI * 2);
        ctx.fill();
        // Inner bright white core
        ctx.fillStyle = "#ffffff";
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(ax, ay, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 2. Solid Laser Line with Gradient (persistent)
      ctx.save();
      ctx.lineCap = "round";
      
      // Laser stays visible after landing
      ctx.globalAlpha = 1.0;
      
      // Gradient: fading out towards the attacker, bright at the tip
      const grad = ctx.createLinearGradient(ax, ay, cx, cy);
      grad.addColorStop(0, "rgba(255, 255, 255, 0.1)"); // Slightly visible at attacker
      // The color is applied near the tip
      grad.addColorStop(0.6, color); 
      // Bright white hot core at the tip (only while flying, turns normal color when landed)
      grad.addColorStop(1, pc < 1 ? "#ffffff" : color);

      ctx.strokeStyle = grad;
      ctx.lineWidth = pc < 1 ? 2.5 : 1.5; // thinner after it lands
      ctx.shadowColor = color;
      ctx.shadowBlur = pc < 1 ? 10 : 4; // less glow after it lands
      
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(cx, cy);
      ctx.stroke();

      // Tip glowing dot (the bullet) - only while flying
      if (pc < 1) {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(cx, cy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Attacker fixed small dot (always visible, but faint)
      ctx.save();
      ctx.globalCompositeOperation = "source-over"; // Reset for dots
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(ax, ay, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 3. Impact Shockwave & Death X
      if (p >= 1) {
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        
        // Shockwave ripple effect
        const overP = p - 1; // 0 to 0.5+
        if (overP < 0.8) {
          const rippleAlpha = 1 - (overP / 0.8);
          const rippleRadius = 4 + overP * 30; // Expands outward
          ctx.globalAlpha = rippleAlpha * 0.7;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(vx, vy, rippleRadius, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Draw the X
        drawDeathX(vx, vy, k.headshot, Math.min(1, overP * 5)); // Fades in quickly
        ctx.restore();
      }
    }

    // Reset composite op
    ctx.globalCompositeOperation = "source-over";
  }

  // ── Kill hover detection ──
  const KV_HOVER_DIST = 120; // forgiving hover radius so nearby movement always gets feedback
  const KV_ZONE_RADIUS = 68;

  // Point-to-line-segment distance
  function ptSegDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
  }

  function findNearestKill(mx, my, kills) {
    let best = null, bestDist = Infinity;
    for (const k of kills) {
      const lineDist = ptSegDist(mx, my, k.att_px, k.att_py, k.vic_px, k.vic_py);
      const midX = (k.att_px + k.vic_px) / 2;
      const midY = (k.att_py + k.vic_py) / 2;
      const midDist = Math.sqrt((mx - midX) ** 2 + (my - midY) ** 2);
      const d = Math.min(lineDist, midDist * 0.8);
      if (d < KV_HOVER_DIST && d < bestDist) {
        best = k;
        bestDist = d;
      }
    }
    return best;
  }

  function drawKillHighlight(k) {
    hoverCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const color = CLASS_COLORS[k.weapon_class] || "#78909c";
    // Bright highlighted line
    hoverCtx.save();
    hoverCtx.globalAlpha = 1;
    hoverCtx.strokeStyle = "#ffffff";
    hoverCtx.lineWidth = 4;
    hoverCtx.shadowColor = color;
    hoverCtx.shadowBlur = 20;
    hoverCtx.lineCap = "round";
    hoverCtx.beginPath();
    hoverCtx.moveTo(k.att_px, k.att_py);
    hoverCtx.lineTo(k.vic_px, k.vic_py);
    hoverCtx.stroke();
    // Colored line on top
    hoverCtx.strokeStyle = color;
    hoverCtx.lineWidth = 2.5;
    hoverCtx.shadowBlur = 0;
    hoverCtx.beginPath();
    hoverCtx.moveTo(k.att_px, k.att_py);
    hoverCtx.lineTo(k.vic_px, k.vic_py);
    hoverCtx.stroke();
    // Attacker dot
    hoverCtx.fillStyle = "#00e676";
    hoverCtx.shadowColor = "#00e676";
    hoverCtx.shadowBlur = 10;
    hoverCtx.beginPath();
    hoverCtx.arc(k.att_px, k.att_py, 5, 0, Math.PI * 2);
    hoverCtx.fill();
    // Victim X
    hoverCtx.strokeStyle = "#ff1744";
    hoverCtx.shadowColor = "#ff1744";
    hoverCtx.shadowBlur = 12;
    hoverCtx.lineWidth = 3;
    const sz = 7;
    hoverCtx.beginPath();
    hoverCtx.moveTo(k.vic_px - sz, k.vic_py - sz);
    hoverCtx.lineTo(k.vic_px + sz, k.vic_py + sz);
    hoverCtx.moveTo(k.vic_px + sz, k.vic_py - sz);
    hoverCtx.lineTo(k.vic_px - sz, k.vic_py + sz);
    hoverCtx.stroke();
    hoverCtx.restore();
  }

  function clearKillHighlight() {
    hoverCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }

  // Build weapon pie for a zone around the hovered kill
  function kvBuildPie(svgEl, legendEl, kills, cx, cy) {
    const zone = kills.filter(k => {
      const dx = ((k.att_px + k.vic_px) / 2) - cx;
      const dy = ((k.att_py + k.vic_py) / 2) - cy;
      return Math.sqrt(dx * dx + dy * dy) < KV_ZONE_RADIUS;
    });
    const counts = {};
    for (const k of zone) counts[k.weapon_class] = (counts[k.weapon_class] || 0) + 1;
    const total = zone.length;
    if (total === 0) { svgEl.innerHTML = ""; legendEl.innerHTML = ""; return; }
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const labels = { pistol: "Pistol", smg: "SMG", rifle: "Rifle", sniper: "Sniper", shotgun: "Shotgun", knife: "Knife" };

    let html = "";
    const pcx = 40, pcy = 40, r = 36;
    if (entries.length === 1) {
      html = `<circle cx="${pcx}" cy="${pcy}" r="${r}" fill="${CLASS_COLORS[entries[0][0]] || "#888"}"/>`;
    } else {
      let angle = -Math.PI / 2;
      for (const [cls, count] of entries) {
        const slice = (count / total) * Math.PI * 2;
        const x1 = pcx + r * Math.cos(angle);
        const y1 = pcy + r * Math.sin(angle);
        const x2 = pcx + r * Math.cos(angle + slice);
        const y2 = pcy + r * Math.sin(angle + slice);
        const large = slice > Math.PI ? 1 : 0;
        html += `<path d="M${pcx},${pcy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z" fill="${CLASS_COLORS[cls] || '#888'}"/>`;
        angle += slice;
      }
    }
    svgEl.innerHTML = html;

    legendEl.innerHTML = entries.map(([cls, count]) => {
      const pct = ((count / total) * 100).toFixed(0);
      return `<div class="pie-leg-item"><span class="pie-leg-dot" style="background:${CLASS_COLORS[cls] || '#888'}"></span><span>${labels[cls] || cls}</span><span class="pie-leg-pct">${pct}%</span></div>`;
    }).join("");
  }

  function kvBuildStats(k, kills, zoneKills, singleClassMode) {
    const dist = Math.sqrt((k.att_px - k.vic_px) ** 2 + (k.att_py - k.vic_py) ** 2);
    const distLabel = dist < 80 ? "Close" : dist < 200 ? "Medium" : "Long";
    const hsRate = zoneKills.length ? Math.round(zoneKills.filter(x => x.headshot).length / zoneKills.length * 100) : 0;
    const topVictim = Object.entries(zoneKills.reduce((acc, x) => {
      acc[x.victim] = (acc[x.victim] || 0) + 1;
      return acc;
    }, {})).sort((a, b) => b[1] - a[1])[0];
    let html = `<div class="stat-row"><span>Attacker</span><span class="stat-val">${k.player}</span></div>`;
    html += `<div class="stat-row"><span>Victim</span><span class="stat-val">${k.victim}</span></div>`;
    html += `<div class="stat-row"><span>Weapon</span><span class="stat-val">${k.weapon.replace(/_/g, " ")}</span></div>`;
    html += `<div class="stat-row"><span>Range</span><span class="stat-val">${distLabel} (${Math.round(dist)}px)</span></div>`;
    html += `<div class="stat-row"><span>Headshot</span><span class="stat-val">${k.headshot ? "✓ Yes" : "No"}</span></div>`;
    html += `<div class="stat-row"><span>Side</span><span class="stat-val">${k.side}</span></div>`;
    html += `<div class="stat-row"><span>Round</span><span class="stat-val">${k.round}</span></div>`;
    if (singleClassMode) {
      html += `<div class="stat-row"><span>Zone Kills</span><span class="stat-val">${zoneKills.length}</span></div>`;
      html += `<div class="stat-row"><span>HS Rate</span><span class="stat-val">${hsRate}%</span></div>`;
      if (topVictim) html += `<div class="stat-row"><span>Frequent Victim</span><span class="stat-val">${topVictim[0]} (${topVictim[1]})</span></div>`;
    }
    return html;
  }

  // Build recent kills list for the zone
  function kvBuildKillsList(kills, cx, cy) {
    const zone = kills.filter(k => {
      const dx = ((k.att_px + k.vic_px) / 2) - cx;
      const dy = ((k.att_py + k.vic_py) / 2) - cy;
      return Math.sqrt(dx * dx + dy * dy) < KV_ZONE_RADIUS;
    }).slice(0, 3);
    if (zone.length <= 1) return "";
    return `<div style="font-size:9px;color:var(--vis-text-muted);margin-bottom:3px;font-weight:700;">Nearby Kills (${zone.length})</div>` +
      zone.map(k => {
        const hs = k.headshot ? '<span class="kill-hs">HS</span>' : "";
        return `<div class="kill-entry"><span class="kill-weapon">${k.weapon.replace(/_/g, " ")}</span><span>${k.player} → ${k.victim}</span>${hs}</div>`;
      }).join("");
  }

  function kvShowTooltip(k, mouseX, mouseY) {
    document.getElementById("kvTooltipHeader").textContent = `${k.player} → ${k.victim}`;
    const midX = (k.att_px + k.vic_px) / 2;
    const midY = (k.att_py + k.vic_py) / 2;
    const zoneKills = lastFilteredKills.filter(x => {
      const dx = ((x.att_px + x.vic_px) / 2) - midX;
      const dy = ((x.att_py + x.vic_py) / 2) - midY;
      return Math.sqrt(dx * dx + dy * dy) < KV_ZONE_RADIUS;
    });
    const singleClassMode = filters.weapon_class !== "all";
    document.getElementById("kvTooltipStats").innerHTML = kvBuildStats(k, lastFilteredKills, zoneKills, singleClassMode);
    const pieRow = kvTooltip.querySelector(".vis-tooltip-pie-row");
    const dividerEls = kvTooltip.querySelectorAll(".vis-tooltip-divider");
    pieRow.style.display = singleClassMode ? "none" : "flex";
    if (dividerEls[0]) dividerEls[0].style.display = singleClassMode ? "none" : "block";
    if (!singleClassMode) {
      kvBuildPie(
        document.getElementById("kvTooltipPie"),
        document.getElementById("kvTooltipLegend"),
        lastFilteredKills, midX, midY
      );
    }
    document.getElementById("kvTooltipKills").innerHTML = kvBuildKillsList(lastFilteredKills, midX, midY);

    const rect = kvMapContainer.getBoundingClientRect();
    kvTooltip.style.display = "block";
    const tipWidth = kvTooltip.offsetWidth;
    const tipHeight = kvTooltip.offsetHeight;
    let left = mouseX + 16;
    if (left + tipWidth + 8 > rect.width) left = mouseX - tipWidth - 16;
    left = Math.max(8, Math.min(left, rect.width - tipWidth - 8));
    let top = mouseY - 18;
    top = Math.max(8, Math.min(top, rect.height - tipHeight - 8));
    kvTooltip.style.left = left + "px";
    kvTooltip.style.top = top + "px";
  }

  function kvHideTooltip() {
    kvTooltip.style.display = "none";
    hoveredKill = null;
    clearKillHighlight();
  }

  // Mouse events on kvMapContainer
  kvMapArea.addEventListener("mousemove", (e) => {
    if (lastFilteredKills.length === 0) return;
    const rect = kvMapContainer.getBoundingClientRect();
    const scale = CANVAS_SIZE / rect.width;
    const mx = (e.clientX - rect.left) * scale;
    const my = (e.clientY - rect.top) * scale;

    const nearest = findNearestKill(mx, my, lastFilteredKills);
    if (nearest) {
      hoveredKill = nearest;
      kvMapContainer.style.cursor = "crosshair";
      drawKillHighlight(nearest);
      const areaRect = kvMapArea.getBoundingClientRect();
      kvShowTooltip(nearest, e.clientX - areaRect.left, e.clientY - areaRect.top);
    } else {
      if (hoveredKill) kvHideTooltip();
      kvMapContainer.style.cursor = "";
    }
  });

  kvMapArea.addEventListener("mouseleave", () => {
    kvHideTooltip();
    kvMapContainer.style.cursor = "";
  });

  // Sequential animation
  function animateIn(kills) {
    if (animRAF) cancelAnimationFrame(animRAF);
    animDone = false;
    kvHideTooltip();

    if (kills.length === 0) {
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      if (isDarkThemeActive()) {
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.50)";
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        ctx.restore();
      }
      return;
    }

    const sorted = kills.slice().sort((a, b) => a.tick - b.tick);
    const n = sorted.length;

    const ARC_DUR = 120; // Laser travel time (very fast)
    const maxTotal = 4000;
    const interval = Math.max(8, (maxTotal - ARC_DUR) / n); // slightly slower interval
    const totalDuration = (n - 1) * interval + ARC_DUR + 1000;

    const startTime = performance.now();
    const progresses = new Float32Array(n);

    function step(now) {
      const elapsed = now - startTime;

      for (let i = 0; i < n; i++) {
        const throwStart = i * interval;
        if (elapsed <= throwStart) {
          progresses[i] = 0;
        } else {
          // Progress can go > 1 to drive the post-impact animations (fading line, ripple)
          progresses[i] = (elapsed - throwStart) / ARC_DUR;
        }
      }

      renderFrame(sorted, progresses);

      if (elapsed < totalDuration) {
        animRAF = requestAnimationFrame(step);
      } else {
        // Animation finished — enable hover interactions
        animDone = true;
      }
    }
    animRAF = requestAnimationFrame(step);
  }

  function updateVisualization() {
    const kills = getFiltered();
    lastFilteredKills = kills;
    document.getElementById("kvStatBadge").textContent = `${kills.length} kills`;
    
    if (isSectionVisible) {
      animateIn(kills);
    } else {
      animDone = false;
      kvHideTooltip();
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      if (isDarkThemeActive()) {
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.50)";
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        ctx.restore();
      }
    }
  }

  function kvBindFilter(containerId, filterKey) {
    const container = document.getElementById(containerId);
    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".kv-filter-btn");
      if (!btn) return;
      container.querySelectorAll(".kv-filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      filters[filterKey] = btn.dataset.value;
      updateVisualization();
    });
  }

  function switchMap(mapName) {
    currentMap = mapName;
    document.querySelectorAll(".kv-map-tab").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.map === mapName);
    });
    setThemedRadarImage(kvRadarImg, MAP_IMG_BASE + mapName + ".png");
    // Reset filters
    filters.side = "all";
    filters.player = "all";
    filters.weapon_class = "all";
    document.querySelectorAll("#kvSideFilter .kv-filter-btn, #kvPlayerFilter .kv-filter-btn, #kvWeaponFilter .kv-filter-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.value === "all");
    });
    updateVisualization();
  }

  async function init() {
    try {
      const resp = await fetch(DATA_URL);
      allData = await resp.json();
    } catch (err) {
      console.error("[KV] Failed to load kill data:", err);
      return;
    }

    // Map tabs
    document.querySelectorAll(".kv-map-tab").forEach(tab => {
      tab.addEventListener("click", () => switchMap(tab.dataset.map));
    });

    // Replay
    document.getElementById("kvReplayBtn").addEventListener("click", () => {
      updateVisualization();
    });

    // Filters
    kvBindFilter("kvSideFilter", "side");
    kvBindFilter("kvPlayerFilter", "player");
    kvBindFilter("kvWeaponFilter", "weapon_class");

    // Replay animation every time the section re-enters the viewport
    document.addEventListener("sectionVisible", (e) => {
      if (e.detail.id === "vis4Section") {
        isSectionVisible = true;
        updateVisualization();
      }
    });

    document.addEventListener("sectionHidden", (e) => {
      if (e.detail.id === "vis4Section") {
        isSectionVisible = false;
        if (animRAF) {
          cancelAnimationFrame(animRAF);
          animRAF = null;
        }
        animDone = false;
        kvHideTooltip();
      }
    });

    new MutationObserver(() => {
      setThemedRadarImage(kvRadarImg, MAP_IMG_BASE + currentMap + ".png");
      updateVisualization();
    }).observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });

    setThemedRadarImage(kvRadarImg, MAP_IMG_BASE + currentMap + ".png");
    updateVisualization();
  }

  init();
})();

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
  const mcRadarImg = document.getElementById("mcRadarImg");

  // Color LUT (T red ← contested purple → CT blue)
  const COLOR_LUT = new Uint8ClampedArray(256 * 4);
  (function buildLUT() {
    function tSide(v) {
      const absV = Math.abs(v);
      const s = Math.min(absV, 1);
      const t = 1 - s;
      return [
        Math.round(218 + 37 * t),
        Math.round(54 + 69 * t),
        Math.round(51 + 63 * t),
        Math.round(15 + 195 * s)
      ];
    }
    function ctSide(v) {
      const s = Math.min(v, 1);
      const t = 1 - s;
      return [
        Math.round(88 - 57 * s),
        Math.round(166 - 30 * s),
        255,
        Math.round(15 + 195 * s)
      ];
    }
    const CONTESTED_RGB = [167, 139, 250];
    const BAND = 0.13;
    for (let i = 0; i < 256; i++) {
      const v = (i / 255) * 2 - 1;
      const idx = i * 4;
      const av = Math.abs(v);
      if (av < BAND) {
        const u = (v + BAND) / (2 * BAND);
        const left = tSide(-BAND);
        const right = ctSide(BAND);
        let r, g, b, a;
        if (u <= 0.5) {
          const w = u / 0.5;
          r = Math.round(left[0] * (1 - w) + CONTESTED_RGB[0] * w);
          g = Math.round(left[1] * (1 - w) + CONTESTED_RGB[1] * w);
          b = Math.round(left[2] * (1 - w) + CONTESTED_RGB[2] * w);
          a = Math.round(left[3] * (1 - w) + 135 * w);
        } else {
          const w = (u - 0.5) / 0.5;
          r = Math.round(CONTESTED_RGB[0] * (1 - w) + right[0] * w);
          g = Math.round(CONTESTED_RGB[1] * (1 - w) + right[1] * w);
          b = Math.round(CONTESTED_RGB[2] * (1 - w) + right[2] * w);
          a = Math.round(135 * (1 - w) + right[3] * w);
        }
        COLOR_LUT[idx] = r;
        COLOR_LUT[idx + 1] = g;
        COLOR_LUT[idx + 2] = b;
        COLOR_LUT[idx + 3] = a;
      } else if (v <= 0) {
        const s = Math.min(av, 1);
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
    const nPct = Math.max(0, 100 - ctPct - tPct);
    const mcNeutralBar = document.getElementById("mcNeutralBar");
    document.getElementById("mcTBar").style.width = `${tPct}%`;
    document.getElementById("mcTBar").textContent = tPct > 0 ? `${tPct}%` : "";
    if (mcNeutralBar) {
      mcNeutralBar.style.width = `${nPct}%`;
      mcNeutralBar.textContent = nPct > 0 ? `${nPct}%` : "";
    }
    document.getElementById("mcCtBar").style.width = `${ctPct}%`;
    document.getElementById("mcCtBar").textContent = ctPct > 0 ? `${ctPct}%` : "";
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
    setThemedRadarImage(mcRadarImg, MAPS[mapName].img);
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
  new MutationObserver(() => {
    setThemedRadarImage(mcRadarImg, MAPS[currentMap].img);
    if (currentFrames) setFrame(frameIndex);
  }).observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });
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
//  (Vis3 initialized via IIFE above)
// ============================================================
