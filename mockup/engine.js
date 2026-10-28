/* Tournament engine – pure logic, no DOM.
   Model: a category is a graph of phases (black boxes) linked by connectors.
   See docs/PHASE-DESIGN.md and docs/SPEC.md. Exposed as window.TE (browser) or module.exports (node). */
(function (root) {
  'use strict';

  // ---------- utils ----------
  let idCounter = 0;
  const uid = (p) => `${p || 'id'}_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const letter = (i) => String.fromCharCode(65 + i);
  const nextPow2 = (n) => { let p = 1; while (p < n) p *= 2; return p; };
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; }; }
  // "1-4, 7" -> [1,2,3,4,7]
  function parsePositions(text) {
    const out = [];
    String(text || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((part) => {
      const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) { for (let i = +m[1]; i <= +m[2]; i++) out.push(i); } else if (/^\d+$/.test(part)) out.push(+part);
    });
    return [...new Set(out)].filter((n) => n > 0).sort((a, b) => a - b);
  }
  function formatPositions(list) {
    const out = []; let i = 0;
    while (i < list.length) { let j = i; while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++; out.push(j > i ? `${list[i]}-${list[j]}` : `${list[i]}`); i = j + 1; }
    return out.join(', ');
  }

  // ---------- sports (SPEC §3) ----------
  const SPORTS = {
    FOOTBALL: { label: 'Football', space: ['field', 'fields'], ties: true, sets: false, unit: ['goal', 'goals'], points: { win: 3, tie: 1, loss: 0 }, forfeit: { home: 3, away: 0 }, rest: 30, gameLength: 40, players: false, americano: false, scheduling: 'FIXED' },
    FUTSAL: { label: 'Futsal', space: ['court', 'courts'], ties: true, sets: false, unit: ['goal', 'goals'], points: { win: 3, tie: 1, loss: 0 }, forfeit: { home: 3, away: 0 }, rest: 15, gameLength: 30, players: false, americano: false, scheduling: 'FIXED' },
    VOLLEYBALL: { label: 'Volleyball', space: ['court', 'courts'], ties: false, sets: true, bestOf: 3, unit: ['point', 'points'], points: { win: 2, tie: 0, loss: 0 }, forfeitSet: [25, 0], rest: 15, gameLength: 60, players: false, americano: false, scheduling: 'FIXED' },
    TENNIS: { label: 'Tennis', space: ['court', 'courts'], ties: false, sets: true, bestOf: 3, unit: ['game', 'games'], points: { win: 1, tie: 0, loss: 0 }, forfeitSet: [6, 0], rest: 15, gameLength: 90, players: true, americano: true, scheduling: 'FIXED' },
    PADEL: { label: 'Padel', space: ['court', 'courts'], ties: false, sets: true, bestOf: 3, unit: ['game', 'games'], points: { win: 1, tie: 0, loss: 0 }, forfeitSet: [6, 0], rest: 15, gameLength: 60, players: true, americano: true, scheduling: 'QUEUE' },
  };

  // ---------- phase types (PHASE-DESIGN §5) ----------
  const PHASE_TYPES = {
    GROUPS: { label: 'Groups', kind: 'TEAM', desc: 'Teams play the others in their group. Rankings: each group, overall, best k-th placed.' },
    KNOCKOUT: { label: 'Knockout', kind: 'TEAM', desc: 'Lose once and you are out. Ranking: final placings.' },
    DOUBLE_KNOCKOUT: { label: 'Double knockout', kind: 'TEAM', desc: 'Out after two losses (upper and lower bracket). Ranking: final placings.' },
    AMERICANO: { label: 'Americano', kind: 'PLAYER', desc: 'Players rotate partners every round. Ranking: players by points won.' },
  };
  const DISTRIBUTIONS = { SNAKE: 'Snake by seed', SEQUENTIAL: 'In seed order', MANUAL: 'Manual', AVOID_REMATCH: 'Avoid rematches' };
  const DYNAMIC = new Set(['AVOID_REMATCH']);
  function defaultPhaseConfig(type) {
    switch (type) {
      case 'GROUPS': return { pools: 2, distribution: 'SNAKE', games: 'ALL_ONCE', gamesPerTeam: 3, crossovers: [], gameLength: null, manualPools: null };
      case 'KNOCKOUT': return { placements: [1], consolations: [], gameLength: null };
      case 'DOUBLE_KNOCKOUT': return { bracketReset: true, gameLength: null };
      case 'AMERICANO': return { gameLength: null };
      default: return {};
    }
  }

  // Presets: ready-made phase graphs (SPEC §4)
  const TEMPLATES = [
    { id: 'RR_SE', name: 'Groups to Knockout', recommended: true, desc: 'Group stage, then a knockout. Add flights for more brackets.', flow: ['GROUPS', 'KNOCKOUT'] },
    { id: 'RR_DE', name: 'Groups to Double Knockout', desc: 'Group stage, then a double-elimination bracket.', flow: ['GROUPS', 'DOUBLE_KNOCKOUT'] },
    { id: 'RR', name: 'Groups', desc: 'One group stage, ranked by results.', flow: ['GROUPS'] },
    { id: 'SE', name: 'Knockout', desc: 'A single knockout bracket.', flow: ['KNOCKOUT'] },
    { id: 'DE', name: 'Double Knockout', desc: 'A double-elimination bracket.', flow: ['DOUBLE_KNOCKOUT'] },
    { id: 'RR3', name: 'Groups × 3, reshuffled', desc: 'Three group stages; each reshuffles the groups avoiding rematches and carries points over. Then a knockout.', flow: ['GROUPS', 'GROUPS', 'GROUPS', 'KNOCKOUT'] },
    { id: 'AM', name: 'Americano', americano: true, desc: 'Players rotate partners every round.', flow: ['AMERICANO'] },
    { id: 'AM_SE', name: 'Americano to Knockout', americano: true, desc: 'Americano, then the top players form pairs (1st + last qualifier…) for a knockout.', flow: ['AMERICANO', 'KNOCKOUT'] },
  ];
  const templatesFor = (sport) => TEMPLATES.filter((t) => !t.americano || SPORTS[sport].americano);

  // ---------- tiebreakers (SPEC §5.4) ----------
  const RULES = {
    POINTS: { name: 'Points', eq: 'PTS', v: (s) => s.PTS, avg: true },
    WINS: { name: 'Wins', eq: 'W', v: (s) => s.W, avg: true },
    MATCHUPS: { name: 'Matchups', eq: '2×W + T', v: (s) => 2 * s.W + s.T, avg: true },
    SCORE_DIFF: { name: 'Score difference', eq: 'For − Against', v: (s) => s.PF - s.PA, avg: true },
    SCORE_FOR: { name: 'Most scored', eq: 'For', v: (s) => s.PF, avg: true },
    SCORE_AGAINST_LEAST: { name: 'Least conceded', eq: 'Against (lowest)', v: (s) => -s.PA, avg: true },
    SCORE_RATIO: { name: 'Score ratio', eq: 'For ÷ Against', v: (s) => (s.PA ? s.PF / s.PA : s.PF ? Infinity : 0) },
    SET_DIFF: { name: 'Set difference', eq: 'Sets won − lost', v: (s) => s.SF - s.SA, avg: true, sets: true },
    SET_RATIO: { name: 'Set ratio', eq: 'Sets won ÷ lost', v: (s) => (s.SA ? s.SF / s.SA : s.SF ? Infinity : 0), sets: true },
    SETS_FOR: { name: 'Most sets won', eq: 'Sets won', v: (s) => s.SF, avg: true, sets: true },
    SETS_AGAINST_LEAST: { name: 'Fewest sets lost', eq: 'Sets lost (lowest)', v: (s) => -s.SA, avg: true, sets: true },
  };
  const rulesFor = (sport) => Object.keys(RULES).filter((k) => !RULES[k].sets || SPORTS[sport].sets);
  const DEFAULT_TIEBREAKERS = {
    FOOTBALL: [['POINTS', 'O'], ['POINTS', 'H'], ['SCORE_DIFF', 'H'], ['SCORE_DIFF', 'O'], ['SCORE_FOR', 'O']],
    FUTSAL: [['POINTS', 'O'], ['POINTS', 'H'], ['SCORE_DIFF', 'H'], ['SCORE_DIFF', 'O'], ['SCORE_FOR', 'O']],
    VOLLEYBALL: [['WINS', 'O'], ['POINTS', 'O'], ['SET_RATIO', 'O'], ['SCORE_RATIO', 'O'], ['WINS', 'H']],
    TENNIS: [['WINS', 'O'], ['WINS', 'H'], ['SET_DIFF', 'O'], ['SCORE_DIFF', 'O']],
    PADEL: [['WINS', 'O'], ['WINS', 'H'], ['SET_DIFF', 'O'], ['SCORE_DIFF', 'O']],
  };
  const COLUMNS = {
    GP: 'Games played', W: 'Wins', T: 'Ties', L: 'Losses', C: 'Cancelled', F: 'Forfeits',
    PF: 'Scored', PA: 'Conceded', PD: 'Difference', SF: 'Sets won', SA: 'Sets lost', SD: 'Set difference', PTS: 'Points',
  };
  // category-level rules shared by all its phases
  function defaultRules(sport) {
    const sp = SPORTS[sport];
    return {
      templateId: null,
      pointsSystem: 'POINTS',
      points: { win: sp.points.win, tie: sp.points.tie, loss: sp.points.loss, cancel: 0, forfeitWin: sp.points.win, forfeitLoss: sp.points.loss, setWin: 0, setLoss: 0 },
      tiebreakers: DEFAULT_TIEBREAKERS[sport].map(([rule, scope]) => ({ rule, scope })),
      columns: sp.sets ? ['GP', 'W', 'L', 'SF', 'SA', 'SD', 'PD', 'PTS'] : ['GP', 'W', 'T', 'L', 'PF', 'PA', 'PD', 'PTS'],
      bestOf: sp.bestOf || null,
      americano: { target: 24, rounds: null },
    };
  }

  // ---------- state ----------
  function newState(sport, name) {
    const sp = SPORTS[sport];
    return {
      version: 2,
      tournament: { name: name || 'New tournament', sport, status: 'DRAFT', restMinutes: sp.rest, scheduling: sp.scheduling },
      categories: [newCategory('Open', sport)],
      venues: [],
      schedule: { blocks: [], assignments: {}, unplaced: [], queue: [], courts: {}, auto: true, lastFinished: {} },
    };
  }
  function newCategory(name, sport) {
    return { id: uid('cat'), name, format: defaultRules(sport || 'FOOTBALL'), teams: [], players: [], phases: [], connectors: [], games: [], nextGame: 1 };
  }
  const findCat = (st, id) => st.categories.find((c) => c.id === id);
  const findPhase = (cat, id) => cat.phases.find((p) => p.id === id);
  const phaseGames = (cat, phaseId) => cat.games.filter((g) => g.phaseId === phaseId);
  const teamName = (cat, id) => { const t = cat.teams.find((x) => x.id === id); return t ? t.name : '?'; };
  const playerName = (cat, id) => { const p = cat.players.find((x) => x.id === id); return p ? p.name : '?'; };
  const participantName = (cat, phase, id) => (PHASE_TYPES[phase.type].kind === 'PLAYER' ? playerName(cat, id) : teamName(cat, id));
  const sortedPhases = (cat) => cat.phases.slice().sort((a, b) => a.order - b.order);
  const connectorTo = (cat, phaseId) => cat.connectors.find((c) => c.to === phaseId) || null;
  const isRoot = (cat, phase) => { const c = connectorTo(cat, phase.id); return !c || !c.selectors.length; };
  function sourcesOf(cat, phase) { const c = connectorTo(cat, phase.id); return c ? [...new Set(c.selectors.map((s) => s.fromPhase))].map((id) => findPhase(cat, id)).filter(Boolean) : []; }
  function downstreamOf(cat, phase) { return cat.connectors.filter((c) => c.selectors.some((s) => s.fromPhase === phase.id)).map((c) => findPhase(cat, c.to)).filter(Boolean); }

  // ---------- seeding helpers ----------
  function seededTeams(cat) {
    return cat.teams.filter((t) => !t.fromAmericano).map((t, i) => ({ t, i })).sort((a, b) => (a.t.seed || 1e9) - (b.t.seed || 1e9) || a.i - b.i).map((x) => x.t.id);
  }
  function snakePools(ids, n) {
    const pools = Array.from({ length: n }, (_, i) => ({ number: i + 1, name: `Group ${letter(i)}`, ids: [] }));
    ids.forEach((id, i) => { const lap = Math.floor(i / n), pos = i % n; pools[lap % 2 === 0 ? pos : n - 1 - pos].ids.push(id); });
    return pools;
  }
  function sequentialPools(ids, n) {
    const pools = Array.from({ length: n }, (_, i) => ({ number: i + 1, name: `Group ${letter(i)}`, ids: [] }));
    const size = Math.ceil(ids.length / n);
    ids.forEach((id, i) => pools[Math.min(n - 1, Math.floor(i / size))].ids.push(id));
    return pools;
  }

  // ---------- graph editing ----------
  function addPhase(state, cat, type, name) {
    const order = cat.phases.length ? Math.max(...cat.phases.map((p) => p.order)) + 1 : 1;
    const p = { id: uid('ph'), name: name || `${PHASE_TYPES[type].label} ${order}`, type, order, config: defaultPhaseConfig(type), inheritPoints: false, entrants: [], pools: [], built: false, confirmed: false, tieOrders: {}, snapshot: null };
    cat.phases.push(p);
    return p;
  }
  function removePhase(state, cat, phaseId) {
    const p = findPhase(cat, phaseId); if (!p) return;
    invalidate(state, cat, p);
    removePhaseGames(state, cat, p);
    cat.connectors = cat.connectors.filter((c) => c.to !== phaseId).map((c) => Object.assign(c, { selectors: c.selectors.filter((s) => s.fromPhase !== phaseId) }));
    cat.phases = cat.phases.filter((x) => x.id !== phaseId);
    sortedPhases(cat).forEach((x, i) => { x.order = i + 1; });
    rebuildAll(state, cat);
  }
  function setConnector(state, cat, toPhaseId, conn) {
    cat.connectors = cat.connectors.filter((c) => c.to !== toPhaseId);
    if (conn && conn.selectors && conn.selectors.length) cat.connectors.push(Object.assign({ id: uid('con'), to: toPhaseId, seeding: 'BY_SOURCE_POSITION', transform: null }, conn, { to: toPhaseId }));
    rebuildPhase(state, cat, findPhase(cat, toPhaseId));
  }
  function updatePhase(state, cat, phaseId, patch) {
    const p = findPhase(cat, phaseId);
    if (patch.config) Object.assign(p.config, patch.config);
    if (patch.name != null) p.name = patch.name;
    if (patch.inheritPoints != null) p.inheritPoints = patch.inheritPoints;
    rebuildPhase(state, cat, p);
  }
  // Presets build a ready-made graph
  function applyTemplate(state, cat, templateId, flights) {
    const tpl = TEMPLATES.find((t) => t.id === templateId);
    cat.games.forEach((g) => dropFromSchedule(state, g.id));
    cat.phases = []; cat.connectors = []; cat.games = []; cat.nextGame = 1;
    cat.teams = cat.teams.filter((t) => !t.fromAmericano);
    cat.format.templateId = templateId;
    const n = cat.teams.length;
    const groups = (name) => { const p = addPhase(state, cat, 'GROUPS', name); p.config.pools = Math.max(1, Math.min(Math.floor(n / 2) || 1, Math.round(n / 4) || 1)); return p; };
    if (templateId === 'RR') groups('Pool Play');
    if (templateId === 'SE') addPhase(state, cat, 'KNOCKOUT', 'Bracket');
    if (templateId === 'DE') addPhase(state, cat, 'DOUBLE_KNOCKOUT', 'Bracket');
    if (templateId === 'RR_SE' || templateId === 'RR_DE') {
      const g = groups('Pool Play');
      const f = Math.max(1, Math.min(5, flights || 1));
      for (let i = 0; i < f; i++) {
        const k = addPhase(state, cat, templateId === 'RR_SE' ? 'KNOCKOUT' : 'DOUBLE_KNOCKOUT', f > 1 ? `${letter(i)} Flight` : 'Playoffs');
        cat.connectors.push({ id: uid('con'), to: k.id, seeding: 'BY_SOURCE_POSITION', transform: null, selectors: [{ fromPhase: g.id, ranking: 'pool:*', positions: [2 * i + 1, 2 * i + 2] }] });
      }
    }
    if (templateId === 'RR3') {
      const a = groups('Stage 1');
      const b = groups('Stage 2'); b.config.distribution = 'AVOID_REMATCH'; b.inheritPoints = true;
      const c = groups('Stage 3'); c.config.distribution = 'AVOID_REMATCH'; c.inheritPoints = true;
      const k = addPhase(state, cat, 'KNOCKOUT', 'Playoffs');
      const all = Array.from({ length: Math.max(n, 2) }, (_, i) => i + 1);
      cat.connectors.push({ id: uid('con'), to: b.id, seeding: 'SELECTOR_ORDER', transform: null, selectors: [{ fromPhase: a.id, ranking: 'overall', positions: all }] });
      cat.connectors.push({ id: uid('con'), to: c.id, seeding: 'SELECTOR_ORDER', transform: null, selectors: [{ fromPhase: b.id, ranking: 'overall', positions: all }] });
      cat.connectors.push({ id: uid('con'), to: k.id, seeding: 'SELECTOR_ORDER', transform: null, selectors: [{ fromPhase: c.id, ranking: 'overall', positions: [1, 2, 3, 4] }] });
    }
    if (templateId === 'AM' || templateId === 'AM_SE') {
      const am = addPhase(state, cat, 'AMERICANO', 'Americano');
      if (templateId === 'AM_SE') {
        const k = addPhase(state, cat, 'KNOCKOUT', 'Playoffs');
        cat.connectors.push({ id: uid('con'), to: k.id, seeding: 'SELECTOR_ORDER', transform: 'PAIRS', selectors: [{ fromPhase: am.id, ranking: 'overall', positions: [1, 2, 3, 4] }] });
      }
    }
    rebuildAll(state, cat);
  }

  // ---------- ranking catalog (PHASE-DESIGN §5, §6) ----------
  function rankingCatalog(cat, phase) {
    if (phase.type === 'GROUPS') {
      const maxSize = Math.max(0, ...phase.pools.map((p) => p.ids.length));
      return [
        { id: 'pool:*', label: 'Each group', size: maxSize },
        ...phase.pools.map((p) => ({ id: `pool:${p.number}`, label: p.name, size: p.ids.length })),
        { id: 'overall', label: 'Overall (per-game averages)', size: phase.entrants.length },
        ...Array.from({ length: maxSize }, (_, i) => ({ id: `cross:${i + 1}`, label: `Best ${ordinal(i + 1)}-placed`, size: phase.pools.filter((p) => p.ids.length > i).length })),
      ];
    }
    if (phase.type === 'AMERICANO') return [{ id: 'overall', label: 'Players by points won', size: phase.entrants.length }];
    return [{ id: 'final', label: 'Final placings', size: phase.entrants.length }];
  }
  function rankingLabel(phase, rankingId, position) {
    if (rankingId === 'overall') return `${ordinal(position)} ${phase.name}`;
    if (rankingId === 'final') return `${ordinal(position)} ${phase.name}`;
    if (rankingId.startsWith('cross:')) return `${ordinal(position)} best ${ordinal(+rankingId.slice(6))}`;
    const pool = phase.pools.find((p) => `pool:${p.number}` === rankingId);
    return `${ordinal(position)} ${pool ? pool.name : '?'}${phase.name ? ` (${phase.name})` : ''}`;
  }
  // Expand a connector into ordered placeholders [{fromPhase, ranking, position, label}]
  function expandConnector(cat, conn) {
    const items = [];
    conn.selectors.forEach((sel, si) => {
      const src = findPhase(cat, sel.fromPhase); if (!src) return;
      if (sel.ranking === 'pool:*') {
        sel.positions.forEach((pos) => src.pools.forEach((p) => { if (p.ids.length >= pos) items.push({ fromPhase: src.id, ranking: `pool:${p.number}`, position: pos, star: true, si, label: rankingLabel(src, `pool:${p.number}`, pos) }); }));
      } else {
        const def = rankingCatalog(cat, src).find((r) => r.id === sel.ranking);
        sel.positions.forEach((pos) => { if (def && pos <= def.size) items.push({ fromPhase: src.id, ranking: sel.ranking, position: pos, si, label: rankingLabel(src, sel.ranking, pos) }); });
      }
    });
    if (conn.seeding === 'BY_SOURCE_POSITION') items.sort((a, b) => a.position - b.position || a.si - b.si);
    if (conn.transform === 'PAIRS') {
      const k = items.length - (items.length % 2);
      return Array.from({ length: k / 2 }, (_, i) => ({ pair: [items[i], items[k - 1 - i]], label: `${items[i].label} + ${items[k - 1 - i].label}` }));
    }
    return items;
  }

  // ---------- validation (PHASE-DESIGN §7.5) ----------
  function validateGraph(state, cat) {
    const errors = [], warnings = [];
    const used = {};
    for (const conn of cat.connectors) {
      const to = findPhase(cat, conn.to); if (!to) continue;
      const kindTo = PHASE_TYPES[to.type].kind;
      const perSourceRank = {};
      for (const sel of conn.selectors) {
        const src = findPhase(cat, sel.fromPhase);
        if (!src) { errors.push({ phase: to.id, msg: 'A selector points to a phase that no longer exists.' }); continue; }
        if (src.order >= to.order) errors.push({ phase: to.id, msg: `${to.name} takes teams from ${src.name}, which comes after it. Phases can only take from earlier phases.` });
        const kindFrom = PHASE_TYPES[src.type].kind;
        if (kindFrom !== kindTo && !(kindFrom === 'PLAYER' && kindTo === 'TEAM' && conn.transform === 'PAIRS')) errors.push({ phase: to.id, msg: `${src.name} ranks ${kindFrom === 'PLAYER' ? 'players' : 'teams'} but ${to.name} needs ${kindTo === 'PLAYER' ? 'players' : 'teams'}.` });
        const cat0 = rankingCatalog(cat, src);
        if (!cat0.some((r) => r.id === sel.ranking) && !(src.type === 'GROUPS' && /^pool:|^cross:/.test(sel.ranking))) { errors.push({ phase: to.id, msg: `${src.name} has no ranking “${sel.ranking}”.` }); continue; }
        if (!sel.positions.length) errors.push({ phase: to.id, msg: `A selector from ${src.name} has no positions.` });
        const r = cat0.find((x) => x.id === sel.ranking);
        if (r && src.built && sel.positions.some((p) => p > r.size)) warnings.push({ phase: to.id, msg: `${src.name}: “${r.label}” has only ${r.size} places; extra positions are ignored.` });
        // overlap rules between rankings of a GROUPS phase
        if (src.type === 'GROUPS') {
          const key = src.id;
          perSourceRank[key] = perSourceRank[key] || { overall: false, poolRanks: {}, crossRanks: {} };
          const b = perSourceRank[key];
          if (sel.ranking === 'overall') b.overall = true;
          if (sel.ranking.startsWith('pool:')) sel.positions.forEach((p) => { b.poolRanks[p] = true; });
          if (sel.ranking.startsWith('cross:')) b.crossRanks[+sel.ranking.slice(6)] = true;
        }
      }
      // the same concrete place taken twice
      for (const ph of expandConnector(cat, conn)) {
        for (const it of ph.pair || [ph]) {
          const k = `${it.fromPhase}|${it.ranking}|${it.position}`;
          if (used[k]) errors.push({ phase: to.id, msg: `“${it.label}” is used twice (${findPhase(cat, used[k]).name} and ${to.name}).` });
          used[k] = to.id;
        }
      }
      for (const [srcId, b] of Object.entries(perSourceRank)) {
        const src = findPhase(cat, srcId);
        if (b.overall && (Object.keys(b.poolRanks).length || Object.keys(b.crossRanks).length)) errors.push({ phase: to.id, msg: `Mixing “Overall” with group places of ${src.name} can select the same team twice.` });
        Object.keys(b.crossRanks).forEach((k) => { if (b.poolRanks[k]) errors.push({ phase: to.id, msg: `“${ordinal(+k)} of a group” and “best ${ordinal(+k)}-placed” from ${src.name} can select the same team twice.` }); });
      }
    }
    // cross-connector overlap of group places vs cross / overall
    const bySrc = {};
    for (const conn of cat.connectors) for (const sel of conn.selectors) {
      const src = findPhase(cat, sel.fromPhase); if (!src || src.type !== 'GROUPS') continue;
      const b = (bySrc[src.id] = bySrc[src.id] || { conns: new Set(), overall: new Set(), pool: {}, cross: {} });
      if (sel.ranking === 'overall') b.overall.add(conn.to);
      if (sel.ranking.startsWith('pool:')) sel.positions.forEach((p) => { (b.pool[p] = b.pool[p] || new Set()).add(conn.to); });
      if (sel.ranking.startsWith('cross:')) (b.cross[+sel.ranking.slice(6)] = b.cross[+sel.ranking.slice(6)] || new Set()).add(conn.to);
    }
    for (const [srcId, b] of Object.entries(bySrc)) {
      const src = findPhase(cat, srcId);
      Object.keys(b.cross).forEach((k) => { const a = b.pool[k]; if (a && [...a].some((x) => !b.cross[k].has(x))) errors.push({ phase: [...b.cross[k]][0], msg: `${ordinal(+k)}-placed teams of ${src.name} are taken both by group and as “best ${ordinal(+k)}-placed” in different phases.` }); });
      if (b.overall.size && (Object.keys(b.pool).length || Object.keys(b.cross).length)) errors.push({ phase: [...b.overall][0], msg: `${src.name} is split by “Overall” and by group places in different phases; the same team could be taken twice.` });
    }
    // places that go nowhere (warning)
    for (const src of cat.phases) {
      const outs = cat.connectors.filter((c) => c.selectors.some((s) => s.fromPhase === src.id));
      if (!outs.length || !src.built) continue;
      const taken = outs.reduce((n, c) => n + expandConnector(cat, c).reduce((m, x) => m + (x.pair ? x.pair.filter((y) => y.fromPhase === src.id).length : x.fromPhase === src.id ? 1 : 0), 0), 0);
      const total = src.entrants.length;
      if (taken < total) warnings.push({ phase: src.id, msg: `${total - taken} of ${total} ${PHASE_TYPES[src.type].kind === 'PLAYER' ? 'players' : 'teams'} in ${src.name} do not continue to another phase.` });
    }
    return { errors: dedupe(errors), warnings: dedupe(warnings) };
  }
  const dedupe = (list) => list.filter((x, i) => list.findIndex((y) => y.msg === x.msg) === i);

  // ---------- building phases ----------
  function rebuildAll(state, cat) { sortedPhases(cat).forEach((p) => rebuildPhase(state, cat, p, true)); }
  function rebuildPhase(state, cat, phase, noCascade) {
    if (!phase) return;
    invalidate(state, cat, phase);
    removePhaseGames(state, cat, phase);
    // entrants
    const conn = connectorTo(cat, phase.id);
    if (!conn || !conn.selectors.length) {
      if (PHASE_TYPES[phase.type].kind === 'PLAYER') phase.entrants = cat.players.map((p) => ({ id: `e_${p.id}`, label: p.name, source: { player: p.id }, participant: p.id }));
      else {
        const prev = phase.entrants.filter((e) => e.source && e.source.team).map((e) => e.source.team);
        let ids = seededTeams(cat);
        // keep a manual knockout order if the team list did not change
        if (phase.type !== 'GROUPS' && prev.length === ids.length && prev.every((x) => ids.includes(x))) ids = prev;
        phase.entrants = ids.map((id) => ({ id: `e_${id}`, label: teamName(cat, id), source: { team: id }, participant: id }));
      }
    } else {
      const items = expandConnector(cat, conn);
      phase.entrants = items.map((it, i) => ({ id: `e_${phase.id}_${i + 1}`, label: it.label, source: it.pair ? { pair: it.pair } : { fromPhase: it.fromPhase, ranking: it.ranking, position: it.position, star: !!it.star }, participant: null }));
    }
    // structure
    if (phase.type === 'GROUPS') {
      const ids = phase.entrants.map((e) => e.id);
      const n = Math.max(1, Math.min(phase.config.pools, Math.max(1, Math.floor(ids.length / 2))));
      phase.config.pools = n;
      const manual = phase.config.distribution === 'MANUAL' && phase.config.manualPools;
      if (manual && manual.length === n && manual.flatMap((p) => p.ids).length === ids.length && manual.every((p) => p.ids.every((x) => ids.includes(x)))) phase.pools = clone(manual);
      else phase.pools = phase.config.distribution === 'SEQUENTIAL' ? sequentialPools(ids, n) : snakePools(ids, n);
      phase.config.crossovers = (phase.config.crossovers || []).filter(([a, b]) => a <= n && b <= n);
    } else phase.pools = [];
    phase.built = phase.type === 'AMERICANO' ? phase.entrants.length >= 4 && phase.entrants.length % 4 === 0 : phase.entrants.length >= 2;
    if (phase.built) generateGames(state, cat, phase);
    tryResolve(state, cat, phase);
    if (!noCascade) downstreamOf(cat, phase).forEach((d) => rebuildPhase(state, cat, d));
  }
  function removePhaseGames(state, cat, phase) {
    const ids = new Set(phaseGames(cat, phase.id).map((g) => g.id));
    cat.games = cat.games.filter((g) => !ids.has(g.id));
    ids.forEach((id) => dropFromSchedule(state, id));
    renumber(cat);
  }
  function addGame(cat, phase, g) {
    const game = Object.assign({ id: uid('g'), number: cat.nextGame++, phaseId: phase.id, status: 'SCHEDULED', result: null }, g);
    cat.games.push(game);
    return game;
  }
  const slotSrc = (phase, entrantId) => ({ t: 'slot', phase: phase.id, id: entrantId });
  function generateGames(state, cat, phase) {
    if (phase.type === 'GROUPS') return generateGroupGames(state, cat, phase);
    if (phase.type === 'KNOCKOUT') {
      const sources = phase.entrants.map((e) => slotSrc(phase, e.id));
      buildSE(cat, phase, sources, 1, (phase.config.placements || [1]).slice().sort((a, b) => a - b), 'M');
      for (const c of phase.config.consolations || []) addGame(cat, phase, { home: c.home, away: c.away, label: 'Consolation', bracket: 'C' });
      return;
    }
    if (phase.type === 'DOUBLE_KNOCKOUT') return buildDE(cat, phase, phase.entrants.map((e) => slotSrc(phase, e.id)), phase.config.bracketReset);
    if (phase.type === 'AMERICANO') return generateAmericanoGames(state, cat, phase);
  }

  // ---------- groups (round robin) ----------
  function circleRounds(ids) {
    const list = ids.slice();
    if (list.length % 2) list.push(null);
    const n = list.length, rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      for (let i = 0; i < n / 2; i++) { const a = list[i], b = list[n - 1 - i]; if (a !== null && b !== null) pairs.push(r % 2 === 0 ? [a, b] : [b, a]); }
      rounds.push(pairs);
      list.splice(1, 0, list.pop());
    }
    return rounds;
  }
  function poolPairs(ids, mode, k) {
    const base = circleRounds(ids);
    if (mode === 'ALL_ONCE') return base;
    if (mode === 'ALL_TWICE') return [...base, ...base.map((r) => r.map(([a, b]) => [b, a]))];
    const out = [], count = Object.fromEntries(ids.map((i) => [i, 0]));
    let lap = 0;
    while (ids.some((i) => count[i] < k) && lap < 40) {
      for (const round of base) {
        const pr = [];
        for (const [a, b] of round) if (count[a] < k && count[b] < k) { pr.push(lap % 2 ? [b, a] : [a, b]); count[a]++; count[b]++; }
        if (pr.length) out.push(pr);
        if (!ids.some((i) => count[i] < k)) break;
      }
      lap++;
      if (ids.filter((i) => count[i] < k).length === 1) {
        const short = ids.find((i) => count[i] < k);
        const opp = ids.filter((i) => i !== short).sort((a, b) => count[a] - count[b])[0];
        out.push([[short, opp]]); count[short]++; count[opp]++;
      }
    }
    return out;
  }
  function crossPairs(a, b) {
    const rounds = [], m = Math.max(a.length, b.length);
    for (let r = 0; r < m; r++) {
      const pr = [];
      for (let i = 0; i < a.length; i++) { const j = (i + r) % m; if (j < b.length) pr.push(r % 2 ? [b[j], a[i]] : [a[i], b[j]]); }
      rounds.push(pr);
    }
    return rounds;
  }
  function generateGroupGames(state, cat, phase) {
    const cfg = phase.config, crossed = new Set(cfg.crossovers.flat()), perPool = [];
    phase.pools.forEach((p) => { if (!crossed.has(p.number)) perPool.push(poolPairs(p.ids, cfg.games, cfg.gamesPerTeam).map((rd) => rd.map((pr) => ({ pr, pool: p.number })))); });
    cfg.crossovers.forEach(([x, y]) => {
      const a = phase.pools.find((p) => p.number === x), b = phase.pools.find((p) => p.number === y);
      if (!a || !b) return;
      let rds = crossPairs(a.ids, b.ids);
      if (cfg.games === 'N') rds = rds.slice(0, cfg.gamesPerTeam);
      perPool.push(rds.map((rd) => rd.map((pr) => ({ pr, pool: x }))));
    });
    const maxR = Math.max(0, ...perPool.map((p) => p.length));
    for (let r = 0; r < maxR; r++) perPool.forEach((p) => (p[r] || []).forEach(({ pr, pool }) => addGame(cat, phase, { home: slotSrc(phase, pr[0]), away: slotSrc(phase, pr[1]), pool, label: phase.pools.find((q) => q.number === pool).name, matchday: r + 1 })));
  }

  // ---------- brackets (SPEC §6.3–6.4); games carry the placings they decide ----------
  function seedOrder(n) { let order = [1]; while (order.length < n) { const m = order.length * 2; order = order.flatMap((s) => [s, m + 1 - s]); } return order; }
  const BYE = { t: 'bye' };
  const roundLabel = (size, base) => {
    if (base === 1) return size === 2 ? 'Final' : size === 4 ? 'Semi Finals' : size === 8 ? 'Quarter Finals' : `Round of ${size}`;
    return size === 2 ? `${ordinal(base)} Place` : `${ordinal(base)} Place ${size === 4 ? 'Semis' : 'Round of ' + size}`;
  };
  function buildSE(cat, phase, sources, base, placements, tag) {
    const size = nextPow2(Math.max(2, sources.length));
    let cur = seedOrder(size).map((s) => sources[s - 1] || BYE), sz = size, depth = 0;
    const rounds = [];
    while (cur.length > 1) {
      const next = [], losers = [], games = [];
      for (let i = 0; i < cur.length; i += 2) {
        const a = cur[i], b = cur[i + 1];
        if (a.t === 'bye' && b.t === 'bye') { next.push(BYE); continue; }
        if (a.t === 'bye') { next.push(b); continue; }
        if (b.t === 'bye') { next.push(a); continue; }
        const g = addGame(cat, phase, { home: a, away: b, label: roundLabel(sz, base), bracket: tag, depth });
        games.push(g); next.push({ t: 'dep', game: g.number, res: 'W' }); losers.push({ t: 'dep', game: g.number, res: 'L' });
      }
      rounds.push({ games, losers, survivors: next.filter((x) => x.t !== 'bye').length });
      cur = next; sz /= 2; depth++;
    }
    const last = rounds[rounds.length - 1];
    if (last && last.games[0]) last.games[0].winnerPlace = base;
    rounds.forEach(({ games, losers, survivors }) => {
      const place = base + survivors;
      const continues = survivors >= 1 && losers.length >= 2 && placements.includes(place) && place > base + 1;
      games.forEach((g) => { g.loserRange = continues ? null : [place, place + losers.length - 1]; });
      if (continues) buildSE(cat, phase, losers, place, placements, 'P');
    });
  }
  function buildDE(cat, phase, sources, reset) {
    const size = nextPow2(Math.max(2, sources.length));
    let alive = sources.length;
    let roundGames = [];
    const play = (a, b, label, tag) => {
      if (a.t === 'bye' && b.t === 'bye') return { w: BYE, l: BYE };
      if (a.t === 'bye') return { w: b, l: BYE };
      if (b.t === 'bye') return { w: a, l: BYE };
      const g = addGame(cat, phase, { home: a, away: b, label, bracket: tag });
      if (tag === 'L') roundGames.push(g);
      return { w: { t: 'dep', game: g.number, res: 'W' }, l: { t: 'dep', game: g.number, res: 'L' } };
    };
    const closeLowerRound = () => { const m = roundGames.length; roundGames.forEach((g) => { g.loserRange = [alive - m + 1, alive]; }); alive -= m; roundGames = []; };
    let upper = seedOrder(size).map((s) => sources[s - 1] || BYE);
    const R = Math.log2(size), upperLosers = [];
    for (let r = 1; r <= R; r++) {
      const next = [], losers = [];
      for (let i = 0; i < upper.length; i += 2) { const res = play(upper[i], upper[i + 1], r === R ? 'Upper Final' : `Upper Round ${r}`, 'U'); next.push(res.w); losers.push(res.l); }
      upperLosers.push(losers); upper = next;
    }
    let lower = [];
    const l1 = upperLosers[0];
    for (let i = 0; i < l1.length; i += 2) lower.push(play(l1[i], l1[i + 1] || BYE, 'Lower Round 1', 'L').w);
    closeLowerRound();
    let lr = 2;
    for (let r = 2; r <= R; r++) {
      const drops = r % 2 === 0 ? upperLosers[r - 1].slice().reverse() : upperLosers[r - 1].slice();
      const next = [];
      for (let i = 0; i < lower.length; i++) next.push(play(lower[i], drops[i] || BYE, r === R ? 'Lower Final' : `Lower Round ${lr}`, 'L').w);
      lower = next; lr++; closeLowerRound();
      if (r < R && lower.length > 1) {
        const merged = [];
        for (let i = 0; i < lower.length; i += 2) merged.push(play(lower[i], lower[i + 1] || BYE, `Lower Round ${lr}`, 'L').w);
        lower = merged; lr++; closeLowerRound();
      }
    }
    const lw = lower[0] || BYE;
    if (lw.t === 'bye') return;
    const gf = addGame(cat, phase, { home: upper[0], away: lw, label: 'Grand Final', bracket: 'GF', winnerPlace: 1, loserRange: [2, 2] });
    if (reset) addGame(cat, phase, { home: { t: 'dep', game: gf.number, res: 'W' }, away: { t: 'dep', game: gf.number, res: 'L' }, label: 'Grand Final (reset)', bracket: 'GF', conditional: gf.number, winnerPlace: 1, loserRange: [2, 2] });
  }
  // manual swap of first-round seeds (knockout)
  function moveEntrant(state, cat, phaseId, from, to) {
    const p = findPhase(cat, phaseId);
    const [e] = p.entrants.splice(from, 1); p.entrants.splice(to, 0, e);
    const parts = p.entrants.map((x) => x.participant);
    rebuildStructureOnly(state, cat, p, parts);
  }
  function rebuildStructureOnly(state, cat, p, parts) {
    invalidate(state, cat, p); removePhaseGames(state, cat, p);
    if (p.built) generateGames(state, cat, p);
    p.entrants.forEach((e, i) => { e.participant = parts[i]; });
    downstreamOf(cat, p).forEach((d) => rebuildPhase(state, cat, d));
  }
  function movePoolEntrant(state, cat, phaseId, entrantId, toPool) {
    const p = findPhase(cat, phaseId);
    const parts = Object.fromEntries(p.entrants.map((e) => [e.id, e.participant]));
    p.pools.forEach((q) => { q.ids = q.ids.filter((x) => x !== entrantId); });
    p.pools.find((q) => q.number === toPool).ids.push(entrantId);
    p.config.distribution = 'MANUAL'; p.config.manualPools = clone(p.pools);
    rebuildStructureOnly(state, cat, p, p.entrants.map((e) => parts[e.id]));
  }

  // ---------- americano ----------
  function americanoSchedule(playerIds, rounds, seed) {
    const n = playerIds.length, rand = rng(seed || 7);
    const partner = {}, opp = {}, key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
    const out = [];
    for (let r = 0; r < rounds; r++) {
      let best = null, bestCost = Infinity;
      for (let attempt = 0; attempt < 400; attempt++) {
        const p = playerIds.slice();
        for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
        let cost = 0; const games = [];
        for (let i = 0; i < n; i += 4) {
          const g = [p[i], p[i + 1], p[i + 2], p[i + 3]];
          cost += 100 * ((partner[key(g[0], g[1])] || 0) + (partner[key(g[2], g[3])] || 0));
          for (const x of [g[0], g[1]]) for (const y of [g[2], g[3]]) cost += opp[key(x, y)] || 0;
          games.push(g);
        }
        if (cost < bestCost) { bestCost = cost; best = games; if (cost === 0) break; }
      }
      best.forEach((g) => {
        partner[key(g[0], g[1])] = (partner[key(g[0], g[1])] || 0) + 1; partner[key(g[2], g[3])] = (partner[key(g[2], g[3])] || 0) + 1;
        for (const x of [g[0], g[1]]) for (const y of [g[2], g[3]]) opp[key(x, y)] = (opp[key(x, y)] || 0) + 1;
      });
      out.push(best);
    }
    return out;
  }
  function generateAmericanoGames(state, cat, phase) {
    const ids = phase.entrants.map((e) => e.participant);
    const rounds = cat.format.americano.rounds || ids.length - 1;
    americanoSchedule(ids, rounds, ids.length * 31 + rounds).forEach((games, r) => games.forEach((g) => {
      addGame(cat, phase, { home: { t: 'pair', players: [g[0], g[1]] }, away: { t: 'pair', players: [g[2], g[3]] }, americano: true, label: `Round ${r + 1}`, matchday: r + 1 });
    }));
  }

  // ---------- results ----------
  function validateResult(state, cat, game, result) {
    const sp = SPORTS[state.tournament.sport];
    const warnings = [];
    if (result.status === 'CANCELLED') return { ok: true, warnings };
    if (result.status === 'FORFEIT') return result.forfeitBy ? { ok: true, warnings } : { ok: false, error: 'Choose which side forfeits.' };
    if (game.americano) {
      const t = cat.format.americano.target;
      if (!(result.home >= 0 && result.away >= 0)) return { ok: false, error: 'Enter both scores.' };
      if (t && result.home + result.away !== t) warnings.push(`Scores add up to ${result.home + result.away}, not ${t}.`);
      return { ok: true, warnings };
    }
    if (sp.sets) {
      const sets = (result.sets || []).filter((s) => s[0] !== '' && s[1] !== '' && s[0] != null && s[1] != null);
      if (!sets.length) return { ok: false, error: 'Enter at least one set.' };
      let h = 0, a = 0;
      for (const [x, y] of sets) {
        if (x === y) return { ok: false, error: 'A set cannot end level.' };
        x > y ? h++ : a++;
        if (state.tournament.sport !== 'VOLLEYBALL') {
          const hi = Math.max(x, y), lo = Math.min(x, y);
          const usual = (hi === 6 && lo <= 4) || (hi === 7 && (lo === 5 || lo === 6)) || (hi >= 10 && hi - lo >= 2 && sets.length === 3);
          if (!usual) warnings.push(`Unusual set score ${x}-${y}.`);
        }
      }
      if (h === a) return { ok: false, error: 'Sets are level; this sport needs a winner.' };
      const need = Math.ceil((cat.format.bestOf || 3) / 2);
      if (Math.max(h, a) !== need) warnings.push(`Best of ${cat.format.bestOf}: the winner usually takes ${need} sets.`);
      return { ok: true, warnings };
    }
    if (!(result.home >= 0 && result.away >= 0)) return { ok: false, error: 'Enter both scores.' };
    const ph = findPhase(cat, game.phaseId);
    if (result.home === result.away && (!sp.ties || ph.type !== 'GROUPS')) return { ok: false, error: ph.type !== 'GROUPS' ? 'Knockout games need a winner.' : 'This sport does not allow draws.' };
    return { ok: true, warnings };
  }
  function gameNumbers(state, cat, g) {
    const sp = SPORTS[state.tournament.sport], r = g.result;
    if (!r || g.status === 'SCHEDULED' || g.status === 'CANCELLED') return null;
    if (g.status === 'FORFEIT') {
      const homeLoses = r.forfeitBy === 'home';
      if (sp.sets) {
        const need = Math.ceil((cat.format.bestOf || 3) / 2), fs = sp.forfeitSet;
        const w = { s: need, p: fs[0] * need }, l = { s: 0, p: fs[1] * need };
        return homeLoses ? { hs: l.s, as: w.s, hp: l.p, ap: w.p, winner: 'away' } : { hs: w.s, as: l.s, hp: w.p, ap: l.p, winner: 'home' };
      }
      const f = sp.forfeit;
      return homeLoses ? { hs: 0, as: 0, hp: f.away, ap: f.home, winner: 'away' } : { hs: 0, as: 0, hp: f.home, ap: f.away, winner: 'home' };
    }
    if (g.americano) return { hs: 0, as: 0, hp: r.home, ap: r.away, winner: r.home > r.away ? 'home' : r.away > r.home ? 'away' : null };
    if (sp.sets) {
      let hs = 0, as = 0, hp = 0, ap = 0;
      for (const [x, y] of r.sets || []) { if (x == null || y == null || x === '' || y === '') continue; hp += +x; ap += +y; x > y ? hs++ : as++; }
      return { hs, as, hp, ap, winner: hs > as ? 'home' : as > hs ? 'away' : null };
    }
    return { hs: 0, as: 0, hp: r.home, ap: r.away, winner: r.home > r.away ? 'home' : r.away > r.home ? 'away' : null };
  }

  // ---------- source resolution ----------
  function resolve(state, cat, src) {
    if (!src) return null;
    if (src.t === 'team') return src.id;
    if (src.t === 'slot') { const p = findPhase(cat, src.phase); const e = p && p.entrants.find((x) => x.id === src.id); return e ? e.participant : null; }
    if (src.t === 'dep') {
      const g = cat.games.find((x) => x.number === src.game);
      if (!g || !isNeeded(state, cat, g)) return null;
      const n = gameNumbers(state, cat, g);
      if (!n || !n.winner) return null;
      const h = resolve(state, cat, g.home), a = resolve(state, cat, g.away);
      return src.res === 'W' ? (n.winner === 'home' ? h : a) : n.winner === 'home' ? a : h;
    }
    return null;
  }
  function entrantLabel(cat, phase, e) {
    if (e.participant) return participantName(cat, phase, e.participant);
    if (DYNAMIC.has(phase.config.distribution) && phase.type === 'GROUPS') {
      const pool = phase.pools.find((q) => q.ids.includes(e.id));
      return pool ? `${pool.name} · place ${pool.ids.indexOf(e.id) + 1}` : e.label;
    }
    return e.label;
  }
  function sourceLabel(state, cat, src) {
    if (!src) return 'TBD';
    if (src.t === 'team') return teamName(cat, src.id);
    if (src.t === 'pair') return src.players.map((p) => playerName(cat, p)).join(' / ');
    if (src.t === 'slot') { const p = findPhase(cat, src.phase); const e = p && p.entrants.find((x) => x.id === src.id); return e ? entrantLabel(cat, p, e) : 'TBD'; }
    const id = resolve(state, cat, src);
    if (id) return teamName(cat, id);
    if (src.t === 'dep') return `${src.res === 'W' ? 'Winner' : 'Loser'} of ${src.game}`;
    return 'TBD';
  }
  function isNeeded(state, cat, g) {
    if (!g.conditional) return true;
    const gf = cat.games.find((x) => x.number === g.conditional);
    const n = gf && gameNumbers(state, cat, gf);
    if (!n) return true;
    return n.winner === 'away';
  }
  function sidesOf(state, cat, g) {
    if (g.americano) return { home: g.home.players, away: g.away.players };
    const h = resolve(state, cat, g.home), a = resolve(state, cat, g.away);
    return { home: h ? [h] : null, away: a ? [a] : null };
  }
  function isPlayable(state, cat, g) { const s = sidesOf(state, cat, g); return !!(s.home && s.away) && isNeeded(state, cat, g); }

  // ---------- lifecycle (PHASE-DESIGN §8) ----------
  function phaseStatus(state, cat, phase) {
    if (!phase.built) return 'DRAFT';
    if (phase.confirmed) return 'CONFIRMED';
    if (phase.entrants.some((e) => !e.participant)) return 'READY';
    const gs = phaseGames(cat, phase.id).filter((g) => isNeeded(state, cat, g));
    if (gs.length && gs.every((g) => g.status !== 'SCHEDULED')) return 'COMPLETE';
    return 'IN_PROGRESS';
  }
  const STATUS_LABEL = { DRAFT: 'Not set up', READY: 'Waiting for earlier phases', IN_PROGRESS: 'In progress', COMPLETE: 'Finished, to confirm', CONFIRMED: 'Confirmed' };
  // Cascade (PHASE-DESIGN §9): this phase is no longer confirmed; everything downstream goes back to placeholders
  function invalidate(state, cat, phase) {
    phase.confirmed = false; phase.snapshot = null;
    for (const d of downstreamOf(cat, phase)) {
      phaseGames(cat, d.id).forEach((g) => { g.status = 'SCHEDULED'; g.result = null; });
      d.entrants.forEach((e) => { if (!e.source.team && !e.source.player) e.participant = null; });
      if (connectorTo(cat, d.id) && connectorTo(cat, d.id).transform === 'PAIRS') cat.teams = cat.teams.filter((t) => !(t.fromAmericano && t.forPhase === d.id));
      invalidate(state, cat, d);
    }
  }
  // Fill placeholders once every source phase is confirmed
  function tryResolve(state, cat, phase) {
    const conn = connectorTo(cat, phase.id);
    if (!conn || !conn.selectors.length) return true;
    const srcs = sourcesOf(cat, phase);
    if (!srcs.length || !srcs.every((s) => s.confirmed && s.snapshot)) return false;
    const pick = (it) => { const s = findPhase(cat, it.fromPhase); return (s.snapshot[it.ranking] || [])[it.position - 1] || null; };
    let teams = phase.entrants.map((e) => (e.source.pair ? null : pick(e.source)));
    // seeds among equal places of different groups follow the cross-group ranking
    if (conn.seeding === 'BY_SOURCE_POSITION') {
      const groups = {};
      phase.entrants.forEach((e, i) => { if (e.source.star) (groups[`${e.source.fromPhase}|${e.source.position}`] = groups[`${e.source.fromPhase}|${e.source.position}`] || []).push(i); });
      Object.entries(groups).forEach(([k, idx]) => {
        const [srcId, pos] = k.split('|'); const order = findPhase(cat, srcId).snapshot[`cross:${pos}`] || [];
        const vals = idx.map((i) => teams[i]).sort((a, b) => order.indexOf(a) - order.indexOf(b));
        idx.forEach((i, j) => { teams[i] = vals[j]; });
      });
    }
    if (conn.transform === 'PAIRS') {
      cat.teams = cat.teams.filter((t) => !(t.fromAmericano && t.forPhase === phase.id));
      teams = phase.entrants.map((e) => {
        const [a, b] = e.source.pair.map(pick);
        if (!a || !b) return null;
        const t = { id: uid('team'), name: `${playerName(cat, a)} / ${playerName(cat, b)}`, players: [a, b], fromAmericano: true, forPhase: phase.id };
        cat.teams.push(t); return t.id;
      });
    }
    if (teams.some((t) => !t)) return false;
    if (phase.type === 'GROUPS' && DYNAMIC.has(phase.config.distribution)) teams = avoidRematch(state, cat, phase, teams);
    phase.entrants.forEach((e, i) => { e.participant = teams[i]; });
    return true;
  }
  // Assign incoming teams to group places so that teams who already met are kept apart
  function avoidRematch(state, cat, phase, teams) {
    const met = new Set();
    const before = new Set(cat.phases.filter((p) => p.order < phase.order).map((p) => p.id));
    cat.games.filter((g) => before.has(g.phaseId) && g.status !== 'SCHEDULED').forEach((g) => {
      const s = sidesOf(state, cat, g); if (!s.home || !s.away) return;
      for (const x of s.home) for (const y of s.away) { met.add(x + '|' + y); met.add(y + '|' + x); }
    });
    const idx = Object.fromEntries(phase.entrants.map((e, i) => [e.id, i]));
    const pos = phase.pools.map((p) => p.ids.map((id) => idx[id]));
    const assign = teams.slice();
    const cost = () => pos.reduce((s, pl) => { let c = 0; for (let i = 0; i < pl.length; i++) for (let j = i + 1; j < pl.length; j++) if (met.has(assign[pl[i]] + '|' + assign[pl[j]])) c++; return s + c; }, 0);
    let best = cost(), improved = true, guard = 0;
    while (improved && best > 0 && guard++ < 200) {
      improved = false;
      for (let a = 0; a < pos.length && !improved; a++) for (let b = a + 1; b < pos.length && !improved; b++)
        for (const i of pos[a]) { for (const j of pos[b]) {
          [assign[i], assign[j]] = [assign[j], assign[i]];
          const c = cost();
          if (c < best) { best = c; improved = true; break; }
          [assign[i], assign[j]] = [assign[j], assign[i]];
        } if (improved) break; }
    }
    phase.rematches = best;
    return assign;
  }

  // ---------- stats & rankings (PHASE-DESIGN §6) ----------
  const ZERO = () => ({ GP: 0, W: 0, T: 0, L: 0, C: 0, F: 0, PF: 0, PA: 0, SF: 0, SA: 0, PTS: 0 });
  function statsFor(state, cat, ids, games, base) {
    const f = cat.format, P = f.points;
    const rows = Object.fromEntries(ids.map((id) => [id, Object.assign({ id }, ZERO(), base && base[id] ? pickStats(base[id]) : {})]));
    for (const g of games) {
      const s = sidesOf(state, cat, g);
      if (!s.home || !s.away) continue;
      if (g.status === 'CANCELLED') { [...s.home, ...s.away].forEach((id) => { if (rows[id]) { rows[id].C++; rows[id].PTS += P.cancel; } }); continue; }
      const n = gameNumbers(state, cat, g);
      if (!n) continue;
      const apply = (side, mine, theirs) => {
        const forfeit = g.status === 'FORFEIT';
        for (const id of s[side]) {
          const r = rows[id]; if (!r) continue;
          r.GP++; r.PF += mine.p; r.PA += theirs.p; r.SF += mine.s; r.SA += theirs.s;
          const won = n.winner === side, tied = !n.winner;
          if (won) r.W++; else if (tied) r.T++; else r.L++;
          if (forfeit && !won) r.F++;
          if (g.americano) { r.PTS += mine.p; continue; }
          r.PTS += forfeit ? (won ? P.forfeitWin : P.forfeitLoss) : won ? P.win : tied ? P.tie : P.loss;
          r.PTS += P.setWin * mine.s + P.setLoss * theirs.s;
        }
      };
      apply('home', { p: n.hp, s: n.hs }, { p: n.ap, s: n.as });
      apply('away', { p: n.ap, s: n.as }, { p: n.hp, s: n.hs });
    }
    for (const r of Object.values(rows)) {
      r.PD = r.PF - r.PA; r.SD = r.SF - r.SA;
      if (f.pointsSystem === 'AWARDED') r.PTS = (f.awarded && f.awarded[r.id]) || 0;
      if (f.pointsSystem === 'NONE' && !games.some((g) => g.americano)) r.PTS = 0;
    }
    return rows;
  }
  const pickStats = (r) => { const o = {}; Object.keys(ZERO()).forEach((k) => { o[k] = r[k] || 0; }); return o; };
  // D1: inherited stats = the team's stats in the phase it was selected from (already cumulative)
  function inheritedBase(state, cat, phase, memo) {
    if (!phase.inheritPoints) return null;
    const base = {};
    for (const e of phase.entrants) {
      if (!e.participant || !e.source.fromPhase) continue;
      const src = findPhase(cat, e.source.fromPhase);
      base[e.participant] = phaseStats(state, cat, src, memo)[e.participant];
    }
    return base;
  }
  function phaseStats(state, cat, phase, memo) {
    memo = memo || {};
    if (memo[phase.id]) return memo[phase.id];
    const ids = phase.entrants.map((e) => e.participant).filter(Boolean);
    memo[phase.id] = statsFor(state, cat, ids, phaseGames(cat, phase.id), inheritedBase(state, cat, phase, memo));
    return memo[phase.id];
  }
  // ordered groups of ids; groups with >1 id are unresolved ties
  function rankIds(state, cat, ids, games, opts) {
    opts = opts || {};
    const f = cat.format;
    let tbs = f.tiebreakers.filter((t) => RULES[t.rule] && !(t.rule === 'POINTS' && f.pointsSystem === 'NONE'));
    if (opts.americano) tbs = [{ rule: 'POINTS', scope: 'O' }, { rule: 'WINS', scope: 'O' }, { rule: 'SCORE_DIFF', scope: 'O' }, { rule: 'POINTS', scope: 'H' }];
    const overall = statsFor(state, cat, ids, games, opts.base);
    const val = (rule, row) => { const R = RULES[rule], v = R.v(row); return opts.average && R.avg ? (row.GP ? v / row.GP : 0) : v; };
    const rec = (group, i) => {
      if (group.length < 2 || i >= tbs.length) return [group];
      const tb = tbs[i];
      let rows;
      if (tb.scope === 'H') {
        const set = new Set(group);
        const h2h = games.filter((g) => { const s = sidesOf(state, cat, g); return s.home && s.away && s.home.every((x) => set.has(x)) && s.away.every((x) => set.has(x)); });
        rows = statsFor(state, cat, group, h2h);
      } else rows = overall;
      const sorted = group.slice().sort((a, b) => val(tb.rule, rows[b]) - val(tb.rule, rows[a]));
      const out = []; let cur = [sorted[0]];
      for (let k = 1; k < sorted.length; k++) { if (val(tb.rule, rows[sorted[k]]) === val(tb.rule, rows[cur[0]])) cur.push(sorted[k]); else { out.push(cur); cur = [sorted[k]]; } }
      out.push(cur);
      return out.flatMap((g) => rec(g, i + 1));
    };
    return { groups: rec(ids.slice(), 0), stats: overall };
  }
  function orderGroups(groups, tieOrders, keyPrefix) {
    const out = []; let pos = 1;
    for (const g of groups) {
      const key = `${keyPrefix}:${pos}`;
      const manual = tieOrders && tieOrders[key];
      const useManual = g.length > 1 && manual && manual.length === g.length && manual.every((x) => g.includes(x));
      (useManual ? manual : g).forEach((id, i) => out.push({ id, rank: g.length > 1 && !useManual ? pos : pos + i, tied: g.length > 1 && !useManual, tieKey: g.length > 1 ? key : null, group: g }));
      pos += g.length;
    }
    return out;
  }
  // ranking(phase, id): rows [{id, rank, tied, tieKey, group, ...stats}]
  function ranking(state, cat, phase, rankingId, tieOrders, memo) {
    tieOrders = tieOrders === undefined ? phase.tieOrders : tieOrders;
    memo = memo || {};
    const games = phaseGames(cat, phase.id);
    const base = inheritedBase(state, cat, phase, memo);
    const part = (eid) => (phase.entrants.find((e) => e.id === eid) || {}).participant;
    if (phase.entrants.some((e) => !e.participant)) return [];
    if (phase.type === 'AMERICANO') {
      const { groups, stats } = rankIds(state, cat, phase.entrants.map((e) => e.participant), games, { americano: true });
      return orderGroups(groups, tieOrders, 'overall').map((r) => Object.assign(r, stats[r.id]));
    }
    if (phase.type === 'GROUPS') {
      if (rankingId.startsWith('pool:')) {
        const pool = phase.pools.find((p) => `pool:${p.number}` === rankingId); if (!pool) return [];
        const { groups, stats } = rankIds(state, cat, pool.ids.map(part), games, { base });
        return orderGroups(groups, tieOrders, rankingId).map((r) => Object.assign(r, stats[r.id]));
      }
      if (rankingId === 'overall') {
        const { groups, stats } = rankIds(state, cat, phase.entrants.map((e) => e.participant), games, { average: true, base });
        return orderGroups(groups, tieOrders, 'overall').map((r) => Object.assign(r, stats[r.id]));
      }
      if (rankingId.startsWith('cross:')) {
        const k = +rankingId.slice(6);
        const ids = phase.pools.map((p) => ranking(state, cat, phase, `pool:${p.number}`, tieOrders, memo)[k - 1]).filter(Boolean).map((r) => r.id);
        const { groups, stats } = rankIds(state, cat, ids, games, { average: true, base });
        return orderGroups(groups, tieOrders, rankingId).map((r) => Object.assign(r, stats[r.id]));
      }
      return [];
    }
    // knockout: places decided on court, then elimination round, then phase tiebreakers, then seed (D2)
    const place = {};
    games.slice().sort((a, b) => a.number - b.number).forEach((g) => {
      if (!isNeeded(state, cat, g)) return;
      const n = gameNumbers(state, cat, g); if (!n || !n.winner) return;
      const h = resolve(state, cat, g.home), a = resolve(state, cat, g.away);
      const win = n.winner === 'home' ? h : a, lose = n.winner === 'home' ? a : h;
      if (g.loserRange) place[lose] = g.loserRange;
      if (g.winnerPlace) place[win] = [g.winnerPlace, g.winnerPlace];
    });
    const seed = Object.fromEntries(phase.entrants.map((e, i) => [e.participant, i]));
    const ids = phase.entrants.map((e) => e.participant);
    const unplaced = ids.filter((id) => !place[id]);
    const buckets = {};
    ids.filter((id) => place[id]).forEach((id) => { (buckets[place[id][0]] = buckets[place[id][0]] || []).push(id); });
    const stats = statsFor(state, cat, ids, games, base);
    const out = []; let pos = 1;
    Object.keys(buckets).map(Number).sort((a, b) => a - b).forEach((lo) => {
      const { groups } = rankIds(state, cat, buckets[lo], games, { base });
      const ordered = groups.flatMap((g) => g.slice().sort((x, y) => seed[x] - seed[y]));
      ordered.forEach((id) => out.push(Object.assign({ id, rank: pos++, tied: false, tieKey: null, group: [id] }, stats[id])));
    });
    unplaced.sort((x, y) => seed[x] - seed[y]).forEach((id) => out.push(Object.assign({ id, rank: pos++, tied: false, tieKey: null, group: [id], pending: true }, stats[id])));
    return out;
  }
  // rankings and positions that decide something (downstream selectors, or all places of a terminal phase)
  function usedRankings(cat, phase) {
    const out = {};
    const add = (id, positions) => { out[id] = [...new Set([...(out[id] || []), ...positions])]; };
    const outs = cat.connectors.filter((c) => c.selectors.some((s) => s.fromPhase === phase.id));
    for (const c of outs) for (const s of c.selectors) {
      if (s.fromPhase !== phase.id) continue;
      if (s.ranking === 'pool:*') { phase.pools.forEach((p) => add(`pool:${p.number}`, s.positions)); if (c.seeding === 'BY_SOURCE_POSITION') s.positions.forEach((k) => add(`cross:${k}`, phase.pools.map((_, i) => i + 1))); }
      else add(s.ranking, s.positions);
      if (s.ranking.startsWith('cross:')) { const k = +s.ranking.slice(6); phase.pools.forEach((p) => add(`pool:${p.number}`, [k])); }
    }
    if (!outs.length) {
      if (phase.type === 'GROUPS') phase.pools.forEach((p) => add(`pool:${p.number}`, p.ids.map((_, i) => i + 1)));
      else add(phase.type === 'AMERICANO' ? 'overall' : 'final', phase.entrants.map((_, i) => i + 1));
    }
    return out;
  }
  function relevantTies(state, cat, phase, ignoreManual) {
    const tieOrders = ignoreManual ? {} : phase.tieOrders;
    const ties = [], seen = new Set();
    const used = usedRankings(cat, phase);
    // groups first: cross rankings depend on them
    const ids = Object.keys(used).sort((a, b) => (a.startsWith('pool:') ? 0 : 1) - (b.startsWith('pool:') ? 0 : 1));
    for (const rid of ids) {
      const rows = ranking(state, cat, phase, rid, tieOrders);
      const def = rankingCatalog(cat, phase).find((r) => r.id === rid);
      for (const r of rows) {
        if (!r.tied || seen.has(r.tieKey)) continue;
        if (!used[rid].some((k) => k >= r.rank && k < r.rank + r.group.length)) continue;
        seen.add(r.tieKey);
        ties.push({ key: r.tieKey, title: `Tied for ${ordinal(r.rank)} · ${def ? def.label : rid}`, ids: r.group.slice() });
      }
    }
    return ties;
  }
  function confirmPhase(state, cat, phase) {
    const status = phaseStatus(state, cat, phase);
    if (status === 'READY') return { error: 'This phase has not started: earlier phases must be confirmed first.' };
    if (status !== 'COMPLETE' && status !== 'CONFIRMED') return { error: 'Every game in this phase needs a result first. Cancel or forfeit games that will not be played.' };
    const open = relevantTies(state, cat, phase).filter((t) => !phase.tieOrders[t.key]);
    if (open.length) return { error: 'Order the tied teams first.', ties: open };
    const memo = {};
    phase.snapshot = Object.fromEntries(rankingCatalog(cat, phase).filter((r) => r.id !== 'pool:*').map((r) => [r.id, ranking(state, cat, phase, r.id, phase.tieOrders, memo).map((x) => x.id)]));
    phase.confirmed = true;
    downstreamOf(cat, phase).forEach((d) => tryResolve(state, cat, d));
    return { ok: true };
  }
  function unconfirmPhase(state, cat, phase) { invalidate(state, cat, phase); }

  // ---------- results & resets ----------
  function renumber(cat) {
    const map = {};
    const order = Object.fromEntries(cat.phases.map((p) => [p.id, p.order]));
    cat.games.sort((a, b) => (order[a.phaseId] || 0) - (order[b.phaseId] || 0) || a.number - b.number);
    cat.games.forEach((g, i) => { map[g.number] = i + 1; });
    const fix = (s) => (s && s.t === 'dep' && map[s.game] ? Object.assign({}, s, { game: map[s.game] }) : s);
    cat.games.forEach((g) => { g.home = fix(g.home); g.away = fix(g.away); if (g.conditional) g.conditional = map[g.conditional]; g.number = map[g.number]; });
    cat.phases.forEach((p) => (p.config.consolations || []).forEach((c) => { c.home = fix(c.home); c.away = fix(c.away); }));
    cat.nextGame = cat.games.length + 1;
  }
  function recordResult(state, cat, game, result) {
    const v = validateResult(state, cat, game, result);
    if (!v.ok) return v;
    if (!isPlayable(state, cat, game)) return { ok: false, error: 'This game cannot be played yet.' };
    const phase = findPhase(cat, game.phaseId);
    const reset = phase.confirmed || downstreamOf(cat, phase).some((d) => d.entrants.some((e) => e.participant && e.source.fromPhase));
    invalidate(state, cat, phase);
    if (game.result) clearDependents(state, cat, game.number);
    game.status = result.status || 'FINAL';
    game.result = clone(result);
    onGameFinished(state, cat, game);
    return { ok: true, warnings: v.warnings, reset };
  }
  function clearDependents(state, cat, number) {
    for (const g of cat.games) {
      const dep = [g.home, g.away].some((s) => s && s.t === 'dep' && s.game === number) || g.conditional === number;
      if (dep && g.result) { g.result = null; g.status = 'SCHEDULED'; clearDependents(state, cat, g.number); }
    }
  }
  function clearResult(state, cat, game) {
    clearDependents(state, cat, game.number);
    invalidate(state, cat, findPhase(cat, game.phaseId));
    game.result = null; game.status = 'SCHEDULED';
  }
  // teams or players changed: root phases rebuild, the rest follows
  function participantsChanged(state, cat) { sortedPhases(cat).filter((p) => isRoot(cat, p)).forEach((p) => rebuildPhase(state, cat, p)); }

  // ---------- scheduling (SPEC §8) ----------
  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const toHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  function allSpaces(state) { return state.venues.flatMap((v) => v.spaces.map((s) => Object.assign({ venue: v.name }, s))); }
  function gameLengthFor(state, cat, phase) { return phase.config.gameLength || SPORTS[state.tournament.sport].gameLength; }
  function participantsKnown(state, cat, g) {
    if (g.americano) return [...g.home.players, ...g.away.players];
    const p = findPhase(cat, g.phaseId);
    return [g.home, g.away].filter((s) => s && s.t === 'slot' && p && isRoot(cat, p)).map((s) => resolve(state, cat, s)).filter(Boolean);
  }
  function orderedGames(state) {
    const out = [];
    const maxOrder = Math.max(0, ...state.categories.flatMap((c) => c.phases.map((p) => p.order)));
    for (let o = 1; o <= maxOrder; o++) {
      const lists = state.categories.map((c) => { const p = c.phases.find((x) => x.order === o); return p ? phaseGames(c, p.id).map((g) => ({ c, p, g })) : []; });
      const m = Math.max(0, ...lists.map((l) => l.length));
      for (let i = 0; i < m; i++) lists.forEach((l) => l[i] && out.push(l[i]));
    }
    return out;
  }
  function generateFixedSchedule(state) {
    const rest = +state.tournament.restMinutes || 0;
    const sched = state.schedule; sched.assignments = {}; sched.unplaced = [];
    const blocks = sched.blocks.slice().sort((a, b) => (a.day + a.start).localeCompare(b.day + b.start));
    const cursor = {}, endAt = {}, teamFree = {}, phaseEnd = {};
    const abs = (day, min) => Date.parse(day + 'T00:00:00Z') / 60000 + min;
    const spaces = allSpaces(state);
    for (const { c, p, g } of orderedGames(state)) {
      const len = gameLengthFor(state, c, p);
      let earliest = -Infinity;
      // D4: a phase starts after all its source phases have ended
      sourcesOf(c, p).forEach((s) => { if (phaseEnd[s.id] != null) earliest = Math.max(earliest, phaseEnd[s.id] + rest); });
      for (const s of [g.home, g.away]) if (s && s.t === 'dep') { const dg = c.games.find((x) => x.number === s.game); if (dg && endAt[dg.id] != null) earliest = Math.max(earliest, endAt[dg.id] + rest); }
      if (g.conditional) { const gf = c.games.find((x) => x.number === g.conditional); if (gf && endAt[gf.id] != null) earliest = Math.max(earliest, endAt[gf.id] + rest); }
      participantsKnown(state, c, g).forEach((x) => { if (teamFree[x] != null) earliest = Math.max(earliest, teamFree[x]); });
      let best = null;
      for (const b of blocks) {
        for (const sid of b.spaceIds) {
          const space = spaces.find((s) => s.id === sid);
          if (!space || (space.categoryIds && space.categoryIds.length && !space.categoryIds.includes(c.id))) continue;
          const k = b.id + ':' + sid;
          const free = cursor[k] != null ? cursor[k] : toMin(b.start);
          const start = Math.max(free, earliest - abs(b.day, 0));
          if (start + len <= toMin(b.end)) { const a = abs(b.day, start); if (!best || a < best.a) best = { a, b, sid, start, k }; }
        }
        if (best) break;
      }
      if (!best) { sched.unplaced.push(g.id); continue; }
      cursor[best.k] = best.start + len;
      endAt[g.id] = best.a + len;
      phaseEnd[p.id] = Math.max(phaseEnd[p.id] || -Infinity, best.a + len);
      participantsKnown(state, c, g).forEach((x) => { teamFree[x] = best.a + len + rest; });
      sched.assignments[g.id] = { spaceId: best.sid, day: best.b.day, start: toHHMM(best.start), end: toHHMM(best.start + len) };
    }
    return { placed: Object.keys(sched.assignments).length, unplaced: sched.unplaced.length };
  }
  function buildQueue(state) { state.schedule.queue = orderedGames(state).filter(({ g }) => g.status === 'SCHEDULED').map(({ g }) => g.id); }
  function findGame(state, gameId) { for (const c of state.categories) { const g = c.games.find((x) => x.id === gameId); if (g) return { cat: c, game: g }; } return null; }
  function onCourt(state) { return new Set(Object.values(state.schedule.courts).filter(Boolean)); }
  function sidesFlat(state, cat, g) { const s = sidesOf(state, cat, g); return [...(s.home || []), ...(s.away || [])]; }
  function fillCourts(state, now) {
    const s = state.schedule;
    if (!s.auto) return [];
    now = now || Date.now();
    const rest = (+state.tournament.restMinutes || 0) * 60000;
    const busy = new Set();
    onCourt(state).forEach((gid) => { const f = findGame(state, gid); if (f) sidesFlat(state, f.cat, f.game).forEach((p) => busy.add(p)); });
    const assigned = [];
    for (const sid of Object.keys(s.courts)) {
      if (s.courts[sid]) continue;
      const pick = s.queue.find((gid) => {
        if (onCourt(state).has(gid)) return false;
        const f = findGame(state, gid); if (!f || f.game.status !== 'SCHEDULED' || !isPlayable(state, f.cat, f.game)) return false;
        return sidesFlat(state, f.cat, f.game).every((p) => !busy.has(p) && !(s.lastFinished[p] && now - s.lastFinished[p] < rest));
      });
      if (pick) { s.courts[sid] = pick; assigned.push(pick); const f = findGame(state, pick); sidesFlat(state, f.cat, f.game).forEach((p) => busy.add(p)); f.game.startedAt = now; }
    }
    return assigned;
  }
  function onGameFinished(state, cat, game) {
    const s = state.schedule;
    s.queue = s.queue.filter((id) => id !== game.id);
    for (const sid of Object.keys(s.courts)) if (s.courts[sid] === game.id) s.courts[sid] = null;
    const now = Date.now();
    sidesFlat(state, cat, game).forEach((p) => { s.lastFinished[p] = now; });
    if (state.tournament.scheduling === 'QUEUE') fillCourts(state, now);
  }
  function dropFromSchedule(state, gameId) {
    const s = state.schedule;
    delete s.assignments[gameId];
    s.queue = s.queue.filter((id) => id !== gameId);
    for (const sid of Object.keys(s.courts)) if (s.courts[sid] === gameId) s.courts[sid] = null;
  }

  // ---------- demo helpers ----------
  function randomResult(state, cat, g, rand) {
    const sp = SPORTS[state.tournament.sport];
    rand = rand || Math.random;
    if (g.americano) { const t = cat.format.americano.target; const h = Math.floor(rand() * (t + 1)); return { status: 'FINAL', home: h, away: t - h }; }
    if (sp.sets) {
      const need = Math.ceil((cat.format.bestOf || 3) / 2), sets = []; let h = 0, a = 0;
      while (h < need && a < need) {
        const homeWins = rand() < 0.5;
        const lo = state.tournament.sport === 'VOLLEYBALL' ? 12 + Math.floor(rand() * 11) : Math.floor(rand() * 5);
        const hi = state.tournament.sport === 'VOLLEYBALL' ? 25 : 6;
        sets.push(homeWins ? [hi, lo] : [lo, hi]); homeWins ? h++ : a++;
      }
      return { status: 'FINAL', sets };
    }
    const ph = findPhase(cat, g.phaseId);
    let h = Math.floor(rand() * 4), a = Math.floor(rand() * 4);
    if (h === a && (!sp.ties || ph.type !== 'GROUPS')) h++;
    return { status: 'FINAL', home: h, away: a };
  }
  function simulatePhase(state, cat, phase, rand) {
    let n = 0;
    for (const g of phaseGames(cat, phase.id).sort((a, b) => a.number - b.number)) {
      if (g.status !== 'SCHEDULED' || !isPlayable(state, cat, g)) continue;
      recordResult(state, cat, g, randomResult(state, cat, g, rand)); n++;
    }
    if (n && phase.type !== 'GROUPS' && phase.type !== 'AMERICANO') n += simulatePhase(state, cat, phase, rand);
    return n;
  }

  const TE = {
    SPORTS, PHASE_TYPES, DISTRIBUTIONS, TEMPLATES, RULES, COLUMNS, DEFAULT_TIEBREAKERS, STATUS_LABEL,
    templatesFor, rulesFor, defaultRules, uid, clone, ordinal, letter, parsePositions, formatPositions,
    newState, newCategory, findCat, findPhase, phaseGames, sortedPhases, connectorTo, sourcesOf, downstreamOf, isRoot,
    teamName, playerName, participantName, seededTeams, snakePools, circleRounds, poolPairs, seedOrder, americanoSchedule,
    addPhase, removePhase, setConnector, updatePhase, applyTemplate, rebuildPhase, rebuildAll, participantsChanged,
    moveEntrant, movePoolEntrant, expandConnector, rankingCatalog, validateGraph,
    phaseStatus, ranking, relevantTies, confirmPhase, unconfirmPhase, statsFor, rankIds, phaseStats,
    validateResult, gameNumbers, recordResult, clearResult, resolve, sourceLabel, entrantLabel, isNeeded, isPlayable, sidesOf,
    allSpaces, gameLengthFor, generateFixedSchedule, buildQueue, fillCourts, findGame,
    randomResult, simulatePhase,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = TE; else root.TE = TE;
})(typeof window !== 'undefined' ? window : globalThis);
