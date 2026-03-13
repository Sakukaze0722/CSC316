/**
 * Dashboard — Full Fancy Interaction Pack
 * Language follows system: navigator.language (zh* → zh-CN, else en)
 */

(function () {
  const sysLang = typeof navigator !== "undefined" && navigator.language ? navigator.language.toLowerCase() : "";
  const locale = sysLang.startsWith("zh") ? "zh" : "en";
  const htmlLang = locale === "zh" ? "zh-CN" : "en";
  document.documentElement.lang = htmlLang;
  document.documentElement.dataset.locale = locale;

  const STRINGS = {
    en: {
      nav_worldmap: "World Map",
      nav_mapcontrol: "Map Control",
      nav_heatmaps: "Heatmaps",
      nav_more: "More",
      nav_conclusion: "Conclusion",
      cs_detail_link: "View full CS2 analysis (detailed page) →",
      map_loading: "Loading world map...",
      detail_placeholder: "Select a country to view regional performance and trends",
      vis3_coming: "Coming Soon",
      vis3_desc: "This section is reserved for a third visualization. Check back later for updates.",
      conclusion_placeholder: "This space is for your final takeaways: summarize regional esports patterns, map control insights, and heatmap findings from the Vitality vs The MongolZ analysis.",
      conclusion_hint: "Replace this placeholder with your written conclusion before submission.",
      drawer_handle: "Top Countries",
      drawer_title_cs: "Counter-Strike Top Countries",
      drawer_title_dota: "DOTA 2 Top Countries",
      story_mode: "Story Mode",
    },
    zh: {
      nav_worldmap: "世界地图",
      nav_mapcontrol: "地图控制",
      nav_heatmaps: "热力图",
      nav_more: "更多",
      nav_conclusion: "结论",
      cs_detail_link: "查看完整 CS2 分析（详情页） →",
      map_loading: "加载世界地图中…",
      detail_placeholder: "点击国家查看该地区表现与趋势",
      vis3_coming: "即将推出",
      vis3_desc: "此处将放置第三个可视化内容，敬请期待。",
      conclusion_placeholder: "在此撰写总结：区域电竞格局、地图控制与热力图分析要点。",
      conclusion_hint: "提交前请用你的结论替换此占位内容。",
      drawer_handle: "国家排名",
      drawer_title_cs: "Counter-Strike 国家排名",
      drawer_title_dota: "DOTA 2 国家排名",
      story_mode: "故事模式",
    },
  };

  function getI18n(key) {
    return (STRINGS[locale] && STRINGS[locale][key]) || STRINGS.en[key] || key;
  }

  function applyI18n() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      const key = el.getAttribute("data-i18n");
      const text = getI18n(key);
      if (el.getAttribute("data-i18n-attr")) {
        el.setAttribute(el.getAttribute("data-i18n-attr"), text);
      } else {
        el.textContent = text;
      }
    });
  }

  window.getI18n = getI18n;

  const WORLD_ATLAS_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
  const THEME_STORAGE_KEY = "dashboard-theme";
  const SOUND_STORAGE_KEY = "dashboard-sound";
  const FLAG_MAP = {
    China: "🇨🇳",
    "United States of America": "🇺🇸",
    "United States": "🇺🇸",
    Russia: "🇷🇺",
    Sweden: "🇸🇪",
    Denmark: "🇩🇰",
    France: "🇫🇷",
    Germany: "🇩🇪",
    Brazil: "🇧🇷",
    Ukraine: "🇺🇦",
    Finland: "🇫🇮",
    Norway: "🇳🇴",
    Poland: "🇵🇱",
    Canada: "🇨🇦",
    "United Kingdom": "🇬🇧",
    Australia: "🇦🇺",
    Indonesia: "🇮🇩",
    Malaysia: "🇲🇾",
    Philippines: "🇵🇭",
    Thailand: "🇹🇭",
  };

  const THEME_COLORS = {
    dark: {
      cs: { base: "#334155", hover: "#475569", active: "#3b82f6", glow: "rgba(59,130,246,0.45)", stroke: "#334155" },
      dota2: { base: "#334155", hover: "#475569", active: "#8b5cf6", glow: "rgba(139,92,246,0.45)", stroke: "#334155" },
    },
    light: {
      cs: { base: "#cbd5e1", hover: "#94a3b8", active: "#3b82f6", glow: "rgba(59,130,246,0.35)", stroke: "#94a3b8" },
      dota2: { base: "#cbd5e1", hover: "#94a3b8", active: "#8b5cf6", glow: "rgba(139,92,246,0.35)", stroke: "#94a3b8" },
    },
  };

  const TOP_COUNTRIES = {
    cs: ["Denmark", "France", "Brazil", "Ukraine", "Sweden", "Russia", "United States", "Germany", "Poland", "Finland"],
    dota2: ["China", "Russia", "Philippines", "Indonesia", "Malaysia", "Thailand", "Ukraine", "Peru", "Brazil", "Sweden"],
  };

  const ACHIEVEMENTS = [
    { key: "explorer1", label: "Explorer I", threshold: 3 },
    { key: "explorer2", label: "Explorer II", threshold: 8 },
    { key: "explorer3", label: "Explorer III", threshold: 15 },
  ];

  const TEAM_POOL = {
    cs: ["Falcons", "Mirage", "Nova", "Steel", "Phantom", "Vertex", "Apex", "Rift", "Orbit", "Sentinel", "Pulse", "Rogue"],
    dota2: ["Ancients", "Lotus", "Aegis", "Tide", "Runes", "Echo", "Spirit", "Mythic", "Golem", "Oracle", "Radiant", "Dire"],
  };
  const PLAYER_PREFIX = ["Neo", "Ace", "Rex", "Luna", "Kai", "Vex", "Aria", "Milo", "Rin", "Jax", "Noah", "Eli", "Zed", "Nia"];

  let currentGame = "cs";
  let currentTheme = "dark";
  let worldTopology = null;
  let projection = null;
  let geoPath = null;
  let svg = null;
  let mapGroup = null;
  let selectedCountry = null;
  let selectedCountryName = null;
  let selectedTeamId = null;
  let exploredCountries = new Set();
  let soundEnabled = false;
  let audioCtx = null;
  let tooltipRAF = null;
  let particlesRAF = null;
  let hoverMenuTimer = null;

  const mapContainer = document.getElementById("worldMap");
  const mapFocusOverlay = document.getElementById("mapFocusOverlay");
  const tooltipEl = document.getElementById("countryTooltip");
  const tooltipTitle = document.getElementById("tooltipTitle");
  const tooltipSub = document.getElementById("tooltipSub");
  const teamHoverMenu = document.getElementById("teamHoverMenu");
  const detailPanel = document.getElementById("detailPanel");
  const detailTitle = document.getElementById("detailCountryName");
  const detailContent = document.getElementById("detailContent");
  const detailClose = document.getElementById("detailClose");
  const gameLabel = document.getElementById("currentGameLabel");
  const themeToggle = document.getElementById("themeToggle");
  const themeSweep = document.getElementById("themeSweep");
  const dynamicStatusBar = document.getElementById("dynamicStatusBar");
  const drawer = document.getElementById("rankDrawer");
  const drawerHandle = document.getElementById("drawerHandle");
  const drawerTitle = document.getElementById("drawerTitle");
  const drawerList = document.getElementById("drawerList");
  const achievementTrack = document.getElementById("achievementTrack");
  const storyCards = [...document.querySelectorAll(".story-card")];
  const soundToggle = document.getElementById("soundToggle");
  const particlesCanvas = document.getElementById("particlesCanvas");
  const headerEl = document.querySelector(".dashboard-header");
  const mapWrapperEl = document.querySelector(".map-wrapper");

  function getGameColors() {
    return THEME_COLORS[currentTheme][currentGame];
  }

  function hashCode(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
    return Math.abs(h);
  }

  function getCountryName(feature) {
    return feature.properties?.name || String(feature.id || "Unknown");
  }

  function getFlag(name) {
    return FLAG_MAP[name] || "🌍";
  }

  function computeMockMetrics(name, game) {
    const seed = hashCode(`${name}-${game}`);
    const tournaments = 6 + (seed % 28);
    const teams = 4 + ((seed >> 3) % 18);
    const players = teams * (game === "cs" ? 5 : 5) + ((seed >> 5) % 12);
    const winRate = 38 + ((seed >> 7) % 38);
    const series = Array.from({ length: 12 }, (_, i) => 35 + ((seed >> (i % 8)) + i * 7) % 55);
    return { tournaments, teams, players, winRate, series };
  }

  function buildCountryTeamData(countryName, game) {
    const seed = hashCode(`${countryName}-${game}-teams`);
    const pool = TEAM_POOL[game];
    const teamCount = 3 + (seed % 4);
    const used = new Set();
    const teams = [];

    for (let i = 0; i < teamCount; i++) {
      const idx = (seed + i * 5) % pool.length;
      if (used.has(idx)) continue;
      used.add(idx);
      const base = pool[idx];
      const teamName = `${base} ${countryName.slice(0, 2).toUpperCase()}`;
      const teamId = `${countryName}-${game}-${i}`.toLowerCase().replace(/\s+/g, "-");
      const players = Array.from({ length: 5 }, (_, pIdx) => {
        const pf = PLAYER_PREFIX[(seed + pIdx * 3 + i) % PLAYER_PREFIX.length];
        return `${pf}_${(seed + pIdx * 17 + i * 7) % 99}`;
      });
      teams.push({
        id: teamId,
        short: base.slice(0, 2).toUpperCase(),
        name: teamName,
        players,
      });
    }

    return teams;
  }

  function hideTeamHoverMenu() {
    teamHoverMenu.classList.remove("visible");
    if (hoverMenuTimer) {
      clearTimeout(hoverMenuTimer);
      hoverMenuTimer = null;
    }
  }

  function scheduleHideTeamHoverMenu() {
    if (hoverMenuTimer) clearTimeout(hoverMenuTimer);
    hoverMenuTimer = setTimeout(() => {
      if (!teamHoverMenu.matches(":hover")) {
        teamHoverMenu.classList.remove("visible");
      }
    }, 140);
  }

  function renderTeamHoverMenu(countryName, x, y) {
    const teams = buildCountryTeamData(countryName, currentGame);
    teamHoverMenu.innerHTML = teams
      .map(
        (t) =>
          `<button class="team-hover-item" data-country="${countryName}" data-team-id="${t.id}" title="${t.name}">${t.short}</button>`
      )
      .join("");
    teamHoverMenu.classList.add("visible");

    const menuW = 46 + teams.length * 40;
    const left = Math.max(12, Math.min(window.innerWidth - menuW - 12, x - menuW / 2));
    const top = Math.max(12, y - 64);
    teamHoverMenu.style.left = `${left}px`;
    teamHoverMenu.style.top = `${top}px`;
  }

  function renderPlayersSection(targetEl, teams, activeTeamId) {
    const activeTeam = teams.find((t) => t.id === activeTeamId);
    if (!activeTeam) {
      targetEl.innerHTML = `<p class="player-list-empty">Select a team to view active players.</p>`;
      return;
    }
    targetEl.innerHTML = `<ul class="player-list">${activeTeam.players.map((p) => `<li>${p}</li>`).join("")}</ul>`;
  }

  function playClickTone(type = "soft") {
    if (!soundEnabled) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type === "accent" ? "triangle" : "sine";
    osc.frequency.value = type === "accent" ? 520 : 380;
    gain.gain.value = 0.001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (type === "accent" ? 0.12 : 0.08));
    osc.start();
    osc.stop(t + (type === "accent" ? 0.14 : 0.1));
  }

  function updateStatusBar() {
    dynamicStatusBar.classList.toggle("dota", currentGame === "dota2");
  }

  function renderDrawer() {
    const topList = TOP_COUNTRIES[currentGame];
    drawerTitle.textContent = currentGame === "cs" ? getI18n("drawer_title_cs") : getI18n("drawer_title_dota");
    drawerList.innerHTML = topList
      .map((name, idx) => {
        const m = computeMockMetrics(name, currentGame);
        return `<li><span>${idx + 1}. ${getFlag(name)} ${name}</span><strong>${m.winRate}%</strong></li>`;
      })
      .join("");
  }

  function renderAchievements() {
    achievementTrack.innerHTML = ACHIEVEMENTS.map((a) => {
      const unlocked = exploredCountries.size >= a.threshold;
      return `<span class="achievement-badge ${unlocked ? "unlocked" : ""}">${a.label}</span>`;
    }).join("");
  }

  function renderStoryModeVisibility() {
    storyCards.forEach((card) => {
      card.style.display = card.dataset.game === currentGame ? "" : "none";
    });
  }

  function triggerThemeSweep() {
    themeSweep.classList.remove("active");
    void themeSweep.offsetWidth;
    themeSweep.classList.add("active");
  }

  function initThemeToggle() {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") {
      currentTheme = saved;
      document.body.dataset.theme = saved;
    }
    themeToggle.addEventListener("click", () => {
      currentTheme = currentTheme === "dark" ? "light" : "dark";
      document.body.dataset.theme = currentTheme;
      localStorage.setItem(THEME_STORAGE_KEY, currentTheme);
      triggerThemeSweep();
      updateMapForGame();
      playClickTone("soft");
    });
  }

  function initSoundToggle() {
    const saved = localStorage.getItem(SOUND_STORAGE_KEY);
    soundEnabled = saved === "on";
    soundToggle.classList.toggle("muted", !soundEnabled);
    soundToggle.textContent = soundEnabled ? "🔊" : "🔇";
    soundToggle.addEventListener("click", () => {
      soundEnabled = !soundEnabled;
      localStorage.setItem(SOUND_STORAGE_KEY, soundEnabled ? "on" : "off");
      soundToggle.classList.toggle("muted", !soundEnabled);
      soundToggle.textContent = soundEnabled ? "🔊" : "🔇";
      playClickTone("soft");
    });
  }

  function initGameToggle() {
    document.querySelectorAll(".game-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const game = btn.dataset.game;
        if (game === currentGame) return;
        currentGame = game;
        document.querySelectorAll(".game-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        if (gameLabel) gameLabel.textContent = game === "cs" ? "Counter-Strike" : "DOTA 2";
        mapContainer.classList.add("switching");
        setTimeout(() => mapContainer.classList.remove("switching"), 280);
        hideTeamHoverMenu();
        updateStatusBar();
        updateMapForGame();
        renderDrawer();
        renderStoryModeVisibility();
        playClickTone("accent");
      });
    });
  }

  function initDrawer() {
    drawerHandle.addEventListener("click", () => {
      drawer.classList.toggle("open");
      playClickTone("soft");
    });
    renderDrawer();
  }

  function initStoryObserver() {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle("active", entry.isIntersecting);
        });
      },
      { threshold: 0.55 }
    );
    storyCards.forEach((card) => observer.observe(card));
  }

  function initParallax() {
    // Parallax disabled — no mouse-based movement
  }

  function initParticles() {
    const ctx = particlesCanvas.getContext("2d");
    let w = 0;
    let h = 0;
    let particles = [];

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      particlesCanvas.width = w;
      particlesCanvas.height = h;
      const count = Math.max(35, Math.floor((w * h) / 42000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: Math.random() * 1.8 + 0.6,
      }));
    }

    function step() {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = currentTheme === "dark" ? "rgba(148,163,184,0.35)" : "rgba(71,85,105,0.16)";
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      particlesRAF = requestAnimationFrame(step);
    }

    resize();
    step();
    window.addEventListener("resize", resize);
  }

  function initProjection() {
    const width = mapContainer.clientWidth || 960;
    const height = mapContainer.clientHeight || 500;
    projection = d3.geoMercator().scale(width / 6.5).translate([width / 2, height / 1.5]);
    geoPath = d3.geoPath().projection(projection);
  }

  function applySelectionPulse() {
    svg.selectAll("path.country").classed("selected-pulse", false);
    if (!selectedCountry) return;
    svg
      .selectAll("path.country")
      .filter((d) => d === selectedCountry)
      .classed("selected-pulse", true);
  }

  function renderCountries(topology) {
    const countries = topojson.feature(topology, topology.objects.countries);
    const colors = getGameColors();
    svg.selectAll("*").remove();
    mapGroup = svg.append("g");

    const paths = mapGroup
      .selectAll("path")
      .data(countries.features)
      .join("path")
      .attr("class", "country")
      .attr("d", geoPath)
      .attr("fill", colors.base)
      .attr("stroke", colors.stroke)
      .attr("stroke-width", 0.5)
      .style("cursor", "pointer")
      .on("mouseover", (event, d) => onCountryHover(event, d))
      .on("mouseout", onCountryOut)
      .on("click", (event, d) => onCountryClick(event, d));

    const maxDelay = Math.min(countries.features.length * 2, 300);
    paths
      .style("opacity", 0)
      .transition()
      .delay((d, i) => Math.min(i * 2, 300))
      .duration(400)
      .ease(d3.easeCubicOut)
      .style("opacity", 1);

    setTimeout(() => {
      mapContainer.classList.remove("loading");
      mapContainer.querySelector(".map-loading")?.remove();
    }, maxDelay + 450);

    const zoom = d3.zoom().scaleExtent([1, 8]).on("zoom", (event) => mapGroup.attr("transform", event.transform));
    svg.call(zoom);
    applySelectionPulse();
  }

  function updateMapForGame() {
    if (!worldTopology || !svg) return;
    const colors = getGameColors();
    svg
      .selectAll("path.country")
      .transition()
      .duration(380)
      .ease(d3.easeCubicInOut)
      .attr("fill", (d) => (d === selectedCountry ? colors.active : colors.base))
      .attr("stroke", (d) => (d === selectedCountry ? colors.active : colors.stroke))
      .attr("stroke-width", (d) => (d === selectedCountry ? 1.6 : 0.5))
      .style("filter", (d) => (d === selectedCountry ? `drop-shadow(0 0 10px ${colors.glow})` : "none"));
    applySelectionPulse();
    if (selectedCountryName && !detailPanel.classList.contains("collapsed")) {
      renderDetailPanel(selectedCountryName, selectedTeamId);
    }
  }

  function onCountryHover(event, feature) {
    const name = getCountryName(feature);
    const m = computeMockMetrics(name, currentGame);
    tooltipTitle.textContent = `${getFlag(name)} ${name}`;
    tooltipSub.textContent = `${currentGame.toUpperCase()} · Win rate ${m.winRate}% · Teams ${m.teams}`;
    tooltipEl.classList.add("visible");
    tooltipEl.style.left = `${event.pageX}px`;
    tooltipEl.style.top = `${event.pageY}px`;
    renderTeamHoverMenu(name, event.pageX, event.pageY);

    const colors = getGameColors();
    d3.select(event.target)
      .transition()
      .duration(120)
      .attr("fill", colors.hover)
      .attr("stroke", colors.active)
      .attr("stroke-width", 1.1)
      .style("filter", `drop-shadow(0 0 8px ${colors.glow})`);
  }

  function onCountryOut(event) {
    tooltipEl.classList.remove("visible");
    scheduleHideTeamHoverMenu();
    const d = d3.select(event.target).datum();
    const colors = getGameColors();
    const isSelected = d === selectedCountry;
    d3.select(event.target)
      .transition()
      .duration(160)
      .attr("fill", isSelected ? colors.active : colors.base)
      .attr("stroke", isSelected ? colors.active : colors.stroke)
      .attr("stroke-width", isSelected ? 1.6 : 0.5)
      .style("filter", isSelected ? `drop-shadow(0 0 10px ${colors.glow})` : "none");
  }

  function renderSparkline(series, color) {
    const max = Math.max(...series);
    const min = Math.min(...series);
    const points = series
      .map((v, i) => {
        const x = (i / (series.length - 1)) * 100;
        const y = 100 - ((v - min) / Math.max(max - min, 1)) * 100;
        return `${x},${y}`;
      })
      .join(" ");
    return `
      <svg class="sparkline" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
      </svg>
    `;
  }

  function renderDetailPanel(name, preferredTeamId = null) {
    const m = computeMockMetrics(name, currentGame);
    const accent = currentGame === "cs" ? "#3b82f6" : "#8b5cf6";
    const teams = buildCountryTeamData(name, currentGame);
    const initialTeamId = preferredTeamId || teams[0]?.id || null;
    selectedTeamId = initialTeamId;
    detailTitle.textContent = `${getFlag(name)} ${name}`;
    detailContent.innerHTML = `
      <p><strong>Game:</strong> ${currentGame === "cs" ? "Counter-Strike" : "DOTA 2"}</p>
      <div class="kpi-grid">
        <div class="kpi-card"><span class="kpi-label">Tournaments</span><span class="kpi-value">${m.tournaments}</span></div>
        <div class="kpi-card"><span class="kpi-label">Teams</span><span class="kpi-value">${m.teams}</span></div>
        <div class="kpi-card"><span class="kpi-label">Player Pool</span><span class="kpi-value">${m.players}</span></div>
        <div class="kpi-card"><span class="kpi-label">Win Rate</span><span class="kpi-value">${m.winRate}%</span></div>
      </div>
      <div class="sparkline-wrap">
        <div class="sparkline-title">Recent 12-period strength trend</div>
        ${renderSparkline(m.series, accent)}
      </div>
      <div class="country-team-section">
        <div class="team-section-title">Teams</div>
        <div class="team-list" id="detailTeamList">
          ${teams
            .map(
              (team) =>
                `<button class="team-list-item ${team.id === initialTeamId ? "active" : ""}" data-team-id="${team.id}">${team.short} · ${team.name}</button>`
            )
            .join("")}
        </div>
        <div class="team-section-title">Active Players</div>
        <div id="detailPlayerList"></div>
      </div>
    `;

    const teamListEl = detailContent.querySelector("#detailTeamList");
    const playerListEl = detailContent.querySelector("#detailPlayerList");
    renderPlayersSection(playerListEl, teams, initialTeamId);

    teamListEl?.addEventListener("click", (event) => {
      const btn = event.target.closest(".team-list-item");
      if (!btn) return;
      const teamId = btn.dataset.teamId;
      selectedTeamId = teamId;
      teamListEl.querySelectorAll(".team-list-item").forEach((item) => {
        item.classList.toggle("active", item.dataset.teamId === teamId);
      });
      renderPlayersSection(playerListEl, teams, teamId);
      playClickTone("soft");
    });
  }

  function applyMapFocus(event) {
    const rect = mapContainer.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    mapFocusOverlay.style.setProperty("--focus-x", `${x}%`);
    mapFocusOverlay.style.setProperty("--focus-y", `${y}%`);
    mapFocusOverlay.classList.add("active");
  }

  function onCountryClick(event, feature) {
    event.stopPropagation();
    const name = getCountryName(feature);
    selectedCountry = feature;
    selectedCountryName = name;
    selectedTeamId = null;
    exploredCountries.add(name);
    const colors = getGameColors();

    svg.selectAll("path.country").classed("selected-pulse", false);
    svg.selectAll("path.country").each(function (d) {
      d3.select(this)
        .transition()
        .duration(240)
        .attr("fill", d === feature ? colors.active : colors.base)
        .attr("stroke", d === feature ? colors.active : colors.stroke)
        .attr("stroke-width", d === feature ? 1.6 : 0.5)
        .style("filter", d === feature ? `drop-shadow(0 0 10px ${colors.glow})` : "none");
    });

    d3.select(event.target).classed("selected-pulse", true);
    hideTeamHoverMenu();
    renderDetailPanel(name, null);
    renderAchievements();
    detailPanel.classList.remove("collapsed");
    applyMapFocus(event);
    playClickTone("accent");
  }

  function closeDetailPanel() {
    detailPanel.classList.add("collapsed");
    selectedCountry = null;
    selectedCountryName = null;
    selectedTeamId = null;
    mapFocusOverlay.classList.remove("active");
    hideTeamHoverMenu();
    updateMapForGame();
    playClickTone("soft");
  }

  function initDetailPanel() {
    detailClose.addEventListener("click", closeDetailPanel);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !detailPanel.classList.contains("collapsed")) {
        closeDetailPanel();
      }
    });
    mapWrapperEl.addEventListener("click", () => {
      if (!detailPanel.classList.contains("collapsed")) {
        closeDetailPanel();
      }
    });
  }

  function initTeamHoverMenu() {
    teamHoverMenu.addEventListener("mouseenter", () => {
      if (hoverMenuTimer) {
        clearTimeout(hoverMenuTimer);
        hoverMenuTimer = null;
      }
    });
    teamHoverMenu.addEventListener("mouseleave", () => {
      scheduleHideTeamHoverMenu();
    });
    teamHoverMenu.addEventListener("click", (event) => {
      const btn = event.target.closest(".team-hover-item");
      if (!btn) return;
      event.stopPropagation();
      const country = btn.dataset.country;
      const teamId = btn.dataset.teamId;
      selectedCountryName = country;
      selectedTeamId = teamId;
      renderDetailPanel(country, teamId);
      detailPanel.classList.remove("collapsed");
      hideTeamHoverMenu();
      playClickTone("accent");
    });
  }

  function initTooltipTracking() {
    document.addEventListener("mousemove", (e) => {
      if (!tooltipEl.classList.contains("visible")) return;
      if (tooltipRAF) cancelAnimationFrame(tooltipRAF);
      tooltipRAF = requestAnimationFrame(() => {
        tooltipEl.style.left = `${e.pageX}px`;
        tooltipEl.style.top = `${e.pageY}px`;
        tooltipRAF = null;
      });
    });
  }

  async function initWorldMap() {
    const width = mapContainer.clientWidth || 960;
    const height = Math.max(500, window.innerHeight - 260);
    svg = d3
      .select("#worldMap")
      .append("svg")
      .attr("viewBox", [0, 0, width, height])
      .attr("width", "100%")
      .attr("height", "100%")
      .style("background", "transparent");
    initProjection();
    worldTopology = await d3.json(WORLD_ATLAS_URL);
    renderCountries(worldTopology);
  }

  function initResize() {
    window.addEventListener("resize", () => {
      if (!worldTopology || !svg) return;
      initProjection();
      renderCountries(worldTopology);
      renderDrawer();
    });
  }

  function initNavHighlight() {
    const nav = document.getElementById("mainNav");
    if (!nav) return;
    const links = nav.querySelectorAll(".main-nav-link");
    const sectionIds = Array.from(links).map((a) => a.getAttribute("href")?.slice(1)).filter(Boolean);
    const sections = sectionIds.map((id) => document.getElementById(id)).filter(Boolean);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.id;
          links.forEach((link) => {
            const href = link.getAttribute("href");
            link.classList.toggle("active", href === "#" + id);
          });
        });
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 }
    );
    sections.forEach((el) => el && observer.observe(el));
  }

  async function init() {
    applyI18n();
    initThemeToggle();
    initSoundToggle();
    initGameToggle();
    initDrawer();
    initDetailPanel();
    initTeamHoverMenu();
    initTooltipTracking();
    initStoryObserver();
    initParallax();
    initParticles();
    updateStatusBar();
    renderStoryModeVisibility();
    renderAchievements();
    initNavHighlight();

    try {
      await initWorldMap();
    } catch (err) {
      console.error("Failed to load world map:", err);
      mapContainer.classList.remove("loading");
      mapContainer.innerHTML = '<p style="color:#94a3b8;padding:2rem;text-align:center;">Failed to load world map. Please check your network connection.</p>';
    }

    initResize();
  }

  init();
})();
