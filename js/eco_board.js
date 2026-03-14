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

  const MAIN_WEAPONS = ['None', 'AK-47', 'M4A4', 'M4A1-S', 'AWP', 'Galil AR', 'FAMAS', 'AUG', 'SG 553', 'SSG 08', 'MAC-10', 'MP9', 'UMP-45', 'MP7', 'PP-Bizon', 'P90'];
  const PISTOLS = ['Default', 'Glock-18', 'USP-S', 'P250', 'Five-SeveN', 'Tec-9', 'Dual Berettas', 'Desert Eagle', 'CZ75-Auto', 'R8 Revolver'];
  const ARMOR_OPTIONS = ['None', 'Kevlar', 'Kevlar+Helmet'];

  let currentSide = 'T';
  let currentStrategy = 'halfbuy';

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
    container.innerHTML = items.map(i => {
      const label = i.name + (i.price ? ' $' + i.price : '');
      return `<span class="eco-recommend-item" title="${i.name}">${escapeHtml(i.name)} <strong>$${i.price}</strong></span>`;
    }).join(' ');
    totalEl.textContent = '= $' + total.toLocaleString();
    totalEl.style.display = 'block';
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
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

    let html = '';
    for (let i = 1; i <= 5; i++) {
      const money = [3400, 2000, 5000, 7000, 8000][i - 1];
      html += `
        <div class="eco-player-card" data-player="${i}">
          <h4>Player ${i}</h4>
          <div class="eco-player-money">
            <label for="player${i}Money">$</label>
            <input type="number" id="player${i}Money" min="0" value="${money}" aria-label="Player ${i} money">
          </div>
          <div class="eco-player-equip">
            <label>Main</label>
            <select id="player${i}Main" aria-label="Player ${i} main weapon">
              ${MAIN_WEAPONS.map(w => `<option value="${w}">${w}</option>`).join('')}
            </select>
          </div>
          <div class="eco-player-equip">
            <label>Pistol</label>
            <select id="player${i}Pistol" aria-label="Player ${i} pistol">
              ${PISTOLS.map(p => `<option value="${p}">${p}</option>`).join('')}
            </select>
          </div>
          <div class="eco-player-equip">
            <label>Armor</label>
            <select id="player${i}Armor" aria-label="Player ${i} armor">
              ${ARMOR_OPTIONS.map(a => `<option value="${a}">${a}</option>`).join('')}
            </select>
          </div>
          <div class="eco-player-equip">
            <label>Grenades</label>
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
    initThemeSync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
