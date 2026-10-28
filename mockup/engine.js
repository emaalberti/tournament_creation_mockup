/* Tournament engine – pure logic, no DOM. See tourny-analysis/SPEC.md.
   Exposed as window.TE (browser) or module.exports (node). */
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

  // ---------- sports (SPEC §3) ----------
  const SPORTS = {
    FOOTBALL: { label: 'Football', space: ['field', 'fields'], ties: true, sets: false, unit: ['goal', 'goals'], points: { win: 3, tie: 1, loss: 0 }, forfeit: { home: 3, away: 0 }, rest: 30, gameLength: 40, players: false, americano: false, scheduling: 'FIXED' },
    FUTSAL: { label: 'Futsal', space: ['court', 'courts'], ties: true, sets: false, unit: ['goal', 'goals'], points: { win: 3, tie: 1, loss: 0 }, forfeit: { home: 3, away: 0 }, rest: 15, gameLength: 30, players: false, americano: false, scheduling: 'FIXED' },
    VOLLEYBALL: { label: 'Volleyball', space: ['court', 'courts'], ties: false, sets: true, bestOf: 3, unit: ['point', 'points'], points: { win: 2, tie: 0, loss: 0 }, forfeitSet: [25, 0], rest: 15, gameLength: 60, players: false, americano: false, scheduling: 'FIXED' },
    TENNIS: { label: 'Tennis', space: ['court', 'courts'], ties: false, sets: true, bestOf: 3, unit: ['game', 'games'], points: { win: 1, tie: 0, loss: 0 }, forfeitSet: [6, 0], rest: 15, gameLength: 90, players: true, americano: true, scheduling: 'FIXED' },
    PADEL: { label: 'Padel', space: ['court', 'courts'], ties: false, sets: true, bestOf: 3, unit: ['game', 'games'], points: { win: 1, tie: 0, loss: 0 }, forfeitSet: [6, 0], rest: 15, gameLength: 60, players: true, americano: true, scheduling: 'QUEUE' },
  };

  // ---------- format templates (SPEC §4) ----------
  const TEMPLATES = [
    { id: 'RR_SE', name: 'Round Robin to Single Elimination', recommended: true, desc: 'Teams compete in pools, then are placed into brackets where they are eliminated after losing one game.', rounds: [{ name: 'Pool Play', type: 'RR' }, { name: 'Playoffs', type: 'SE' }] },
    { id: 'RR_DE', name: 'Round Robin to Double Elimination', desc: 'Teams compete in pools, then are placed into brackets where they are eliminated after losing two games.', rounds: [{ name: 'Pool Play', type: 'RR' }, { name: 'Playoffs', type: 'DE' }] },
    { id: 'RR', name: 'Round Robin', desc: 'Teams compete in pools and are ranked based on the results.', rounds: [{ name: 'Pool Play', type: 'RR' }] },
    { id: 'SE', name: 'Single Elimination', desc: 'Teams are placed into a bracket and are eliminated after losing one game.', rounds: [{ name: 'Bracket', type: 'SE' }] },
    { id: 'DE', name: 'Double Elimination', desc: 'Teams are placed into a bracket and are eliminated after losing two games.', rounds: [{ name: 'Bracket', type: 'DE' }] },
    { id: 'AM', name: 'Americano', americano: true, desc: 'Players rotate partners every round. Each player scores the points their side wins.', rounds: [{ name: 'Americano', type: 'AM' }] },
    { id: 'AM_SE', name: 'Americano to Single Elimination', americano: true, desc: 'Americano rounds, then the top players form pairs (1st + last qualifier, …) and play a knockout.', rounds: [{ name: 'Americano', type: 'AM' }, { name: 'Playoffs', type: 'SE' }] },
  ];
  const templatesFor = (sport) => TEMPLATES.filter((t) => !t.americano || SPORTS[sport].americano);
  const isBracketType = (t) => t === 'SE' || t === 'DE';

  // ---------- tiebreakers (SPEC §5.4) ----------
  // value(s) gets a stats row; higher is better.
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
  function defaultFormat(sport, templateId) {
    const sp = SPORTS[sport];
    return {
      templateId,
      pointsSystem: 'POINTS', // POINTS | AWARDED | NONE
      points: { win: sp.points.win, tie: sp.points.tie, loss: sp.points.loss, cancel: 0, forfeitWin: sp.points.win, forfeitLoss: sp.points.loss, setWin: 0, setLoss: 0 },
      tiebreakers: DEFAULT_TIEBREAKERS[sport].map(([rule, scope]) => ({ rule, scope })),
      columns: sp.sets ? ['GP', 'W', 'L', 'SF', 'SA', 'SD', 'PD', 'PTS'] : ['GP', 'W', 'T', 'L', 'PF', 'PA', 'PD', 'PTS'],
      bestOf: sp.bestOf || null,
      flights: 1,
      americano: { target: 24, rounds: null, playoffPlayers: 4 },
    };
  }

  // ---------- state ----------
  function newState(sport, name) {
    const sp = SPORTS[sport];
    return {
      version: 1,
      tournament: { name: name || 'New tournament', sport, status: 'DRAFT', restMinutes: sp.rest, scheduling: sp.scheduling },
      categories: [newCategory('Open')],
      venues: [],
      schedule: { blocks: [], assignments: {}, unplaced: [], queue: [], courts: {}, auto: true, lastFinished: {} },
    };
  }
  function newCategory(name) {
    return { id: uid('cat'), name, format: null, teams: [], players: [], rounds: [], games: [], nextGame: 1 };
  }
  const findCat = (st, id) => st.categories.find((c) => c.id === id);
  const roundGames = (cat, roundId) => cat.games.filter((g) => g.roundId === roundId);
  const teamName = (cat, id) => { const t = cat.teams.find((x) => x.id === id); return t ? t.name : '?'; };
  const playerName = (cat, id) => { const p = cat.players.find((x) => x.id === id); return p ? p.name : '?'; };

  // ---------- format application (SPEC §4) ----------
  function applyFormat(state, cat, templateId, flights) {
    const tpl = TEMPLATES.find((t) => t.id === templateId);
    const prev = cat.format;
    cat.format = Object.assign(defaultFormat(state.tournament.sport, templateId), prev && prev.templateId ? { pointsSystem: prev.pointsSystem, points: prev.points, tiebreakers: prev.tiebreakers, columns: prev.columns, bestOf: prev.bestOf, americano: prev.americano } : {});
    cat.format.templateId = templateId;
    cat.format.flights = Math.max(1, Math.min(5, flights || 1));
    cat.games = []; cat.nextGame = 1;
    cat.rounds = [];
    let number = 1;
    tpl.rounds.forEach((r, idx) => {
      const isPlayoff = idx > 0 && isBracketType(r.type);
      const copies = isPlayoff && !tpl.americano ? cat.format.flights : 1;
      for (let i = 0; i < copies; i++) {
        cat.rounds.push({
          id: uid('rnd'), number: number++, type: r.type,
          name: copies > 1 ? `${letter(i)} Flight` : r.name,
          fromRoundId: idx > 0 ? cat.rounds.find((x) => x.number === 1).id : null,
          config: defaultRoundConfig(r.type), built: false,
        });
      }
    });
    clearScheduleFor(state, cat);
  }
  function defaultRoundConfig(type) {
    switch (type) {
      case 'RR': return { pools: [], gamesMode: 'ALL', gamesPerTeam: 3, crossovers: [], advancement: null };
      case 'SE': return { entrants: [], placements: [1], consolations: [] };
      case 'DE': return { entrants: [], trueDouble: true };
      case 'AM': return { advancement: null };
      default: return {};
    }
  }

  // ---------- pools & round robin (SPEC §6.1) ----------
  function seededTeams(cat) {
    return cat.teams.map((t, i) => ({ t, i })).sort((a, b) => (a.t.seed || 1e9) - (b.t.seed || 1e9) || a.i - b.i).map((x) => x.t.id);
  }
  function snakePools(teamIds, n) {
    const pools = Array.from({ length: n }, (_, i) => ({ number: i + 1, name: `Pool ${letter(i)}`, teamIds: [] }));
    teamIds.forEach((id, i) => {
      const lap = Math.floor(i / n), pos = i % n;
      pools[lap % 2 === 0 ? pos : n - 1 - pos].teamIds.push(id);
    });
    return pools;
  }
  // circle (Berger) method; returns rounds of pairs [a,b]
  function circleRounds(ids) {
    const list = ids.slice();
    if (list.length % 2) list.push(null);
    const n = list.length, rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      for (let i = 0; i < n / 2; i++) {
        const a = list[i], b = list[n - 1 - i];
        if (a !== null && b !== null) pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
      }
      rounds.push(pairs);
      list.splice(1, 0, list.pop());
    }
    return rounds;
  }
  // pairs so each team plays k games (or all once). Extra games for odd counts.
  function poolPairs(ids, mode, k) {
    const base = circleRounds(ids);
    if (mode === 'ALL') return base;
    const out = [], count = Object.fromEntries(ids.map((i) => [i, 0]));
    let lap = 0;
    while (ids.some((i) => count[i] < k) && lap < 40) {
      for (const round of base) {
        const pr = [];
        for (const [a, b] of round) {
          if (count[a] < k && count[b] < k) { pr.push(lap % 2 ? [b, a] : [a, b]); count[a]++; count[b]++; }
        }
        if (pr.length) out.push(pr);
        if (!ids.some((i) => count[i] < k)) break;
      }
      lap++;
      if (lap > 0 && ids.filter((i) => count[i] < k).length === 1) {
        // odd case: one team short -> extra game vs the team with fewest games (warning shown in UI)
        const short = ids.find((i) => count[i] < k);
        const opp = ids.filter((i) => i !== short).sort((a, b) => count[a] - count[b])[0];
        out.push([[short, opp]]); count[short]++; count[opp]++;
      }
    }
    return out;
  }
  function crossPairs(a, b) {
    const rounds = [];
    const m = Math.max(a.length, b.length);
    for (let r = 0; r < m; r++) {
      const pr = [];
      for (let i = 0; i < a.length; i++) { const j = (i + r) % m; if (j < b.length) pr.push(r % 2 ? [b[j], a[i]] : [a[i], b[j]]); }
      rounds.push(pr);
    }
    return rounds;
  }
  function generatePoolGames(state, cat, round) {
    const cfg = round.config;
    removeRoundGamesAndAfter(state, cat, round);
    const crossed = new Set(cfg.crossovers.flat());
    const perPool = [];
    cfg.pools.forEach((p) => {
      if (crossed.has(p.number)) return;
      perPool.push(poolPairs(p.teamIds, cfg.gamesMode, cfg.gamesPerTeam).map((rd) => rd.map((pr) => ({ pr, pool: p.number }))));
    });
    cfg.crossovers.forEach(([x, y]) => {
      const a = cfg.pools.find((p) => p.number === x), b = cfg.pools.find((p) => p.number === y);
      if (!a || !b) return;
      let rds = crossPairs(a.teamIds, b.teamIds);
      if (cfg.gamesMode === 'N') rds = rds.slice(0, cfg.gamesPerTeam);
      perPool.push(rds.map((rd) => rd.map((pr) => ({ pr, pool: x }))));
    });
    // interleave: round 1 of every pool, then round 2…
    const maxR = Math.max(0, ...perPool.map((p) => p.length));
    for (let r = 0; r < maxR; r++) {
      perPool.forEach((p) => (p[r] || []).forEach(({ pr, pool }) => addGame(cat, round, { home: { t: 'team', id: pr[0] }, away: { t: 'team', id: pr[1] }, pool, label: cat.format && round.config.pools.length > 1 ? round.config.pools.find((q) => q.number === pool).name : round.name, matchday: r + 1 })));
    }
    round.built = true;
  }
  function addGame(cat, round, g) {
    const game = Object.assign({ id: uid('g'), number: cat.nextGame++, roundId: round.id, status: 'SCHEDULED', result: null }, g);
    cat.games.push(game);
    return game;
  }

  // ---------- results ----------
  // result: { home, away } (non-set) or { sets:[[h,a],…] } ; status FINAL|FORFEIT|CANCELLED
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
    const r = cat.rounds.find((x) => x.id === game.roundId);
    if (result.home === result.away && (!sp.ties || r.type !== 'RR')) return { ok: false, error: r.type !== 'RR' ? 'Knockout games need a winner.' : 'This sport does not allow draws.' };
    return { ok: true, warnings };
  }
  // normalised numbers for a game from a side's perspective
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
  // source kinds: team {t:'team',id} | slot {t:'slot', round, key} | dep {t:'dep', game, res:'W'|'L'} | pair {t:'pair', players:[a,b]} | bye
  function resolve(state, cat, src) {
    if (!src) return null;
    if (src.t === 'team') return src.id;
    if (src.t === 'slot') {
      const r = cat.rounds.find((x) => x.id === src.round);
      const adv = r && r.config.advancement;
      return adv && adv.confirmed ? adv.resolved[src.key] || null : null;
    }
    if (src.t === 'dep') {
      const g = cat.games.find((x) => x.number === src.game);
      if (!g || !isNeeded(state, cat, g)) return null;
      const n = gameNumbers(state, cat, g);
      if (!n || !n.winner) return null;
      const h = resolve(state, cat, g.home), a = resolve(state, cat, g.away);
      const win = n.winner === 'home' ? h : a, lose = n.winner === 'home' ? a : h;
      return src.res === 'W' ? win : lose;
    }
    return null;
  }
  function sourceLabel(state, cat, src) {
    if (!src) return 'TBD';
    if (src.t === 'team') return teamName(cat, src.id);
    if (src.t === 'pair') return src.players.map((p) => playerName(cat, p)).join(' / ');
    const id = resolve(state, cat, src);
    if (id) return teamName(cat, id);
    if (src.t === 'slot') return src.label;
    if (src.t === 'dep') return `${src.res === 'W' ? 'Winner' : 'Loser'} of ${src.game}`;
    return 'TBD';
  }
  // DE reset game is only played if the lower-bracket finalist wins the grand final
  function isNeeded(state, cat, g) {
    if (!g.conditional) return true;
    const gf = cat.games.find((x) => x.number === g.conditional);
    const n = gf && gameNumbers(state, cat, gf);
    if (!n) return true; // unknown yet
    return n.winner === 'away';
  }
  function sidesOf(state, cat, g) {
    if (g.americano) return { home: g.home.players, away: g.away.players };
    const h = resolve(state, cat, g.home), a = resolve(state, cat, g.away);
    return { home: h ? [h] : null, away: a ? [a] : null };
  }
  function isPlayable(state, cat, g) {
    const s = sidesOf(state, cat, g);
    return !!(s.home && s.away) && isNeeded(state, cat, g);
  }

  // ---------- standings (SPEC §5) ----------
  function statsFor(state, cat, ids, games) {
    const f = cat.format, P = f.points;
    const rows = Object.fromEntries(ids.map((id) => [id, { id, GP: 0, W: 0, T: 0, L: 0, C: 0, F: 0, PF: 0, PA: 0, SF: 0, SA: 0, PTS: 0, awarded: 0 }]));
    for (const g of games) {
      const s = sidesOf(state, cat, g);
      if (!s.home || !s.away) continue;
      if (g.status === 'CANCELLED') {
        [...s.home, ...s.away].forEach((id) => { if (rows[id]) { rows[id].C++; rows[id].PTS += P.cancel; } });
        continue;
      }
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
      if (f.pointsSystem === 'NONE' && !cat.format.templateId.startsWith('AM')) r.PTS = 0;
    }
    return rows;
  }
  // Returns ordered groups: [[id], [id,id] (unresolved tie), …]
  function rankIds(state, cat, ids, games, opts) {
    const f = cat.format;
    let tbs = f.tiebreakers.filter((t) => RULES[t.rule] && !(t.rule === 'POINTS' && f.pointsSystem === 'NONE'));
    if (opts && opts.americano) tbs = [{ rule: 'POINTS', scope: 'O' }, { rule: 'WINS', scope: 'O' }, { rule: 'SCORE_DIFF', scope: 'O' }, { rule: 'POINTS', scope: 'H' }];
    const avg = opts && opts.average;
    const overall = statsFor(state, cat, ids, games);
    const val = (rule, row) => {
      const R = RULES[rule], v = R.v(row);
      return avg && R.avg ? (row.GP ? v / row.GP : 0) : v;
    };
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
      for (let k = 1; k < sorted.length; k++) {
        if (val(tb.rule, rows[sorted[k]]) === val(tb.rule, rows[cur[0]])) cur.push(sorted[k]); else { out.push(cur); cur = [sorted[k]]; }
      }
      out.push(cur);
      return out.flatMap((g) => rec(g, i + 1));
    };
    return { groups: rec(ids.slice(), 0), stats: overall };
  }
  // flatten groups with manual tie orders; returns rows [{id, rank, tied}]
  function orderGroups(groups, tieOrders, keyPrefix) {
    const out = []; let pos = 1;
    for (const g of groups) {
      const key = `${keyPrefix}:${pos}`;
      let ids = g;
      const manual = tieOrders && tieOrders[key];
      if (g.length > 1 && manual && manual.length === g.length && manual.every((x) => g.includes(x))) ids = manual;
      ids.forEach((id, i) => out.push({ id, rank: g.length > 1 && !manual ? pos : pos + i, tied: g.length > 1 && !manual, tieKey: g.length > 1 ? key : null, group: g }));
      pos += g.length;
    }
    return out;
  }
  function poolStandings(state, cat, round, tieOrders) {
    const games = roundGames(cat, round.id);
    return round.config.pools.map((p) => {
      const { groups, stats } = rankIds(state, cat, p.teamIds, games);
      return { pool: p, rows: orderGroups(groups, tieOrders, `pool:${p.number}`).map((r) => Object.assign(r, stats[r.id])) };
    });
  }
  function overallStandings(state, cat, round, tieOrders) {
    const games = roundGames(cat, round.id);
    const ids = round.config.pools.flatMap((p) => p.teamIds);
    const { groups, stats } = rankIds(state, cat, ids, games, { average: true });
    return orderGroups(groups, tieOrders, 'overall').map((r) => Object.assign(r, stats[r.id]));
  }
  function americanoStandings(state, cat, round, tieOrders) {
    const games = roundGames(cat, round.id);
    const ids = cat.players.map((p) => p.id);
    const { groups, stats } = rankIds(state, cat, ids, games, { americano: true });
    return orderGroups(groups, tieOrders, 'overall').map((r) => Object.assign(r, stats[r.id]));
  }

  // ---------- advancement (SPEC §6.2) ----------
  function slotLabel(s, cfg, roundName) {
    if (s.type === 'POOL') return `${ordinal(s.rank)} ${cfg.pools.find((p) => p.number === s.pool).name}`;
    if (s.type === 'OVERALL') return `${ordinal(s.rank)} ${roundName}`;
    return `${ordinal(s.placement)} of ${ordinal(s.rank)}s`;
  }
  // returns { slots: {roundId:[slot]}, error }
  function generateSlots(cat, poolRound, method, wildcards, counts) {
    const cfg = poolRound.config;
    const nextRounds = cat.rounds.filter((r) => r.fromRoundId === poolRound.id);
    const total = nextRounds.reduce((s, r) => s + (+counts[r.id] || 0), 0);
    const nTeams = cfg.pools.reduce((s, p) => s + p.teamIds.length, 0);
    if (total > nTeams) return { error: `Only ${nTeams} teams are in the pools.` };
    const maxSize = Math.max(0, ...cfg.pools.map((p) => p.teamIds.length));
    const levels = [];
    for (let r = 1; r <= maxSize; r++) levels.push(cfg.pools.filter((p) => p.teamIds.length >= r).map((p) => ({ rank: r, pool: p.number })));
    let seq = [];
    if (method === 'OVERALL') {
      for (let i = 1; i <= total; i++) seq.push({ type: 'OVERALL', rank: i });
    } else {
      // boundaries where a flight (or the advancing cut) ends
      const bounds = []; let acc = 0;
      nextRounds.forEach((r) => { acc += +counts[r.id] || 0; bounds.push(acc); });
      let taken = 0;
      for (const lvl of levels) {
        if (taken >= total) break;
        const start = taken, end = Math.min(taken + lvl.length, total);
        const split = bounds.some((b) => b > start && b < start + lvl.length);
        if (method === 'CROSS' || split) {
          if (method === 'POOL' && !wildcards) {
            return { error: `The ${ordinal(lvl[0].rank)}-placed teams don't all fit in the same flight. Turn on wildcards or change the number of advancing teams.` };
          }
          for (let k = 0; k < end - start; k++) seq.push({ type: 'CROSS', rank: lvl[0].rank, placement: k + 1 });
        } else lvl.forEach((s) => seq.push({ type: 'POOL', rank: s.rank, pool: s.pool }));
        taken = end;
      }
    }
    const slots = {}; let i = 0;
    nextRounds.forEach((r) => {
      const n = +counts[r.id] || 0;
      slots[r.id] = seq.slice(i, i + n).map((s, k) => Object.assign(s, { key: `${r.id}#${k + 1}`, label: slotLabel(s, cfg, poolRound.name) }));
      i += n;
    });
    return { slots };
  }
  function setAdvancement(state, cat, poolRound, adv) {
    poolRound.config.advancement = Object.assign({ confirmed: false, resolved: {}, tieOrders: {} }, adv);
    // brackets fed by this round must be rebuilt from the new slots
    cat.rounds.filter((r) => r.fromRoundId === poolRound.id).forEach((r) => {
      r.config.entrants = (adv.slots[r.id] || []).map((s) => ({ t: 'slot', round: poolRound.id, key: s.key, label: s.label, slot: s }));
      buildBracket(state, cat, r);
    });
  }
  // pools changed: slots may point at pools that no longer exist
  function clearAdvancement(state, cat, poolRound) {
    poolRound.config.advancement = null;
    cat.rounds.filter((r) => r.fromRoundId === poolRound.id).forEach((r) => {
      removeRoundGamesAndAfter(state, cat, r);
      r.config.entrants = []; r.built = false;
    });
  }
  // move a slot between/within flights (manual edit)
  function moveSlot(state, cat, poolRound, fromRound, fromIdx, toRound, toIdx) {
    const adv = poolRound.config.advancement;
    const a = adv.slots[fromRound], b = adv.slots[toRound];
    const [s] = a.splice(fromIdx, 1);
    b.splice(Math.min(toIdx, b.length), 0, s);
    Object.keys(adv.slots).forEach((rid) => adv.slots[rid].forEach((x, k) => { x.key = `${rid}#${k + 1}`; }));
    setAdvancement(state, cat, poolRound, adv);
  }
  function roundComplete(state, cat, round) {
    const gs = roundGames(cat, round.id);
    return gs.length > 0 && gs.every((g) => g.status !== 'SCHEDULED');
  }
  // Ties that change which team fills a slot (SPEC §7)
  function relevantTies(state, cat, poolRound, ignoreManual) {
    const adv = poolRound.config.advancement; if (!adv) return [];
    const all = Object.values(adv.slots).flat();
    const tieOrders = ignoreManual ? {} : adv.tieOrders || {};
    const ties = [];
    const isAm = poolRound.type === 'AM';
    if (isAm || all.some((s) => s.type === 'OVERALL')) {
      const rows = isAm ? americanoStandings(state, cat, poolRound, tieOrders) : overallStandings(state, cat, poolRound, tieOrders);
      const need = new Set(all.filter((s) => s.type === 'OVERALL').map((s) => s.rank));
      collectTies(rows, (r) => [...need].some((k) => k >= r.rank && k < r.rank + r.group.length), ties, isAm ? 'Tied for {r} overall' : 'Tied for {r} overall', isAm);
    }
    if (!isAm) {
      const pools = poolStandings(state, cat, poolRound, tieOrders);
      for (const ps of pools) {
        const used = all.filter((s) => (s.type === 'POOL' && s.pool === ps.pool.number) || s.type === 'CROSS').map((s) => s.rank);
        collectTies(ps.rows, (r) => used.some((k) => k >= r.rank && k < r.rank + r.group.length), ties, `Tied for {r} in ${ps.pool.name}`);
      }
      for (const rank of [...new Set(all.filter((s) => s.type === 'CROSS').map((s) => s.rank))]) {
        const rows = crossRanking(state, cat, poolRound, rank, tieOrders);
        const used = all.filter((s) => s.type === 'CROSS' && s.rank === rank).map((s) => s.placement);
        collectTies(rows, (r) => used.some((k) => k >= r.rank && k < r.rank + r.group.length), ties, `Tied for {r} of ${ordinal(rank)}s`);
      }
    }
    return ties;
  }
  function collectTies(rows, relevant, out, title, players) {
    const seen = new Set();
    for (const r of rows) {
      if (!r.tied || seen.has(r.tieKey) || !relevant(r)) continue;
      seen.add(r.tieKey);
      out.push({ key: r.tieKey, title: title.replace('{r}', ordinal(r.rank)), ids: r.group.slice(), players: !!players });
    }
  }
  // k-th placed team of every pool, compared on per-game averages (decision #7)
  function crossRanking(state, cat, poolRound, rank, tieOrders) {
    const pools = poolStandings(state, cat, poolRound, tieOrders);
    const ids = pools.map((ps) => ps.rows[rank - 1]).filter(Boolean).map((r) => r.id);
    const { groups, stats } = rankIds(state, cat, ids, roundGames(cat, poolRound.id), { average: true });
    return orderGroups(groups, tieOrders, `cross:${rank}`).map((r) => Object.assign(r, stats[r.id]));
  }
  function confirmAdvancement(state, cat, poolRound) {
    const adv = poolRound.config.advancement;
    if (!roundComplete(state, cat, poolRound)) return { error: 'Every game in this round needs a result first. Cancel or forfeit games that will not be played.' };
    const open = relevantTies(state, cat, poolRound).filter((t) => !(adv.tieOrders || {})[t.key]);
    if (open.length) return { error: 'Resolve the ties first.', ties: open };
    const resolved = {};
    if (poolRound.type === 'AM') {
      const rows = americanoStandings(state, cat, poolRound, adv.tieOrders);
      // pair players 1+k, 2+(k-1)… into new teams for the playoff
      const k = adv.players, top = rows.slice(0, k).map((r) => r.id);
      cat.teams = cat.teams.filter((t) => !t.fromAmericano);
      const pairs = [];
      for (let i = 0; i < k / 2; i++) {
        const t = { id: uid('team'), name: `${playerName(cat, top[i])} / ${playerName(cat, top[k - 1 - i])}`, players: [top[i], top[k - 1 - i]], fromAmericano: true };
        cat.teams.push(t); pairs.push(t.id);
      }
      Object.values(adv.slots).flat().forEach((s, i) => { resolved[s.key] = pairs[i]; });
    } else {
      const pools = poolStandings(state, cat, poolRound, adv.tieOrders);
      const overall = overallStandings(state, cat, poolRound, adv.tieOrders);
      for (const s of Object.values(adv.slots).flat()) {
        if (s.type === 'POOL') { const ps = pools.find((p) => p.pool.number === s.pool); resolved[s.key] = ps.rows[s.rank - 1].id; }
        else if (s.type === 'OVERALL') resolved[s.key] = overall[s.rank - 1].id;
        else resolved[s.key] = crossRanking(state, cat, poolRound, s.rank, adv.tieOrders)[s.placement - 1].id;
      }
    }
    adv.resolved = resolved; adv.confirmed = true;
    return { ok: true };
  }
  function unconfirm(state, cat, round) {
    const adv = round.config.advancement;
    if (adv && adv.confirmed) {
      adv.confirmed = false; adv.resolved = {};
      cat.rounds.filter((r) => r.fromRoundId === round.id).forEach((r) => {
        roundGames(cat, r.id).forEach((g) => { g.status = 'SCHEDULED'; g.result = null; });
        if (r.config.advancement) unconfirm(state, cat, r);
      });
      return true;
    }
    return false;
  }

  // ---------- brackets (SPEC §6.3, §6.4) ----------
  function seedOrder(n) {
    let order = [1];
    while (order.length < n) { const m = order.length * 2; order = order.flatMap((s) => [s, m + 1 - s]); }
    return order;
  }
  const BYE = { t: 'bye' };
  const roundLabel = (size, base) => {
    if (base === 1) return size === 2 ? 'Final' : size === 4 ? 'Semi Finals' : size === 8 ? 'Quarter Finals' : `Round of ${size}`;
    return size === 2 ? `${ordinal(base)} Place` : `${ordinal(base)} Place ${size === 4 ? 'Semis' : 'Round of ' + size}`;
  };
  function buildSE(cat, round, sources, base, placements, tag) {
    const size = nextPow2(Math.max(2, sources.length));
    const slots = seedOrder(size).map((s) => sources[s - 1] || BYE);
    let cur = slots, sz = size, depth = 0;
    const losersByRound = [];
    while (cur.length > 1) {
      const next = [], losers = [];
      for (let i = 0; i < cur.length; i += 2) {
        const a = cur[i], b = cur[i + 1];
        if (a.t === 'bye' && b.t === 'bye') { next.push(BYE); continue; }
        if (a.t === 'bye') { next.push(b); continue; }
        if (b.t === 'bye') { next.push(a); continue; }
        const g = addGame(cat, round, { home: a, away: b, label: roundLabel(sz, base), bracket: tag, depth });
        next.push({ t: 'dep', game: g.number, res: 'W' }); losers.push({ t: 'dep', game: g.number, res: 'L' });
      }
      losersByRound.push({ losers, survivors: next.filter((x) => x.t !== 'bye').length });
      cur = next; sz /= 2; depth++;
    }
    // placement games for losers of each round (recursive mini-brackets)
    losersByRound.forEach(({ losers, survivors }) => {
      const place = base + survivors;
      if (survivors >= 1 && losers.length >= 2 && placements.includes(place) && place > base + 1) buildSE(cat, round, losers, place, placements, 'P');
    });
  }
  function buildDE(cat, round, sources, trueDouble) {
    const size = nextPow2(Math.max(2, sources.length));
    const play = (a, b, label, tag) => {
      if (a.t === 'bye' && b.t === 'bye') return { w: BYE, l: BYE };
      if (a.t === 'bye') return { w: b, l: BYE };
      if (b.t === 'bye') return { w: a, l: BYE };
      const g = addGame(cat, round, { home: a, away: b, label, bracket: tag });
      return { w: { t: 'dep', game: g.number, res: 'W' }, l: { t: 'dep', game: g.number, res: 'L' } };
    };
    let upper = seedOrder(size).map((s) => sources[s - 1] || BYE);
    const R = Math.log2(size);
    const upperLosers = [];
    for (let r = 1; r <= R; r++) {
      const next = [], losers = [];
      for (let i = 0; i < upper.length; i += 2) { const res = play(upper[i], upper[i + 1], r === R ? 'Upper Final' : `Upper Round ${r}`, 'U'); next.push(res.w); losers.push(res.l); }
      upperLosers.push(losers); upper = next;
    }
    // lower bracket
    let lower = [];
    const l1 = upperLosers[0];
    for (let i = 0; i < l1.length; i += 2) lower.push(play(l1[i], l1[i + 1] || BYE, 'Lower Round 1', 'L').w);
    let lr = 2;
    for (let r = 2; r <= R; r++) {
      const drops = r % 2 === 0 ? upperLosers[r - 1].slice().reverse() : upperLosers[r - 1].slice();
      const next = [];
      for (let i = 0; i < lower.length; i++) next.push(play(lower[i], drops[i] || BYE, r === R ? 'Lower Final' : `Lower Round ${lr}`, 'L').w);
      lower = next; lr++;
      if (r < R && lower.length > 1) {
        const merged = [];
        for (let i = 0; i < lower.length; i += 2) merged.push(play(lower[i], lower[i + 1] || BYE, `Lower Round ${lr}`, 'L').w);
        lower = merged; lr++;
      }
    }
    const lw = lower[0] || BYE;
    if (lw.t === 'bye') return;
    const gf = addGame(cat, round, { home: upper[0], away: lw, label: 'Grand Final', bracket: 'GF' });
    if (trueDouble) addGame(cat, round, { home: { t: 'dep', game: gf.number, res: 'W' }, away: { t: 'dep', game: gf.number, res: 'L' }, label: 'Grand Final (reset)', bracket: 'GF', conditional: gf.number });
  }
  function buildBracket(state, cat, round) {
    removeRoundGamesAndAfter(state, cat, round);
    const entrants = round.config.entrants || [];
    if (entrants.length < 2) { round.built = false; return; }
    if (round.type === 'SE') {
      const sorted = (round.config.placements || [1]).slice().sort((a, b) => a - b);
      buildSE(cat, round, entrants, 1, sorted, 'M');
      for (const c of round.config.consolations || []) addGame(cat, round, { home: c.home, away: c.away, label: 'Consolation', bracket: 'C' });
    } else buildDE(cat, round, entrants, round.config.trueDouble);
    round.built = true;
  }
  function teamEntrants(cat) { return seededTeams(cat).map((id) => ({ t: 'team', id })); }

  // ---------- americano (SPEC §6.5) ----------
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
        partner[key(g[0], g[1])] = (partner[key(g[0], g[1])] || 0) + 1;
        partner[key(g[2], g[3])] = (partner[key(g[2], g[3])] || 0) + 1;
        for (const x of [g[0], g[1]]) for (const y of [g[2], g[3]]) opp[key(x, y)] = (opp[key(x, y)] || 0) + 1;
      });
      out.push(best);
    }
    return out;
  }
  function generateAmericano(state, cat, round) {
    const ids = cat.players.map((p) => p.id);
    if (ids.length < 4 || ids.length % 4) return { error: `Americano needs a multiple of 4 players (you have ${ids.length}).` };
    removeRoundGamesAndAfter(state, cat, round);
    const rounds = cat.format.americano.rounds || ids.length - 1;
    americanoSchedule(ids, rounds, ids.length * 31 + rounds).forEach((games, r) => games.forEach((g) => {
      addGame(cat, round, { home: { t: 'pair', players: [g[0], g[1]] }, away: { t: 'pair', players: [g[2], g[3]] }, americano: true, label: `Round ${r + 1}`, matchday: r + 1 });
    }));
    round.built = true;
    // the playoff (if any) gets k/2 pair slots
    const next = cat.rounds.find((r) => r.fromRoundId === round.id);
    if (next) {
      const k = Math.min(cat.format.americano.playoffPlayers, ids.length - (ids.length % 2));
      const slots = { [next.id]: Array.from({ length: k / 2 }, (_, i) => ({ type: 'AMPAIR', key: `${next.id}#${i + 1}`, label: `${ordinal(i + 1)} + ${ordinal(k - i)} placed` })) };
      setAdvancement(state, cat, round, { method: 'AMERICANO', players: k, slots });
    }
    return { ok: true };
  }

  // ---------- resets (SPEC §7) ----------
  function laterRounds(cat, round) { return cat.rounds.filter((r) => r.number > round.number); }
  function removeRoundGamesAndAfter(state, cat, round) {
    const ids = new Set(roundGames(cat, round.id).map((g) => g.id));
    cat.games = cat.games.filter((g) => !ids.has(g.id));
    if (round.config.advancement) unconfirm(state, cat, round);
    renumber(cat);
    ids.forEach((id) => dropFromSchedule(state, id));
  }
  function renumber(cat) {
    // keep numbers stable relative to order; re-sequence and patch dependencies
    const map = {};
    cat.games.sort((a, b) => cat.rounds.find((r) => r.id === a.roundId).number - cat.rounds.find((r) => r.id === b.roundId).number || a.number - b.number);
    cat.games.forEach((g, i) => { map[g.number] = i + 1; });
    const fix = (s) => (s && s.t === 'dep' && map[s.game] ? Object.assign({}, s, { game: map[s.game] }) : s);
    cat.games.forEach((g) => { g.home = fix(g.home); g.away = fix(g.away); if (g.conditional) g.conditional = map[g.conditional]; g.number = map[g.number]; });
    cat.rounds.forEach((r) => (r.config.consolations || []).forEach((c) => { c.home = fix(c.home); c.away = fix(c.away); }));
    cat.nextGame = cat.games.length + 1;
  }
  function recordResult(state, cat, game, result) {
    const v = validateResult(state, cat, game, result);
    if (!v.ok) return v;
    const round = cat.rounds.find((r) => r.id === game.roundId);
    const reset = round.config.advancement && round.config.advancement.confirmed;
    if (reset) unconfirm(state, cat, round);
    // a changed knockout result clears games that depended on it
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
    const round = cat.rounds.find((r) => r.id === game.roundId);
    if (round.config.advancement) unconfirm(state, cat, round);
    game.result = null; game.status = 'SCHEDULED';
  }

  // ---------- scheduling (SPEC §8) ----------
  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const toHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  function allSpaces(state) { return state.venues.flatMap((v) => v.spaces.map((s) => Object.assign({ venue: v.name }, s))); }
  function gameLengthFor(state, cat, round) { return (round.config.gameLength) || SPORTS[state.tournament.sport].gameLength; }
  function participantsKnown(state, cat, g) {
    if (g.americano) return [...g.home.players, ...g.away.players];
    return [g.home, g.away].filter((s) => s && s.t === 'team').map((s) => s.id);
  }
  function generateFixedSchedule(state) {
    const rest = +state.tournament.restMinutes || 0;
    const sched = state.schedule; sched.assignments = {}; sched.unplaced = [];
    const blocks = sched.blocks.slice().sort((a, b) => (a.day + a.start).localeCompare(b.day + b.start));
    const cursor = {}; // blockId:spaceId -> next free minute
    const endAt = {}; // gameId -> absolute end key
    const teamFree = {}; // participant -> absolute minute
    const abs = (day, min) => Date.parse(day + 'T00:00:00Z') / 60000 + min;
    // games in round order, categories interleaved
    const queue = [];
    const maxRound = Math.max(0, ...state.categories.map((c) => c.rounds.length));
    for (let rn = 1; rn <= maxRound; rn++) {
      const lists = state.categories.map((c) => { const r = c.rounds.find((x) => x.number === rn); return r ? roundGames(c, r.id).map((g) => ({ c, r, g })) : []; });
      const m = Math.max(0, ...lists.map((l) => l.length));
      for (let i = 0; i < m; i++) lists.forEach((l) => l[i] && queue.push(l[i]));
    }
    for (const { c, r, g } of queue) {
      const len = gameLengthFor(state, c, r);
      let earliest = -Infinity;
      for (const s of [g.home, g.away]) {
        if (s && s.t === 'dep') { const dg = c.games.find((x) => x.number === s.game); if (dg && endAt[dg.id] != null) earliest = Math.max(earliest, endAt[dg.id] + rest); }
        if (s && s.t === 'slot') { const pr = c.rounds.find((x) => x.id === s.round); roundGames(c, pr.id).forEach((pg) => { if (endAt[pg.id] != null) earliest = Math.max(earliest, endAt[pg.id] + rest); }); }
      }
      if (g.conditional) { const gf = c.games.find((x) => x.number === g.conditional); if (gf && endAt[gf.id] != null) earliest = Math.max(earliest, endAt[gf.id] + rest); }
      participantsKnown(state, c, g).forEach((p) => { if (teamFree[p] != null) earliest = Math.max(earliest, teamFree[p]); });
      let best = null;
      for (const b of blocks) {
        for (const sid of b.spaceIds) {
          const space = allSpaces(state).find((s) => s.id === sid);
          if (!space) continue;
          if (space.categoryIds && space.categoryIds.length && !space.categoryIds.includes(c.id)) continue;
          const k = b.id + ':' + sid;
          const free = cursor[k] != null ? cursor[k] : toMin(b.start);
          const start = Math.max(free, earliest - abs(b.day, 0));
          if (start + len <= toMin(b.end)) {
            const a = abs(b.day, start);
            if (!best || a < best.a) best = { a, b, sid, start, k };
          }
        }
        if (best) break;
      }
      if (!best) { sched.unplaced.push(g.id); continue; }
      cursor[best.k] = best.start + len;
      endAt[g.id] = best.a + len;
      participantsKnown(state, c, g).forEach((p) => { teamFree[p] = best.a + len + rest; });
      sched.assignments[g.id] = { spaceId: best.sid, day: best.b.day, start: toHHMM(best.start), end: toHHMM(best.start + len) };
    }
    return { placed: Object.keys(sched.assignments).length, unplaced: sched.unplaced.length };
  }
  // court queue (dynamic assignment)
  function buildQueue(state) {
    const q = [];
    const maxRound = Math.max(0, ...state.categories.map((c) => c.rounds.length));
    for (let rn = 1; rn <= maxRound; rn++) {
      const lists = state.categories.map((c) => { const r = c.rounds.find((x) => x.number === rn); return r ? roundGames(c, r.id).filter((g) => g.status === 'SCHEDULED').map((g) => g.id) : []; });
      const m = Math.max(0, ...lists.map((l) => l.length));
      for (let i = 0; i < m; i++) lists.forEach((l) => l[i] && q.push(l[i]));
    }
    state.schedule.queue = q;
  }
  function findGame(state, gameId) {
    for (const c of state.categories) { const g = c.games.find((x) => x.id === gameId); if (g) return { cat: c, game: g }; }
    return null;
  }
  function onCourt(state) { return new Set(Object.values(state.schedule.courts).filter(Boolean)); }
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
        const ps = sidesFlat(state, f.cat, f.game);
        return ps.every((p) => !busy.has(p) && !(s.lastFinished[p] && now - s.lastFinished[p] < rest));
      });
      if (pick) {
        s.courts[sid] = pick; assigned.push(pick);
        const f = findGame(state, pick); sidesFlat(state, f.cat, f.game).forEach((p) => busy.add(p));
        f.game.startedAt = now;
      }
    }
    return assigned;
  }
  function sidesFlat(state, cat, g) { const s = sidesOf(state, cat, g); return [...(s.home || []), ...(s.away || [])]; }
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
  function clearScheduleFor(state, cat) {
    const ids = new Set(cat.games.map((g) => g.id));
    Object.keys(state.schedule.assignments).forEach((id) => { if (!findGame(state, id)) delete state.schedule.assignments[id]; });
    state.schedule.queue = state.schedule.queue.filter((id) => findGame(state, id) || ids.has(id));
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
    const round = cat.rounds.find((r) => r.id === g.roundId);
    let h = Math.floor(rand() * 4), a = Math.floor(rand() * 4);
    if (h === a && (!sp.ties || round.type !== 'RR')) h++;
    return { status: 'FINAL', home: h, away: a };
  }
  function simulateRound(state, cat, round) {
    let n = 0;
    for (const g of roundGames(cat, round.id).sort((a, b) => a.number - b.number)) {
      if (g.status !== 'SCHEDULED' || !isPlayable(state, cat, g)) continue;
      recordResult(state, cat, g, randomResult(state, cat, g)); n++;
    }
    // knockout games unlock in waves
    if (n && isBracketType(round.type)) n += simulateRound(state, cat, round);
    return n;
  }

  const TE = {
    SPORTS, TEMPLATES, RULES, COLUMNS, DEFAULT_TIEBREAKERS, templatesFor, rulesFor, defaultFormat, isBracketType,
    uid, clone, ordinal, letter, newState, newCategory, findCat, roundGames, teamName, playerName,
    applyFormat, seededTeams, snakePools, circleRounds, poolPairs, generatePoolGames,
    validateResult, gameNumbers, recordResult, clearResult, resolve, sourceLabel, isNeeded, isPlayable, sidesOf,
    statsFor, rankIds, poolStandings, overallStandings, americanoStandings, crossRanking,
    generateSlots, setAdvancement, clearAdvancement, moveSlot, relevantTies, confirmAdvancement, roundComplete, unconfirm,
    seedOrder, buildBracket, teamEntrants, americanoSchedule, generateAmericano,
    removeRoundGamesAndAfter, laterRounds,
    allSpaces, generateFixedSchedule, buildQueue, fillCourts, findGame, gameLengthFor,
    randomResult, simulateRound,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = TE; else root.TE = TE;
})(typeof window !== 'undefined' ? window : globalThis);
