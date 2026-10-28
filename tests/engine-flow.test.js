const TE = require(process.argv[2] || require('path').join(__dirname, '../mockup/engine.js'));
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
// seedOrder
assert(JSON.stringify(TE.seedOrder(8)) === '[1,8,4,5,2,7,3,6]', 'seedOrder 8');
// snake
const p = TE.snakePools(['1','2','3','4','5','6','7','8'], 3).map(x=>x.teamIds.join(''));
assert(JSON.stringify(p) === '["167","258","34"]', 'snake 8/3 ' + JSON.stringify(p));
// circle: 5 teams each plays 4, 10 games
const c5 = TE.circleRounds(['a','b','c','d','e']).flat(); assert(c5.length === 10, 'circle 5 -> 10 games');
const pairs = new Set(c5.map(x=>x.slice().sort().join(''))); assert(pairs.size === 10, 'circle unique pairs');
// games per team N
for (const [n,k] of [[4,2],[5,2],[5,3],[6,3],[4,5]]) {
  const ids = Array.from({length:n},(_,i)=>'t'+i); const g = TE.poolPairs(ids,'N',k).flat();
  const cnt = {}; g.forEach(([a,b])=>{cnt[a]=(cnt[a]||0)+1;cnt[b]=(cnt[b]||0)+1;});
  const vals = ids.map(i=>cnt[i]||0);
  assert(vals.every(v=>v>=k && v<=k+1), `poolPairs n=${n} k=${k} counts ${vals}`);
}
// Full scenario: football, 10 teams, RR_SE with 2 flights
const st = TE.newState('FOOTBALL','Cup'); const cat = st.categories[0];
for (let i=1;i<=10;i++) cat.teams.push({id:'T'+i,name:'Team '+i,seed:i,players:[]});
TE.applyFormat(st, cat, 'RR_SE', 2);
assert(cat.rounds.map(r=>r.name).join(',') === 'Pool Play,A Flight,B Flight', 'rounds+flights');
const rr = cat.rounds[0]; rr.config.pools = TE.snakePools(TE.seededTeams(cat), 3);
TE.generatePoolGames(st, cat, rr);
assert(TE.roundGames(cat, rr.id).length === 6+3+3, 'pool games 4,3,3 teams = 12: '+TE.roundGames(cat, rr.id).length);
// advancement: POOL without wildcards, A=4 -> split level 2 -> error
let r1 = TE.generateSlots(cat, rr, 'POOL', false, {[cat.rounds[1].id]:4,[cat.rounds[2].id]:4});
assert(!!r1.error, 'uneven cut blocked without wildcards: ' + r1.error);
r1 = TE.generateSlots(cat, rr, 'POOL', true, {[cat.rounds[1].id]:4,[cat.rounds[2].id]:4});
console.log('   A:', r1.slots[cat.rounds[1].id].map(s=>s.label).join(', '));
console.log('   B:', r1.slots[cat.rounds[2].id].map(s=>s.label).join(', '));
assert(r1.slots[cat.rounds[1].id][3].label === '1st of 2nds', 'wildcard creates 1st of 2nds');
const r2 = TE.generateSlots(cat, rr, 'POOL', false, {[cat.rounds[1].id]:3,[cat.rounds[2].id]:3});
assert(!r2.error && r2.slots[cat.rounds[2].id][0].label === '2nd Pool A', 'clean cut 3/3');
TE.setAdvancement(st, cat, rr, {method:'POOL', wildcards:true, counts:{}, slots:r1.slots});
const A = cat.rounds[1];
const aGames = TE.roundGames(cat, A.id);
assert(aGames.length === 3, 'A flight 4 teams -> 3 games (2 SF + F): '+aGames.length);
// placements 3rd
A.config.placements=[1,3]; TE.buildBracket(st, cat, A);
assert(TE.roundGames(cat, A.id).map(g=>g.label).join(',') === 'Semi Finals,Semi Finals,Final,3rd Place', 'SE with 3rd place: '+TE.roundGames(cat, A.id).map(g=>g.label).join(','));
// confirm before complete -> error
assert(!!TE.confirmAdvancement(st, cat, rr).error, 'cannot confirm before pool done');
// simulate pool, then ties, confirm
TE.simulateRound(st, cat, rr);
assert(TE.roundComplete(st, cat, rr), 'pool complete');
let ties = TE.relevantTies(st, cat, rr);
console.log('   ties:', ties.map(t=>t.title+' '+t.ids.join('/')).join(' | ') || 'none');
for (const t of ties) rr.config.advancement.tieOrders[t.key] = t.ids;
const conf = TE.confirmAdvancement(st, cat, rr);
assert(conf.ok, 'confirm ok ' + JSON.stringify(conf.error||''));
const sf = TE.roundGames(cat, A.id)[0];
console.log('   SF1:', TE.sourceLabel(st,cat,sf.home), 'vs', TE.sourceLabel(st,cat,sf.away));
assert(TE.isPlayable(st, cat, sf), 'bracket playable after confirm');
// play A flight fully
TE.simulateRound(st, cat, A);
assert(TE.roundGames(cat, A.id).every(g=>g.status==='FINAL'), 'A flight complete');
// editing a pool result resets
const pg = TE.roundGames(cat, rr.id)[0];
const res = TE.recordResult(st, cat, pg, {status:'FINAL', home:5, away:0});
assert(res.reset && !rr.config.advancement.confirmed && TE.roundGames(cat, A.id).every(g=>g.status==='SCHEDULED'), 'editing pool result resets playoffs');
// standings sanity: pts sum
const ps = TE.poolStandings(st, cat, rr, {});
ps.forEach(p=>console.log('  ', p.pool.name, p.rows.map(r=>`${r.rank}.${r.id}(${r.PTS}p ${r.PD>=0?'+':''}${r.PD})${r.tied?'*':''}`).join(' ')));
