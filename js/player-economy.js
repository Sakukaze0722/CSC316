(function () {
  const lineChartEl = document.getElementById("ecoLineChart");
  const radarChartEl = document.getElementById("ecoRadarChart");
  const weaponsBoardEl = document.getElementById("ecoWeaponsBoard");
  const keyRoundsListEl = document.getElementById("ecoKeyRoundsList");

  const playerSelect = document.getElementById("ecoPlayerSelect");
  const matchSelect = document.getElementById("ecoMatchSelect");
  const mapSelect = document.getElementById("ecoMapSelect");
  const roundStartInput = document.getElementById("ecoRoundStart");
  const roundEndInput = document.getElementById("ecoRoundEnd");
  const applyBtn = document.getElementById("ecoApplyFilters");

  const playerNameEl = document.getElementById("ecoPlayerName");
  const playerTeamEl = document.getElementById("ecoPlayerTeam");
  const playerRatingEl = document.getElementById("ecoPlayerRating");
  const playerAvatarImg = document.getElementById("ecoPlayerAvatarImg");
  const playerAvatarFallback = document.getElementById("ecoPlayerAvatarFallback");
  const playerKdEl = document.getElementById("ecoPlayerKD");
  const playerAdrEl = document.getElementById("ecoPlayerADR");
  const playerRatingHltvEl = document.getElementById("ecoPlayerRatingHLTV");

  if (!lineChartEl) return;

  /**
   * 来源：HLTV.org — Vitality vs The MongolZ, BLAST.tv Austin Major 2025
   * https://www.hltv.org/matches/2382619/vitality-vs-the-mongolz-blasttv-austin-major-2025
   * 数据已手工整理为结构化对象，方便在前端直接引用。
   */
  const MATCH_DATA = {
    matchId: "blast_austin_2025_gf",
    event: "BLAST.tv Austin Major 2025",
    bo: 3,
    teams: {
      vitality: {
        id: "vitality",
        name: "Vitality",
        logoUrl: "assets/teams/vitality.png",
        players: [
          {
            id: "vitality_apex",
            name: "apEX",
            fullName: "Dan 'apEX' Madesclaire",
            role: "IGL",
            avatarUrl: "images/apEX.jpg",
            stats: {
              kd: "43-33",
              adr: 94.1,
              rating3: 1.32,
            },
          },
          {
            id: "vitality_flamez",
            name: "flameZ",
            fullName: "Shahar 'flameZ' Shushan",
            role: "Entry",
            avatarUrl: "images/flameZ.jpg",
            stats: {
              kd: "44-33",
              adr: 75.5,
              rating3: 1.28,
            },
          },
          {
            id: "vitality_mezii",
            name: "mezii",
            fullName: "William 'mezii' Merriman",
            role: "Rifler",
            avatarUrl: "images/mezii.jpg",
            stats: {
              kd: "47-33",
              adr: 88.3,
              rating3: 1.24,
            },
          },
          {
            id: "vitality_zywoo",
            name: "ZywOo",
            fullName: "Mathieu 'ZywOo' Herbaut",
            role: "AWPer",
            avatarUrl: "images/ZywOo.jpg",
            stats: {
              kd: "37-34",
              adr: 78.3,
              rating3: 1.13,
            },
          },
          {
            id: "vitality_ropz",
            name: "ropz",
            fullName: "Robin 'ropz' Kool",
            role: "Rifler",
            avatarUrl: "images/ropz.jpg",
            stats: {
              kd: "41-38",
              adr: 81.0,
              rating3: 1.06,
            },
          },
        ],
      },
      mongolz: {
        id: "mongolz",
        name: "The MongolZ",
        logoUrl: "assets/teams/the_mongolz.png",
        players: [
          {
            id: "mongolz_senzu",
            name: "Senzu",
            fullName: "Azbayar 'Senzu' Munkhbold",
            role: "Rifler",
            avatarUrl: "images/Senzu.jpg",
            stats: {
              kd: "45-41",
              adr: 95.3,
              rating3: 1.18,
            },
          },
          {
            id: "mongolz_techno",
            name: "Techno",
            fullName: "Sodbayar 'Techno' Munkhbold",
            role: "Rifler",
            avatarUrl: "images/Techno.jpg",
            stats: {
              kd: "31-37",
              adr: 61.3,
              rating3: 1.12,
            },
          },
          {
            id: "mongolz_blitz",
            name: "bLitz",
            fullName: "Garidmagnai 'bLitz' Byambasuren",
            role: "IGL",
            avatarUrl: "images/bLitz.jpg",
            stats: {
              kd: "35-46",
              adr: 72.5,
              rating3: 0.92,
            },
          },
          {
            id: "mongolz_mzinho",
            name: "mzinho",
            fullName: "Ayush 'mzinho' Batbold",
            role: "Rifler",
            avatarUrl: "images/mzinho.jpg",
            stats: {
              kd: "26-42",
              adr: 55.1,
              rating3: 0.82,
            },
          },
          {
            id: "mongolz_910",
            name: "910",
            fullName: "Usukhbayar '910' Banzragch",
            role: "Rifler",
            avatarUrl: "images/910.jpg",
            stats: {
              kd: "33-47",
              adr: 72.0,
              rating3: 0.70,
            },
          },
        ],
      },
    },
  };

  /**
   * 数据接口占位：获取可选选手列表。
   * 未来可替换为从后端 API / 文件加载真实数据。
   */
  async function fetchAvailablePlayers() {
    // TODO: 可以在这里替换为后端接口，例如 /api/match/:id/players
    const all = [];
    Object.values(MATCH_DATA.teams).forEach((team) => {
      team.players.forEach((p) => {
        all.push({
          id: p.id,
          name: p.name,
          fullName: p.fullName,
          team: team.name,
          teamId: team.id,
          region: team.id === "vitality" ? "EU" : "ASIA",
          avatarUrl: p.avatarUrl,
          stats: p.stats,
        });
      });
    });
    return all;
  }

  /**
   * 数据接口占位：获取某名选手在指定对局中的逐回合经济数据。
   * 参数可以直接对接你后续的数据处理/后端服务。
   */
  async function fetchPlayerEconomyData(params) {
    const {
      playerId,
      matchId,
      mapName,
      startRound,
      endRound,
    } = params;

    // TODO: 用真实数据源替换此处（例如 /api/economy?playerId=...）

    const rounds = [];
    const totalRounds = Math.max(1, (endRound || 30) - (startRound || 1) + 1);
    let currentMoney = 4000;

    for (let i = 0; i < totalRounds; i++) {
      const round = (startRound || 1) + i;
      const spend = 800 + Math.round(Math.random() * 2500);
      const delta = (Math.random() - 0.4) * 2500;
      const endMoney = Math.max(0, currentMoney - spend + Math.max(0, delta));
      const kills = Math.floor(Math.random() * 4);
      const damage = 50 + Math.round(Math.random() * 150);
      const result = delta >= 0 ? "win" : "loss";

      rounds.push({
        roundNumber: round,
        startMoney: currentMoney,
        spendMoney: spend,
        endMoney,
        kills,
        damage,
        result,
      });

      currentMoney = Math.min(16000, endMoney + 3250 + Math.round(Math.random() * 1500));
    }

    return {
      playerId,
      matchId,
      mapName,
      rounds,
      summary: computeSummaryMetrics(rounds),
      weapons: buildMockWeaponInvestments(),
      keyRounds: buildMockKeyRounds(rounds),
    };
  }

  function computeSummaryMetrics(rounds) {
    if (!rounds.length) {
      return {
        ecoRating: 0,
        stability: 0,
        efficiency: 0,
        tempoControl: 0,
        saveRate: 0,
      };
    }

    const n = rounds.length;
    const startValues = rounds.map((r) => r.startMoney);
    const meanStart = startValues.reduce((a, b) => a + b, 0) / n;
    const variance =
      startValues.reduce((acc, v) => acc + (v - meanStart) * (v - meanStart), 0) / n;
    const stability = 1 - Math.min(1, variance / (8000 * 8000));

    const totalSpend = rounds.reduce((s, r) => s + r.spendMoney, 0);
    const totalDamage = rounds.reduce((s, r) => s + r.damage, 0);
    const efficiency = totalSpend > 0 ? Math.min(1, totalDamage / (totalSpend * 0.15)) : 0;

    const winRounds = rounds.filter((r) => r.result === "win").length;
    const tempoControl = winRounds / n;

    const lowBuyRounds = rounds.filter((r) => r.spendMoney < 1200).length;
    const saveRate = lowBuyRounds / n;

    const ecoRating = Math.round(
      (stability * 0.25 + efficiency * 0.35 + tempoControl * 0.3 + saveRate * 0.1) * 100
    );

    return {
      ecoRating,
      stability,
      efficiency,
      tempoControl,
      saveRate,
    };
  }

  function buildMockWeaponInvestments() {
    return [
      {
        id: "ak47",
        name: "AK‑47",
        category: "rifle",
        spent: 48000,
        kills: 42,
        iconUrl: "img/weapons/AK47.jpg",
      },
      {
        id: "m4a1s",
        name: "M4A1‑S",
        category: "rifle",
        spent: 39000,
        kills: 31,
        iconUrl: "img/weapons/M4A1S.jpg",
      },
      {
        id: "awp",
        name: "AWP",
        category: "sniper",
        spent: 35000,
        kills: 18,
        iconUrl: "img/weapons/AWP.jpg",
      },
      {
        id: "deagle",
        name: "Desert Eagle",
        category: "pistol",
        spent: 7000,
        kills: 10,
        iconUrl: "img/weapons/DesertEagle.jpg",
      },
      {
        id: "utility",
        name: "Grenades / Utility",
        category: "utility",
        spent: 16000,
        kills: 4,
        iconUrl: "img/weapons/HighExplosiveGrenade.jpg",
      },
    ];
  }

  function buildMockKeyRounds(rounds) {
    return rounds.slice(0, 5).map((r) => ({
      roundNumber: r.roundNumber,
      startMoney: r.startMoney,
      spendMoney: r.spendMoney,
      result: r.result,
      note:
        r.result === "win"
          ? "高投入并赢下关键回合，后续几局经济稳定。"
          : "高投入但回合失败，导致后续一到两局经济紧张。",
    }));
  }

  function initPlayerOptions(players) {
    playerSelect.innerHTML = "";
    players.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.name} — ${p.team}`;
      playerSelect.appendChild(opt);
    });

    if (players.length > 0) {
      playerSelect.value = players[0].id;
      updatePlayerInfo(players[0], { ecoRating: 0 });
    }
  }

  function updatePlayerInfo(player, summary) {
    playerNameEl.textContent = player.name;
    playerTeamEl.textContent = `${player.team} · ${player.region}`;
    playerRatingEl.textContent =
      typeof summary.ecoRating === "number" && summary.ecoRating > 0
        ? summary.ecoRating.toFixed(0)
        : "—";

    if (player.avatarUrl) {
      playerAvatarImg.src = player.avatarUrl;
      playerAvatarImg.style.display = "block";
      playerAvatarImg.onerror = () => {
        playerAvatarImg.style.display = "none";
        playerAvatarFallback.style.display = "flex";
      };
      playerAvatarFallback.textContent = player.name.charAt(0).toUpperCase();
      playerAvatarFallback.style.display = "none";
    } else {
      playerAvatarImg.removeAttribute("src");
      playerAvatarImg.style.display = "none";
      playerAvatarFallback.textContent = player.name.charAt(0).toUpperCase();
      playerAvatarFallback.style.display = "flex";
    }

    if (player.stats) {
      if (playerKdEl) playerKdEl.textContent = player.stats.kd;
      if (playerAdrEl) playerAdrEl.textContent = player.stats.adr.toFixed(1);
      if (playerRatingHltvEl) playerRatingHltvEl.textContent = player.stats.rating3.toFixed(2);
    } else {
      if (playerKdEl) playerKdEl.textContent = "—";
      if (playerAdrEl) playerAdrEl.textContent = "—";
      if (playerRatingHltvEl) playerRatingHltvEl.textContent = "—";
    }
  }

  function renderLineChart(data) {
    const container = lineChartEl;
    container.innerHTML = "";

    const margin = { top: 12, right: 24, bottom: 28, left: 44 };
    const width = container.clientWidth || 600;
    const height = 260;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3
      .select(container)
      .append("svg")
      .attr("width", width)
      .attr("height", height);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scalePoint()
      .domain(data.rounds.map((d) => d.roundNumber))
      .range([0, innerWidth])
      .padding(0.5);

    const maxMoney = d3.max(data.rounds, (d) => Math.max(d.startMoney, d.endMoney, d.spendMoney)) || 10000;
    const y = d3.scaleLinear().domain([0, maxMoney]).nice().range([innerHeight, 0]);

    const lineStart = d3
      .line()
      .x((d) => x(d.roundNumber))
      .y((d) => y(d.startMoney));

    const lineEnd = d3
      .line()
      .x((d) => x(d.roundNumber))
      .y((d) => y(d.endMoney));

    const lineSpend = d3
      .line()
      .x((d) => x(d.roundNumber))
      .y((d) => y(d.spendMoney));

    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).tickSizeOuter(0))
      .selectAll("text")
      .attr("font-size", 10);

    g.append("g")
      .call(
        d3
          .axisLeft(y)
          .ticks(5)
          .tickFormat((v) => `$${v}`)
      )
      .selectAll("text")
      .attr("font-size", 10);

    g.append("path")
      .datum(data.rounds)
      .attr("fill", "none")
      .attr("stroke", "#22c55e")
      .attr("stroke-width", 2)
      .attr("d", lineStart);

    g.append("path")
      .datum(data.rounds)
      .attr("fill", "none")
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 2)
      .attr("d", lineEnd);

    g.append("path")
      .datum(data.rounds)
      .attr("fill", "none")
      .attr("stroke", "#f97316")
      .attr("stroke-dasharray", "4,3")
      .attr("stroke-width", 1.6)
      .attr("d", lineSpend);

    const legend = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${8})`)
      .attr("font-size", 10);

    const legendItems = [
      { color: "#22c55e", label: "回合开始金钱" },
      { color: "#3b82f6", label: "回合结束金钱" },
      { color: "#f97316", label: "本回合花费" },
    ];

    legendItems.forEach((item, i) => {
      const gItem = legend.append("g").attr("transform", `translate(${i * 120},0)`);
      gItem
        .append("line")
        .attr("x1", 0)
        .attr("x2", 16)
        .attr("y1", 0)
        .attr("y2", 0)
        .attr("stroke", item.color)
        .attr("stroke-width", 2);
      gItem
        .append("text")
        .attr("x", 20)
        .attr("y", 3)
        .text(item.label);
    });
  }

  function renderRadarChart(summary) {
    const container = radarChartEl;
    container.innerHTML = "";

    const metrics = [
      { key: "stability", label: "稳定度" },
      { key: "efficiency", label: "投入产出" },
      { key: "tempoControl", label: "节奏控制" },
      { key: "saveRate", label: "省钱/保存" },
    ];

    const values = metrics.map((m) => ({
      ...m,
      value: Math.max(0, Math.min(1, summary[m.key] || 0)),
    }));

    const width = 260;
    const height = 260;
    const radius = 90;
    const centerX = width / 2;
    const centerY = height / 2;

    const svg = d3.select(container).append("svg").attr("width", width).attr("height", height);
    const g = svg.append("g").attr("transform", `translate(${centerX},${centerY})`);

    const levels = 4;
    for (let level = 1; level <= levels; level++) {
      const r = (radius * level) / levels;
      const ringPoints = values.map((_, i) => {
        const angle = (Math.PI * 2 * i) / values.length - Math.PI / 2;
        return [Math.cos(angle) * r, Math.sin(angle) * r];
      });
      g.append("polygon")
        .attr("points", ringPoints.map((p) => p.join(",")).join(" "))
        .attr("fill", "none")
        .attr("stroke", "rgba(148,163,184,0.4)")
        .attr("stroke-width", 0.8);
    }

    values.forEach((v, i) => {
      const angle = (Math.PI * 2 * i) / values.length - Math.PI / 2;
      const [x, y] = [Math.cos(angle) * radius, Math.sin(angle) * radius];
      g.append("line")
        .attr("x1", 0)
        .attr("y1", 0)
        .attr("x2", x)
        .attr("y2", y)
        .attr("stroke", "rgba(148,163,184,0.6)")
        .attr("stroke-width", 0.8);

      svg
        .append("text")
        .attr("x", centerX + x * 1.08)
        .attr("y", centerY + y * 1.08)
        .attr("font-size", 10)
        .attr("text-anchor", x >= 0 ? "start" : "end")
        .attr("dominant-baseline", "central")
        .text(v.label);
    });

    const radarPoints = values.map((v, i) => {
      const angle = (Math.PI * 2 * i) / values.length - Math.PI / 2;
      const r = radius * v.value;
      return [Math.cos(angle) * r, Math.sin(angle) * r];
    });

    g.append("polygon")
      .attr("points", radarPoints.map((p) => p.join(",")).join(" "))
      .attr("fill", "rgba(59,130,246,0.4)")
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 1.5);
  }

  function renderWeaponsBoard(weapons) {
    weaponsBoardEl.innerHTML = "";

    const totalSpent = weapons.reduce((s, w) => s + w.spent, 0) || 1;

    weapons.forEach((w) => {
      const row = document.createElement("div");
      row.className = "eco-weapon-row";

      const iconWrap = document.createElement("div");
      iconWrap.className = "eco-weapon-icon-wrap";

      const iconImg = document.createElement("img");
      iconImg.className = "eco-weapon-icon";
      iconImg.alt = w.name;
      if (w.iconUrl) {
        iconImg.src = w.iconUrl;
      } else {
        iconImg.style.display = "none";
        iconWrap.textContent = "🔫";
      }
      iconImg.onerror = () => {
        iconImg.style.display = "none";
        if (!iconWrap.textContent) iconWrap.textContent = "🔫";
      };
      iconWrap.appendChild(iconImg);

      const content = document.createElement("div");
      content.className = "eco-weapon-content";

      const label = document.createElement("div");
      label.className = "eco-weapon-label";
      label.textContent = w.name;

      const barWrapper = document.createElement("div");
      barWrapper.className = "eco-weapon-bar-wrapper";

      const bar = document.createElement("div");
      bar.className = "eco-weapon-bar";
      bar.style.width = `${(w.spent / totalSpent) * 100}%`;

      const meta = document.createElement("div");
      meta.className = "eco-weapon-meta";
      meta.textContent = `投入 $${w.spent.toLocaleString()} · 击杀 ${w.kills}`;

      barWrapper.appendChild(bar);
      content.appendChild(label);
      content.appendChild(barWrapper);
      content.appendChild(meta);

      row.appendChild(iconWrap);
      row.appendChild(content);
      weaponsBoardEl.appendChild(row);
    });
  }

  function renderKeyRounds(keyRounds) {
    keyRoundsListEl.innerHTML = "";
    if (!keyRounds.length) return;

    keyRounds.forEach((kr) => {
      const li = document.createElement("li");
      li.className = "eco-key-round-item";
      li.innerHTML = `<strong>第 ${kr.roundNumber} 回合 · ${
        kr.result === "win" ? "胜" : "负"
      }</strong><span>开始 $${kr.startMoney.toLocaleString()} · 花费 $${kr.spendMoney.toLocaleString()}</span><p>${kr.note}</p>`;
      keyRoundsListEl.appendChild(li);
    });
  }

  async function refresh() {
    const playerId = playerSelect.value;
    const matchId = matchSelect.value || "match_1";
    const mapName = mapSelect.value || "de_mirage";
    const startRound = parseInt(roundStartInput.value, 10) || 1;
    const endRound = parseInt(roundEndInput.value, 10) || 30;

    const params = { playerId, matchId, mapName, startRound, endRound };
    const data = await fetchPlayerEconomyData(params);

    const players = await fetchAvailablePlayers();
    const player = players.find((p) => p.id === playerId) || players[0];
    if (player) {
      // 用 HLTV Rating 作为经济评分的主参考之一
      if (player.stats && typeof player.stats.rating3 === "number") {
        const base = player.stats.rating3;
        const adrBoost = player.stats.adr ? (player.stats.adr - 70) * 0.3 : 0;
        data.summary.ecoRating = Math.max(0, Math.min(100, Math.round(base * 60 + adrBoost)));
      }
      updatePlayerInfo(player, data.summary);
    }

    renderLineChart(data);
    renderRadarChart(data.summary);
    renderWeaponsBoard(data.weapons);
    renderKeyRounds(data.keyRounds);
  }

  async function init() {
    const players = await fetchAvailablePlayers();
    initPlayerOptions(players);

    matchSelect.innerHTML = "";
    ["Grand Final", "Semi Final"].forEach((name, idx) => {
      const opt = document.createElement("option");
      opt.value = `match_${idx + 1}`;
      opt.textContent = name;
      matchSelect.appendChild(opt);
    });
    matchSelect.value = "match_1";

    mapSelect.innerHTML = "";
    [
      { id: "de_mirage", name: "Mirage" },
      { id: "de_dust2", name: "Dust II" },
      { id: "de_inferno", name: "Inferno" },
    ].forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.name;
      mapSelect.appendChild(opt);
    });
    mapSelect.value = "de_mirage";

    playerSelect.addEventListener("change", refresh);
    matchSelect.addEventListener("change", refresh);
    mapSelect.addEventListener("change", refresh);
    applyBtn.addEventListener("click", refresh);

    await refresh();
  }

  init();
})();

