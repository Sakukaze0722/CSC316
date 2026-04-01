(function () {
  'use strict';

  const TEAM_DATA_URL = 'data/processed/eco_timeline.json';
  const PLAYER_DATA_URL = 'data/processed/eco_player_rounds.json';
  const THEME_STORAGE_KEY = 'dashboard-theme';
  const DEFAULT_MAP = 'de_mirage';
  const MAP_LABELS = { de_mirage: 'Mirage', de_dust2: 'Dust II', de_inferno: 'Inferno' };
  const BUY_LABELS = { pistol: 'Pistol', eco: 'Eco', half: 'Half buy', force: 'Force buy', full: 'Full buy' };
  const BUY_DESCRIPTIONS = {
    pistol: 'Opening round, both teams start from equal money.',
    eco: 'Save now, spend harder on the next fight.',
    half: 'A mixed budget round with partial utility and lighter guns.',
    force: 'Commit now to avoid slipping into a deeper loss chain.',
    full: 'Rifles, armor, and utility are all online.'
  };
  const BUY_TOOLTIP_COPY = {
    pistol: 'This is the opening round. Both teams start with limited money, so the weapons are light and simple. Winning here often creates the first big economy advantage.',
    eco: 'An eco is a saving round. Teams spend very little so they can afford a stronger buy later. It is a weak round on purpose to protect the next one.',
    half: 'A half buy is a compromise round. The team spends some money, but not enough for a full rifle setup. The goal is to stay dangerous now without ruining the next buy.',
    force: 'A force buy means spending even though the economy is shaky. The team is trying to steal the round immediately instead of saving. If it fails, the next round is usually much weaker.',
    full: 'A full buy is the ideal gun round. Most players can afford rifles, armor, and useful grenades. This is the setup teams want when their economy is healthy.'
  };
  const TEAM_META = {
    vitality: { label: 'Vitality', short: 'VIT', color: '#2563eb' },
    mongolz: { label: 'The MongolZ', short: 'TMZ', color: '#ef4444' }
  };
  const RIFLE_WEAPONS = new Set(['ak47', 'm4a4', 'm4a1_silencer', 'galilar', 'famas', 'aug', 'sg553', 'awp', 'ssg08', 'scar20', 'g3sg1']);
  const SMG_WEAPONS = new Set(['mp9', 'mac10', 'ump45', 'mp7', 'mp5sd', 'bizon', 'p90']);
  const PISTOL_WEAPONS = new Set(['glock', 'usp_silencer', 'hkp2000', 'p250', 'deagle', 'fiveseven', 'tec9', 'cz75_auto', 'elite', 'revolver']);
  const UTILITY_WEAPONS = new Set(['flashbang', 'smokegrenade', 'hegrenade', 'molotov', 'incgrenade', 'decoy', 'tagrenade']);
  const KNIFE_TOKENS = ['knife', 'karambit', 'bayonet', 'butterfly', 'nomad', 'stiletto', 'talon', 'ursus', 'bowie', 'falchion', 'navaja', 'daggers', 'gut', 'flip', 'paracord', 'survival', 'skeleton', 'kukri'];
  const WEAPON_ALIASES = {
    usp_s: 'usp_silencer',
    usp_silencer_off: 'usp_silencer',
    m4a1_s: 'm4a1_silencer',
    m4a1_silencer_off: 'm4a1_silencer',
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
    c4_explosive: 'c4',
    mp_9: 'mp9',
    mac_10: 'mac10',
    ump_45: 'ump45',
    mp_7: 'mp7',
    pp_bizon: 'bizon',
    sg_553: 'sg553',
    mag_7: 'mag7',
    sawed_off: 'sawedoff',
    r8_revolver: 'revolver'
  };
  const DISPLAY_NAMES = {
    ak47: 'AK-47',
    awp: 'AWP',
    m4a4: 'M4A4',
    m4a1_silencer: 'M4A1-S',
    galilar: 'Galil AR',
    famas: 'FAMAS',
    aug: 'AUG',
    sg553: 'SG 553',
    ssg08: 'SSG 08',
    mp9: 'MP9',
    mac10: 'MAC-10',
    ump45: 'UMP-45',
    mp7: 'MP7',
    mp5sd: 'MP5-SD',
    bizon: 'PP-Bizon',
    p90: 'P90',
    glock: 'Glock',
    usp_silencer: 'USP-S',
    hkp2000: 'P2000',
    p250: 'P250',
    deagle: 'Deagle',
    fiveseven: 'Five-SeveN',
    tec9: 'Tec-9',
    cz75_auto: 'CZ75-Auto',
    elite: 'Dual Berettas',
    revolver: 'R8 Revolver',
    flashbang: 'Flash',
    smokegrenade: 'Smoke',
    hegrenade: 'HE',
    incgrenade: 'Incendiary',
    molotov: 'Molotov',
    decoy: 'Decoy',
    c4: 'C4'
  };
  const STANDOUT_PRIORITY = ['awp', 'deagle', 'ssg08', 'famas', 'galilar', 'mp9', 'mac10', 'p250', 'elite'];

  const state = {
    embedded: false,
    matchData: null,
    playerData: null,
    currentMap: DEFAULT_MAP,
    currentRound: 1,
    hoverRound: null,
    analytics: null,
    tooltipTarget: null,
    pinnedTooltipTarget: null
  };

  const dom = {};

  function boot() {
    state.embedded = readSearchParam('embedded') === '1';
    document.body.classList.toggle('eco-embedded-mode', state.embedded);
    cacheDom();
    applyPreferredTheme();
    bindThemeSync();
    if (!dom.timeline || typeof window.d3 === 'undefined') return;
    bindStaticEvents();
    loadData();
  }

  function cacheDom() {
    dom.subtitle = document.getElementById('ecoSubtitle');
    dom.mapTabs = Array.from(document.querySelectorAll('.eco-map-tab'));
    dom.mapMeta = document.getElementById('ecoMapMeta');
    dom.roundCaption = document.getElementById('ecoRoundCaption');
    dom.roundLabel = document.getElementById('ecoRoundLabel');
    dom.roundContext = document.getElementById('ecoRoundContext');
    dom.timeline = document.getElementById('ecoRoundTimeline');
    dom.glossaryGrid = document.getElementById('ecoGlossaryGrid');
    dom.contextPanel = document.getElementById('ecoContextPanel');
    dom.deltaChart = document.getElementById('ecoDeltaChart');
    dom.buyTooltip = document.getElementById('ecoBuyTooltip');
  }

  function bindStaticEvents() {
    dom.mapTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        if (!state.matchData || tab.dataset.map === state.currentMap) return;
        renderMap(tab.dataset.map, 1);
      });
    });
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleTooltipEscape);
    window.addEventListener('resize', handleTooltipViewportChange);
    window.addEventListener('scroll', handleTooltipViewportChange, true);
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
    const mapData = getMapData(mapName);
    if (!mapData) return;
    hideBuyTooltip();
    state.currentMap = mapData.map;
    state.analytics = analyzeMap(mapData);
    state.currentRound = Math.max(1, Math.min(desiredRound || 1, mapData.rounds.length));
    state.hoverRound = null;
    syncMapTabs();
    renderTimeline(mapData);
    renderCurrentRound();
    updateEmbeddedFrameHeight();
  }

  function renderCurrentRound() {
    const mapData = getCurrentMapData();
    if (!mapData) return;
    hideBuyTooltip();
    const focusRound = state.hoverRound || state.currentRound;
    const round = getRoundByNumber(mapData, focusRound);
    if (!round) return;
    const transition = buildRoundTransition(mapData, focusRound);
    const vitalitySummary = buildPlayerSummary(state.currentMap, focusRound, 'vitality', round.vitality);
    const mongolzSummary = buildPlayerSummary(state.currentMap, focusRound, 'mongolz', round.mongolz);
    const isPreviewing = Boolean(state.hoverRound && state.hoverRound !== state.currentRound);

    if (dom.roundCaption) dom.roundCaption.textContent = isPreviewing ? 'Hover preview' : 'Selected round';
    dom.roundLabel.textContent = `Round ${round.round}`;
    dom.roundContext.textContent = buildRoundContext(round, transition);
    dom.mapMeta.textContent = `${getMapLabel(mapData.map)} - ${getTeamLabel(mapData.winner)} won ${mapData.score.vitality}-${mapData.score.mongolz}`;
    dom.contextPanel.innerHTML = renderContextPanel(transition, vitalitySummary, mongolzSummary, isPreviewing);
    bindBuyTierTooltips(dom.contextPanel);
    syncTimelineSelection();
    renderDeltaChart(mapData, focusRound);
    updateEmbeddedFrameHeight();
  }

  function renderTimeline(mapData) {
    dom.timeline.innerHTML = mapData.rounds.map((round) => {
      const aftershock = state.analytics.aftershocks[round.round];
      const cardNote = getTimelineNote(mapData, round, aftershock);
      return `
        <button
          class="eco-round-card${aftershock.impacted.length ? ' has-aftershock' : ''}"
          data-round="${round.round}"
          data-winner="${round.winner}"
          type="button"
          role="option"
          aria-selected="${round.round === state.currentRound ? 'true' : 'false'}"
        >
          <div class="eco-round-card-top">
            <span class="eco-round-card-index">R${round.round}</span>
            <span class="eco-round-card-winner eco-round-card-winner-${round.winner === 'vitality' ? 'v' : 'm'}">${getTeamLabel(round.winner)}</span>
          </div>
          <div class="eco-round-buy-stack">
          <div class="eco-round-buy-line">
            <span class="eco-round-team-tag">${TEAM_META.vitality.short}</span>
              ${renderBuyTierBadge(round.vitality.buy_tier)}
          </div>
          <div class="eco-round-buy-line">
            <span class="eco-round-team-tag">${TEAM_META.mongolz.short}</span>
              ${renderBuyTierBadge(round.mongolz.buy_tier)}
          </div>
        </div>
          <div class="eco-round-card-bottom">
            <span>${cardNote.label}</span>
            <span>${cardNote.value}</span>
          </div>
        </button>
      `;
    }).join('');

    dom.timeline.querySelectorAll('.eco-round-card').forEach((button) => {
      const roundNumber = Number(button.dataset.round);
      button.addEventListener('click', () => setCurrentRound(roundNumber));
      button.addEventListener('mouseenter', () => setHoverRound(roundNumber));
      button.addEventListener('mouseleave', clearHoverRound);
      button.addEventListener('focus', () => setHoverRound(roundNumber));
      button.addEventListener('blur', clearHoverRound);
    });
    bindBuyTierTooltips(dom.timeline);
  }

  function syncTimelineSelection() {
    const focusRound = state.hoverRound || state.currentRound;
    const aftershock = state.analytics.aftershocks[focusRound];
    const impactedRounds = new Set(aftershock ? aftershock.impacted.map((item) => item.round) : []);
    dom.timeline.querySelectorAll('.eco-round-card').forEach((button) => {
      const roundNumber = Number(button.dataset.round);
      const isSelected = roundNumber === state.currentRound;
      const isPreview = roundNumber === state.hoverRound && state.hoverRound !== state.currentRound;
      button.classList.toggle('is-selected', isSelected);
      button.classList.toggle('is-preview', Boolean(isPreview));
      button.classList.toggle('is-impacted', impactedRounds.has(roundNumber));
      button.setAttribute('aria-selected', String(isSelected));
    });
  }

  function renderContextPanel(transition, vitalitySummary, mongolzSummary, isPreviewing) {
    return `
      <div class="eco-context-grid">
        <div class="eco-context-compare">
          ${renderImpactTeamCard('vitality', transition, vitalitySummary)}
          ${renderImpactTeamCard('mongolz', transition, mongolzSummary)}
        </div>
        ${renderImpactCenter(transition, isPreviewing)}
      </div>
    `;
  }

  function renderImpactTeamCard(teamKey, transition, summary) {
    const teamTransition = transition.teams[teamKey];
    const isVitality = teamKey === 'vitality';
    const prevText = renderPhaseValue(teamTransition.prevEqDelta, teamTransition.prevPhase, 'eq');
    const nextText = renderPhaseValue(teamTransition.nextEqDelta, teamTransition.nextPhase, 'eq');
    return `
      <div class="eco-impact-team-head">
        <span class="eco-team-dot ${isVitality ? 'eco-team-dot-v' : 'eco-team-dot-m'}"></span>
        <h3 class="eco-team-impact-title">${getTeamLabel(teamKey)}</h3>
        <span class="eco-side-badge ${teamTransition.side === 'T' ? 'eco-side-t' : 'eco-side-ct'}">${teamTransition.side === 'T' ? 'Attack' : 'Defend'}</span>
      </div>
      <div class="eco-impact-chip-row">
        ${renderBuyTierBadge(teamTransition.currentTier)}
        ${renderNextTierPill(teamTransition)}
      </div>
      <div class="eco-impact-stat-grid">
        <div class="eco-impact-stat">
          <span class="eco-impact-stat-label">Money now</span>
          <span class="eco-impact-stat-value">${formatMoney(teamTransition.money)}</span>
        </div>
        <div class="eco-impact-stat">
          <span class="eco-impact-stat-label">Equipment now</span>
          <span class="eco-impact-stat-value">${formatMoney(teamTransition.eqValue)}</span>
        </div>
        <div class="eco-impact-stat">
          <span class="eco-impact-stat-label">Vs previous round</span>
          <span class="eco-impact-stat-value ${getDeltaClass(teamTransition.prevEqDelta, teamTransition.prevPhase)}">${prevText}</span>
        </div>
        <div class="eco-impact-stat">
          <span class="eco-impact-stat-label">Next-round shift</span>
          <span class="eco-impact-stat-value ${getDeltaClass(teamTransition.nextEqDelta, teamTransition.nextPhase)}">${nextText}</span>
        </div>
      </div>
      <div class="eco-team-compare-metrics">
        ${summary.metrics.slice(0, 5).map((metric) => `<span class="eco-preview-metric">${metric}</span>`).join('')}
      </div>
      <p class="eco-impact-note"><strong>Snapshot:</strong> ${summary.standouts}</p>
      <p class="eco-impact-note">${teamTransition.note}</p>
    `;
  }

  function renderImpactCenter(transition, isPreviewing) {
    const round = transition.round;
    const impacted = transition.aftershockRounds;
    return `
      <p class="eco-impact-overline">${isPreviewing ? 'Hover impact' : 'Round impact'}</p>
      <h3>${buildImpactHeadline(round, transition)}</h3>
      <p class="eco-impact-copy">${transition.impactLabel}</p>
      <div class="eco-impact-chip-row">
        <span class="eco-impact-chip is-winner">Winner: ${getTeamLabel(round.winner)}</span>
        <span class="eco-impact-chip">${transition.statusLabel}</span>
        <span class="eco-impact-chip">${impacted.length ? `Aftershock: ${impacted.length} round${impacted.length > 1 ? 's' : ''}` : 'Aftershock: contained in one round'}</span>
        <span class="eco-impact-chip">${isPreviewing ? 'Hovering to preview' : 'Click a round to pin'}</span>
      </div>
    `;
  }

  function renderDeltaChart(mapData, focusRound) {
    const width = Math.max(dom.deltaChart.clientWidth || 960, 320);
    const height = 420;
    const margin = { top: 28, right: 24, bottom: 42, left: 80 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const laneGap = 54;
    const laneHeight = (innerHeight - laneGap) / 2;
    const barBand = d3.scaleBand().domain(mapData.rounds.map((round) => String(round.round))).range([0, innerWidth]).padding(0.22);
    const deltaRows = buildDeltaRows(mapData);
    const maxAbs = Math.max(1000, d3.max(deltaRows.flatMap((row) => ['vitality', 'mongolz'].map((team) => Math.abs(row[team].delta || 0)))) || 1000);
    const barScale = d3.scaleLinear().domain([0, maxAbs]).range([0, laneHeight / 2 - 20]);
    const svg = d3.select(dom.deltaChart).html('').append('svg').attr('width', width).attr('height', height);
    const root = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const selectedAftershock = new Set(state.analytics.aftershocks[focusRound].impacted.map((item) => item.round));

    renderDeltaLane(root, deltaRows, 'vitality', 0, laneHeight, barBand, barScale, selectedAftershock, focusRound);
    renderDeltaLane(root, deltaRows, 'mongolz', laneHeight + laneGap, laneHeight, barBand, barScale, selectedAftershock, focusRound);

    root.append('g')
      .attr('class', 'eco-delta-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(barBand).tickSizeOuter(0));
  }

  function renderDeltaLane(root, rows, teamKey, offsetY, laneHeight, barBand, barScale, impactedSet, focusRound) {
    const lane = root.append('g').attr('transform', `translate(0,${offsetY})`);
    const baselineY = laneHeight / 2;
    lane.append('line').attr('class', 'eco-delta-baseline').attr('x1', 0).attr('x2', barBand.range()[1]).attr('y1', baselineY).attr('y2', baselineY);
    lane.append('text').attr('class', 'eco-lane-title').attr('x', -56).attr('y', baselineY - 12).text(getTeamLabel(teamKey));
    lane.append('text').attr('class', 'eco-lane-copy').attr('x', -56).attr('y', baselineY + 2).text('heavier');
    lane.append('text').attr('class', 'eco-lane-copy').attr('x', -56).attr('y', baselineY + 40).text('lighter');

    rows.forEach((row) => {
      const entry = row[teamKey];
      const x = barBand(String(row.round));
      if (x == null) return;
      if (entry.phase !== 'normal') {
        lane.append('rect')
          .attr('class', `eco-delta-reset-marker${row.round === focusRound ? ' is-selected' : ''}${impactedSet.has(row.round) ? ' is-impacted' : ''}`)
          .attr('x', x)
          .attr('y', baselineY - 10)
          .attr('width', barBand.bandwidth())
          .attr('height', 20)
          .attr('rx', 10);
        lane.append('text')
          .attr('class', 'eco-delta-reset-text')
          .attr('x', x + barBand.bandwidth() / 2)
          .attr('y', baselineY + 3)
          .attr('text-anchor', 'middle')
          .text(entry.phase === 'half_reset' ? 'RESET' : 'OPEN');
        return;
      }

      const magnitude = barScale(Math.abs(entry.delta));
      const isPositive = entry.delta >= 0;
      const y = isPositive ? baselineY - magnitude : baselineY;
      lane.append('rect')
        .attr('class', `eco-delta-bar${row.round === focusRound ? ' is-selected' : ''}${impactedSet.has(row.round) ? ' is-impacted' : ''}`)
        .attr('x', x)
        .attr('y', y)
        .attr('width', barBand.bandwidth())
        .attr('height', Math.max(4, magnitude))
        .attr('fill', getTierColor(entry.buyTier, teamKey));
    });
  }

  function buildDeltaRows(mapData) {
    return mapData.rounds.map((round, index) => {
      const prev = index > 0 ? mapData.rounds[index - 1] : null;
      return {
        round: round.round,
        vitality: buildDeltaEntry(round.vitality, prev ? prev.vitality : null, prev && prev.half === round.half ? 'normal' : (prev ? 'half_reset' : 'map_start')),
        mongolz: buildDeltaEntry(round.mongolz, prev ? prev.mongolz : null, prev && prev.half === round.half ? 'normal' : (prev ? 'half_reset' : 'map_start'))
      };
    });
  }

  function buildDeltaEntry(teamRound, prevTeamRound, phase) {
    return {
      buyTier: teamRound.buy_tier,
      delta: phase === 'normal' && prevTeamRound ? teamRound.eq_value - prevTeamRound.eq_value : 0,
      phase
    };
  }

  function buildRoundTransition(mapData, roundNumber) {
    const rounds = mapData.rounds;
    const index = rounds.findIndex((item) => item.round === roundNumber);
    const round = rounds[index];
    const prev = index > 0 ? rounds[index - 1] : null;
    const next = index < rounds.length - 1 ? rounds[index + 1] : null;
    const prevPhase = prev ? (prev.half === round.half ? 'normal' : 'half_reset') : 'map_start';
    const nextPhase = next ? (next.half === round.half ? 'normal' : 'half_reset') : 'map_end';
    const aftershock = state.analytics.aftershocks[round.round];

    const transition = {
      round,
      prev,
      next,
      aftershockRounds: aftershock.impacted.map((item) => item.round),
      statusLabel: nextPhase === 'map_end' ? 'Map ends here' : nextPhase === 'half_reset' ? 'Next round resets to pistols' : `Next round: Round ${next.round}`,
      teams: {
        vitality: buildTeamTransition('vitality', round, prev, next, prevPhase, nextPhase),
        mongolz: buildTeamTransition('mongolz', round, prev, next, prevPhase, nextPhase)
      }
    };

    transition.impactLabel = buildImpactSentence(transition);
    return transition;
  }

  function buildTeamTransition(teamKey, round, prev, next, prevPhase, nextPhase) {
    const current = round[teamKey];
    const previous = prevPhase === 'normal' && prev ? prev[teamKey] : null;
    const following = nextPhase === 'normal' && next ? next[teamKey] : null;
    return {
      currentTier: current.buy_tier,
      nextTier: following ? following.buy_tier : null,
      side: current.side,
      money: current.money || 0,
      eqValue: current.eq_value || 0,
      prevMoneyDelta: previous ? (current.money || 0) - (previous.money || 0) : null,
      prevEqDelta: previous ? (current.eq_value || 0) - (previous.eq_value || 0) : null,
      nextMoneyDelta: following ? (following.money || 0) - (current.money || 0) : null,
      nextEqDelta: following ? (following.eq_value || 0) - (current.eq_value || 0) : null,
      prevPhase,
      nextPhase,
      note: buildTeamNote(teamKey, current, following, nextPhase)
    };
  }

  function buildTeamNote(teamKey, current, nextRoundTeam, nextPhase) {
    if (nextPhase === 'map_end') {
      return `${getTeamLabel(teamKey)} finish the map on a ${formatBuyTier(current.buy_tier)}. There is no next-round economy to compare against.`;
    }
    if (nextPhase === 'half_reset') {
      return `${getTeamLabel(teamKey)} end this half on a ${formatBuyTier(current.buy_tier)}. The next round resets both sides to pistol money.`;
    }
    return `${getTeamLabel(teamKey)} move from ${formatBuyTier(current.buy_tier)} into ${formatBuyTier(nextRoundTeam.buy_tier)} on the next round.`;
  }

  function buildImpactHeadline(round, transition) {
    if (!transition.next) return `${getTeamLabel(round.winner)} close the map, so the story stops at the final result.`;
    if (transition.teams.vitality.nextPhase === 'half_reset') return `Round ${round.round} ends the half and wipes both teams back to pistol conditions.`;
    const winner = getTeamLabel(round.winner);
    const loser = getTeamLabel(otherTeam(round.winner));
    const loserTier = transition.teams[otherTeam(round.winner)].nextTier;
    return `${winner} win a ${formatBuyTier(round[round.winner].buy_tier)} and push ${loser} toward ${formatBuyTier(loserTier)} on round ${transition.next.round}.`;
  }

  function buildImpactSentence(transition) {
    const round = transition.round;
    const winner = round.winner;
    const loser = otherTeam(winner);
    if (!transition.next) {
      return `Round ${round.round} is the map closer. The board stops at the result instead of inventing a next-round economy swing.`;
    }
    if (transition.teams.vitality.nextPhase === 'half_reset') {
      return `Round ${round.round} flows straight into halftime. The next round is a fresh pistol reset, so strategy carry-over becomes side reset instead of a normal money chain.`;
    }
    const winnerNext = transition.teams[winner];
    const loserNext = transition.teams[loser];
    const aftershock = transition.aftershockRounds.length
      ? `The pressure stays visible through round ${transition.aftershockRounds[transition.aftershockRounds.length - 1]}.`
      : 'The pressure is mostly contained inside the immediate next round.';
    return `${getTeamLabel(winner)} convert this ${formatBuyTier(round[winner].buy_tier)} into ${formatBuyTier(winnerNext.nextTier)} on round ${transition.next.round}, while ${getTeamLabel(loser)} fall toward ${formatBuyTier(loserNext.nextTier)}. ${aftershock}`;
  }

  function buildRoundContext(round, transition) {
    const winnerTier = formatBuyTier(round[round.winner].buy_tier);
    const loserTier = formatBuyTier(round[otherTeam(round.winner)].buy_tier);
    if (!transition.next) {
      return `${getTeamLabel(round.winner)} win a ${winnerTier} over ${loserTier} to finish the map.`;
    }
    if (transition.teams.vitality.nextPhase === 'half_reset') {
      return `${getTeamLabel(round.winner)} win a ${winnerTier} over ${loserTier}, but the next round is a pistol reset because the half ends here.`;
    }
    const loserNextTier = formatBuyTier(transition.teams[otherTeam(round.winner)].nextTier);
    return `${getTeamLabel(round.winner)} win a ${winnerTier} over ${loserTier} and force ${getTeamLabel(otherTeam(round.winner))} toward ${loserNextTier} next round.`;
  }

  function buildPlayerSummary(mapKey, roundNumber, teamKey, roundTeamData) {
    const players = getRoundPlayers(mapKey, roundNumber, teamKey);
    if (!players.length) {
      return {
        buyTier: roundTeamData.buy_tier,
        copy: 'No parsed player snapshot is available for this round, so the preview falls back to team-level economy only.',
        metrics: [
          `Tier ${formatBuyTier(roundTeamData.buy_tier)}`,
          `Money ${formatMoney(roundTeamData.money)}`,
          `Equipment ${formatMoney(roundTeamData.eq_value)}`
        ],
        standouts: 'Player-level composition unavailable'
      };
    }

    let rifleCount = 0;
    let smgCount = 0;
    let pistolOnlyCount = 0;
    let fullArmorCount = 0;
    let lightArmorCount = 0;
    let utilHeavyCount = 0;
    let totalGrenades = 0;
    const standoutCounts = new Map();

    players.forEach((player, index) => {
      const card = normalizePlayerCard(player, `Player ${index + 1}`);
      const primary = normalizeWeaponName(card.primary);
      const grenades = card.grenades.map(normalizeWeaponName);
      if (RIFLE_WEAPONS.has(primary)) rifleCount += 1;
      else if (SMG_WEAPONS.has(primary)) smgCount += 1;
      else pistolOnlyCount += 1;
      if (card.armor && card.armor.toLowerCase().includes('helmet')) fullArmorCount += 1;
      else if (card.armor) lightArmorCount += 1;
      if (grenades.length >= 2) utilHeavyCount += 1;
      totalGrenades += grenades.length;
      addStandout(primary, standoutCounts);
      addStandout(normalizeWeaponName(card.secondary), standoutCounts);
    });

    const utilAverage = totalGrenades / players.length;
    return {
      buyTier: roundTeamData.buy_tier,
      copy: `${getTeamLabel(teamKey)} enter this round on a ${formatBuyTier(roundTeamData.buy_tier)} with ${formatMoney(roundTeamData.eq_value)} of equipment spread across the team.`,
      metrics: [
        `Rifles x${rifleCount}`,
        `SMGs x${smgCount}`,
        `Pistol-only x${pistolOnlyCount}`,
        `Full armor x${fullArmorCount}`,
        `Light armor x${lightArmorCount}`,
        `Heavy util x${utilHeavyCount}`,
        `Avg util ${utilAverage.toFixed(1)}`
      ],
      standouts: buildStandoutList(standoutCounts)
    };
  }

  function buildStandoutList(counts) {
    const ordered = Array.from(counts.entries()).sort((a, b) => {
      const priorityDelta = getStandoutRank(a[0]) - getStandoutRank(b[0]);
      if (priorityDelta !== 0) return priorityDelta;
      return b[1] - a[1];
    });
    if (!ordered.length) return 'Standard sidearms and utility only';
    return ordered.slice(0, 2).map(([weapon, count]) => `${formatWeaponName(weapon)} x${count}`).join(', ');
  }

  function getStandoutRank(weapon) {
    const index = STANDOUT_PRIORITY.indexOf(weapon);
    return index === -1 ? 99 : index;
  }

  function addStandout(weapon, counts) {
    if (!weapon) return;
    const isPrimary = RIFLE_WEAPONS.has(weapon) || SMG_WEAPONS.has(weapon);
    const isSpecialPistol = weapon === 'deagle' || weapon === 'p250' || weapon === 'elite';
    if (!isPrimary && !isSpecialPistol) return;
    counts.set(weapon, (counts.get(weapon) || 0) + 1);
  }

  function analyzeMap(mapData) {
    const aftershocks = {};
    mapData.rounds.forEach((round, index) => {
      const loser = otherTeam(round.winner);
      const impacted = [];
      for (let i = index + 1; i < mapData.rounds.length && impacted.length < 3; i += 1) {
        const future = mapData.rounds[i];
        if (future.half !== round.half) break;
        const weakBuy = future[loser].buy_tier === 'eco' || future[loser].buy_tier === 'half';
        const pressureGap = future[round.winner].eq_value - future[loser].eq_value;
        if (weakBuy || pressureGap > 1200) impacted.push({ round: future.round, eqGap: pressureGap });
        else if (impacted.length) break;
      }
      aftershocks[round.round] = { round: round.round, impacted };
    });
    return { aftershocks };
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

  function renderGlossary() {
    const tiers = ['pistol', 'eco', 'half', 'force', 'full'];
    dom.glossaryGrid.innerHTML = tiers.map((tier) => `
      ${renderBuyTierBadge(tier)}
    `).join('');
    bindBuyTierTooltips(dom.glossaryGrid);
  }

  function setCurrentRound(roundNumber) {
    state.currentRound = roundNumber;
    renderCurrentRound();
  }

  function setHoverRound(roundNumber) {
    if (state.hoverRound === roundNumber) return;
    state.hoverRound = roundNumber;
    renderCurrentRound();
  }

  function clearHoverRound() {
    if (!state.hoverRound) return;
    state.hoverRound = null;
    renderCurrentRound();
  }

  function bindBuyTierTooltips(scope) {
    if (!scope || !scope.querySelectorAll) return;
    scope.querySelectorAll('.eco-buy-tier-badge[data-buy-tooltip]').forEach((badge) => {
      if (badge.dataset.tooltipBound === '1') return;
      badge.dataset.tooltipBound = '1';
      badge.addEventListener('mouseenter', () => {
        if (state.pinnedTooltipTarget && state.pinnedTooltipTarget !== badge) return;
        showBuyTooltip(badge);
      });
      badge.addEventListener('mouseleave', () => {
        if (state.pinnedTooltipTarget === badge) return;
        hideBuyTooltip(badge);
      });
      badge.addEventListener('mousemove', () => {
        if (state.pinnedTooltipTarget && state.pinnedTooltipTarget !== badge) return;
        positionBuyTooltip(badge);
      });
      badge.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleBuyTooltip(badge);
      });
    });
  }

  function showBuyTooltip(target) {
    if (!dom.buyTooltip || !target || !target.dataset.buyTooltip) return;
    state.tooltipTarget = target;
    dom.buyTooltip.textContent = target.dataset.buyTooltip;
    dom.buyTooltip.dataset.visible = 'true';
    dom.buyTooltip.setAttribute('aria-hidden', 'false');
    positionBuyTooltip(target);
  }

  function hideBuyTooltip(target) {
    if (target && state.tooltipTarget && target !== state.tooltipTarget) return;
    state.tooltipTarget = null;
    state.pinnedTooltipTarget = null;
    if (!dom.buyTooltip) return;
    dom.buyTooltip.removeAttribute('data-visible');
    dom.buyTooltip.removeAttribute('data-placement');
    dom.buyTooltip.setAttribute('aria-hidden', 'true');
  }

  function toggleBuyTooltip(target) {
    if (!target) return;
    if (state.pinnedTooltipTarget === target) {
      hideBuyTooltip(target);
      return;
    }
    state.pinnedTooltipTarget = target;
    showBuyTooltip(target);
  }

  function positionBuyTooltip(target) {
    if (!dom.buyTooltip || !target || state.tooltipTarget !== target) return;
    const targetRect = target.getBoundingClientRect();
    dom.buyTooltip.style.left = '12px';
    dom.buyTooltip.style.top = '12px';
    const tooltipRect = dom.buyTooltip.getBoundingClientRect();
    const gutter = 12;
    let left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
    left = Math.max(gutter, Math.min(left, window.innerWidth - tooltipRect.width - gutter));
    let top = targetRect.top - tooltipRect.height - 14;
    let placement = 'top';
    if (top < gutter) {
      top = targetRect.bottom + 14;
      placement = 'bottom';
    }
    dom.buyTooltip.style.left = `${left}px`;
    dom.buyTooltip.style.top = `${top}px`;
    dom.buyTooltip.dataset.placement = placement;
  }

  function handleTooltipViewportChange() {
    if (!state.tooltipTarget || !document.body.contains(state.tooltipTarget)) {
      hideBuyTooltip();
      return;
    }
    positionBuyTooltip(state.tooltipTarget);
  }

  function handleDocumentClick(event) {
    if (!state.pinnedTooltipTarget) return;
    if (event.target instanceof Element && event.target.closest('.eco-buy-tier-badge')) return;
    hideBuyTooltip();
  }

  function handleTooltipEscape(event) {
    if (event.key !== 'Escape' || !state.tooltipTarget) return;
    hideBuyTooltip();
  }

  function handleResize() {
    window.clearTimeout(handleResize._timer);
    handleResize._timer = window.setTimeout(() => {
      renderMap(state.currentMap, state.currentRound);
    }, 120);
  }

  function getTimelineNote(mapData, round, aftershock) {
    const nextRound = getRoundByNumber(mapData, round.round + 1);
    if (!nextRound) return { label: 'Status', value: 'Map end' };
    if (nextRound.half !== round.half) return { label: 'Status', value: 'Half reset' };
    if (aftershock.impacted.length) return { label: 'Pressure', value: `${aftershock.impacted.length} round${aftershock.impacted.length > 1 ? 's' : ''}` };
    return { label: 'Pressure', value: 'Contained' };
  }

  function renderPhaseValue(delta, phase, unit) {
    if (phase === 'map_start') return 'Opening round';
    if (phase === 'half_reset') return 'Half reset';
    if (phase === 'map_end') return 'Map ends';
    const formatted = unit === 'eq' ? formatSignedMoney(delta) : formatSignedNumber(delta);
    return formatted;
  }

  function renderTransitionSubcopy(teamTransition) {
    if (teamTransition.nextPhase === 'map_end') return 'No future round remains on this map.';
    if (teamTransition.nextPhase === 'half_reset') return 'The next round resets both sides to pistols.';
    return `Next-round equipment shift: ${formatSignedMoney(teamTransition.nextEqDelta)}.`;
  }

  function renderNextTierPill(teamTransition) {
    if (teamTransition.nextPhase === 'map_end') return '<span class="eco-reset-pill">Map end</span>';
    if (teamTransition.nextPhase === 'half_reset') return '<span class="eco-reset-pill">Half reset</span>';
    return `<span class="eco-stat-pill eco-next-tier-pill">Next</span>${renderBuyTierBadge(teamTransition.nextTier)}`;
  }

  function getDeltaClass(delta, phase) {
    if (phase !== 'normal' || delta == null) return 'is-flat';
    if (delta > 0) return 'is-up';
    if (delta < 0) return 'is-down';
    return 'is-flat';
  }

  function getTierColor(tier, teamKey) {
    const palette = {
      vitality: { pistol: '#94a3b8', eco: '#f59e0b', half: '#60a5fa', force: '#3b82f6', full: '#1d4ed8' },
      mongolz: { pistol: '#94a3b8', eco: '#fb923c', half: '#f87171', force: '#ef4444', full: '#b91c1c' }
    };
    return palette[teamKey][tier] || '#94a3b8';
  }

  function getRoundPlayers(mapKey, roundNumber, teamKey) {
    const mapData = state.playerData && state.playerData.maps ? state.playerData.maps[mapKey] : null;
    const roundData = mapData && mapData.rounds ? (mapData.rounds[String(roundNumber)] || mapData.rounds[roundNumber]) : null;
    const players = roundData ? roundData[teamKey] : null;
    return Array.isArray(players) ? players : [];
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
    const inventory = Array.isArray(player && player.inventory) ? player.inventory : [];
    const inferred = inferWeapons(inventory);
    return {
      name: player && (player.name || player.player_name) ? (player.name || player.player_name) : fallbackName,
      primary: player && (player.primary || player.primary_weapon) ? (player.primary || player.primary_weapon) : inferred.primary,
      secondary: player && (player.secondary || player.secondary_weapon) ? (player.secondary || player.secondary_weapon) : inferred.secondary,
      armor: player ? (player.armor_label || formatArmor(player)) : null,
      grenades: player && Array.isArray(player.grenades) ? player.grenades : inferred.grenades
    };
  }

  function inferWeapons(inventory) {
    const normalized = inventory.map(normalizeWeaponName);
    const primaries = normalized.filter((weapon) => !UTILITY_WEAPONS.has(weapon) && !isKnife(weapon) && !PISTOL_WEAPONS.has(weapon));
    const pistols = normalized.filter((weapon) => PISTOL_WEAPONS.has(weapon));
    const grenades = normalized.filter((weapon) => UTILITY_WEAPONS.has(weapon));
    return { primary: primaries[0] || null, secondary: pistols[0] || null, grenades };
  }

  function formatArmor(player) {
    if (player && (player.armor_label || player.armor || player.armor_value)) return player.has_helmet ? 'Kevlar + helmet' : 'Kevlar';
    return null;
  }

  function showFatalState(message) {
    dom.roundContext.textContent = message;
    if (dom.timeline) dom.timeline.innerHTML = `<p class="eco-preview-copy">${message}</p>`;
  }

  function getMapData(mapName) {
    return state.matchData ? state.matchData.maps.find((map) => map.map === mapName) : null;
  }

  function getCurrentMapData() {
    return getMapData(state.currentMap);
  }

  function getRoundByNumber(mapData, roundNumber) {
    return mapData ? mapData.rounds.find((round) => round.round === roundNumber) : null;
  }

  function getMapLabel(mapKey) {
    return MAP_LABELS[mapKey] || mapKey;
  }

  function getTeamLabel(teamKey) {
    return TEAM_META[teamKey] ? TEAM_META[teamKey].label : teamKey;
  }

  function otherTeam(teamKey) {
    return teamKey === 'vitality' ? 'mongolz' : 'vitality';
  }

  function formatMoney(value) {
    return `$${Number(value || 0).toLocaleString()}`;
  }

  function formatSignedMoney(value) {
    const amount = Number(value || 0);
    const sign = amount > 0 ? '+' : amount < 0 ? '-' : '+';
    return `${sign}$${Math.abs(amount).toLocaleString()}`;
  }

  function formatSignedNumber(value) {
    const amount = Number(value || 0);
    const sign = amount > 0 ? '+' : amount < 0 ? '-' : '+';
    return `${sign}${Math.abs(amount).toLocaleString()}`;
  }

  function formatBuyTier(tier) {
    return BUY_LABELS[tier] || String(tier || '').replace(/^./, (char) => char.toUpperCase());
  }

  function getBuyTooltip(tier) {
    return BUY_TOOLTIP_COPY[tier] || BUY_DESCRIPTIONS[tier] || formatBuyTier(tier);
  }

  function renderBuyTierBadge(tier) {
    const label = formatBuyTier(tier);
    return `<span class="eco-buy-tier-badge eco-tier-badge-${tier}" data-buy-tooltip="${escapeHtmlAttribute(getBuyTooltip(tier))}" aria-label="${escapeHtmlAttribute(`${label}: ${getBuyTooltip(tier)}`)}">${label}</span>`;
  }

  function readSearchParam(key) {
    try {
      return new URLSearchParams(window.location.search).get(key);
    } catch (error) {
      return null;
    }
  }

  function normalizeWeaponName(value) {
    const text = String(value || '').toLowerCase().replace(/^weapon_/, '').replace(/-/g, '_').replace(/ /g, '_');
    if (KNIFE_TOKENS.some((token) => text.includes(token))) return 'knife';
    return WEAPON_ALIASES[text] || text;
  }

  function formatWeaponName(value) {
    const normalized = normalizeWeaponName(value);
    return DISPLAY_NAMES[normalized] || normalized.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function escapeHtmlAttribute(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function isKnife(value) {
    return normalizeWeaponName(value).includes('knife');
  }

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
      return;
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
