/**
 * CS2 Eco Board — Team Economic Info
 * Follows CS2 economy and equipment rules; generates recommended loadouts by strategy.
 */

(function () {
  'use strict';

  // ---------- CS2 economy constants ----------
  const REWARDS = {
    winElimination: 3250,   // elimination win
    winBomb: 3500,          // bomb plant/defuse win
    lossBonus: [1400, 1900, 2400, 2900, 3400], // consecutive losses 1–5+
    lossBonusPistol: 1900,  // pistol round loss
    bombPlant: 300,
    bombDefuse: 300
  };

  // ---------- CS2 equipment prices (in-game) ----------
  const PRICES = {
    // rifles
    'AK-47': 2700,
    'M4A4': 3100,
    'M4A1-S': 2900,
    'AWP': 4750,
    'Galil AR': 1800,
    'FAMAS': 2050,
    'AUG': 3300,
    'SG 553': 3000,
    'SSG 08': 1700,
    // SMGs
    'MAC-10': 1050,
    'MP9': 1250,
    'UMP-45': 1200,
    'MP7': 1500,
    'MP5-SD': 1500,
    'PP-Bizon': 1400,
    'P90': 2350,
    // pistols
    'Glock-18': 0,
    'USP-S': 0,
    'P250': 300,
    'Five-SeveN': 500,
    'Tec-9': 500,
    'Dual Berettas': 300,
    'Desert Eagle': 700,
    'CZ75-Auto': 500,
    'R8 Revolver': 600,
    // armor
    'Kevlar': 650,
    'Kevlar+Helmet': 1000,
    // utility (T/CT molotov price differs)
    'Flashbang': 200,
    'HE Grenade': 300,
    'Smoke Grenade': 300,
    'Decoy': 50,
    'Molotov': 400,      // T
    'Incendiary': 600    // CT
  };

  const MAIN_WEAPONS = ['None', 'AK-47', 'M4A4', 'M4A1-S', 'AWP', 'Galil AR', 'MP5-SD', 'FAMAS', 'AUG', 'SG 553', 'SSG 08', 'MAC-10', 'MP9', 'UMP-45', 'MP7', 'PP-Bizon', 'P90'];
  const PISTOLS = ['Default', 'Glock-18', 'USP-S', 'P250', 'Five-SeveN', 'Tec-9', 'Dual Berettas', 'Desert Eagle', 'CZ75-Auto', 'R8 Revolver'];
  const ARMOR_OPTIONS = ['None', 'Kevlar', 'Kevlar+Helmet'];

  var MAIN_WEAPON_IMAGES = {
    'AK-47': 'assets/ak47.png',
    'AWP': 'assets/awp.png',
    'Galil AR': 'assets/galil-ar.png',
    'M4A4': 'assets/m4a4.png',
    'M4A1-S': 'assets/m4a1s.png',
    'MP5-SD': 'assets/mp5sd.png'
  };

  let currentSide = 'T';
  let currentStrategy = 'halfbuy';
  const CT_AVATAR_URL = 'assets/ct-avatar.png';
  const T_AVATAR_URL = 'https://i.imgur.com/JhMpxJq_d.webp?maxwidth=760&fidelity=grand';

  // Round history for win-rate prediction: { round, result: 'win'|'loss', avgEconomyAfter }
  let roundHistory = [];

  function getMolotovPrice() {
    return currentSide === 'CT' ? PRICES['Incendiary'] : PRICES['Molotov'];
  }

  function getEquipmentValue(main, pistol, armor, nades) {
    let v = 0;
    if (main && main !== 'None') v += PRICES[main] || 0;
    if (pistol && pistol !== 'Default' && pistol !== 'Glock-18' && pistol !== 'USP-S') v += PRICES[pistol] || 0;
    if (armor && armor !== 'None') v += PRICES[armor] || 0;
    if (nades && Array.isArray(nades)) {
      nades.forEach(n => {
        if (n === 'Molotov' || n === 'Incendiary') v += getMolotovPrice();
        else v += (PRICES[n] || 0);
      });
    }
    return v;
  }

  function getPlayerData() {
    const players = [];
    for (let i = 1; i <= 5; i++) {
      const money = parseInt(document.getElementById(`player${i}Money`)?.value || '0', 10) || 0;
      const main = document.getElementById(`player${i}Main`)?.value || 'None';
      const pistol = document.getElementById(`player${i}Pistol`)?.value || 'Default';
      const armor = document.getElementById(`player${i}Armor`)?.value || 'None';
      const nadesRaw = document.getElementById(`player${i}Nades`)?.value || '';
      const nades = nadesRaw ? nadesRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
      players.push({ money, main, pistol, armor, nades });
    }
    return players;
  }

  function getTotalEquipmentValue(players) {
    return players.reduce((sum, p) => sum + getEquipmentValue(p.main, p.pistol, p.armor, p.nades), 0);
  }

  function getAverageMoney(players) {
    if (!players.length) return 0;
    return Math.round(players.reduce((s, p) => s + p.money, 0) / players.length);
  }

  function updateSummary() {
    const players = getPlayerData();
    const avg = getAverageMoney(players);
    const totalEq = getTotalEquipmentValue(players);
    const round = parseInt(document.getElementById('currentRound').value, 10) || 1;
    const lossTier = Math.min(4, round - 1); // simplified: use round as proxy for loss streak
    const lossBonus = REWARDS.lossBonus[Math.min(lossTier, 4)];

    document.getElementById('winBonus').textContent = REWARDS.winBomb;
    document.getElementById('lossBonus').textContent = REWARDS.lossBonus[0];
    document.getElementById('lossBonusMax').textContent = REWARDS.lossBonus[4];
    document.getElementById('avgEconomy').textContent = '$' + avg.toLocaleString();
    document.getElementById('totalEquipment').textContent = '$' + totalEq.toLocaleString();
    // next round avg (assuming loss): current money + loss bonus (fixed 1400 here; can extend with win/loss state)
    document.getElementById('nextRoundAvg').textContent = '$' + (avg + lossBonus).toLocaleString();
    if (document.getElementById('ecoWinRateChart')) renderPredictionChart();
  }

  // ---------- Strategy recommendations ----------
  function buildEcoRecommendation() {
    // Eco: pistol + optional 1 flash, save money
    const items = [
      { name: 'P250', price: PRICES['P250'] },
      { name: 'Flashbang', price: PRICES['Flashbang'] }
    ];
    const total = items.reduce((s, i) => s + i.price, 0);
    return { items, total };
  }

  function buildHalfBuyRecommendation() {
    // Half Buy: SMG / budget rifle + armor + basic utility
    const rifle = currentSide === 'T' ? 'Galil AR' : 'FAMAS';
    const smg = currentSide === 'T' ? 'MAC-10' : 'MP9';
    const items = [
      { name: rifle, price: PRICES[rifle] },
      { name: 'Kevlar+Helmet', price: PRICES['Kevlar+Helmet'] },
      { name: 'Flashbang', price: PRICES['Flashbang'] },
      { name: 'Flashbang', price: PRICES['Flashbang'] },
      { name: 'Smoke Grenade', price: PRICES['Smoke Grenade'] },
      { name: 'HE Grenade', price: PRICES['HE Grenade'] }
    ];
    const total = items.reduce((s, i) => s + i.price, 0);
    return { items, total };
  }

  function buildFullBuyRecommendation() {
    // Full Buy: main rifle + full armor + full utility
    const rifle = currentSide === 'T' ? 'AK-47' : 'M4A4';
    const molotovName = currentSide === 'CT' ? 'Incendiary' : 'Molotov';
    const molotovPrice = getMolotovPrice();
    const items = [
      { name: rifle, price: PRICES[rifle] },
      { name: 'Kevlar+Helmet', price: PRICES['Kevlar+Helmet'] },
      { name: 'Flashbang', price: PRICES['Flashbang'] },
      { name: 'Flashbang', price: PRICES['Flashbang'] },
      { name: 'Smoke Grenade', price: PRICES['Smoke Grenade'] },
      { name: 'HE Grenade', price: PRICES['HE Grenade'] },
      { name: molotovName, price: molotovPrice }
    ];
    const total = items.reduce((s, i) => s + i.price, 0);
    return { items, total };
  }

  function getRecommendation() {
    switch (currentStrategy) {
      case 'eco': return buildEcoRecommendation();
      case 'halfbuy': return buildHalfBuyRecommendation();
      case 'fullbuy': return buildFullBuyRecommendation();
      default: return buildHalfBuyRecommendation();
    }
  }

  function renderRecommendation() {
    const { items, total } = getRecommendation();
    const placeholder = document.querySelector('.eco-recommend-placeholder');
    const container = document.getElementById('recommendItems');
    const totalEl = document.getElementById('recommendTotal');
    if (placeholder) placeholder.style.display = 'none';
    container.innerHTML = items.map(i =>
      `<span class="eco-recommend-item" title="${i.name}">${escapeHtml(i.name)} <strong>$${i.price}</strong></span>`
    ).join(' + ');
    if (totalEl) {
      totalEl.textContent = '$' + total.toLocaleString();
      totalEl.style.display = 'inline';
    }
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function getAvatarUrl() {
    return currentSide === 'CT' ? CT_AVATAR_URL : T_AVATAR_URL;
  }

  function updateAvatarsForSide() {
    var url = getAvatarUrl();
    document.querySelectorAll('.eco-player-avatar').forEach(function (el) {
      el.className = 'eco-player-avatar eco-avatar-' + currentSide;
      el.style.backgroundImage = "url('" + url + "')";
      el.style.backgroundSize = 'contain';
      el.style.backgroundRepeat = 'no-repeat';
      el.style.backgroundPosition = 'center';
    });
  }

  function renderPlayerCards() {
    const grid = document.getElementById('playersGrid');
    const nadeOptions = [
        '',
        'Flashbang',
        'Flashbang,Flashbang',
        'Flashbang,Smoke Grenade',
        'Flashbang,Flashbang,Smoke Grenade',
        'Flashbang,Flashbang,Smoke Grenade,HE Grenade',
        'Flashbang,Flashbang,Smoke Grenade,HE Grenade,' + (currentSide === 'CT' ? 'Incendiary' : 'Molotov')
    ].map((val, i) => {
      const label = !val ? 'None' : (val.split(',').length + ' items');
      return `<option value="${escapeHtml(val)}">${label}</option>`;
    }).join('');

    const avatarClass = 'eco-player-avatar eco-avatar-' + currentSide;
    const avatarUrl = getAvatarUrl();
    const avatarStyle = " style=\"background-image: url('" + avatarUrl + "'); background-size: contain; background-repeat: no-repeat; background-position: center;\"";
    let html = '';
    for (let i = 1; i <= 5; i++) {
      const money = [3400, 2000, 5000, 7000, 8000][i - 1];
      html += `
        <div class="eco-player-card" data-player="${i}">
          <h4>Player ${i}</h4>
          <div class="${avatarClass}"${avatarStyle} aria-hidden="true"></div>
          <div class="eco-player-money">
            <label for="player${i}Money">$</label>
            <input type="number" id="player${i}Money" min="0" value="${money}" aria-label="Player ${i} money">
          </div>
          <div class="eco-player-equip">
            <label>Main:</label>
            <select id="player${i}Main" aria-label="Player ${i} main weapon">
              ${MAIN_WEAPONS.map(w => `<option value="${w}">${w}</option>`).join('')}
            </select>
            <div class="eco-main-weapon-img" id="player${i}MainImg">
              <img src="" alt="" role="presentation">
            </div>
          </div>
          <div class="eco-player-equip">
            <label>Pistol:</label>
            <select id="player${i}Pistol" aria-label="Player ${i} pistol">
              ${PISTOLS.map(p => `<option value="${p}">${p}</option>`).join('')}
            </select>
          </div>
          <div class="eco-player-equip">
            <label>Equipment:</label>
            <select id="player${i}Armor" aria-label="Player ${i} armor">
              ${ARMOR_OPTIONS.map(a => `<option value="${a}">${a}</option>`).join('')}
            </select>
          </div>
          <div class="eco-player-equip">
            <label>Grenades:</label>
            <select id="player${i}Nades" aria-label="Player ${i} grenades">
              ${nadeOptions}
            </select>
          </div>
        </div>`;
    }
    grid.innerHTML = html;

    // Bind input/change for summary update
    grid.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('input', updateSummary);
      el.addEventListener('change', updateSummary);
    });

    for (var i = 1; i <= 5; i++) {
      updateMainWeaponImg(i);
      var mainSelect = document.getElementById('player' + i + 'Main');
      if (mainSelect) {
        mainSelect.addEventListener('change', (function (idx) {
          return function () { updateMainWeaponImg(idx); };
        })(i));
      }
    }
  }

  function updateMainWeaponImg(playerIndex) {
    var select = document.getElementById('player' + playerIndex + 'Main');
    var container = document.getElementById('player' + playerIndex + 'MainImg');
    if (!select || !container) return;
    var img = container.querySelector('img');
    if (!img) return;
    var value = select.value;
    var src = MAIN_WEAPON_IMAGES[value] || '';
    if (src) {
      img.src = src;
      img.alt = value;
      container.classList.remove('eco-main-weapon-img-empty');
    } else {
      img.removeAttribute('src');
      img.alt = '';
      container.classList.add('eco-main-weapon-img-empty');
    }
  }


  function bindRoundNav() {
    const input = document.getElementById('currentRound');
    document.getElementById('btnLastRound').addEventListener('click', () => {
      const v = Math.max(1, parseInt(input.value, 10) - 1);
      input.value = v;
      updateSummary();
    });
    document.getElementById('btnNextRound').addEventListener('click', () => {
      const v = parseInt(input.value, 10) || 1;
      input.value = v + 1;
      updateSummary();
    });
    input.addEventListener('change', updateSummary);
  }

  function bindSideButtons() {
    document.querySelectorAll('.eco-side-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.eco-side-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSide = btn.dataset.side;
        updateAvatarsForSide();
        renderRecommendation();
      });
    });
  }

  function bindStrategyButtons() {
    document.querySelectorAll('.eco-strategy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.eco-strategy-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentStrategy = btn.dataset.strategy;
        renderRecommendation();
      });
    });
  }

  // ---------- Win rate prediction ----------
  const PREDICTION_LOOKBACK = 5;
  const ECONOMY_NEUTRAL = 3500;
  const ECONOMY_FACTOR = 0.00012; // per dollar deviation from neutral, clamped

  function computeNextRoundWinProbability(history, currentAvgEconomy) {
    if (!history || history.length === 0) {
      const raw = 0.5 + (currentAvgEconomy - ECONOMY_NEUTRAL) * ECONOMY_FACTOR;
      return Math.max(0.1, Math.min(0.9, raw));
    }
    const recent = history.slice(-PREDICTION_LOOKBACK);
    const wins = recent.filter(r => r.result === 'win').length;
    const recentWinRate = wins / recent.length;
    const economyDelta = (currentAvgEconomy - ECONOMY_NEUTRAL) * ECONOMY_FACTOR;
    const economyClamp = Math.max(-0.15, Math.min(0.15, economyDelta));
    const p = recentWinRate + economyClamp;
    return Math.max(0.1, Math.min(0.9, p));
  }

  function getPredictionData() {
    const players = getPlayerData();
    const avgNow = getAverageMoney(players);
    const nextPred = computeNextRoundWinProbability(roundHistory, avgNow);
    const actuals = roundHistory.map(r => ({
      round: r.round,
      value: r.result === 'win' ? 1 : 0,
      label: r.result === 'win' ? 'Win' : 'Loss'
    }));
    const predictions = [];
    for (let i = 0; i < roundHistory.length; i++) {
      const nextRound = roundHistory[i].round + 1;
      const economyUsed = roundHistory[i].avgEconomyAfter;
      const histUpTo = roundHistory.slice(0, i + 1);
      const pred = computeNextRoundWinProbability(histUpTo, economyUsed);
      predictions.push({ round: nextRound, value: pred, label: (pred * 100).toFixed(0) + '%' });
    }
    if (roundHistory.length > 0) {
      const last = predictions[predictions.length - 1];
      last.value = nextPred;
      last.label = (nextPred * 100).toFixed(0) + '%';
    } else {
      predictions.push({ round: 1, value: nextPred, label: (nextPred * 100).toFixed(0) + '%' });
    }
    return { actuals, predictions, nextPred };
  }

  function renderPredictionChart() {
    const container = document.getElementById('ecoWinRateChart');
    if (!container || typeof window.d3 === 'undefined') return;
    const d3 = window.d3;
    const { actuals, predictions } = getPredictionData();
    const margin = { top: 10, right: 10, bottom: 28, left: 36 };
    const cw = container.clientWidth || 280;
    const width = Math.max(220, Math.min(cw - margin.left - margin.right, 400));
    const height = Math.max(140, 180) - margin.top - margin.bottom;
    d3.select(container).selectAll('*').remove();
    if (actuals.length === 0 && predictions.length <= 1) {
      const p = predictions[0] ? (predictions[0].value * 100).toFixed(0) : '50';
      container.innerHTML = '<p class="eco-prediction-empty">No round history yet. Current economy suggests next round win chance: <strong>' + p + '%</strong>. Simulate Win/Loss to build the chart.</p>';
      return;
    }
    const svg = d3.select(container)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
    const allRounds = new Set(actuals.map(d => d.round).concat(predictions.map(d => d.round)));
    const roundExtent = [Math.min(...allRounds), Math.max(...allRounds)];
    if (roundExtent[0] === roundExtent[1]) {
      roundExtent[1] = roundExtent[0] + 1;
    }
    const x = d3.scaleLinear().domain(roundExtent).range([0, width]);
    const y = d3.scaleLinear().domain([0, 1]).nice().range([height, 0]);
    const lineActual = d3.line()
      .x(d => x(d.round))
      .y(d => y(d.value))
      .curve(d3.curveStepAfter);
    svg.append('g')
      .attr('transform', 'translate(0,' + height + ')')
      .attr('class', 'eco-chart-axis')
      .call(d3.axisBottom(x).ticks(Math.min(8, roundExtent[1] - roundExtent[0] + 1)).tickFormat(d3.format('d')));
    svg.append('g')
      .attr('class', 'eco-chart-axis')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => (d * 100) + '%'));
    if (predictions.length > 0) {
      const linePred = d3.line()
        .x(d => x(d.round))
        .y(d => y(d.value));
      const predSorted = [...predictions].sort((a, b) => a.round - b.round);
      svg.append('path')
        .datum(predSorted)
        .attr('class', 'eco-chart-line-pred')
        .attr('d', linePred);
    }
    if (actuals.length > 0) {
      svg.append('path')
        .datum(actuals.sort((a, b) => a.round - b.round))
        .attr('class', 'eco-chart-line-actual')
        .attr('d', lineActual);
      svg.selectAll('.eco-chart-pt-actual')
        .data(actuals)
        .join('circle')
        .attr('class', 'eco-chart-pt-actual')
        .attr('cx', d => x(d.round))
        .attr('cy', d => y(d.value))
        .attr('r', 4)
        .attr('aria-label', d => 'Round ' + d.round + ' ' + d.label);
    }
    if (predictions.length > 0) {
      svg.selectAll('.eco-chart-pt-pred')
        .data(predictions)
        .join('circle')
        .attr('class', 'eco-chart-pt-pred')
        .attr('cx', d => x(d.round))
        .attr('cy', d => y(d.value))
        .attr('r', 4)
        .attr('aria-label', d => 'Predicted round ' + d.round + ' ' + d.label);
    }
  }

  function bindOutcomeButtons() {
    const btnWin = document.getElementById('btnSimulateWin');
    const btnLoss = document.getElementById('btnSimulateLoss');
    function recordAndUpdate(result, bonus) {
      const roundInput = document.getElementById('currentRound');
      const round = parseInt(roundInput?.value || '1', 10) || 1;
      const players = getPlayerData();
      const avgBefore = getAverageMoney(players);
      const avgEconomyAfter = avgBefore + bonus;
      roundHistory.push({ round, result, avgEconomyAfter });
      for (let i = 1; i <= 5; i++) {
        const input = document.getElementById('player' + i + 'Money');
        if (input) input.value = (parseInt(input.value, 10) || 0) + bonus;
      }
      if (roundInput) roundInput.value = round + 1;
      updateSummary();
      renderPredictionChart();
    }
    if (btnWin) {
      btnWin.addEventListener('click', () => recordAndUpdate('win', REWARDS.winBomb));
    }
    if (btnLoss) {
      btnLoss.addEventListener('click', () => recordAndUpdate('loss', REWARDS.lossBonus[0]));
    }
  }

  function initThemeSync() {
    if (window.self === window.top) return;
    function applyTheme(theme) {
      if (theme === 'dark' || theme === 'light') {
        document.body.setAttribute('data-theme', theme);
      }
    }
    window.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'theme') {
        applyTheme(e.data.theme);
      }
    });
    function requestTheme() {
      try {
        window.parent.postMessage({ type: 'eco-board-ready' }, '*');
      } catch (_) {}
    }
    requestTheme();
    setTimeout(requestTheme, 150);
    setTimeout(requestTheme, 500);
  }

  function init() {
    renderPlayerCards();
    updateSummary();
    renderRecommendation();
    bindRoundNav();
    bindSideButtons();
    bindStrategyButtons();
    bindOutcomeButtons();
    renderPredictionChart();
    initThemeSync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
