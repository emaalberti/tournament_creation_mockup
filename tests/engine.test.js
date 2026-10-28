// Phase-model engine tests. Usage: node p1.js [path/to/engine.js]
const TE = require(process.argv[2] || require('path').join(__dirname, '../mockup/engine.js'));
let fails = 0;
const assert = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
function mk(sport, tpl, n, flights) {
  const st = TE.newState(sport, 'X'); const cat = st.categories[0];
  for (let i = 1; i <= n; i++) cat.teams.push({ id: 'T' + i, name: 'T' + i, seed: i, players: [] });
  if (tpl) TE.applyTemplate(st, cat, tpl, flights || 1);
  return { st, cat };
}
const finishWithTies = (st, cat, ph) => { TE.simulatePhase(st, cat, ph); for (const t of TE.relevantTies(st, cat, ph, true)) ph.tieOrders[t.key] = t.ids; return TE.confirmPhase(st, cat, ph); };

// --- basics kept from v1
assert(JSON.stringify(TE.seedOrder(8)) === '[1,8,4,5,2,7,3,6]', 'seedOrder 8');
assert(JSON.stringify(TE.parsePositions('1-3, 5,7-8')) === '[1,2,3,5,7,8]', 'parsePositions');
assert(TE.formatPositions([1, 2, 3, 5, 7, 8]) === '1-3, 5, 7-8', 'formatPositions');
for (const [n, k] of [[4, 2], [5, 2], [5, 3], [6, 3]]) {
  const ids = Array.from({ length: n }, (_, i) => 't' + i); const g = TE.poolPairs(ids, 'N', k).flat();
  const cnt = {}; g.forEach(([a, b]) => { cnt[a] = (cnt[a] || 0) + 1; cnt[b] = (cnt[b] || 0) + 1; });
  assert(ids.every((i) => cnt[i] >= k && cnt[i] <= k + 1), `poolPairs n=${n} k=${k}`);
}

// --- template RR_SE with 2 flights = graph of 3 phases + 2 connectors
{ const { st, cat } = mk('FOOTBALL', 'RR_SE', 12, 2);
  assert(cat.phases.map((p) => p.name).join(',') === 'Pool Play,A Flight,B Flight' && cat.connectors.length === 2, 'RR_SE 2 flights builds phase graph');
  const [g, A, B] = TE.sortedPhases(cat);
  assert(g.pools.length === 3 && g.pools.every((p) => p.ids.length === 4), '12 teams -> 3 groups of 4');
  assert(A.entrants.map((e) => e.label).slice(0, 4).join('|') === '1st Group A (Pool Play)|1st Group B (Pool Play)|1st Group C (Pool Play)|2nd Group A (Pool Play)', 'A flight placeholders by source position');
  assert(TE.phaseGames(cat, A.id).length === 5, 'A flight 6 entrants -> 5 games with byes (placeholders exist before start)');
  assert(TE.phaseStatus(st, cat, A) === 'READY' && TE.phaseStatus(st, cat, g) === 'IN_PROGRESS', 'statuses: groups in progress, flight waiting');
  assert(!TE.isPlayable(st, cat, TE.phaseGames(cat, A.id)[0]), 'flight game not playable before groups confirmed (D4)');
  const v = TE.validateGraph(st, cat); assert(v.errors.length === 0, 'RR_SE graph valid ' + JSON.stringify(v.errors));
  assert(!!TE.confirmPhase(st, cat, g).error, 'cannot confirm unfinished groups');
  const c = finishWithTies(st, cat, g); assert(c.ok, 'groups confirmed ' + (c.error || ''));
  assert(A.entrants.every((e) => e.participant) && B.entrants.every((e) => e.participant), 'flights filled after confirm');
  const firsts = A.entrants.slice(0, 3).map((e) => e.participant);
  const cross1 = g.snapshot['cross:1'];
  assert(JSON.stringify(firsts) === JSON.stringify(cross1), 'group winners seeded by cross-group ranking');
  TE.simulatePhase(st, cat, A);
  assert(TE.phaseStatus(st, cat, A) === 'COMPLETE', 'A flight complete');
  const fin = TE.ranking(st, cat, A, 'final');
  assert(fin.length === 6 && fin.every((r, i) => r.rank === i + 1 && !r.tied), 'knockout final ranking complete, no structural ties (D2)');
  const finalGame = TE.phaseGames(cat, A.id).find((x) => x.label === 'Final');
  const champ = TE.resolve(st, cat, { t: 'dep', game: finalGame.number, res: 'W' });
  assert(fin[0].id === champ, 'champion ranked 1st');
  // cascade: change a group result -> flights back to placeholders
  const gg = TE.phaseGames(cat, g.id)[0];
  const r = TE.recordResult(st, cat, gg, { status: 'FINAL', home: 9, away: 0 });
  assert(r.reset && !g.confirmed && A.entrants.every((e) => !e.participant) && TE.phaseGames(cat, A.id).every((x) => !x.result), 'editing a group result invalidates downstream (cascade)');
}

// --- knockout final ranking: QF losers ordered by phase tiebreakers then seed
{ const { st, cat } = mk('FOOTBALL', 'SE', 8); const ko = cat.phases[0];
  const games = TE.phaseGames(cat, ko.id);
  const qf = games.filter((x) => x.label === 'Quarter Finals');
  const margins = [1, 4, 2, 3];
  qf.forEach((x, i) => TE.recordResult(st, cat, x, { status: 'FINAL', home: margins[i], away: 0 }));
  TE.simulatePhase(st, cat, ko);
  const fin = TE.ranking(st, cat, ko, 'final');
  const qfLosers = qf.map((x) => TE.resolve(st, cat, x.away));
  const order = fin.slice(4).map((r) => r.id);
  assert(fin.slice(4).every((r) => qfLosers.includes(r.id)), 'places 5-8 are the quarter-final losers');
  assert(order[0] === qfLosers[0] && order[3] === qfLosers[1], 'QF losers ordered by score difference (lost 0-1 is 5th, lost 0-4 is 8th): ' + order);
}

// --- composable: 3 group stages reshuffled + inherit points + knockout (template RR3)
{ const { st, cat } = mk('FOOTBALL', 'RR3', 8); const [s1, s2, s3, ko] = TE.sortedPhases(cat);
  assert(cat.phases.length === 4 && s2.config.distribution === 'AVOID_REMATCH' && s2.inheritPoints, 'RR3 builds 3 group stages + knockout');
  assert(TE.phaseGames(cat, s2.id).length === 12 && TE.sourceLabel(st, cat, TE.phaseGames(cat, s2.id)[0].home).includes('place'), 'stage 2 games exist with neutral places before start');
  assert(finishWithTies(st, cat, s1).ok, 'stage 1 confirmed');
  assert(s2.entrants.every((e) => e.participant), 'stage 2 filled');
  assert(s2.rematches === 4, 'stage 2 rematches minimised to the lower bound (8 teams, 2 groups of 4 -> 4): ' + s2.rematches);
  const t = s2.entrants[0].participant;
  const st1 = TE.phaseStats(st, cat, s1)[t], st2 = TE.phaseStats(st, cat, s2)[t];
  assert(st2.PTS === st1.PTS && st2.GP === st1.GP, 'inherited points carried into stage 2 before it is played (D1)');
  TE.simulatePhase(st, cat, s2);
  const st2b = TE.phaseStats(st, cat, s2)[t];
  assert(st2b.GP === st1.GP + 3, 'stage 2 stats = inherited + new games');
  assert(finishWithTies(st, cat, s2).ok && finishWithTies(st, cat, s3).ok, 'stages 2 and 3 confirmed');
  assert(ko.entrants.every((e) => e.participant) && ko.entrants[0].participant === s3.snapshot.overall[0], 'knockout gets top 4 of stage 3 overall');
  const v = TE.validateGraph(st, cat);
  assert(v.errors.length === 0 && v.warnings.some((w) => w.msg.includes('do not continue')), 'RR3 valid; warns that 4 teams stop after stage 3');
}

// --- consolation groups from knockout final 5-8 + BYEs
{ const { st, cat } = mk('VOLLEYBALL', 'SE', 7); const ko = cat.phases[0];
  assert(TE.phaseGames(cat, ko.id).length === 6, '7 teams knockout: 6 games (one BYE)');
  const cons = TE.addPhase(st, cat, 'GROUPS', 'Consolation'); cons.config.pools = 1;
  TE.setConnector(st, cat, cons.id, { selectors: [{ fromPhase: ko.id, ranking: 'final', positions: [5, 6, 7, 8] }], seeding: 'SELECTOR_ORDER' });
  assert(cons.entrants.length === 3, 'final 5-8 from 7 teams -> 3 places (8th does not exist)');
  assert(TE.phaseGames(cat, cons.id).length === 3, 'consolation group of 3 has 3 games');
  TE.simulatePhase(st, cat, ko); assert(TE.confirmPhase(st, cat, ko).ok, 'knockout confirmed');
  assert(cons.entrants.every((e) => e.participant), 'consolation filled from knockout placings');
}

// --- validation errors
{ const { st, cat } = mk('FOOTBALL', 'RR', 9); const g = cat.phases[0];
  const k1 = TE.addPhase(st, cat, 'KNOCKOUT', 'Gold'), k2 = TE.addPhase(st, cat, 'KNOCKOUT', 'Silver');
  TE.setConnector(st, cat, k1.id, { selectors: [{ fromPhase: g.id, ranking: 'pool:*', positions: [1, 2] }] });
  TE.setConnector(st, cat, k2.id, { selectors: [{ fromPhase: g.id, ranking: 'cross:2', positions: [1] }] });
  let v = TE.validateGraph(st, cat);
  assert(v.errors.some((e) => e.msg.includes('best 2nd-placed')), 'error: 2nd-placed taken by group and as best 2nd in different phases');
  TE.setConnector(st, cat, k2.id, { selectors: [{ fromPhase: g.id, ranking: 'pool:*', positions: [2] }] });
  v = TE.validateGraph(st, cat); assert(v.errors.some((e) => e.msg.includes('used twice')), 'error: same place used twice');
  TE.setConnector(st, cat, k2.id, { selectors: [{ fromPhase: g.id, ranking: 'final', positions: [1] }] });
  v = TE.validateGraph(st, cat); assert(v.errors.some((e) => e.msg.includes('has no ranking')), 'error: ranking not offered by this phase type');
  const am = TE.addPhase(st, cat, 'AMERICANO', 'Am');
  TE.setConnector(st, cat, am.id, { selectors: [{ fromPhase: g.id, ranking: 'overall', positions: [1, 2, 3, 4] }] });
  v = TE.validateGraph(st, cat); assert(v.errors.some((e) => e.msg.includes('needs players')), 'error: participant kind mismatch (D3)');
}

// --- americano -> pairs knockout
{ const st = TE.newState('PADEL', 'Am'); const cat = st.categories[0];
  for (let i = 1; i <= 8; i++) cat.players.push({ id: 'P' + i, name: 'P' + i });
  TE.applyTemplate(st, cat, 'AM_SE'); const [am, ko] = TE.sortedPhases(cat);
  assert(TE.phaseGames(cat, am.id).length === 14 && ko.entrants.length === 2, 'americano 14 games; playoff has 2 pair places');
  assert(finishWithTies(st, cat, am).ok, 'americano confirmed');
  const top = am.snapshot.overall;
  assert(TE.teamName(cat, ko.entrants[0].participant) === `${top[0]} / ${top[3]}`, 'pairs 1st+4th and 2nd+3rd');
}

// --- results validation + forfeit + schedule
{ const { st, cat } = mk('PADEL', 'RR', 4); const g = cat.phases[0]; g.config.pools = 1; TE.rebuildPhase(st, cat, g);
  const x = TE.phaseGames(cat, g.id)[0];
  const v = TE.recordResult(st, cat, x, { status: 'FINAL', sets: [[6, 5], [6, 3]] }); assert(v.ok && v.warnings.length === 1, 'padel 6-5 accepted with warning');
  const y = TE.phaseGames(cat, g.id)[1]; TE.recordResult(st, cat, y, { status: 'FORFEIT', forfeitBy: 'home' });
  const s = TE.phaseStats(st, cat, g); const loser = TE.resolve(st, cat, y.home);
  assert(s[loser].F === 1 && s[loser].SA === 2 && s[loser].PA === 12, 'forfeit counts default 6-0 6-0'); }
{ const { st, cat } = mk('FOOTBALL', 'RR_SE', 8, 1);
  st.venues.push({ id: 'v1', name: 'Park', spaces: [{ id: 's1', name: 'F1' }, { id: 's2', name: 'F2' }] });
  st.schedule.blocks.push({ id: 'b1', day: '2026-11-01', start: '09:00', end: '20:00', spaceIds: ['s1', 's2'] });
  const r = TE.generateFixedSchedule(st); assert(r.unplaced === 0 && r.placed === TE.phaseGames(cat, cat.phases[0].id).length + TE.phaseGames(cat, cat.phases[1].id).length, 'schedule places groups + knockout');
  const toM = (t) => +t.split(':')[0] * 60 + +t.split(':')[1];
  const lastPool = Math.max(...TE.phaseGames(cat, cat.phases[0].id).map((x) => toM(st.schedule.assignments[x.id].end)));
  const firstKo = Math.min(...TE.phaseGames(cat, cat.phases[1].id).map((x) => toM(st.schedule.assignments[x.id].start)));
  assert(firstKo >= lastPool + 30, 'knockout scheduled after the whole group phase + rest (D4)'); }
{ const { st, cat } = mk('VOLLEYBALL', 'DE', 6); const de = cat.phases[0];
  assert(TE.phaseGames(cat, de.id).length === 11, 'DE 6 teams = 11 games incl. reset');
  TE.simulatePhase(st, cat, de); const fin = TE.ranking(st, cat, de, 'final');
  assert(TE.phaseStatus(st, cat, de) === 'COMPLETE' && fin.length === 6 && !fin.some((r) => r.pending), 'DE final ranking complete'); }

// --- three phase types: double elimination is a knockout setting
{ assert(Object.keys(TE.PHASE_TYPES).join(',') === 'GROUPS,KNOCKOUT,AMERICANO', 'phase types are Groups, Knockout, Americano');
  const { st, cat } = mk('TENNIS', 'DE', 8); const ko = cat.phases[0];
  assert(ko.type === 'KNOCKOUT' && ko.config.eliminations === 2 && TE.phaseGames(cat, ko.id).length === 15, 'DE preset = knockout with 2 eliminations (15 games)');
  TE.updatePhase(st, cat, ko.id, { config: { eliminations: 1 } });
  assert(TE.phaseGames(cat, ko.id).length === 7, 'switching to 1 elimination rebuilds a single bracket (7 games)');
  const old = { categories: [{ phases: [{ type: 'DOUBLE_KNOCKOUT', config: { bracketReset: false } }] }] };
  TE.migrateState(old); const m = old.categories[0].phases[0];
  assert(m.type === 'KNOCKOUT' && m.config.eliminations === 2 && m.config.bracketReset === false, 'old saved double-knockout phases are migrated'); }

// --- empty start
{ const st = TE.emptyState();
  assert(st.tournament.name === '' && st.tournament.sport === null && st.categories.length === 0 && st.venues.length === 0, 'empty state: no name, sport, categories or venues');
  st.categories.push(TE.newCategory('Open', 'FOOTBALL')); TE.setSport(st, 'VOLLEYBALL');
  assert(st.tournament.restMinutes === 15 && st.categories[0].format.points.win === 2 && st.categories[0].format.bestOf === 3, 'choosing the sport sets its defaults'); }

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
