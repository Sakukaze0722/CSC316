/**
 * Dashboard — 世界地图 + CS/DOTA2 切换 (Fancy 版)
 */

(function () {
  const WORLD_ATLAS_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
  const THEME_STORAGE_KEY = "dashboard-theme";

  // 游戏主题色（按 日/夜 模式）
  const THEME_COLORS = {
    dark: {
      cs: { base: "#334155", hover: "#475569", active: "#3b82f6", glow: "rgba(59, 130, 246, 0.4)", stroke: "#334155" },
      dota2: { base: "#334155", hover: "#475569", active: "#8b5cf6", glow: "rgba(139, 92, 246, 0.4)", stroke: "#334155" },
    },
    light: {
      cs: { base: "#cbd5e1", hover: "#94a3b8", active: "#3b82f6", glow: "rgba(59, 130, 246, 0.35)", stroke: "#94a3b8" },
      dota2: { base: "#cbd5e1", hover: "#94a3b8", active: "#8b5cf6", glow: "rgba(139, 92, 246, 0.35)", stroke: "#94a3b8" },
    },
  };

  let currentGame = "cs";
  let currentTheme = "dark";
  let worldTopology = null;
  let geoPath = null;
  let projection = null;
  let svg = null;
  let selectedCountry = null;

  const mapContainer = document.getElementById("worldMap");
  const tooltipEl = document.getElementById("countryTooltip");
  const detailPanel = document.getElementById("detailPanel");
  const detailTitle = document.getElementById("detailCountryName");
  const detailContent = document.getElementById("detailContent");
  const detailClose = document.getElementById("detailClose");
  const gameLabel = document.getElementById("currentGameLabel");
  const themeToggle = document.getElementById("themeToggle");

  function getGameColors() {
    return THEME_COLORS[currentTheme][currentGame];
  }

  // ============================================================
  // 主题切换（日/夜间模式）
  // ============================================================
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
      updateMapForGame(currentGame);
    });
  }

  // ============================================================
  // 游戏切换
  // ============================================================
  function initGameToggle() {
    document.querySelectorAll(".game-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const game = btn.dataset.game;
        if (game === currentGame) return;

        currentGame = game;
        document.querySelectorAll(".game-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        gameLabel.textContent = game === "cs" ? "Counter-Strike" : "DOTA 2";

        updateMapForGame(game);
      });
    });
  }

  function updateMapForGame(game) {
    if (worldTopology && svg) {
      const paths = svg.selectAll("path.country");
      const colors = getGameColors();
      paths
        .transition()
        .duration(400)
        .ease(d3.easeCubicInOut)
        .attr("fill", (d) => {
          if (d === selectedCountry) return colors.active;
          return colors.base;
        })
        .attr("stroke", (d) => (d === selectedCountry ? colors.active : colors.stroke))
        .attr("stroke-width", (d) => (d === selectedCountry ? 1.5 : 0.5))
        .style("filter", (d) => (d === selectedCountry ? "drop-shadow(0 0 10px " + colors.glow + ")" : "none"));
    }
  }

  // ============================================================
  // 世界地图
  // ============================================================
  function initProjection() {
    const width = mapContainer.clientWidth || 960;
    const height = mapContainer.clientHeight || 500;
    projection = d3
      .geoMercator()
      .scale(width / 6.5)
      .translate([width / 2, height / 1.5]);
    geoPath = d3.geoPath().projection(projection);
  }

  function renderCountries(topology, game) {
    const countries = topojson.feature(topology, topology.objects.countries);
    const width = mapContainer.clientWidth || 960;
    const height = mapContainer.clientHeight || 500;
    const colors = getGameColors();

    svg.selectAll("*").remove();

    const g = svg.append("g");

    // 绘制国家 - 带入场动画
    const paths = g
      .selectAll("path")
      .data(countries.features)
      .join("path")
      .attr("class", "country")
      .attr("d", geoPath)
      .attr("fill", colors.base)
      .attr("stroke", colors.stroke)
      .attr("stroke-width", 0.5)
      .style("cursor", "pointer")
      .style("transition", "filter 0.2s ease")
      .on("mouseover", (event, d) => onCountryHover(event, d))
      .on("mouseout", onCountryOut)
      .on("click", (event, d) => onCountryClick(event, d));

    // 入场动画：从透明到可见
    const maxDelay = Math.min(countries.features.length * 2, 300);
    paths
      .style("opacity", 0)
      .transition()
      .delay((d, i) => Math.min(i * 2, 300))
      .duration(400)
      .ease(d3.easeCubicOut)
      .style("opacity", 1);

    // 动画结束后移除 loading
    setTimeout(() => {
      mapContainer.classList.remove("loading");
      mapContainer.querySelector(".map-loading")?.remove();
    }, maxDelay + 450);

    // 缩放与拖拽
    const zoom = d3
      .zoom()
      .scaleExtent([1, 8])
      .on("zoom", (event) => g.attr("transform", event.transform));

    svg.call(zoom);
  }

  function getCountryName(d) {
    return d.properties?.name ?? d.id ?? "Unknown";
  }

  function onCountryHover(event, d) {
    const name = getCountryName(d);
    tooltipEl.textContent = name;
    tooltipEl.classList.add("visible");
    tooltipEl.style.left = event.pageX + "px";
    tooltipEl.style.top = event.pageY + "px";

    const colors = getGameColors();
    d3.select(event.target)
      .transition()
      .duration(150)
      .attr("fill", colors.hover)
      .attr("stroke", colors.active)
      .attr("stroke-width", 1)
      .style("filter", "drop-shadow(0 0 8px " + colors.glow + ")");
  }

  function onCountryOut(event) {
    tooltipEl.classList.remove("visible");

    const d = d3.select(event.target).datum();
    const colors = getGameColors();
    const isSelected = d === selectedCountry;

    d3.select(event.target)
      .transition()
      .duration(200)
      .attr("fill", isSelected ? colors.active : colors.base)
      .attr("stroke", isSelected ? colors.active : colors.stroke)
      .attr("stroke-width", isSelected ? 1.5 : 0.5)
      .style("filter", isSelected ? "drop-shadow(0 0 8px " + colors.glow + ")" : "none");
  }

  function onCountryClick(event, d) {
    const name = getCountryName(d);
    selectedCountry = d;
    const colors = getGameColors();

    // 取消之前选中
    svg.selectAll("path.country").each(function (datum) {
      if (datum !== d) {
        d3.select(this)
          .transition()
          .duration(300)
          .attr("fill", colors.base)
          .attr("stroke", colors.stroke)
          .attr("stroke-width", 0.5)
          .style("filter", "none");
      }
    });

    // 高亮当前选中
    d3.select(event.target)
      .transition()
      .duration(300)
      .attr("fill", colors.active)
      .attr("stroke", colors.active)
      .attr("stroke-width", 1.5)
      .style("filter", "drop-shadow(0 0 10px " + colors.glow + ")");

    // 更新详情面板
    detailTitle.textContent = name;
    detailContent.innerHTML = `
      <p><strong>游戏：</strong>${currentGame === "cs" ? "Counter-Strike" : "DOTA 2"}</p>
      <p>此处可展示该国家的电竞数据（队伍、选手、赛事等）。</p>
      <p class="detail-placeholder">数据对接后在此渲染。</p>
    `;
    detailPanel.classList.remove("collapsed");
  }

  // ============================================================
  // 侧边栏
  // ============================================================
  function initDetailPanel() {
    detailClose.addEventListener("click", () => {
      detailPanel.classList.add("collapsed");
      selectedCountry = null;

      if (worldTopology && svg) {
        const colors = getGameColors();
        svg
          .selectAll("path.country")
          .transition()
          .duration(300)
          .attr("fill", colors.base)
          .attr("stroke", colors.stroke)
          .attr("stroke-width", 0.5)
          .style("filter", "none");
      }
    });
  }

  // 工具提示跟随（节流）
  let tooltipRAF = null;
  document.addEventListener("mousemove", (e) => {
    if (!tooltipEl.classList.contains("visible")) return;
    if (tooltipRAF) cancelAnimationFrame(tooltipRAF);
    tooltipRAF = requestAnimationFrame(() => {
      tooltipEl.style.left = e.pageX + "px";
      tooltipEl.style.top = e.pageY + "px";
      tooltipRAF = null;
    });
  });

  // ============================================================
  // 初始化
  // ============================================================
  async function init() {
    initThemeToggle();
    initGameToggle();
    initDetailPanel();

    const width = mapContainer.clientWidth || 960;
    const height = Math.max(500, window.innerHeight - 200);

    svg = d3
      .select("#worldMap")
      .append("svg")
      .attr("viewBox", [0, 0, width, height])
      .attr("width", "100%")
      .attr("height", "100%")
      .style("background", "transparent");

    initProjection();

    try {
      worldTopology = await d3.json(WORLD_ATLAS_URL);
      renderCountries(worldTopology, currentGame);
    } catch (err) {
      console.error("Failed to load world map:", err);
      mapContainer.classList.remove("loading");
      mapContainer.innerHTML =
        '<p style="color:#94a3b8;padding:2rem;text-align:center;">加载世界地图失败，请检查网络连接。</p>';
    }
  }

  window.addEventListener("resize", () => {
    if (worldTopology && svg) {
      initProjection();
      renderCountries(worldTopology, currentGame);
    }
  });

  init();
})();
