(function () {
  'use strict';

  const TEAM_DATA_URL = 'data/processed/eco_timeline.json';
  const PLAYER_DATA_URL = 'data/processed/eco_player_rounds.json';
  const THEME_STORAGE_KEY = 'dashboard-theme';
  const DEFAULT_MAP = 'de_mirage';
  const SPEED_TO_DELAY = { '0.5': 1700, '1': 950, '1.5': 650, '2': 460 };
  const TEAM_META = {
    vitality: { label: 'Vitality', color: '#3b82f6', roster: ['apEX', 'ZywOo', 'flameZ', 'mezii', 'ropz'] },
    mongolz: { label: 'The MongolZ', color: '#ef4444', roster: ['910', 'bLitz', 'Techno4K', 'Mzinho', 'Senzu'] }
  };
  const MAP_LABELS = { de_mirage: 'Mirage', de_dust2: 'Dust II', de_inferno: 'Inferno' };
  const BUY_LABELS = { pistol: 'Pistol', eco: 'Eco', half: 'Half buy', force: 'Force buy', full: 'Full buy' };
  const WEAPON_ASSETS = {
    ak47: 'assets/ak47.png',
    awp: 'assets/awp.png',
    galilar: 'assets/galil-ar.png',
    m4a1: 'assets/m4a4.png',
    m4a1_silencer: 'assets/m4a1s.png',
    mp5sd: 'assets/mp5sd.png'
  };
  const WEAPON_ALIASES = {
    usp_s: 'usp_silencer',
    m4a1_s: 'm4a1_silencer',
    ak_47: 'ak47',
    galil_ar: 'galilar',
    five_seven: 'fiveseven',
    tec_9: 'tec9',
    ssg_08: 'ssg08',
    glock_18: 'glock',
    desert_eagle: 'deagle',
    dual_berettas: 'elite',
    smoke_grenade: 'smokegrenade',
    he_grenade: 'hegrenade',
    incendiary_grenade: 'incgrenade',
    c4_explosive: 'c4'
  };
  const KNIFE_TOKENS = ['knife', 'karambit', 'bayonet', 'butterfly', 'nomad', 'stiletto', 'talon', 'ursus', 'bowie', 'falchion', 'navaja', 'daggers', 'gut', 'flip', 'paracord', 'survival', 'skeleton', 'kukri'];

  const state = {
    embedded: false,
    matchData: null,
    playerData: null,
    currentMap: DEFAULT_MAP,
    currentRound: 1,
    analytics: null,
    isPlaying: false,
    playbackTimer: null
  };

  const dom = {};

  function boot() {
    state.embedded = readSearchParam('embedded') === '1';
    document.body.classList.toggle('eco-embedded-mode', state.embedded);
    cacheDom();
    applyPreferredTheme();
    bindThemeSync();
    if (!dom.roundStrip || typeof window.d3 === 'undefined') return;
    bindStaticEvents();
    loadData();
  }

  function cacheDom() {
    dom.subtitle = document.getElementById('ecoSubtitle');
    dom.mapTabs = Array.from(document.querySelectorAll('.eco-map-tab'));
    dom.playBtn = document.getElementById('ecoPlayBtn');
    dom.speedSelect = document.getElementById('ecoSpeedSelect');
    dom.prevRoundBtn = document.getElementById('ecoPrevRoundBtn');
    dom.nextRoundBtn = document.getElementById('ecoNextRoundBtn');
    dom.roundRange = document.getElementById('ecoRoundRange');
    dom.roundLabel = document.getElementById('ecoRoundLabel');
    dom.roundContext = document.getElementById('ecoRoundContext');
    dom.roundStrip = document.getElementById('ecoRoundStrip');
    dom.mapMeta = document.getElementById('ecoMapMeta');
    dom.scorebar = document.getElementById('ecoScorebar');
    dom.vitalityPanel = document.getElementById('ecoTeamPanelVitality');
    dom.mongolzPanel = document.getElementById('ecoTeamPanelMongolz');
    dom.storyPanel = document.getElementById('ecoStoryPanel');
    dom.glossaryGrid = document.getElementById('ecoGlossaryGrid');
    dom.scoreChart = document.getElementById('ecoScoreChart');
    dom.dataStatus = document.getElementById('ecoDataStatus');
    dom.consequenceStrip = document.getElementById('ecoConsequenceStrip');
    dom.eqGapBar = document.getElementById('ecoEqGapBar');
  }

  function bindStaticEvents() {
    dom.mapTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        if (!state.matchData || tab.dataset.map === state.currentMap) return;
        renderMap(tab.dataset.map, 1);
      });
    });

    dom.playBtn.addEventListener('click', () => {
      if (state.isPlaying) stopPlayback();
      else startPlayback();
    });

    dom.speedSelect.addEventListener('change', () => {
      if (state.isPlaying) startPlayback();
    });

    dom.prevRoundBtn.addEventListener('click', () => moveRound(-1));
    dom.nextRoundBtn.addEventListener('click', () => moveRound(1));
    dom.roundRange.addEventListener('input', () => setCurrentRound(Number(dom.roundRange.value), false));
  }

  async function loadData() {
    try {
      const [teamResponse, playerResponse] = await Promise.all([
        fetch(TEAM_DATA_URL, { cache: 'no-store' }),
        fetch(PLAYER_DATA_URL, { cache: 'no-store' }).catch(() => null)
      ]);
      if (!teamResponse.ok) throw new Error('Failed to load eco_timeline.json.');
      state.matchData = await teamResponse.json();
      state.playerData = playerResponse && playerResponse.ok ? normalizePlayerData(await playerResponse.json()) : null;
      populateTabScores();
      updateSubtitle();
      renderGlossary();
      renderMap(state.currentMap, 1);
      window.addEventListener('resize', handleResize);
    } catch (error) {
      console.error(error);
      showFatalState(error.message);
    }
  }

  function renderMap(mapName, desiredRound) {
    stopPlayback();
    const mapData = getMapData(mapName);
    if (!mapData) return;
    state.currentMap = mapData.map;
    state.analytics = analyzeMap(mapData);
    state.currentRound = Math.max(1, Math.min(desiredRound || 1, mapData.rounds.length));
    syncMapTabs();
    updateRoundRange(mapData);
    renderRoundStrip(mapData);
    renderCurrentRound();
    renderScoreChart(mapData);
    updateEmbeddedFrameHeight();
  }

  function renderCurrentRound() {
    const mapData = getCurrentMapData();
    if (!mapData) return;
    const round = mapData.rounds.find((item) => item.round === state.currentRound);
    const aftershock = state.analytics.aftershocks[round.round];
    const scoreBefore = getScoreBefore(round.round);
    const scoreAfter = state.analytics.scoreAfterRound[round.round];

    dom.roundLabel.textContent = `Round ${round.round}`;
    dom.roundContext.textContent = `${getTeamLabel(round.winner)} won this round. The chips below show what actually happened next, not a simulated forecast.`;
    dom.mapMeta.textContent = `${getMapLabel(mapData.map)} - ${getTeamLabel(mapData.winner)} won ${mapData.score.vitality}-${mapData.score.mongolz}`;

    if (dom.scorebar) dom.scorebar.innerHTML = renderScorebar(round, aftershock, scoreAfter);
    dom.vitalityPanel.innerHTML = renderTeamLoadout('vitality', round);
    dom.mongolzPanel.innerHTML = renderTeamLoadout('mongolz', round);
    if (dom.consequenceStrip) dom.consequenceStrip.innerHTML = renderConsequenceStrip(round, aftershock);
    renderEqGapBar(round);
    requestAnimationFrame(animateMoneyCounters);
    if (dom.storyPanel) dom.storyPanel.innerHTML = renderStoryPanel(mapData, round, aftershock, scoreBefore, scoreAfter);

    dom.prevRoundBtn.disabled = round.round === 1;
    dom.nextRoundBtn.disabled = round.round === mapData.rounds.length;
    dom.roundRange.value = String(round.round);
    syncRoundStrip(round.round);
    updateScoreFocus(round.round, aftershock);
    updateEmbeddedFrameHeight();
  }

  function renderRoundStrip(mapData) {
    dom.roundStrip.innerHTML = mapData.rounds.map((round) => `
      <button
        type="button"
        class="eco-round-chip eco-round-chip-${round.winner}${round.event ? ' is-event' : ''}${round.round === state.currentRound ? ' is-active' : ''}"
        data-round="${round.round}"
      >
        <strong>${round.round}</strong>
        <span>${BUY_LABELS[round[round.winner].buy_tier] || 'Round'}</span>
      </button>
    `).join('');

    dom.roundStrip.querySelectorAll('.eco-round-chip').forEach((button) => {
      button.addEventListener('click', () => setCurrentRound(Number(button.dataset.round), false));
    });
  }

  function syncRoundStrip(roundNumber) {
    const aftershock = state.analytics.aftershocks[roundNumber];
    const aftershockRounds = new Set(aftershock ? aftershock.impacted.map((i) => i.round) : []);
    dom.roundStrip.querySelectorAll('.eco-round-chip').forEach((button) => {
      const n = Number(button.dataset.round);
      button.classList.toggle('is-active', n === roundNumber);
      button.classList.toggle('is-aftershock', aftershockRounds.has(n));
    });
  }

  function renderScorebar(round, aftershock, scoreAfter) {
    const vData = round.vitality;
    const mData = round.mongolz;
    const vWin = round.winner === 'vitality';
    const swing = formatMoney(Math.abs(vData.eq_value - mData.eq_value));
    const followSentence = aftershock.impacted.length
      ? `${getTeamLabel(aftershock.loser)} forced into weaker buys for ${aftershock.impacted.length} round${aftershock.impacted.length > 1 ? 's' : ''} · EQ swing ${swing}`
      : `Both teams reset to equal footing · EQ swing ${swing}`;
    const eventLabel = round.event ? `<span class="eco-sb-event">${getEventLabel(round.event)}</span>` : '';
    return `
      <div class="eco-sb-inner">
        <div class="eco-sb-team eco-sb-team-v">
          <span class="eco-sb-name">Vitality</span>
          <span class="eco-metric-pill ${vWin ? 'is-win' : 'is-loss'}">${vWin ? 'Win' : 'Loss'}</span>
          <span class="eco-buy-tier-badge eco-tier-badge-${vData.buy_tier}">${formatBuyTier(vData.buy_tier)}</span>
          <div class="eco-power-meter">${renderPowerMeter(vData.eq_value)}</div>
          <span class="eco-sb-money">${formatMoney(vData.eq_value)}</span>
        </div>
        <div class="eco-sb-center">
          <span class="eco-sb-score">${scoreAfter.vitality}–${scoreAfter.mongolz}</span>
          ${eventLabel}
        </div>
        <div class="eco-sb-team eco-sb-team-m">
          <span class="eco-sb-money">${formatMoney(mData.eq_value)}</span>
          <div class="eco-power-meter">${renderPowerMeter(mData.eq_value)}</div>
          <span class="eco-buy-tier-badge eco-tier-badge-${mData.buy_tier}">${formatBuyTier(mData.buy_tier)}</span>
          <span class="eco-metric-pill ${!vWin ? 'is-win' : 'is-loss'}">${!vWin ? 'Win' : 'Loss'}</span>
          <span class="eco-sb-name">The MongolZ</span>
        </div>
      </div>
      <p class="eco-sb-aftershock">${followSentence}</p>
    `;
  }

  function renderTeamLoadout(teamKey, round) {
    const roundNumber = round.round;
    const teamData = round[teamKey];
    const players = getRoundPlayers(state.currentMap, roundNumber, teamKey);
    const roster = TEAM_META[teamKey].roster;
    const cards = roster.map((name, index) => renderPlayerCard(players[index], teamKey, name, teamData.buy_tier, index)).join('');
    const sideLabel = teamData.side === 'T' ? 'Attacking' : 'Defending';
    const sideClass = teamData.side === 'T' ? 'eco-side-t' : 'eco-side-ct';
    return `
      <div class="eco-team-loadout-header">
        <div class="eco-team-loadout-title">
          <h3 class="eco-card-title">${getTeamLabel(teamKey)}</h3>
          <span class="eco-side-badge ${sideClass}">${sideLabel}</span>
          <span class="eco-buy-tier-badge eco-tier-badge-${teamData.buy_tier}">${formatBuyTier(teamData.buy_tier)}</span>
        </div>
        <div class="eco-power-meter" title="Equipment value: ${formatMoney(teamData.eq_value)}">
          ${renderPowerMeter(teamData.eq_value)}
          <span class="eco-power-label">${formatMoney(teamData.eq_value)}</span>
        </div>
      </div>
      <div class="eco-roster-cards">${cards}</div>
    `;
  }

  function renderPlayerCard(player, teamKey, fallbackName, teamBuyTier, cardIndex) {
    const info = normalizePlayerCard(player, fallbackName);
    return `
      <article class="eco-player-card eco-player-card-${teamKey}" style="--card-idx:${cardIndex || 0}">
        <div class="eco-player-head">
          <div class="eco-player-avatar">${info.name.slice(0, 2).toUpperCase()}</div>
          <h4 class="eco-player-name">${info.name}${info.hasC4 ? ' <span class="eco-c4-badge">💣</span>' : ''}</h4>
        </div>
        <div class="eco-player-money" data-money="${info.money}">$0</div>
        <div class="eco-player-loadout">
          <div class="eco-player-row">
            <span class="eco-row-label">Main</span>
            <span class="eco-row-value">${renderWeaponLabel(info.primary)}</span>
          </div>
          <div class="eco-player-row">
            <span class="eco-row-label">Pistol</span>
            <span class="eco-row-value">${renderWeaponLabel(info.secondary)}</span>
          </div>
          <div class="eco-player-row">
            <span class="eco-row-label">Armor</span>
            <span class="eco-row-value">${renderArmorVisual(info.armor)}</span>
          </div>
          <div class="eco-player-row">
            <span class="eco-row-label">Util</span>
            <span class="eco-row-value eco-grenade-row">${renderGrenadeIcons(info.grenades)}</span>
          </div>
        </div>
        <div class="eco-player-tier-bar eco-tier-bar-${teamBuyTier || 'pistol'}"></div>
      </article>
    `;
  }

  function renderPowerMeter(eqValue) {
    const filled = Math.round(Math.min(eqValue / 4500, 1) * 5);
    return Array.from({ length: 5 }, (_, i) =>
      `<span class="eco-power-pip${i < filled ? ' is-filled' : ''}"></span>`
    ).join('');
  }

  function renderArmorVisual(armor) {
    if (!armor) return '<span class="eco-armor-none">None</span>';
    const hasHelmet = armor.toLowerCase().includes('helmet');
    return `<span class="eco-armor-pip eco-armor-body"></span>${hasHelmet ? '<span class="eco-armor-pip eco-armor-head"></span>' : ''}<span class="eco-armor-text"> ${armor}</span>`;
  }

  function renderGrenadeIcons(grenades) {
    if (!grenades || !grenades.length) return '<span class="eco-util-none">—</span>';
    const iconMap = { flashbang: '⚡', smokegrenade: '🌫', hegrenade: '💥', molotov: '🔥', incgrenade: '🔥', decoy: '📣' };
    return grenades.slice(0, 4).map((g) => {
      const key = normalizeWeaponName(g);
      return `<span class="eco-gren-icon" title="${formatWeaponName(g)}">${iconMap[key] || '◆'}</span>`;
    }).join('');
  }

  function animateMoneyCounters() {
    document.querySelectorAll('.eco-player-money[data-money]').forEach((el) => {
      const target = parseInt(el.dataset.money, 10) || 0;
      const duration = 480;
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = '$' + Math.round(target * eased).toLocaleString();
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  function renderConsequenceStrip(round, aftershock) {
    const winner = getTeamLabel(round.winner);
    const loser = getTeamLabel(otherTeam(round.winner));
    const followSentence = aftershock.impacted.length
      ? `${loser} forced into weaker buys for the next ${aftershock.impacted.length} round${aftershock.impacted.length > 1 ? 's' : ''}.`
      : `${loser} stabilized — both teams reset to equal footing.`;
    return `
      <div class="eco-consequence-win">
        <span class="eco-consequence-label">${winner} wins</span>
        <span class="eco-consequence-amount">+$3,500</span>
        <span class="eco-consequence-note">Full rifle buy secured next round</span>
      </div>
      <div class="eco-consequence-center">
        <span class="eco-consequence-vs">Round ${round.round} consequence</span>
        <p class="eco-consequence-sentence">${followSentence}</p>
      </div>
      <div class="eco-consequence-loss">
        <span class="eco-consequence-label">${loser} loses</span>
        <span class="eco-consequence-amount">+$1,900</span>
        <span class="eco-consequence-note">Not enough for rifles next round</span>
      </div>
    `;
  }

  function renderWeaponLabel(weapon) {
    if (!weapon) return 'No parsed inventory';
    const normalized = normalizeWeaponName(weapon);
    const asset = WEAPON_ASSETS[normalized];
    const text = formatWeaponName(weapon);
    if (!asset) return text;
    return `<span class="eco-weapon-pill"><img src="${asset}" alt="${text}"><span>${text}</span></span>`;
  }

  function renderStoryPanel(mapData, round, aftershock, scoreBefore, scoreAfter) {
    const strongest = state.analytics.strongest;
    const upset = state.analytics.biggestUpset;
    return `
      <div class="eco-panel-head">
        <div>
          <h2 class="eco-section-title">How This Map Turned</h2>
          <p class="eco-section-copy">
            Clear language for what the current round meant inside the larger map story.
          </p>
        </div>
      </div>
      <h3 class="eco-story-title">Round ${round.round} in plain English</h3>
      <p class="eco-story-copy">
        ${buildRoundStory(round, aftershock, scoreBefore, scoreAfter)}
      </p>
      <ul class="eco-story-list">
        <li>Strongest economy break on this map: Round ${strongest.round}.</li>
        <li>Largest upset by equipment deficit: ${upset ? `Round ${upset.round}` : 'none recorded'}.</li>
        <li>Final score on ${getMapLabel(mapData.map)}: ${mapData.score.vitality}-${mapData.score.mongolz}.</li>
      </ul>
    `;
  }

  function renderGlossary() {
    if (!dom.glossaryGrid) return;
    const tiers = [
      ['pistol', 'Pistol — opening round, everyone starts equal'],
      ['eco', 'Eco — save money now, buy rifles next round'],
      ['half', 'Half Buy — partial rifles, no full setup'],
      ['force', 'Force Buy — spend everything to avoid deeper loss'],
      ['full', 'Full Buy — rifles + armor + grenades']
    ];
    dom.glossaryGrid.innerHTML = tiers.map(([key, label]) =>
      `<span class="eco-tier-badge eco-tier-badge-${key}" title="${label}">${BUY_LABELS[key]}</span>`
    ).join('');
  }

  function renderEqGapBar(round) {
    if (!dom.eqGapBar) return;
    const wrap = dom.eqGapBar.parentElement;
    const width = wrap ? wrap.clientWidth || 600 : 600;
    const height = 64;
    const barH = 20;
    const barY = 30;
    const vEq = round.vitality.eq_value || 0;
    const mEq = round.mongolz.eq_value || 0;
    const total = vEq + mEq || 1;
    const vW = Math.max(4, (vEq / total) * width);
    const mW = Math.max(4, width - vW);
    const gap = Math.abs(vEq - mEq);
    const leader = vEq >= mEq ? 'vitality' : 'mongolz';
    const labelX = leader === 'vitality' ? vW / 2 : vW + mW / 2;

    const isFirstRender = !state.eqGapView || state.eqGapView.width !== width;

    if (isFirstRender) {
      const svg = d3.select(dom.eqGapBar).attr('width', width).attr('height', height).html('');
      state.eqGapView = {
        width,
        vRect:   svg.append('rect').attr('y', barY).attr('height', barH).attr('rx', 6).attr('fill', '#3b82f6'),
        mRect:   svg.append('rect').attr('y', barY).attr('height', barH).attr('rx', 6).attr('fill', '#ef4444'),
        vLabel:  svg.append('text').attr('y', barY - 8).attr('fill', '#3b82f6').attr('font-size', 11).attr('font-weight', 700),
        mLabel:  svg.append('text').attr('y', barY - 8).attr('text-anchor', 'end').attr('fill', '#ef4444').attr('font-size', 11).attr('font-weight', 700),
        gapText: svg.append('text').attr('y', barY + barH / 2 + 4).attr('text-anchor', 'middle').attr('fill', 'white').attr('font-size', 10).attr('font-weight', 800)
      };
    }

    const { vRect, mRect, vLabel, mLabel, gapText } = state.eqGapView;
    const t = d3.transition().duration(500).ease(d3.easeCubicOut);

    vRect.transition(t).attr('x', 0).attr('width', vW);
    mRect.transition(t).attr('x', vW).attr('width', mW);
    gapText.transition(t).attr('x', labelX);

    vLabel.attr('x', 0).text(`Vitality  ${formatMoney(vEq)}`);
    mLabel.attr('x', width).text(`The MongolZ  ${formatMoney(mEq)}`);
    gapText.text(gap > 0 ? `+${formatMoney(gap)}` : '');
  }

  function renderScoreChart(mapData) {
    const width = dom.scoreChart.clientWidth || 900;
    const height = 180;
    const margin = { top: 18, right: 36, bottom: 28, left: 42 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const rounds = mapData.rounds;
    const maxScore = Math.max(mapData.score.vitality, mapData.score.mongolz, 13);
    const xScale = d3.scaleLinear().domain([0, rounds.length]).range([0, innerWidth]);
    const yScale = d3.scaleLinear().domain([0, maxScore]).range([innerHeight, 0]);
    const line = d3.line().x((d) => xScale(d.round)).y((d) => yScale(d.score)).curve(d3.curveStepAfter);
    const svg = d3.select(dom.scoreChart).html('').append('svg').attr('width', width).attr('height', height);
    const root = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    root.append('g').attr('class', 'eco-chart-axis').attr('transform', `translate(0,${innerHeight})`).call(d3.axisBottom(xScale).ticks(rounds.length > 16 ? 8 : rounds.length).tickFormat(d3.format('d')));
    root.append('g').attr('class', 'eco-chart-axis').call(d3.axisLeft(yScale).ticks(Math.min(6, maxScore)).tickFormat(d3.format('d')));
    root.append('path').attr('class', 'eco-score-line-v').attr('d', line(buildScoreSeries(rounds, 'vitality')));
    root.append('path').attr('class', 'eco-score-line-m').attr('d', line(buildScoreSeries(rounds, 'mongolz')));

    const halftime = rounds.find((round) => round.half === 2);
    if (halftime) {
      root.append('line')
        .attr('class', 'eco-score-halftime')
        .attr('x1', xScale(halftime.round - 1))
        .attr('x2', xScale(halftime.round - 1))
        .attr('y1', 0)
        .attr('y2', innerHeight);
    }

    state.scoreView = { root: root.append('g'), xScale, yScale, rounds, innerHeight };
    updateScoreFocus(state.currentRound, state.analytics.aftershocks[state.currentRound]);
  }

  function updateScoreFocus(roundNumber, aftershock) {
    if (!state.scoreView || !roundNumber || !aftershock) return;
    const score = state.analytics.scoreAfterRound[roundNumber];
    const endRound = aftershock.impacted.length ? aftershock.impacted[aftershock.impacted.length - 1].round : roundNumber;
    const x1 = state.scoreView.xScale(Math.max(0, roundNumber - 0.45));
    const x2 = state.scoreView.xScale(Math.min(state.scoreView.rounds.length, endRound + 0.45));

    state.scoreView.root.selectAll('*').remove();
    state.scoreView.root.append('rect')
      .attr('class', `eco-score-band ${aftershock.winner === 'mongolz' ? 'mongolz' : ''}`)
      .attr('x', x1)
      .attr('y', 0)
      .attr('width', Math.max(12, x2 - x1))
      .attr('height', state.scoreView.innerHeight);
    state.scoreView.root.append('circle').attr('class', 'eco-score-point-v').attr('cx', state.scoreView.xScale(roundNumber)).attr('cy', state.scoreView.yScale(score.vitality)).attr('r', 4);
    state.scoreView.root.append('circle').attr('class', 'eco-score-point-m').attr('cx', state.scoreView.xScale(roundNumber)).attr('cy', state.scoreView.yScale(score.mongolz)).attr('r', 4);
  }

  function startPlayback() {
    stopPlayback();
    state.isPlaying = true;
    dom.playBtn.textContent = 'Pause';

    const step = () => {
      if (!state.isPlaying) return;
      const mapData = getCurrentMapData();
      if (!mapData) return;
      if (state.currentRound >= mapData.rounds.length) {
        stopPlayback();
        return;
      }
      setCurrentRound(state.currentRound + 1, true);
      state.playbackTimer = window.setTimeout(step, getPlaybackDelay());
    };

    state.playbackTimer = window.setTimeout(step, getPlaybackDelay());
  }

  function stopPlayback() {
    state.isPlaying = false;
    dom.playBtn.textContent = 'Play';
    if (state.playbackTimer) window.clearTimeout(state.playbackTimer);
    state.playbackTimer = null;
  }

  function moveRound(delta) {
    const mapData = getCurrentMapData();
    if (!mapData) return;
    setCurrentRound(Math.max(1, Math.min(mapData.rounds.length, state.currentRound + delta)), false);
  }

  function setCurrentRound(roundNumber, fromPlayback) {
    state.currentRound = roundNumber;
    renderCurrentRound();
    if (!fromPlayback) stopPlayback();
  }

  function handleResize() {
    const currentRound = state.currentRound;
    const currentMap = state.currentMap;
    window.clearTimeout(handleResize._timer);
    handleResize._timer = window.setTimeout(() => renderMap(currentMap, currentRound), 120);
  }

  function populateTabScores() {
    state.matchData.maps.forEach((map) => {
      const el = document.getElementById(`score-${map.map}`);
      if (!el) return;
      el.textContent = `${map.score.vitality}-${map.score.mongolz}`;
      el.dataset.winner = map.winner;
    });
  }

  function updateSubtitle() {
    const result = state.matchData.series_winner && state.matchData.series_score ? `${getTeamLabel(state.matchData.series_winner)} won ${state.matchData.series_score}` : '';
    dom.subtitle.textContent = [state.matchData.match, state.matchData.event, result].filter(Boolean).join(' - ');
  }

  function syncMapTabs() {
    dom.mapTabs.forEach((tab) => {
      const active = tab.dataset.map === state.currentMap;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
  }

  function updateRoundRange(mapData) {
    dom.roundRange.max = String(mapData.rounds.length);
    dom.roundRange.value = String(state.currentRound);
  }

  function analyzeMap(mapData) {
    const scoreAfterRound = {};
    const aftershocks = {};
    let vitalityScore = 0;
    let mongolzScore = 0;
    let strongest = null;
    let biggestUpset = null;

    mapData.rounds.forEach((round, index) => {
      const winner = round.winner;
      const loser = otherTeam(winner);
      if (winner === 'vitality') vitalityScore += 1;
      else mongolzScore += 1;
      scoreAfterRound[round.round] = { vitality: vitalityScore, mongolz: mongolzScore };

      const impacted = [];
      for (let i = index + 1; i < mapData.rounds.length && impacted.length < 3; i += 1) {
        const future = mapData.rounds[i];
        if (future.half !== round.half) break;
        const weakBuy = ['eco', 'half'].includes(future[loser].buy_tier);
        const pressureGap = future[winner].eq_value - future[loser].eq_value;
        if (weakBuy || pressureGap > 1200) {
          impacted.push({ round: future.round, tier: future[loser].buy_tier, eqGap: pressureGap });
        } else if (impacted.length) {
          break;
        }
      }

      const upsetValue = round[loser].eq_value - round[winner].eq_value;
      const impactScore = impacted.length * 1.25 + Math.max(0, upsetValue) / 1200 + (round.event ? 0.6 : 0);
      const summary = { round: round.round, winner, loser, impacted, upsetValue, impactScore };
      aftershocks[round.round] = summary;
      if (!strongest || summary.impactScore > strongest.impactScore) strongest = summary;
      if ((!biggestUpset || summary.upsetValue > biggestUpset.upsetValue) && summary.upsetValue > 0) biggestUpset = summary;
    });

    return { scoreAfterRound, aftershocks, strongest, biggestUpset };
  }

  function getRoundPlayers(mapKey, roundNumber, teamKey) {
    const mapData = state.playerData?.maps?.[mapKey];
    const roundData = mapData?.rounds?.[String(roundNumber)] || mapData?.rounds?.[roundNumber];
    const players = roundData?.[teamKey];
    return Array.isArray(players) ? players : [];
  }

  function hasPlayerDataForMap(mapKey) {
    const mapData = state.playerData?.maps?.[mapKey];
    return Boolean(mapData && mapData.rounds && Object.keys(mapData.rounds).length);
  }

  function normalizePlayerData(raw) {
    if (!raw) return null;
    if (raw.maps && !Array.isArray(raw.maps)) return raw;
    if (!Array.isArray(raw.maps)) return null;
    const maps = {};
    raw.maps.forEach((mapEntry) => {
      const rounds = {};
      (mapEntry.rounds || []).forEach((roundEntry) => {
        rounds[String(roundEntry.round)] = {
          vitality: roundEntry.vitality || [],
          mongolz: roundEntry.mongolz || []
        };
      });
      maps[mapEntry.map] = { rounds };
    });
    return { maps };
  }

  function normalizePlayerCard(player, fallbackName) {
    if (!player) {
      return { name: fallbackName, money: 0, eqValue: 0, primary: null, secondary: null, armor: null, grenades: [], note: 'Waiting for parsed demo loadout.' };
    }
    const inventory = Array.isArray(player.inventory) ? player.inventory : [];
    const inferred = inferWeapons(inventory);
    return {
      name: player.name || player.player_name || fallbackName,
      money: player.money || player.balance || player.start_balance || 0,
      eqValue: player.eq_value || player.equipment_value || 0,
      primary: player.primary || player.primary_weapon || inferred.primary,
      secondary: player.secondary || player.secondary_weapon || inferred.secondary,
      armor: player.armor_label || formatArmor(player),
      grenades: Array.isArray(player.grenades) ? player.grenades : inferred.grenades,
      hasC4: Boolean(player.has_c4),
      note: player.note || 'Parsed from demo loadout snapshot.'
    };
  }

  function inferWeapons(inventory) {
    const normalized = inventory.map(normalizeWeaponName);
    const pistols = normalized.filter(isPistol);
    const primaries = normalized.filter((weapon) => !isUtility(weapon) && !isKnife(weapon) && !isPistol(weapon));
    const grenades = normalized.filter(isUtility).map(formatWeaponName);
    return { primary: primaries[0] || null, secondary: pistols[0] || null, grenades };
  }

  function formatArmor(player) {
    if (player.armor || player.armor_value) return player.has_helmet ? 'Kevlar + helmet' : 'Kevlar';
    return null;
  }

  function buildRoundStory(round, aftershock, scoreBefore, scoreAfter) {
    const winner = getTeamLabel(round.winner);
    const loser = getTeamLabel(otherTeam(round.winner));
    const followUp = aftershock.impacted.length
      ? `${loser} stayed on weaker follow-up buys through round ${aftershock.impacted[aftershock.impacted.length - 1].round}.`
      : `${loser} stabilized immediately after this loss.`;
    return `${winner} moved the score from ${scoreBefore.vitality}-${scoreBefore.mongolz} to ${scoreAfter.vitality}-${scoreAfter.mongolz}. ${followUp}`;
  }

  function buildScoreSeries(rounds, teamKey) {
    let score = 0;
    const series = [{ round: 0, score: 0 }];
    rounds.forEach((round) => {
      if (round.winner === teamKey) score += 1;
      series.push({ round: round.round, score });
    });
    return series;
  }

  function getScoreBefore(roundNumber) {
    if (roundNumber <= 1) return { vitality: 0, mongolz: 0 };
    return state.analytics.scoreAfterRound[roundNumber - 1] || { vitality: 0, mongolz: 0 };
  }

  function showFatalState(message) {
    dom.roundContext.textContent = message;
    if (dom.scorebar) dom.scorebar.innerHTML = `<p class="eco-empty-copy">${message}</p>`;
  }

  function getPlaybackDelay() {
    return SPEED_TO_DELAY[dom.speedSelect.value] || SPEED_TO_DELAY['1'];
  }

  function getMapData(mapName) { return state.matchData ? state.matchData.maps.find((map) => map.map === mapName) : null; }
  function getCurrentMapData() { return getMapData(state.currentMap); }
  function getMapLabel(mapKey) { return MAP_LABELS[mapKey] || mapKey; }
  function getTeamLabel(teamKey) { return TEAM_META[teamKey]?.label || teamKey; }
  function otherTeam(teamKey) { return teamKey === 'vitality' ? 'mongolz' : 'vitality'; }
  function formatMoney(value) { return `$${Number(value || 0).toLocaleString()}`; }
  function formatBuyTier(tier) { return BUY_LABELS[tier] || String(tier || '').replace(/^./, (char) => char.toUpperCase()); }
  function getEventLabel(eventKey) { return state.matchData?.event_labels?.[eventKey] || String(eventKey || '').replace(/_/g, ' '); }
  function readSearchParam(key) { try { return new URLSearchParams(window.location.search).get(key); } catch (error) { return null; } }
  function normalizeWeaponName(value) {
    const text = String(value || '').toLowerCase().replace(/^weapon_/, '').replace(/-/g, '_').replace(/ /g, '_');
    if (KNIFE_TOKENS.some((token) => text.includes(token))) return 'knife';
    return WEAPON_ALIASES[text] || text;
  }
  function formatWeaponName(value) {
    const normalized = normalizeWeaponName(value);
    const label = {
      usp_silencer: 'USP-S',
      m4a1_silencer: 'M4A1-S',
      ak47: 'AK-47',
      galilar: 'Galil AR',
      fiveseven: 'Five-SeveN',
      tec9: 'Tec-9',
      ssg08: 'SSG 08',
      glock: 'Glock',
      deagle: 'Deagle',
      elite: 'Dual Berettas',
      smokegrenade: 'Smoke',
      hegrenade: 'HE',
      incgrenade: 'Incendiary',
      c4: 'C4'
    }[normalized];
    return label || normalized.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }
  function isKnife(value) { return normalizeWeaponName(value).includes('knife'); }
  function isUtility(value) { return ['flashbang', 'smokegrenade', 'hegrenade', 'molotov', 'incgrenade', 'decoy', 'tagrenade'].includes(normalizeWeaponName(value)); }
  function isPistol(value) { return ['glock', 'usp_silencer', 'hkp2000', 'p250', 'deagle', 'fiveseven', 'tec9', 'cz75_auto', 'elite', 'revolver'].includes(normalizeWeaponName(value)); }

  function bindThemeSync() {
    window.addEventListener('storage', (event) => {
      if (!event.key || event.key === THEME_STORAGE_KEY) applyPreferredTheme();
    });
    if (!state.embedded) return;
    try {
      const parentBody = window.parent.document.body;
      const observer = new MutationObserver(() => {
        document.body.dataset.theme = parentBody.dataset.theme === 'dark' ? 'dark' : 'light';
        updateEmbeddedFrameHeight();
      });
      observer.observe(parentBody, { attributes: true, attributeFilter: ['data-theme'] });
    } catch (error) {
      // Ignore parent access issues.
    }
  }

  function applyPreferredTheme() {
    let theme = null;
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') theme = stored;
    } catch (error) {
      theme = null;
    }
    if (!theme && state.embedded) {
      try {
        theme = window.parent.document.body.dataset.theme;
      } catch (error) {
        theme = null;
      }
    }
    document.body.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  }

  function updateEmbeddedFrameHeight() {
    if (!state.embedded || !window.frameElement) return;
    window.requestAnimationFrame(() => {
      const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      window.frameElement.style.height = `${height}px`;
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
