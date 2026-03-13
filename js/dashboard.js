
/**
 * Dashboard - World map + player dashboard (player_stats-driven).
 */

(function () {
  const WORLD_ATLAS_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
  const PLAYER_STATS_URL = "data/player_stats.csv";
  const HLTV_ENRICH_URL = "https://hltv-api.vercel.app/api/player.json";
  const HLTV_OVERRIDES_URL = "data/hltv_player_overrides.json";
  const THEME_STORAGE_KEY = "dashboard-theme";
  const SOUND_STORAGE_KEY = "dashboard-sound";

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

  const TOP_COUNTRIES_DOTA = ["China", "Russia", "Philippines", "Indonesia", "Malaysia", "Thailand", "Ukraine", "Peru", "Brazil", "Sweden"];
  const ACHIEVEMENTS = [
    { label: "Explorer I", threshold: 3 },
    { label: "Explorer II", threshold: 8 },
    { label: "Explorer III", threshold: 15 },
  ];

  const MAP_ALIAS_TO_DATA = {
    "united states of america": "United States",
    "czechia": "Czech Republic",
    "russian federation": "Russia",
    "bosnia and herz": "Bosnia and Herzegovina",
    "bosnia and herzegovina": "Bosnia and Herzegovina",
    "republic of korea": "Korea",
    "south korea": "Korea",
    "north macedonia": "Macedonia",
  };

  const COUNTRY_CODE = {
    Albania: "AL", Argentina: "AR", Australia: "AU", Austria: "AT", Azerbaijan: "AZ", Belarus: "BY", Belgium: "BE",
    "Bosnia and Herzegovina": "BA", Brazil: "BR", Bulgaria: "BG", Canada: "CA", Chile: "CL", China: "CN", Colombia: "CO",
    Croatia: "HR", "Czech Republic": "CZ", Denmark: "DK", Estonia: "EE", Finland: "FI", France: "FR", Germany: "DE",
    Greece: "GR", Guatemala: "GT", "Hong Kong": "HK", Hungary: "HU", India: "IN", Indonesia: "ID", Iraq: "IQ", Ireland: "IE",
    Israel: "IL", Italy: "IT", Japan: "JP", Jordan: "JO", Kazakhstan: "KZ", Korea: "KR", Kyrgyzstan: "KG", Latvia: "LV",
    Lebanon: "LB", Lithuania: "LT", Macedonia: "MK", Malaysia: "MY", Mexico: "MX", Mongolia: "MN", Montenegro: "ME",
    Netherlands: "NL", "New Zealand": "NZ", Norway: "NO", Peru: "PE", Philippines: "PH", Poland: "PL", Portugal: "PT",
    Romania: "RO", Russia: "RU", Serbia: "RS", Singapore: "SG", Slovakia: "SK", Slovenia: "SI", "South Africa": "ZA",
    Spain: "ES", Sweden: "SE", Switzerland: "CH", Taiwan: "TW", Thailand: "TH", Tunisia: "TN", Turkey: "TR", Ukraine: "UA",
    "United Arab Emirates": "AE", "United Kingdom": "GB", "United States": "US", Uruguay: "UY", Uzbekistan: "UZ", Vietnam: "VN",
  };

  const RADAR_METRICS = [
    { key: "rating", label: "Rating", fmt: (v) => v.toFixed(2) },
    { key: "kd", label: "K/D", fmt: (v) => v.toFixed(2) },
    { key: "kd_diff", label: "K-D Diff", fmt: (v) => d3.format(",.0f")(v) },
    { key: "total_maps", label: "Maps", fmt: (v) => d3.format(",.0f")(v) },
    { key: "total_rounds", label: "Rounds", fmt: (v) => d3.format(",.0f")(v) },
    { key: "teamCount", label: "Teams", fmt: (v) => d3.format(".0f")(v) },
  ];
  const EMPTY_METRIC_PROFILE = { rating: 0, kd: 0, kd_diff: 0, total_maps: 0, total_rounds: 0, teamCount: 0 };

  let currentGame = "cs";
  let currentTheme = "dark";
  let worldTopology = null;
  let projection = null;
  let geoPath = null;
  let svg = null;
  let mapGroup = null;
  let selectedCountry = null;
  let selectedCountryName = null;
  let selectedCountryProfile = null;
  let exploredCountries = new Set();
  let soundEnabled = false;
  let audioCtx = null;
  let tooltipRAF = null;
  let particlesRAF = null;
  let hoverMenuTimer = null;
  let radarMode = "global";
  let detailPlayerSort = "rating";
  let detailPlayerQuery = "";
  let detailPlayerPage = 1;
  let mapScale = 1;
  let mapPanX = 0;
  let mapPanY = 0;
  let mapDragging = false;

  let players = [];
  let playerById = new Map();
  let countryData = new Map();
  let countryLookup = new Map();
  let countryRank = [];
  let metricExtents = {};
  let globalMetricAverages = { ...EMPTY_METRIC_PROFILE };

  const mapContainer = document.getElementById("worldMap");
  const mapFocusOverlay = document.getElementById("mapFocusOverlay");
  const tooltipEl = document.getElementById("countryTooltip");
  const tooltipTitle = document.getElementById("tooltipTitle");
  const tooltipSub = document.getElementById("tooltipSub");
  const teamHoverMenu = document.getElementById("teamHoverMenu");
  const mapZoomSlider = document.getElementById("mapZoomSlider");
  const mapZoomValue = document.getElementById("mapZoomValue");
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

  const playerModal = document.getElementById("playerDashboardModal");
  const playerModalBackdrop = document.getElementById("playerDashboardBackdrop");
  const playerModalClose = document.getElementById("playerDashboardClose");
  const playerModalContent = document.getElementById("playerDashboardContent");

  function getGameColors() {
    return THEME_COLORS[currentTheme][currentGame];
  }

  function hashCode(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function esc(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function normCountry(value) {
    return String(value || "")
      .toLowerCase()
      .replaceAll("&", " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function numOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function parseTeams(raw) {
    if (!raw) return [];
    const hit = [...String(raw).matchAll(/'([^']*)'|"([^"]*)"/g)]
      .map((m) => m[1] || m[2])
      .map((name) => name.trim())
      .filter(Boolean);
    if (hit.length) return [...new Set(hit)];
    return String(raw)
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map((v) => v.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }

  function initials(name) {
    const parts = String(name || "").split(/[\s\-_]+/).filter(Boolean);
    if (!parts.length) return "P";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  function normalizePlayerName(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function playerSlug(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "player";
  }

  function avatarUri(name) {
    const seed = hashCode(name);
    const h1 = seed % 360;
    const h2 = (seed * 7) % 360;
    const label = initials(name);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220' viewBox='0 0 220 220'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='hsl(${h1},78%,58%)'/><stop offset='100%' stop-color='hsl(${h2},72%,42%)'/></linearGradient></defs><rect width='220' height='220' rx='28' fill='url(#g)'/><circle cx='110' cy='88' r='38' fill='rgba(255,255,255,0.28)'/><rect x='58' y='138' width='104' height='40' rx='20' fill='rgba(255,255,255,0.28)'/><text x='110' y='204' text-anchor='middle' fill='rgba(255,255,255,0.92)' font-size='46' font-family='Segoe UI,Arial,sans-serif' font-weight='700'>${label}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function flagEmoji(country) {
    const code = COUNTRY_CODE[country];
    if (!code || code.length !== 2) return "[Flag]";
    const cp = code.toUpperCase().split("").map((ch) => 127397 + ch.charCodeAt(0));
    return String.fromCodePoint(...cp);
  }

  function flagImg(country) {
    const code = COUNTRY_CODE[country];
    return code ? `https://flagcdn.com/w80/${code.toLowerCase()}.png` : "";
  }

  function mapCountryName(feature) {
    return feature.properties?.name || String(feature.id || "Unknown");
  }

  function mockMetrics(name, game) {
    const s = hashCode(`${name}-${game}`);
    return {
      tournaments: 6 + (s % 28),
      teams: 4 + ((s >> 3) % 18),
      players: 20 + ((s >> 5) % 120),
      winRate: 38 + ((s >> 7) % 38),
      series: Array.from({ length: 12 }, (_, i) => 35 + ((s >> (i % 8)) + i * 7) % 55),
    };
  }
  function canonicalDataCountry(raw) {
    const norm = normCountry(raw);
    return MAP_ALIAS_TO_DATA[norm] || raw;
  }

  function resolveCountryForMap(raw) {
    const norm = normCountry(raw);
    if (countryLookup.has(norm)) return countryLookup.get(norm);
    if (MAP_ALIAS_TO_DATA[norm] && countryData.has(MAP_ALIAS_TO_DATA[norm])) return MAP_ALIAS_TO_DATA[norm];
    return countryData.has(raw) ? raw : null;
  }

  function metricValue(player, key) {
    return key === "teamCount" ? player.teamCount : num(player[key]);
  }

  function normalizeByExtent(value, extent) {
    if (!extent || extent.length !== 2) return 0.5;
    const min = num(extent[0]);
    const max = num(extent[1], 1);
    if (Math.abs(max - min) < 1e-6) return 0.5;
    return clamp((value - min) / (max - min), 0, 1);
  }

  function percentile(value, extent) {
    return `${Math.round(normalizeByExtent(value, extent) * 100)}th pct`;
  }

  function averageMetricsFromPlayers(playerList) {
    if (!Array.isArray(playerList) || !playerList.length) return { ...EMPTY_METRIC_PROFILE };
    return {
      rating: d3.mean(playerList, (p) => p.rating) || 0,
      kd: d3.mean(playerList, (p) => p.kd) || 0,
      kd_diff: d3.mean(playerList, (p) => p.kd_diff) || 0,
      total_maps: d3.mean(playerList, (p) => p.total_maps) || 0,
      total_rounds: d3.mean(playerList, (p) => p.total_rounds) || 0,
      teamCount: d3.mean(playerList, (p) => p.teamCount) || 0,
    };
  }

  function baselineForMode(profile, mode) {
    if (mode === "country") return averageMetricsFromPlayers(profile?.players || []);
    return globalMetricAverages;
  }

  function baselineLabel(profile, mode) {
    if (mode === "country" && profile?.country) return `${profile.country} average`;
    if (mode === "country") return "Country average";
    return "Global average";
  }

  function modePopulationLabel(profile, mode) {
    if (mode === "country" && profile?.country) return `${profile.country} players`;
    return "all players";
  }

  function bindFlagFallback(scope) {
    if (!scope) return;
    scope.querySelectorAll("img.flag-image").forEach((img) => {
      img.addEventListener("error", () => img.classList.add("hidden"));
    });
  }

  /**
   * Convert one CSV row into the internal normalized player model.
   * This model intentionally includes both "source stats" and "future enrichment"
   * fields so UI rendering stays deterministic even before HLTV data arrives.
   */
  function toPlayer(row, index) {
    const name = String(row.name || "").trim();
    const countryRaw = String(row.country || "").trim();
    if (!name || !countryRaw) return null;
    const teams = parseTeams(row.teams);
    const country = canonicalDataCountry(countryRaw);
    const totalMaps = num(row.total_maps);
    const fallbackAvatar = avatarUri(name);
    return {
      id: `p-${index}-${hashCode(`${name}-${country}-${totalMaps}`)}`,
      name,
      country,
      teams,
      teamCount: teams.length,
      total_maps: totalMaps,
      total_rounds: num(row.total_rounds),
      kd_diff: num(row.kd_diff),
      kd: num(row.kd),
      rating: num(row.rating),
      avatar: fallbackAvatar,
      avatarFallback: fallbackAvatar,
      hltvId: null,
      hltvIgn: name,
      hltvCountry: country,
      hltvCountryCode: null,
      hltvAge: null,
      hltvStats: null,
      hltvCurrentTeam: null,
      hltvTeamsHistory: [],
      hltvNews: [],
      hltvSocials: null,
      hltvUrl: `https://www.hltv.org/search?query=${encodeURIComponent(name)}`,
    };
  }

  /**
   * Rebuild all cross-country aggregates from the currently loaded player list.
   * We call this once after loading to keep every downstream chart in sync with one
   * source of truth (country panel, radar extents, rankings, mode baselines).
   */
  function buildData(records) {
    playerById = new Map();
    countryData = new Map();
    countryLookup = new Map();

    records.forEach((p) => playerById.set(p.id, p));
    const grouped = d3.group(records, (p) => p.country);

    grouped.forEach((list, country) => {
      const sorted = list.slice().sort((a, b) => d3.descending(a.rating, b.rating) || d3.descending(a.kd, b.kd));
      const teamSet = new Set();
      sorted.forEach((p) => p.teams.forEach((t) => teamSet.add(t)));
      const profile = {
        country,
        players: sorted,
        playerCount: sorted.length,
        avgRating: d3.mean(sorted, (p) => p.rating) || 0,
        avgKD: d3.mean(sorted, (p) => p.kd) || 0,
        avgKDDiff: d3.mean(sorted, (p) => p.kd_diff) || 0,
        totalMaps: d3.sum(sorted, (p) => p.total_maps),
        totalRounds: d3.sum(sorted, (p) => p.total_rounds),
        teamCount: teamSet.size,
      };
      countryData.set(country, profile);
      countryLookup.set(normCountry(country), country);
    });

    Object.entries(MAP_ALIAS_TO_DATA).forEach(([alias, target]) => {
      if (countryData.has(target)) countryLookup.set(alias, target);
    });

    countryRank = Array.from(countryData.values()).sort((a, b) => d3.descending(a.avgRating, b.avgRating) || d3.descending(a.playerCount, b.playerCount));

    metricExtents = {
      rating: d3.extent(records, (p) => p.rating),
      kd: d3.extent(records, (p) => p.kd),
      kd_diff: d3.extent(records, (p) => p.kd_diff),
      total_maps: d3.extent(records, (p) => p.total_maps),
      total_rounds: d3.extent(records, (p) => p.total_rounds),
      teamCount: d3.extent(records, (p) => p.teamCount),
    };
    globalMetricAverages = averageMetricsFromPlayers(records);
  }

  /**
   * Merge locally cached HLTV player profiles.
   * This file is generated offline to avoid browser-side anti-bot/CORS issues while
   * still giving us richer data (photo, age, team history, socials, news, etc.).
   */
  async function applyHLTVOverrides() {
    try {
      const payload = await d3.json(HLTV_OVERRIDES_URL);
      if (!payload || typeof payload !== "object") return 0;
      const rawMap = payload.players || {};
      const normalizedMap = new Map();
      Object.entries(rawMap).forEach(([key, value]) => {
        normalizedMap.set(normalizePlayerName(key), value);
      });

      let applied = 0;
      players.forEach((player) => {
        const override = rawMap[player.name] || normalizedMap.get(normalizePlayerName(player.name));
        if (!override) return;

        if (typeof override.image === "string" && override.image.startsWith("http")) {
          player.avatar = override.image;
        }
        if (typeof override.name === "string" && override.name.trim()) {
          player.fullname = override.name.trim();
        }
        if (typeof override.ign === "string" && override.ign.trim()) {
          player.hltvIgn = override.ign.trim();
        }
        if (typeof override.country === "string" && override.country.trim()) {
          player.hltvCountry = override.country.trim();
        }
        if (typeof override.countryCode === "string" && override.countryCode.trim()) {
          player.hltvCountryCode = override.countryCode.trim();
        }
        if (Number.isFinite(override.age)) {
          player.hltvAge = override.age;
        }
        if (override.statistics && typeof override.statistics === "object") {
          player.hltvStats = {
            rating: numOrNull(override.statistics.rating),
            killsPerRound: numOrNull(override.statistics.killsPerRound),
            headshots: numOrNull(override.statistics.headshots),
            mapsPlayed: numOrNull(override.statistics.mapsPlayed),
            deathsPerRound: numOrNull(override.statistics.deathsPerRound),
            roundsContributed: numOrNull(override.statistics.roundsContributed),
          };
        }
        if (override.currentTeam && typeof override.currentTeam === "object") {
          player.hltvCurrentTeam = {
            id: override.currentTeam.id || null,
            name: override.currentTeam.name || null,
            ranking: override.currentTeam.ranking || null,
          };
        }
        if (Array.isArray(override.teams)) {
          player.hltvTeamsHistory = override.teams.slice(0, 12);
        }
        if (Array.isArray(override.news)) {
          player.hltvNews = override.news.slice(0, 10);
        }
        if (override.socials && typeof override.socials === "object") {
          player.hltvSocials = {
            twitter: override.socials.twitter || null,
            twitch: override.socials.twitch || null,
            facebook: override.socials.facebook || null,
            instagram: override.socials.instagram || null,
          };
        }

        if (override.id) {
          player.hltvId = override.id;
          const ign = override.ign || player.hltvIgn || player.name;
          player.hltvUrl = `https://www.hltv.org/player/${override.id}/${playerSlug(ign)}`;
        }
        applied += 1;
      });

      return applied;
    } catch (error) {
      console.warn("HLTV overrides file unavailable:", error);
      return 0;
    }
  }

  /**
   * Secondary enrichment from public HLTV top-team roster feed.
   * This is not full career stats, but it helps fill missing photos/full names and
   * links players to currently ranked teams when available.
   */
  async function enrichPlayersFromHLTV() {
    try {
      const res = await fetch(HLTV_ENRICH_URL, { cache: "no-store" });
      if (!res.ok) return 0;
      const teams = await res.json();
      if (!Array.isArray(teams)) return 0;

      const nickMap = new Map();
      teams.forEach((team) => {
        (team.players || []).forEach((player) => {
          const nick = player?.nickname;
          if (!nick) return;
          nickMap.set(normalizePlayerName(nick), {
            ...player,
            _teamName: team?.name || null,
            _teamId: team?.id || null,
            _teamRanking: numOrNull(team?.ranking),
          });
        });
      });

      let enriched = 0;
      players.forEach((player) => {
        const hit = nickMap.get(normalizePlayerName(player.name));
        if (!hit) return;
        if (typeof hit.image === "string" && hit.image.startsWith("http")) {
          player.avatar = hit.image;
        }
        if (typeof hit.fullname === "string" && hit.fullname.trim()) {
          player.fullname = hit.fullname.trim();
        }
        if (hit.country?.name) {
          player.hltvCountry = hit.country.name;
        }
        if (hit.country?.code && !player.hltvCountryCode) {
          player.hltvCountryCode = hit.country.code;
        }
        if (!player.hltvCurrentTeam && (hit._teamName || hit._teamId)) {
          player.hltvCurrentTeam = {
            id: hit._teamId || null,
            name: hit._teamName || null,
            ranking: Number.isFinite(hit._teamRanking) ? hit._teamRanking : null,
          };
        }
        if (hit.nickname && !player.hltvId && !player.hltvUrl.includes("/player/")) {
          player.hltvUrl = `https://www.hltv.org/search?query=${encodeURIComponent(hit.nickname)}`;
        }
        enriched += 1;
      });

      return enriched;
    } catch (error) {
      console.warn("HLTV enrich failed, fallback to local avatars:", error);
      players.forEach((player) => {
        if (!player.hltvUrl) player.hltvUrl = `https://www.hltv.org/search?query=${encodeURIComponent(player.name)}`;
      });
      return 0;
    }
  }

  async function loadPlayers() {
    const rows = await d3.csv(PLAYER_STATS_URL);
    players = rows.map((row, i) => toPlayer(row, i)).filter(Boolean);
    await applyHLTVOverrides();
    await enrichPlayersFromHLTV();
    buildData(players);
  }

  function countryProfileByFeature(feature) {
    const canonical = resolveCountryForMap(mapCountryName(feature));
    return canonical ? countryData.get(canonical) || null : null;
  }

  function countryFill(feature) {
    const colors = getGameColors();
    if (feature === selectedCountry) return colors.active;
    if (currentGame !== "cs") return colors.base;
    const profile = countryProfileByFeature(feature);
    if (!profile || !countryRank.length) return colors.base;
    const intensity = clamp(profile.playerCount / (countryRank[0].playerCount || 1), 0, 1);
    return d3.interpolateRgb(colors.base, colors.active)(0.2 + 0.6 * intensity);
  }

  function playTone(type = "soft") {
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

  function renderDrawer() {
    if (!drawerTitle || !drawerList) return;
    if (currentGame === "cs" && countryRank.length) {
      drawerTitle.textContent = "Counter-Strike Top Countries";
      drawerList.innerHTML = countryRank
        .slice(0, 10)
        .map((profile, i) => `<li><span>${i + 1}. ${esc(flagEmoji(profile.country))} ${esc(profile.country)}</span><strong>${profile.avgRating.toFixed(2)}</strong></li>`)
        .join("");
      return;
    }
    drawerTitle.textContent = "DOTA 2 Top Countries";
    drawerList.innerHTML = TOP_COUNTRIES_DOTA
      .map((name, i) => {
        const m = mockMetrics(name, "dota2");
        return `<li><span>${i + 1}. ${esc(flagEmoji(name))} ${esc(name)}</span><strong>${m.winRate}%</strong></li>`;
      })
      .join("");
  }

  function renderAchievements() {
    if (!achievementTrack) return;
    achievementTrack.innerHTML = ACHIEVEMENTS
      .map((a) => `<span class="achievement-badge ${exploredCountries.size >= a.threshold ? "unlocked" : ""}">${a.label}</span>`)
      .join("");
  }

  function renderStoryVisibility() {
    storyCards.forEach((card) => (card.style.display = card.dataset.game === currentGame ? "" : "none"));
  }

  function updateStatusBar() {
    dynamicStatusBar?.classList.toggle("dota", currentGame === "dota2");
  }

  function triggerThemeSweep() {
    if (!themeSweep) return;
    themeSweep.classList.remove("active");
    void themeSweep.offsetWidth;
    themeSweep.classList.add("active");
  }

  function initProjection() {
    const w = mapContainer?.clientWidth || 960;
    const h = mapContainer?.clientHeight || 500;
    projection = d3.geoMercator().scale(w / 6.5).translate([w / 2, h / 1.5]);
    geoPath = d3.geoPath().projection(projection);
  }

  function mapViewportSize() {
    if (!svg) return { width: 960, height: 500 };
    const vb = (svg.attr("viewBox") || "0 0 960 500").match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [0, 0, 960, 500];
    return { width: vb[2] || 960, height: vb[3] || 500 };
  }

  /**
   * Keep drag movement intentionally bounded:
   * - a small baseline range (so users can inspect labels near edges),
   * - plus extra range when zoomed in (to avoid clipping at larger scales).
   */
  function mapPanLimits() {
    const { width, height } = mapViewportSize();
    const baseX = width * 0.1;
    const baseY = height * 0.08;
    const zoomX = Math.max(0, (mapScale - 1) * width * 0.5);
    const zoomY = Math.max(0, (mapScale - 1) * height * 0.5);
    return {
      x: Math.min(width * 0.24, baseX + zoomX),
      y: Math.min(height * 0.2, baseY + zoomY),
    };
  }

  function clampMapPan() {
    const limits = mapPanLimits();
    mapPanX = clamp(mapPanX, -limits.x, limits.x);
    mapPanY = clamp(mapPanY, -limits.y, limits.y);
  }

  /**
   * Compose one transform for zoom + bounded pan.
   * We always zoom around center first, then apply constrained drag offset.
   */
  function applyMapScale() {
    if (!svg || !mapGroup) return;
    clampMapPan();
    const { width, height } = mapViewportSize();
    const tx = (width * (1 - mapScale)) / 2 + mapPanX;
    const ty = (height * (1 - mapScale)) / 2 + mapPanY;
    mapGroup.attr("transform", `translate(${tx},${ty}) scale(${mapScale})`);
    if (mapZoomValue) mapZoomValue.textContent = `${Math.round(mapScale * 100)}%`;
  }

  /**
   * Dedicated slider-based zoom (wheel zoom intentionally disabled per UX request).
   */
  function initMapZoomControl() {
    if (!mapZoomSlider) return;
    mapZoomSlider.value = String(Math.round(mapScale * 100));
    if (mapZoomValue) mapZoomValue.textContent = `${Math.round(mapScale * 100)}%`;
    mapZoomSlider.addEventListener("input", () => {
      const next = num(mapZoomSlider.value, 100);
      mapScale = clamp(next / 100, 0.75, 2.3);
      applyMapScale();
    });
  }

  /**
   * Add click-and-drag panning with strict boundaries.
   * This keeps the map readable and centered instead of letting users lose context.
   */
  function initMapDragControl() {
    if (!svg || !mapContainer) return;
    const dragBehavior = d3
      .drag()
      .clickDistance(4)
      .filter((event) => event.button === 0 && !event.ctrlKey && !event.metaKey)
      .on("start", () => {
        mapDragging = true;
        mapContainer.classList.add("dragging");
        tooltipEl.classList.remove("visible");
        const colors = getGameColors();
        svg
          .selectAll("path.country")
          .interrupt()
          .attr("fill", (f) => countryFill(f))
          .attr("stroke", (f) => (f === selectedCountry ? colors.active : colors.stroke))
          .attr("stroke-width", (f) => (f === selectedCountry ? 1.6 : 0.5))
          .style("filter", (f) => (f === selectedCountry ? `drop-shadow(0 0 10px ${colors.glow})` : "none"));
      })
      .on("drag", (event) => {
        mapPanX += event.dx;
        mapPanY += event.dy;
        applyMapScale();
      })
      .on("end", () => {
        mapDragging = false;
        mapContainer.classList.remove("dragging");
      });

    svg.call(dragBehavior);
  }

  function applySelectionPulse() {
    if (!svg) return;
    svg.selectAll("path.country").classed("selected-pulse", false);
    if (!selectedCountry) return;
    svg.selectAll("path.country").filter((f) => f === selectedCountry).classed("selected-pulse", true);
  }

  function hideQuickMenu() {
    if (!teamHoverMenu) return;
    teamHoverMenu.classList.remove("visible");
    if (hoverMenuTimer) {
      clearTimeout(hoverMenuTimer);
      hoverMenuTimer = null;
    }
  }

  function scheduleHideQuickMenu() {
    if (!teamHoverMenu) return;
    if (hoverMenuTimer) clearTimeout(hoverMenuTimer);
    hoverMenuTimer = setTimeout(() => {
      if (!teamHoverMenu.matches(":hover")) teamHoverMenu.classList.remove("visible");
    }, 140);
  }

  function renderQuickMenu(profile, x, y) {
    if (!teamHoverMenu || !profile || currentGame !== "cs") {
      hideQuickMenu();
      return;
    }
    const top = profile.players.slice(0, 6);
    if (!top.length) {
      hideQuickMenu();
      return;
    }
    teamHoverMenu.innerHTML = top
      .map((p) => `<button class="team-hover-item" data-player-id="${p.id}" title="${esc(p.name)} | Rating ${p.rating.toFixed(2)}">${esc(initials(p.name))}</button>`)
      .join("");
    teamHoverMenu.classList.add("visible");
    const menuW = Math.max(180, top.length * 44);
    const left = Math.max(12, Math.min(window.innerWidth - menuW - 12, x - menuW / 2));
    teamHoverMenu.style.left = `${left}px`;
    teamHoverMenu.style.top = `${Math.max(12, y - 64)}px`;
  }
  function renderSparkline(series, color) {
    const clean = series.filter((v) => Number.isFinite(v));
    if (clean.length < 2) return `<div class="sparkline-empty">Not enough data</div>`;
    const max = Math.max(...clean);
    const min = Math.min(...clean);
    const points = clean
      .map((v, i) => {
        const x = (i / (clean.length - 1)) * 100;
        const y = 100 - ((v - min) / Math.max(max - min, 1e-6)) * 100;
        return `${x},${y}`;
      })
      .join(" ");
    return `<svg class="sparkline" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"></polyline></svg>`;
  }

  function sortPlayers(list, key) {
    const copy = list.slice();
    copy.sort((a, b) => {
      if (key === "name") return d3.ascending(a.name.toLowerCase(), b.name.toLowerCase());
      if (key === "kd") return d3.descending(a.kd, b.kd);
      if (key === "maps") return d3.descending(a.total_maps, b.total_maps);
      return d3.descending(a.rating, b.rating);
    });
    return copy;
  }

  /**
   * Country-side list with filter + sort + pagination (5 rows/page).
   * Keeping this in a dedicated renderer avoids DOM bloat when countries have many players.
   */
  function renderCountryPlayerList() {
    const listEl = detailContent?.querySelector("#countryPlayerList");
    if (!listEl || !selectedCountryProfile) return;

    const query = detailPlayerQuery.trim().toLowerCase();
    const sorted = sortPlayers(selectedCountryProfile.players, detailPlayerSort);
    const filtered = sorted.filter((p) => !query || p.name.toLowerCase().includes(query) || p.teams.some((t) => t.toLowerCase().includes(query)));

    if (!filtered.length) {
      listEl.innerHTML = `<p class="player-list-empty">No players match this filter.</p>`;
      return;
    }

    const perPage = 5;
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    detailPlayerPage = clamp(detailPlayerPage, 1, totalPages);
    const startIndex = (detailPlayerPage - 1) * perPage;
    const shown = filtered.slice(startIndex, startIndex + perPage);

    listEl.innerHTML = `
      <div class="player-list-grid">
        ${shown
          .map(
            (p) => {
              const metaTail = p.hltvCurrentTeam?.name ? `HLTV: ${p.hltvCurrentTeam.name}` : `${p.teamCount} teams`;
              return `
                <button class="player-row-btn" data-player-id="${p.id}">
                  <img class="player-avatar-sm" src="${p.avatar}" data-fallback="${p.avatarFallback}" alt="${esc(p.name)} avatar">
                  <span class="player-row-main">
                    <span class="player-row-name">${esc(p.name)}</span>
                    <span class="player-row-meta">K/D ${p.kd.toFixed(2)} | ${esc(metaTail)}</span>
                  </span>
                  <span class="player-row-score">R ${p.rating.toFixed(2)}</span>
                </button>
              `;
            }
          )
          .join("")}
      </div>
      <div class="player-pagination">
        <button class="player-page-btn" id="playerPrevPage" ${detailPlayerPage <= 1 ? "disabled" : ""}>Prev</button>
        <span class="player-page-info">Page ${detailPlayerPage} / ${totalPages}</span>
        <button class="player-page-btn" id="playerNextPage" ${detailPlayerPage >= totalPages ? "disabled" : ""}>Next</button>
      </div>
    `;

    listEl.querySelectorAll(".player-row-btn").forEach((btn) => {
      btn.addEventListener("click", () => openPlayerDashboard(btn.dataset.playerId));
    });

    listEl.querySelectorAll(".player-avatar-sm").forEach((img) => {
      img.addEventListener("error", () => {
        if (img.dataset.fallback) img.src = img.dataset.fallback;
      });
    });

    listEl.querySelector("#playerPrevPage")?.addEventListener("click", () => {
      detailPlayerPage = Math.max(1, detailPlayerPage - 1);
      renderCountryPlayerList();
    });

    listEl.querySelector("#playerNextPage")?.addEventListener("click", () => {
      detailPlayerPage = Math.min(totalPages, detailPlayerPage + 1);
      renderCountryPlayerList();
    });
  }

  function renderCountryPanel(mapCountry) {
    if (currentGame !== "cs") {
      const m = mockMetrics(mapCountry, currentGame);
      const accent = currentGame === "cs" ? "#3b82f6" : "#8b5cf6";
      detailTitle.textContent = `${flagEmoji(mapCountry)} ${mapCountry}`;
      detailContent.innerHTML = `
        <p><strong>Game:</strong> ${currentGame === "cs" ? "Counter-Strike" : "DOTA 2"}</p>
        <div class="kpi-grid">
          <div class="kpi-card"><span class="kpi-label">Tournaments</span><span class="kpi-value">${m.tournaments}</span></div>
          <div class="kpi-card"><span class="kpi-label">Teams</span><span class="kpi-value">${m.teams}</span></div>
          <div class="kpi-card"><span class="kpi-label">Player Pool</span><span class="kpi-value">${m.players}</span></div>
          <div class="kpi-card"><span class="kpi-label">Win Rate</span><span class="kpi-value">${m.winRate}%</span></div>
        </div>
        <div class="sparkline-wrap"><div class="sparkline-title">Recent trend</div>${renderSparkline(m.series, accent)}</div>
      `;
      return;
    }

    const canonical = resolveCountryForMap(mapCountry);
    const profile = canonical ? countryData.get(canonical) : null;
    selectedCountryProfile = profile || null;

    if (!profile) {
      detailTitle.textContent = `${flagEmoji(mapCountry)} ${mapCountry}`;
      detailContent.innerHTML = `<div class="empty-state"><p class="detail-placeholder">No player_stats entries found for this country.</p></div>`;
      return;
    }

    const flag = flagImg(profile.country);
    const trend = profile.players.slice(0, 12).map((p) => p.rating);
    detailTitle.textContent = `${flagEmoji(profile.country)} ${profile.country}`;
    detailContent.innerHTML = `
      <div class="country-headline">
        ${flag ? `<img class="country-flag flag-image" src="${flag}" alt="${esc(profile.country)} flag">` : ""}
        <div class="country-headline-text">
          <div class="country-headline-name">${esc(flagEmoji(profile.country))} ${esc(profile.country)}</div>
          <div class="country-headline-sub">${profile.playerCount} players in player_stats</div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card"><span class="kpi-label">Avg Rating</span><span class="kpi-value">${profile.avgRating.toFixed(2)}</span></div>
        <div class="kpi-card"><span class="kpi-label">Avg K/D</span><span class="kpi-value">${profile.avgKD.toFixed(2)}</span></div>
        <div class="kpi-card"><span class="kpi-label">Unique Teams</span><span class="kpi-value">${profile.teamCount}</span></div>
        <div class="kpi-card"><span class="kpi-label">Avg Rounds / Player</span><span class="kpi-value">${d3.format(",.0f")(profile.totalRounds / Math.max(profile.playerCount, 1))}</span></div>
      </div>

      <div class="sparkline-wrap">
        <div class="sparkline-title">Top-player rating trend</div>
        ${renderSparkline(trend, "#3b82f6")}
      </div>

      <div class="country-player-controls">
        <input id="countryPlayerSearch" class="country-player-search" type="search" placeholder="Search players or teams">
        <div class="player-sort-group">
          <button class="player-sort-btn ${detailPlayerSort === "rating" ? "active" : ""}" data-sort="rating">Rating</button>
          <button class="player-sort-btn ${detailPlayerSort === "kd" ? "active" : ""}" data-sort="kd">K/D</button>
          <button class="player-sort-btn ${detailPlayerSort === "maps" ? "active" : ""}" data-sort="maps">Maps</button>
          <button class="player-sort-btn ${detailPlayerSort === "name" ? "active" : ""}" data-sort="name">Name</button>
        </div>
      </div>

      <div id="countryPlayerList"></div>
    `;

    bindFlagFallback(detailContent);

    detailContent.querySelector("#countryPlayerSearch")?.addEventListener("input", (e) => {
      detailPlayerQuery = e.target.value || "";
      detailPlayerPage = 1;
      renderCountryPlayerList();
    });

    detailContent.querySelectorAll(".player-sort-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        detailPlayerSort = btn.dataset.sort || "rating";
        detailPlayerPage = 1;
        detailContent.querySelectorAll(".player-sort-btn").forEach((b) => b.classList.toggle("active", b.dataset.sort === detailPlayerSort));
        renderCountryPlayerList();
      });
    });

    renderCountryPlayerList();
  }

  function updateMapColors() {
    if (!svg) return;
    const colors = getGameColors();
    svg
      .selectAll("path.country")
      .transition()
      .duration(360)
      .ease(d3.easeCubicInOut)
      .attr("fill", (f) => countryFill(f))
      .attr("stroke", (f) => (f === selectedCountry ? colors.active : colors.stroke))
      .attr("stroke-width", (f) => (f === selectedCountry ? 1.6 : 0.5))
      .style("filter", (f) => (f === selectedCountry ? `drop-shadow(0 0 10px ${colors.glow})` : "none"));
    applySelectionPulse();
    svg.selectAll("text.country-label").classed("selected", (f) => f === selectedCountry);
  }

  function onCountryHover(event, feature) {
    if (mapDragging) return;
    const name = mapCountryName(feature);
    const colors = getGameColors();

    if (currentGame === "cs") {
      const profile = countryProfileByFeature(feature);
      const display = profile?.country || name;
      tooltipTitle.textContent = `${flagEmoji(display)} ${display}`;
      tooltipSub.textContent = profile
        ? `CS2 | Players ${profile.playerCount} | Avg rating ${profile.avgRating.toFixed(2)}`
        : "CS2 | No player_stats data";
      hideQuickMenu();
    } else {
      const m = mockMetrics(name, currentGame);
      tooltipTitle.textContent = `${flagEmoji(name)} ${name}`;
      tooltipSub.textContent = `${currentGame.toUpperCase()} | Win rate ${m.winRate}% | Teams ${m.teams}`;
      hideQuickMenu();
    }

    tooltipEl.classList.add("visible");
    tooltipEl.style.left = `${event.pageX}px`;
    tooltipEl.style.top = `${event.pageY}px`;

    d3.select(event.target)
      .transition()
      .duration(120)
      .attr("fill", colors.hover)
      .attr("stroke", colors.active)
      .attr("stroke-width", 1.1)
      .style("filter", `drop-shadow(0 0 8px ${colors.glow})`);
  }

  function onCountryOut(event) {
    if (mapDragging) return;
    tooltipEl.classList.remove("visible");
    scheduleHideQuickMenu();
    const f = d3.select(event.target).datum();
    const colors = getGameColors();
    const selected = f === selectedCountry;
    d3.select(event.target)
      .transition()
      .duration(160)
      .attr("fill", countryFill(f))
      .attr("stroke", selected ? colors.active : colors.stroke)
      .attr("stroke-width", selected ? 1.6 : 0.5)
      .style("filter", selected ? `drop-shadow(0 0 10px ${colors.glow})` : "none");
  }

  function onCountryClick(event, feature) {
    if (event.defaultPrevented || mapDragging) return;
    const name = mapCountryName(feature);
    selectedCountry = feature;
    selectedCountryName = name;
    detailPlayerSort = "rating";
    detailPlayerQuery = "";
    detailPlayerPage = 1;
    exploredCountries.add(name);

    updateMapColors();
    renderCountryPanel(name);
    renderAchievements();
    detailPanel.classList.remove("collapsed");

    const rect = mapContainer.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    mapFocusOverlay.style.setProperty("--focus-x", `${x}%`);
    mapFocusOverlay.style.setProperty("--focus-y", `${y}%`);
    mapFocusOverlay.classList.add("active");

    hideQuickMenu();
    playTone("accent");
  }
  function countryAverages(profile) {
    return averageMetricsFromPlayers(profile?.players || []);
  }

  function extentForMode(key, profile, mode) {
    if (mode === "country" && profile && profile.players.length > 1) {
      return d3.extent(profile.players, (p) => metricValue(p, key));
    }
    return metricExtents[key] || [0, 1];
  }

  function setRadarHint(text) {
    const el = playerModalContent?.querySelector("#playerRadarHint");
    if (el) el.textContent = text;
  }

  function signedMetric(metric, delta) {
    return `${delta >= 0 ? "+" : ""}${metric.fmt(delta)}`;
  }

  function syncPlayerModeCopy(player, profile, mode) {
    const caption = playerModalContent?.querySelector("#playerModeCaption");
    const summary = playerModalContent?.querySelector("#playerModeSummary");
    const impactSubtitle = playerModalContent?.querySelector("#playerImpactSubtitle");
    const base = baselineForMode(profile, mode);
    const label = baselineLabel(profile, mode);
    const delta = player.rating - num(base.rating);

    if (caption) {
      const scope = modePopulationLabel(profile, mode);
      caption.textContent = mode === "country"
        ? `Country mode: normalize against ${scope}.`
        : `Global mode: normalize against all ${players.length} players in player_stats.`;
    }

    if (impactSubtitle) {
      impactSubtitle.textContent = `Blue bar = player, gray bar = ${label.toLowerCase()}`;
    }

    if (summary) {
      summary.innerHTML = `${label}: <strong>${num(base.rating).toFixed(2)}</strong> | Rating delta: <strong class="${delta >= 0 ? "delta-up" : "delta-down"}">${delta >= 0 ? "+" : ""}${delta.toFixed(2)}</strong>`;
    }
  }

  /**
   * Render radar in two comparison modes:
   * - global: player vs global averages/extents,
   * - country: player vs selected country averages/extents.
   * This is why toggling mode updates both geometry and explanatory text.
   */
  function renderRadar(player, profile, mode) {
    const host = playerModalContent?.querySelector("#playerRadar");
    if (!host) return;
    host.innerHTML = "";

    const w = 360;
    const h = 320;
    const cx = w / 2;
    const cy = h / 2 - 6;
    const r = 112;
    const lv = 5;
    const base = baselineForMode(profile, mode);

    const data = RADAR_METRICS.map((m, i) => {
      const v = metricValue(player, m.key);
      const a = num(base[m.key]);
      const ext = extentForMode(m.key, profile, mode);
      return {
        ...m,
        i,
        v,
        a,
        ext,
        nv: normalizeByExtent(v, ext),
        na: normalizeByExtent(a, ext),
      };
    });

    const svg = d3.select(host).append("svg").attr("viewBox", [0, 0, w, h]).attr("class", "player-radar-svg");
    const step = (Math.PI * 2) / data.length;
    const pt = (i, v) => {
      const angle = -Math.PI / 2 + i * step;
      return [cx + Math.cos(angle) * r * v, cy + Math.sin(angle) * r * v];
    };
    const ps = (arr) => arr.map((p) => `${p[0]},${p[1]}`).join(" ");

    for (let i = 1; i <= lv; i++) {
      const scale = i / lv;
      svg.append("polygon").attr("points", ps(data.map((d) => pt(d.i, scale)))).attr("class", "radar-grid-ring");
    }

    data.forEach((d) => {
      const end = pt(d.i, 1);
      svg.append("line").attr("x1", cx).attr("y1", cy).attr("x2", end[0]).attr("y2", end[1]).attr("class", "radar-axis-line");
      const lp = pt(d.i, 1.12);
      svg
        .append("text")
        .attr("x", lp[0])
        .attr("y", lp[1])
        .attr("class", "radar-axis-label")
        .attr("text-anchor", lp[0] >= cx + 10 ? "start" : lp[0] <= cx - 10 ? "end" : "middle")
        .text(d.label);
    });

    const avgPts = data.map((d) => pt(d.i, d.na));
    const plyPts = data.map((d) => pt(d.i, d.nv));
    const startPts = data.map((d) => pt(d.i, 0.02));

    svg.append("polygon").attr("points", ps(avgPts)).attr("class", "radar-country-avg");
    svg.append("polygon").attr("points", ps(startPts)).attr("class", "radar-player-shape").transition().duration(420).ease(d3.easeCubicOut).attr("points", ps(plyPts));

    svg
      .selectAll("circle.radar-player-point")
      .data(data)
      .join("circle")
      .attr("class", "radar-player-point")
      .attr("cx", (d) => pt(d.i, d.nv)[0])
      .attr("cy", (d) => pt(d.i, d.nv)[1])
      .attr("r", 4.2)
      .on("mouseenter", (event, d) => {
        const modeLabel = baselineLabel(profile, mode);
        setRadarHint(`${d.label}: ${d.fmt(d.v)} | ${modeLabel} ${d.fmt(d.a)} (${percentile(d.v, d.ext)}, ${modePopulationLabel(profile, mode)} scale)`);
      })
      .on("mouseleave", () => setRadarHint("Hover a radar point to inspect metric details."));

    setRadarHint(`Hover a radar point to inspect metric details. Current baseline: ${baselineLabel(profile, mode)}.`);
  }

  /**
   * Impact bars mirror radar mode so users can read exact numbers and deltas.
   * Each row shows player value, baseline value, and signed delta.
   */
  function renderBars(player, profile, mode) {
    const host = playerModalContent?.querySelector("#playerMiniBars");
    if (!host) return;
    const base = baselineForMode(profile, mode);
    const label = baselineLabel(profile, mode);

    const keys = ["rating", "kd", "kd_diff", "total_maps", "total_rounds"];
    host.innerHTML = keys
      .map((key) => {
        const cfg = RADAR_METRICS.find((m) => m.key === key);
        const v = metricValue(player, key);
        const a = num(base[key]);
        const delta = v - a;
        const ext = extentForMode(key, profile, mode);
        const w = Math.max(6, Math.round(normalizeByExtent(v, ext) * 100));
        const aw = Math.max(4, Math.round(normalizeByExtent(a, ext) * 100));
        return `
          <div class="player-mini-bar-row" data-key="${key}">
            <div class="player-mini-bar-head">
              <span>${cfg.label}</span>
              <span class="player-mini-bar-values">
                <span class="player-mini-bar-player">P ${cfg.fmt(v)}</span>
                <span class="player-mini-bar-baseline">B ${cfg.fmt(a)}</span>
                <span class="player-mini-delta ${delta >= 0 ? "up" : "down"}">${signedMetric(cfg, delta)}</span>
              </span>
            </div>
            <div class="player-mini-bar-track">
              <div class="player-mini-bar-avg" style="width:${aw}%"></div>
              <div class="player-mini-bar-fill" style="width:${w}%"></div>
            </div>
          </div>
        `;
      })
      .join("");

    host.querySelectorAll(".player-mini-bar-row").forEach((row) => {
      row.addEventListener("mouseenter", () => {
        const key = row.dataset.key;
        const cfg = RADAR_METRICS.find((m) => m.key === key);
        const v = metricValue(player, key);
        const a = num(base[key]);
        const delta = v - a;
        setRadarHint(`${cfg.label}: ${cfg.fmt(v)} | ${label} ${cfg.fmt(a)} | Delta ${signedMetric(cfg, delta)}`);
      });
      row.addEventListener("mouseleave", () => setRadarHint(`Hover a radar point to inspect metric details. Current baseline: ${label}.`));
    });

    syncPlayerModeCopy(player, profile, mode);
  }

  function formatMaybeNumber(value, formatter, fallback = "N/A") {
    return Number.isFinite(value) ? formatter(value) : fallback;
  }

  function renderHLTVSocialLinks(player) {
    if (!player.hltvSocials) return "";
    const links = [
      { key: "twitter", label: "Twitter" },
      { key: "twitch", label: "Twitch" },
      { key: "instagram", label: "Instagram" },
      { key: "facebook", label: "Facebook" },
    ]
      .map((cfg) => ({ ...cfg, url: player.hltvSocials[cfg.key] }))
      .filter((cfg) => typeof cfg.url === "string" && cfg.url.startsWith("http"));
    if (!links.length) return "";
    return `<div class="player-social-links">${links.map((cfg) => `<a class="player-social-link" href="${cfg.url}" target="_blank" rel="noopener">${cfg.label}</a>`).join("")}</div>`;
  }

  function renderHLTVNews(player) {
    if (!Array.isArray(player.hltvNews) || !player.hltvNews.length) return "";
    return `
      <div class="player-news-section">
        <div class="player-news-title">Recent HLTV headlines</div>
        <div class="player-news-list">
          ${player.hltvNews
            .slice(0, 3)
            .map((n) => `<a class="player-news-item" href="${n.link || "#"}" target="_blank" rel="noopener">${esc(n.title || "HLTV article")}</a>`)
            .join("")}
        </div>
      </div>
    `;
  }

  function renderHLTVSnapshot(player) {
    const hStats = player.hltvStats || {};
    const currentTeam = player.hltvCurrentTeam?.name || "N/A";
    const rank = numOrNull(player.hltvCurrentTeam?.ranking);
    const teamLabel = rank ? `${currentTeam} (#${rank})` : currentTeam;
    return `
      <section class="player-hltv-snapshot">
        <div class="player-hltv-title">HLTV Snapshot</div>
        <div class="player-hltv-grid">
          <button class="player-hltv-chip" type="button" data-focus-key="rating" data-hint="HLTV rating (if available) compared with local dataset rating in bars.">
            <span>HLTV Rating</span>
            <strong>${formatMaybeNumber(hStats.rating, (v) => v.toFixed(2))}</strong>
          </button>
          <button class="player-hltv-chip" type="button" data-hint="Approximate age from HLTV player profile.">
            <span>Age</span>
            <strong>${Number.isFinite(player.hltvAge) ? player.hltvAge : "N/A"}</strong>
          </button>
          <button class="player-hltv-chip" type="button" data-hint="Current team from HLTV player profile.">
            <span>Current Team</span>
            <strong>${esc(teamLabel)}</strong>
          </button>
          <button class="player-hltv-chip" type="button" data-hint="Headshot percentage from HLTV (when present).">
            <span>Headshot %</span>
            <strong>${formatMaybeNumber(hStats.headshots, (v) => `${v.toFixed(1)}%`)}</strong>
          </button>
          <button class="player-hltv-chip" type="button" data-focus-key="total_maps" data-hint="HLTV maps played can differ from our player_stats aggregation window.">
            <span>HLTV Maps</span>
            <strong>${formatMaybeNumber(hStats.mapsPlayed, (v) => d3.format(",.0f")(v))}</strong>
          </button>
          <button class="player-hltv-chip" type="button" data-hint="HLTV kills/round and deaths/round add extra context beyond raw K-D diff.">
            <span>KPR / DPR</span>
            <strong>${formatMaybeNumber(hStats.killsPerRound, (v) => v.toFixed(2), "-")} / ${formatMaybeNumber(hStats.deathsPerRound, (v) => v.toFixed(2), "-")}</strong>
          </button>
        </div>
        ${renderHLTVSocialLinks(player)}
        ${renderHLTVNews(player)}
      </section>
    `;
  }

  /**
   * Full player dashboard modal:
   * - local CSV metrics,
   * - HLTV cached snapshot (photo/team/social/news),
   * - mode-aware comparative visuals.
   */
  function renderPlayerModal(player) {
    if (!playerModalContent) return;
    const profile = countryData.get(player.country) || null;
    const displayCountry = player.hltvCountry || player.country;
    const flag = flagImg(displayCountry);
    const hltvUrl = player.hltvUrl || `https://www.hltv.org/search?query=${encodeURIComponent(player.name)}`;
    const teamLine = player.hltvCurrentTeam?.name
      ? `${player.hltvCurrentTeam.name}${player.hltvCurrentTeam.ranking ? ` (#${player.hltvCurrentTeam.ranking})` : ""}`
      : null;

    playerModalContent.innerHTML = `
      <div class="player-dash-header">
        <img class="player-dash-avatar" src="${player.avatar}" data-fallback="${player.avatarFallback}" alt="${esc(player.name)} avatar">
        <div class="player-dash-identity">
          <h3 id="playerDashTitle">${esc(player.name)}</h3>
          ${player.fullname ? `<div class="player-fullname">${esc(player.fullname)}</div>` : ""}
          <div class="player-dash-country">${flag ? `<img class="flag-image player-flag" src="${flag}" alt="${esc(displayCountry)} flag">` : ""}<span>${esc(flagEmoji(displayCountry))} ${esc(displayCountry)}</span></div>
          ${teamLine ? `<div class="player-current-team">Current team: ${esc(teamLine)}</div>` : ""}
          <div class="player-dash-links"><a class="hltv-link" href="${hltvUrl}" target="_blank" rel="noopener">View on HLTV</a></div>
          <div class="player-dash-teams">${player.teams.slice(0, 8).map((t) => `<button class="team-chip" type="button">${esc(t)}</button>`).join("")}</div>
        </div>
        <div class="player-rating-pill">Rating ${player.rating.toFixed(2)}</div>
      </div>

      <div class="player-dash-kpis">
        <div class="player-kpi-card"><span class="player-kpi-label">K/D</span><span class="player-kpi-value">${player.kd.toFixed(2)}</span></div>
        <div class="player-kpi-card"><span class="player-kpi-label">K-D Diff</span><span class="player-kpi-value">${d3.format(",.0f")(player.kd_diff)}</span></div>
        <div class="player-kpi-card"><span class="player-kpi-label">Maps</span><span class="player-kpi-value">${d3.format(",.0f")(player.total_maps)}</span></div>
        <div class="player-kpi-card"><span class="player-kpi-label">Rounds</span><span class="player-kpi-value">${d3.format(",.0f")(player.total_rounds)}</span></div>
      </div>

      ${renderHLTVSnapshot(player)}

      <div class="player-viz-grid">
        <section class="player-viz-card">
          <div class="player-viz-card-head">
            <h4>Dynamic Hex Radar</h4>
            <div class="radar-mode-group">
              <button class="radar-mode-btn ${radarMode === "global" ? "active" : ""}" data-mode="global">Global</button>
              <button class="radar-mode-btn ${radarMode === "country" ? "active" : ""}" data-mode="country">Country</button>
            </div>
          </div>
          <p id="playerModeCaption" class="player-mode-caption"></p>
          <div id="playerRadar" class="player-radar"></div>
          <p id="playerRadarHint" class="player-radar-hint">Hover a radar point to inspect metric details.</p>
        </section>

        <section class="player-viz-card">
          <div class="player-viz-card-head">
            <h4>Impact Bars</h4>
            <span id="playerImpactSubtitle" class="player-viz-sub">Blue bar = player, gray bar = global average</span>
          </div>
          <div id="playerMiniBars" class="player-mini-bars"></div>
          <div id="playerModeSummary" class="player-country-summary"></div>
        </section>
      </div>
    `;

    bindFlagFallback(playerModalContent);

    playerModalContent.querySelectorAll(".player-dash-avatar").forEach((img) => {
      img.addEventListener("error", () => {
        if (img.dataset.fallback) img.src = img.dataset.fallback;
      });
    });

    playerModalContent.querySelectorAll(".team-chip").forEach((chip) => chip.addEventListener("click", () => chip.classList.toggle("active")));
    playerModalContent.querySelectorAll(".player-hltv-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const hint = chip.dataset.hint;
        if (hint) setRadarHint(hint);
        const key = chip.dataset.focusKey;
        if (!key) return;
        const row = playerModalContent.querySelector(`.player-mini-bar-row[data-key="${key}"]`);
        if (!row) return;
        row.classList.add("focus");
        setTimeout(() => row.classList.remove("focus"), 420);
      });
    });

    playerModalContent.querySelectorAll(".radar-mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mode === "country" ? "country" : "global";
        if (mode === radarMode) return;
        radarMode = mode;
        playerModalContent.querySelectorAll(".radar-mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === radarMode));
        renderRadar(player, profile, radarMode);
        renderBars(player, profile, radarMode);
        playTone("soft");
      });
    });

    renderRadar(player, profile, radarMode);
    renderBars(player, profile, radarMode);
  }

  function openPlayerDashboard(playerId) {
    if (!playerModal || !playerId) return;
    const player = playerById.get(playerId);
    if (!player) return;
    radarMode = "global";
    renderPlayerModal(player);
    playerModal.classList.add("open");
    playerModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("player-dashboard-open");
    playTone("accent");
  }

  function closePlayerDashboard() {
    if (!playerModal) return;
    playerModal.classList.remove("open");
    playerModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("player-dashboard-open");
  }
  function renderCountryLabels(features) {
    if (!mapGroup || !geoPath) return;

    mapGroup
      .selectAll("text.country-label")
      .data(features)
      .join("text")
      .attr("class", "country-label")
      .attr("x", (f) => geoPath.centroid(f)[0])
      .attr("y", (f) => geoPath.centroid(f)[1])
       .style("font-size", (f) => `${clamp(Math.sqrt(geoPath.area(f)) / 16, 5.5, 14)}px`)
      .style("opacity", 0.82)
      .text((f) => mapCountryName(f));
  }

  function updateCountryLabels() {
    if (!svg || !geoPath) return;
    svg
      .selectAll("text.country-label")
      .attr("x", (f) => geoPath.centroid(f)[0])
      .attr("y", (f) => geoPath.centroid(f)[1])
       .style("font-size", (f) => `${clamp(Math.sqrt(geoPath.area(f)) / 16, 5.5, 14)}px`)
      .style("opacity", 0.82)
      .classed("selected", (f) => f === selectedCountry);
  }

  /**
   * Bootstrap world map once:
   * - draw countries + labels,
   * - bind hover/click interactions,
   * - initialize zoom slider and bounded drag transform state.
   */
  async function initWorldMap() {
    const w = mapContainer.clientWidth || 960;
    const h = Math.max(500, window.innerHeight - 260);
    svg = d3.select("#worldMap").append("svg").attr("viewBox", [0, 0, w, h]).attr("width", "100%").attr("height", "100%").style("background", "transparent");
    initProjection();
    worldTopology = await d3.json(WORLD_ATLAS_URL);

    const countries = topojson.feature(worldTopology, worldTopology.objects.countries);
    mapGroup = svg.append("g");

    const colors = getGameColors();
    const paths = mapGroup
      .selectAll("path")
      .data(countries.features)
      .join("path")
      .attr("class", "country")
      .attr("d", geoPath)
      .attr("fill", (f) => countryFill(f))
      .attr("stroke", colors.stroke)
      .attr("stroke-width", 0.5)
      .style("cursor", "pointer")
      .on("mouseover", (e, f) => onCountryHover(e, f))
      .on("mouseout", onCountryOut)
      .on("click", (e, f) => onCountryClick(e, f));

    renderCountryLabels(countries.features);

    paths.style("opacity", 0).transition().delay((f, i) => Math.min(i * 2, 300)).duration(400).ease(d3.easeCubicOut).style("opacity", 1);

    setTimeout(() => {
      mapContainer.classList.remove("loading");
      mapContainer.querySelector(".map-loading")?.remove();
    }, 760);

    applySelectionPulse();
    svg.selectAll("text.country-label").classed("selected", (f) => f === selectedCountry);
    updateCountryLabels();
    applyMapScale();
    initMapDragControl();
  }

  function initThemeToggle() {
    if (!themeToggle) return;
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
      updateMapColors();
      playTone("soft");
    });
  }

  function initSoundToggle() {
    if (!soundToggle) return;
    soundEnabled = localStorage.getItem(SOUND_STORAGE_KEY) === "on";
    soundToggle.classList.toggle("muted", !soundEnabled);
    soundToggle.textContent = soundEnabled ? "SOUND" : "MUTE";
    soundToggle.addEventListener("click", () => {
      soundEnabled = !soundEnabled;
      localStorage.setItem(SOUND_STORAGE_KEY, soundEnabled ? "on" : "off");
      soundToggle.classList.toggle("muted", !soundEnabled);
      soundToggle.textContent = soundEnabled ? "SOUND" : "MUTE";
      playTone("soft");
    });
  }

  function initGameToggle() {
    document.querySelectorAll(".game-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const game = btn.dataset.game;
        if (!game || game === currentGame) return;
        currentGame = game;
        document.querySelectorAll(".game-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        if (gameLabel) gameLabel.textContent = game === "cs" ? "Counter-Strike" : "DOTA 2";
        mapContainer.classList.add("switching");
        setTimeout(() => mapContainer.classList.remove("switching"), 280);
        hideQuickMenu();
        updateStatusBar();
        updateMapColors();
        if (selectedCountryName && !detailPanel.classList.contains("collapsed")) renderCountryPanel(selectedCountryName);
        renderDrawer();
        renderStoryVisibility();
        playTone("accent");
      });
    });
  }

  function initDrawer() {
    if (drawerHandle && drawer) {
      drawerHandle.addEventListener("click", () => {
        drawer.classList.toggle("open");
        playTone("soft");
      });
    }
    renderDrawer();
  }

  function initDetailPanel() {
    detailClose?.addEventListener("click", () => {
      detailPanel.classList.add("collapsed");
      selectedCountry = null;
      selectedCountryName = null;
      selectedCountryProfile = null;
      mapFocusOverlay?.classList.remove("active");
      hideQuickMenu();
      updateMapColors();
      playTone("soft");
    });
  }

  function initQuickMenu() {
    if (!teamHoverMenu) return;
    teamHoverMenu.addEventListener("mouseenter", () => {
      if (hoverMenuTimer) {
        clearTimeout(hoverMenuTimer);
        hoverMenuTimer = null;
      }
    });
    teamHoverMenu.addEventListener("mouseleave", scheduleHideQuickMenu);
    teamHoverMenu.addEventListener("click", (event) => {
      const btn = event.target.closest(".team-hover-item");
      if (!btn) return;
      event.stopPropagation();
      openPlayerDashboard(btn.dataset.playerId);
      hideQuickMenu();
      playTone("accent");
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

  function initStoryObserver() {
    if (!("IntersectionObserver" in window)) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.target.classList.toggle("active", entry.isIntersecting));
    }, { threshold: 0.55 });
    storyCards.forEach((card) => obs.observe(card));
  }

  function initParticles() {
    if (!particlesCanvas) return;
    const ctx = particlesCanvas.getContext("2d");
    if (!ctx) return;
    let w = 0;
    let h = 0;
    let ps = [];

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      particlesCanvas.width = w;
      particlesCanvas.height = h;
      const n = Math.max(35, Math.floor((w * h) / 42000));
      ps = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18, r: Math.random() * 1.8 + 0.6 }));
    }

    function step() {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = currentTheme === "dark" ? "rgba(148,163,184,0.35)" : "rgba(71,85,105,0.16)";
      ps.forEach((p) => {
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

  function initModal() {
    playerModalBackdrop?.addEventListener("click", closePlayerDashboard);
    playerModalClose?.addEventListener("click", closePlayerDashboard);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && playerModal?.classList.contains("open")) closePlayerDashboard();
    });
  }

  function initResize() {
    window.addEventListener("resize", () => {
      if (!worldTopology || !svg) return;
      const w = mapContainer.clientWidth || 960;
      const h = Math.max(500, window.innerHeight - 260);
      svg.attr("viewBox", [0, 0, w, h]);
      initProjection();
      const countries = topojson.feature(worldTopology, worldTopology.objects.countries);
      svg.selectAll("path.country").data(countries.features).attr("d", geoPath);
      updateCountryLabels();
      applyMapScale();
      renderDrawer();
    });
  }

  async function init() {
    initThemeToggle();
    initSoundToggle();
    initGameToggle();
    initDrawer();
    initDetailPanel();
    initQuickMenu();
    initTooltipTracking();
    initStoryObserver();
    initParticles();
    initModal();
    initMapZoomControl();
    updateStatusBar();
    renderStoryVisibility();
    renderAchievements();

    try {
      await loadPlayers();
      renderDrawer();
    } catch (error) {
      console.error("Failed to load player_stats.csv:", error);
    }

    try {
      await initWorldMap();
    } catch (error) {
      console.error("Failed to load world map:", error);
      mapContainer.classList.remove("loading");
      mapContainer.innerHTML = '<p style="color:#94a3b8;padding:2rem;text-align:center;">Failed to load world map. Please check your network connection.</p>';
    }

    initResize();
  }

  init();
})();
























