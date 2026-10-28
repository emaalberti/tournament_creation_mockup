const TE = require(process.argv[2] || require('path').join(__dirname, '../mockup/engine.js'));
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
function mk(sport, tpl, n, flights) {
  const st = TE.newState(sport,'X'); const cat = st.categories[0];
  for (let i=1;i<=n;i++) cat.teams.push({id:'T'+i,name:'T'+i,seed:i,players:[]});
  TE.applyFormat(st, cat, tpl, flights||1); return {st,cat};
}
// SE with byes: 6 teams -> 5 games; 1 and 2 get byes
{ const {st,cat}=mk('TENNIS','SE',6); const r=cat.rounds[0]; r.config.entrants=TE.teamEntrants(cat); TE.buildBracket(st,cat,r);
  const g=TE.roundGames(cat,r.id); assert(g.length===5,'SE 6 teams = 5 games');
  console.log('   ', g.map(x=>`${x.number}:${x.label}:${TE.sourceLabel(st,cat,x.home)}-${TE.sourceLabel(st,cat,x.away)}`).join(' | '));
  TE.simulateRound(st,cat,r); assert(g.every(x=>x.status==='FINAL'),'SE 6 plays out'); }
// SE 8 with placements 1,3,5,7 -> 7 + 1 + 4 (5th semis 2 + 5th + 7th) = 12
{ const {st,cat}=mk('PADEL','SE',8); const r=cat.rounds[0]; r.config.entrants=TE.teamEntrants(cat); r.config.placements=[1,3,5,7]; TE.buildBracket(st,cat,r);
  const g=TE.roundGames(cat,r.id); console.log('   ', g.map(x=>x.label).join(', ')); assert(g.length===12,'SE 8 placements 1,3,5,7 = 12 games: '+g.length);
  TE.simulateRound(st,cat,r); assert(g.every(x=>x.status==='FINAL'),'SE 8 with placements plays out'); }
// DE sizes: 2n-2 or 2n-1 games
for (const n of [4,5,6,8,11,16]) { const {st,cat}=mk('VOLLEYBALL','DE',n); const r=cat.rounds[0]; r.config.entrants=TE.teamEntrants(cat); TE.buildBracket(st,cat,r);
  const g=TE.roundGames(cat,r.id); assert(g.length===2*n-1,`DE ${n} teams = ${2*n-1} games (incl. reset): ${g.length}`);
  TE.simulateRound(st,cat,r);
  const pend=g.filter(x=>x.status==='SCHEDULED'); const reset=g.find(x=>x.conditional);
  assert(pend.length===0 || (pend.length===1 && pend[0]===reset && !TE.isNeeded(st,cat,reset)), `DE ${n} plays out (reset needed: ${TE.isNeeded(st,cat,reset)})`);
  // each team has <=2 losses... check every team loses at most 2 games
  const losses={}; g.filter(x=>x.status==='FINAL').forEach(x=>{const nn=TE.gameNumbers(st,cat,x); const lo= nn.winner==='home'?TE.resolve(st,cat,x.away):TE.resolve(st,cat,x.home); losses[lo]=(losses[lo]||0)+1;});
  const elim=Object.values(losses).filter(v=>v>=2).length; assert(Object.values(losses).every(v=>v<=2) && elim===n-1, `DE ${n}: n-1 teams eliminated with 2 losses (${elim})`);
}
// Volleyball set validation
{ const {st,cat}=mk('VOLLEYBALL','RR',4); const r=cat.rounds[0]; r.config.pools=TE.snakePools(TE.seededTeams(cat),1); TE.generatePoolGames(st,cat,r); const g=TE.roundGames(cat,r.id)[0];
  assert(!TE.recordResult(st,cat,g,{status:'FINAL',sets:[[25,20],[20,25]]}).ok,'volley level sets rejected');
  assert(TE.recordResult(st,cat,g,{status:'FINAL',sets:[[25,20],[25,22]]}).ok,'volley 2-0 ok');
  const f=TE.roundGames(cat,r.id)[1]; TE.recordResult(st,cat,f,{status:'FORFEIT',forfeitBy:'home'});
  const s=TE.statsFor(st,cat,['T1','T2','T3','T4'],TE.roundGames(cat,r.id)); const loser=TE.resolve(st,cat,f.home);
  assert(s[loser].F===1 && s[loser].SA===2 && s[loser].PA===50,'forfeit default score 25-0 x2 counted');
  const c=TE.roundGames(cat,r.id)[2]; TE.recordResult(st,cat,c,{status:'CANCELLED'}); const s2=TE.statsFor(st,cat,['T1','T2','T3','T4'],TE.roundGames(cat,r.id));
  assert(s2[TE.resolve(st,cat,c.home)].C===1,'cancel counted as C'); }
// Padel lenient warning
{ const {st,cat}=mk('PADEL','RR',4); const r=cat.rounds[0]; r.config.pools=TE.snakePools(TE.seededTeams(cat),1); TE.generatePoolGames(st,cat,r); const g=TE.roundGames(cat,r.id)[0];
  const v=TE.recordResult(st,cat,g,{status:'FINAL',sets:[[6,5],[6,3]]}); assert(v.ok && v.warnings.length===1,'padel 6-5 accepted with warning: '+v.warnings); }
// Americano 8 players -> 7 rounds, every pair partners once
{ const st=TE.newState('PADEL','Am'); const cat=st.categories[0]; for(let i=1;i<=8;i++) cat.players.push({id:'P'+i,name:'P'+i});
  TE.applyFormat(st,cat,'AM_SE',1); const am=cat.rounds[0];
  const res=TE.generateAmericano(st,cat,am); assert(res.ok,'americano generated');
  const g=TE.roundGames(cat,am.id); assert(g.length===14,'8 players 7 rounds = 14 games');
  const part={}; g.forEach(x=>[x.home.players,x.away.players].forEach(([a,b])=>{const k=[a,b].sort().join();part[k]=(part[k]||0)+1;}));
  const repeats=Object.values(part).filter(v=>v>1).length; console.log('   partner pairs:',Object.keys(part).length,'repeats:',repeats);
  assert(Object.keys(part).length>=24,'americano partner variety (>=24 of 28 pairs)');
  cat.players.push({id:'P9',name:'P9'}); assert(!!TE.generateAmericano(st,cat,am).error,'9 players rejected'); cat.players.pop(); TE.generateAmericano(st,cat,am);
  TE.simulateRound(st,cat,am);
  const rows=TE.americanoStandings(st,cat,am,{}); console.log('   ', rows.map(r=>`${r.rank}.${r.id}:${r.PTS}`).join(' '));
  const ties=TE.relevantTies(st,cat,am); ties.forEach(t=>am.config.advancement.tieOrders[t.key]=t.ids);
  const c=TE.confirmAdvancement(st,cat,am); assert(c.ok,'americano confirm '+(c.error||''));
  const po=cat.rounds[1]; const pg=TE.roundGames(cat,po.id); console.log('   playoff:', pg.map(x=>TE.sourceLabel(st,cat,x.home)+' vs '+TE.sourceLabel(st,cat,x.away)).join(' | '));
  assert(pg.length===1 && TE.isPlayable(st,cat,pg[0]),'top4 -> 2 pairs final playable'); }
// Fixed schedule
{ const {st,cat}=mk('FOOTBALL','RR_SE',8,1); const rr=cat.rounds[0]; rr.config.pools=TE.snakePools(TE.seededTeams(cat),2); TE.generatePoolGames(st,cat,rr);
  const sl=TE.generateSlots(cat,rr,'POOL',false,{[cat.rounds[1].id]:4}); TE.setAdvancement(st,cat,rr,{method:'POOL',slots:sl.slots});
  st.venues.push({id:'v1',name:'Park',spaces:[{id:'s1',name:'Field 1'},{id:'s2',name:'Field 2'}]});
  st.schedule.blocks.push({id:'b1',day:'2026-11-01',start:'09:00',end:'18:00',spaceIds:['s1','s2']});
  const r=TE.generateFixedSchedule(st); console.log('   placed',r.placed,'unplaced',r.unplaced);
  assert(r.placed===15 && r.unplaced===0,'all 15 games placed');
  // no team double booked & rest respected
  const byTeam={}; cat.games.forEach(g=>{const a=st.schedule.assignments[g.id]; [g.home,g.away].filter(s=>s.t==='team').forEach(s=>{(byTeam[s.id]=byTeam[s.id]||[]).push(a);});});
  const toM=t=>+t.split(':')[0]*60+ +t.split(':')[1];
  let okRest=true; Object.values(byTeam).forEach(l=>{l.sort((x,y)=>toM(x.start)-toM(y.start)); for(let i=1;i<l.length;i++) if(toM(l[i].start)<toM(l[i-1].end)+30) okRest=false;}); assert(okRest,'30 min rest respected');
  const lastPool=Math.max(...TE.roundGames(cat,rr.id).map(g=>toM(st.schedule.assignments[g.id].end)));
  const firstSF=Math.min(...TE.roundGames(cat,cat.rounds[1].id).map(g=>toM(st.schedule.assignments[g.id].start)));
  assert(firstSF>=lastPool+30,'playoffs start after pool play + rest');
  st.schedule.blocks[0].end='11:00'; const r2=TE.generateFixedSchedule(st); assert(r2.unplaced>0,'short block -> incomplete: '+r2.unplaced); }
// Queue
{ const {st,cat}=mk('PADEL','RR',6); st.tournament.restMinutes=0; const rr=cat.rounds[0]; rr.config.pools=TE.snakePools(TE.seededTeams(cat),1); TE.generatePoolGames(st,cat,rr);
  st.venues.push({id:'v',name:'Club',spaces:[{id:'c1',name:'Court 1'},{id:'c2',name:'Court 2'},{id:'c3',name:'Court 3'}]});
  st.schedule.courts={c1:null,c2:null,c3:null}; TE.buildQueue(st); TE.fillCourts(st);
  const on=Object.values(st.schedule.courts).filter(Boolean); assert(on.length===3,'3 courts filled');
  const teams=new Set(); let clash=false; on.forEach(id=>{const f=TE.findGame(st,id); [f.game.home.id,f.game.away.id].forEach(t=>{if(teams.has(t))clash=true;teams.add(t);});}); assert(!clash,'no team on two courts');
  const g=TE.findGame(st,on[0]).game; TE.recordResult(st,cat,g,TE.randomResult(st,cat,g));
  assert(!Object.values(st.schedule.courts).includes(g.id),'finished game frees court, next fills');
  st.tournament.restMinutes=15; const g2=TE.findGame(st,st.schedule.courts.c2).game; const finishedTeams=[g2.home.id,g2.away.id]; TE.recordResult(st,cat,g2,TE.randomResult(st,cat,g2));
  const nowOn=Object.values(st.schedule.courts).filter(Boolean).map(id=>TE.findGame(st,id).game);
  assert(!nowOn.some(x=>finishedTeams.includes(x.home.id)||finishedTeams.includes(x.away.id)),'rest: just-finished teams not reassigned'); }
