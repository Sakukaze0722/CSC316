// Main entry point for D3 visualizations

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
  let filters = { side: "all", match: "all", type: "all", player: "all" };
  let animRAF = null;
  let isSectionVisible = false;

  const canvas = document.getElementById("ulTrailCanvas");
  const ctx = canvas.getContext("2d");

  function getFilteredTrajectories() {
    if (!allData || !allData.maps[currentMap]) return [];
    let trajs = allData.maps[currentMap].trajectories;
    if (filters.side !== "all") trajs = trajs.filter(t => t.side === filters.side);
    if (filters.match !== "all") trajs = trajs.filter(t => t.match === filters.match);
    if (filters.type !== "all") trajs = trajs.filter(t => t.type === filters.type);
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
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.restore();

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

  // Sequential animation: grenades thrown one by one, each arc grows from throw→land
  function animateIn(trajs) {
    if (animRAF) cancelAnimationFrame(animRAF);
    if (trajs.length === 0) {
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.restore();
      return;
    }

    // Sort by tick to preserve throw order
    const sorted = trajs.slice().sort((a, b) => a.tick - b.tick);
    const n = sorted.length;

    // Timing: each arc takes ARC_DUR ms to grow; a new throw starts every INTERVAL ms
    // Total duration ≈ (n-1)*INTERVAL + ARC_DUR — keep under ~5s
    const ARC_DUR = 250;                                     // ms per arc growth
    const maxTotal = 4500;                                   // target max total
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
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.restore();
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
    document.getElementById("ulRadarImg").src = MAP_IMG_BASE + mapName + ".png";
    // Reset filters
    filters.side = "all";
    filters.match = "all";
    filters.type = "all";
    filters.player = "all";
    document.querySelectorAll("#ulSideFilter .ul-filter-btn, #ulTypeFilter .ul-filter-btn, #ulPlayerFilter .ul-filter-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.value === "all");
    });
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

    // Bind sidebar filters (once)
    bindFilterGroup("ulSideFilter", "side");
    bindFilterGroup("ulMatchFilter", "match");
    bindFilterGroup("ulTypeFilter", "type");
    bindFilterGroup("ulPlayerFilter", "player");

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
      }
    });

    // Initial load
    updateMatchFilter();
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

  const canvas = document.getElementById("kvCanvas");
  const ctx = canvas.getContext("2d");

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
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.50)";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.restore();

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

  // Sequential animation
  function animateIn(kills) {
    if (animRAF) cancelAnimationFrame(animRAF);
    if (kills.length === 0) {
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.50)";
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.restore();
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
        // Just let the last frame persist
      }
    }
    animRAF = requestAnimationFrame(step);
  }

  function updateVisualization() {
    const kills = getFiltered();
    document.getElementById("kvStatBadge").textContent = `${kills.length} kills`;
    
    if (isSectionVisible) {
      animateIn(kills);
    } else {
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.50)";
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.restore();
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
    document.getElementById("kvRadarImg").src = MAP_IMG_BASE + mapName + ".png";
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
      }
    });

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
//  (Vis3 initialized via IIFE above)
// ============================================================
