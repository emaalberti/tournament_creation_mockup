/* Tournament mockup UI. Logic lives in engine.js (window.TE). */
(function () {
  'use strict';
  const { useState, useEffect } = React;
  const html = htm.bind(React.createElement);
  const STORE = 'tournament-mockup-v1';

  // ---------- persistence ----------
  function load() {
    try { const s = localStorage.getItem(STORE); if (s) return JSON.parse(s); } catch (e) { /* storage unavailable */ }
    return seed();
  }
  function save(s) { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) { /* ignore */ } }
  function xorshift(seed) { let s = seed; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e6) / 1e6; }; }

  // ---------- sample tournament (clearly labelled as example data) ----------
  function seed() {
    const st = TE.newState('PADEL', 'Autumn Padel Open (example)');
    st.tournament.status = 'PUBLISHED';
    const men = st.categories[0]; men.name = "Men's Open";
    const pairs = [['Rossi', 'Bianchi'], ['Ferrari', 'Esposito'], ['Romano', 'Colombo'], ['Ricci', 'Marino'], ['Greco', 'Bruno'], ['Gallo', 'Conti'], ['De Luca', 'Mancini'], ['Costa', 'Giordano'], ['Rizzo', 'Lombardi'], ['Moretti', 'Barbieri']];
    pairs.forEach(([a, b], i) => men.teams.push({ id: TE.uid('team'), name: `${a} / ${b}`, seed: i + 1, players: [{ id: TE.uid('pl'), name: a }, { id: TE.uid('pl'), name: b }] }));
    TE.applyFormat(st, men, 'RR_SE', 2);
    const rr = men.rounds[0];
    rr.config.pools = TE.snakePools(TE.seededTeams(men), 3);
    TE.generatePoolGames(st, men, rr);
    const counts = { [men.rounds[1].id]: 4, [men.rounds[2].id]: 4 };
    const sl = TE.generateSlots(men, rr, 'POOL', true, counts);
    TE.setAdvancement(st, men, rr, { method: 'POOL', wildcards: true, counts, slots: sl.slots });
    men.rounds[1].config.placements = [1, 3];
    TE.buildBracket(st, men, men.rounds[1]);
    const rand = xorshift(20261101);
    TE.roundGames(men, rr.id).slice(0, 8).forEach((g) => TE.recordResult(st, men, g, TE.randomResult(st, men, g, rand)));

    const am = TE.newCategory('Americano Night'); st.categories.push(am);
    ['Giulia', 'Marco', 'Sara', 'Luca', 'Elena', 'Paolo', 'Chiara', 'Davide'].forEach((n) => am.players.push({ id: TE.uid('pl'), name: n }));
    TE.applyFormat(st, am, 'AM_SE', 1);
    am.format.americano.rounds = 7;
    TE.generateAmericano(st, am, am.rounds[0]);

    st.venues.push({ id: TE.uid('ven'), name: 'Club Padel Center', spaces: [1, 2, 3, 4].map((n) => ({ id: TE.uid('sp'), name: `Court ${n}`, categoryIds: [] })) });
    st.venues[0].spaces.forEach((s) => { st.schedule.courts[s.id] = null; });
    st.schedule.blocks.push({ id: TE.uid('blk'), day: '2026-11-07', start: '09:00', end: '20:00', spaceIds: st.venues[0].spaces.map((s) => s.id) });
    TE.buildQueue(st);
    st.schedule.lastFinished = {};
    TE.fillCourts(st);
    return st;
  }

  // ---------- small UI parts ----------
  const Pill = ({ tone, children }) => html`<span className=${'pill ' + (tone || '')}>${children}</span>`;
  const Field = ({ label, hint, children, id }) => html`<label className="field" htmlFor=${id}><span className="field-label">${label}</span>${children}${hint ? html`<span className="hint">${hint}</span>` : null}</label>`;
  const Section = ({ title, sub, actions, children }) => html`<section className="panel"><header className="panel-head"><div><h2>${title}</h2>${sub ? html`<p className="sub">${sub}</p>` : null}</div>${actions ? html`<div className="row">${actions}</div>` : null}</header>${children}</section>`;
  const Note = ({ tone, children }) => html`<div className=${'note ' + (tone || '')}>${children}</div>`;
  const Btn = ({ kind, onClick, disabled, children, title }) => html`<button type="button" className=${'btn ' + (kind || '')} onClick=${onClick} disabled=${disabled} title=${title}>${children}</button>`;

  function Modal({ title, children, onClose, footer }) {
    useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
    return html`<div className="modal-back" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label=${title}>
        <header className="modal-head"><h3>${title}</h3><button className="icon-btn" aria-label="Close" onClick=${onClose}>×</button></header>
        <div className="modal-body">${children}</div>
        ${footer ? html`<footer className="modal-foot">${footer}</footer>` : null}
      </div></div>`;
  }

  // ---------- app ----------
  function App() {
    const [st, setSt] = useState(load);
    const [view, setView] = useState(() => { try { return localStorage.getItem(STORE + ':view') || 'rounds'; } catch (e) { return 'rounds'; } });
    const [catId, setCatId] = useState(() => st.categories[0].id);
    const [modal, setModal] = useState(null);
    const [toast, setToast] = useState(null);
    const [, tick] = useState(0);
    useEffect(() => { try { localStorage.setItem(STORE + ':view', view); } catch (e) { /* ignore */ } }, [view]);
    useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);

    const cat = TE.findCat(st, catId) || st.categories[0];
    const sport = TE.SPORTS[st.tournament.sport];
    function act(fn) { const d = TE.clone(st); const out = fn(d, TE.findCat(d, cat.id)); save(d); setSt(d); return out; }
    function say(msg, tone) { setToast({ msg, tone }); clearTimeout(say.t); say.t = setTimeout(() => setToast(null), 3800); }
    function ask(title, body, confirmText, fn, danger) {
      setModal(html`<${Modal} title=${title} onClose=${() => setModal(null)} footer=${html`<${Btn} kind="ghost" onClick=${() => setModal(null)}>Cancel<//><${Btn} kind=${danger ? 'danger' : 'primary'} onClick=${() => { setModal(null); fn(); }}>${confirmText}<//>`}><p>${body}</p><//>`);
    }
    const ctx = { st, cat, sport, act, say, ask, setModal, setView, setCatId };

    const nav = [
      { id: 'event', label: 'Event', done: true, info: `${sport.label} · ${st.tournament.status === 'PUBLISHED' ? 'Published' : 'Draft'}` },
      { id: 'format', label: 'Format', done: !!cat.format, info: cat.format ? TE.TEMPLATES.find((t) => t.id === cat.format.templateId).name : 'Select a format', perCat: true },
      { id: 'rules', label: 'Standings rules', done: !!cat.format, info: 'Points, tiebreakers, columns', perCat: true },
      { id: 'categories', label: 'Categories', done: true, optional: true, info: st.categories.map((c) => c.name).join(' · ') },
      { id: 'teams', label: isAm(cat) ? 'Players' : 'Teams', done: isAm(cat) ? cat.players.length >= 4 : cat.teams.length >= 2, info: isAm(cat) ? `${cat.players.length} players` : `${cat.teams.length} teams`, perCat: true },
      { id: 'rounds', label: 'Rounds', done: cat.rounds.length > 0 && cat.rounds.every((r) => r.built), info: cat.rounds.map((r) => r.name).join(' · ') || 'Choose a format first', perCat: true },
      { id: 'venues', label: 'Venues', done: st.venues.length > 0, info: `${TE.allSpaces(st).length} ${sport.space[1]}` },
      { id: 'schedule', label: 'Schedule', done: st.tournament.scheduling === 'QUEUE' ? Object.keys(st.schedule.courts).length > 0 : Object.keys(st.schedule.assignments).length > 0, info: st.tournament.scheduling === 'QUEUE' ? `Next available ${sport.space[0]}` : 'Fixed times' },
      { id: 'games', label: 'Games & results', run: true, info: `${cat.games.filter((g) => g.status !== 'SCHEDULED').length}/${cat.games.length} played`, perCat: true },
      { id: 'standings', label: 'Standings', run: true, info: 'Tables, brackets, advancing', perCat: true },
    ];
    const setupItems = nav.filter((n) => !n.run && !n.optional);
    const doneCount = setupItems.filter((n) => n.done).length;
    const cur = nav.find((n) => n.id === view) || nav[0];

    return html`<div className="app">
      <header className="topbar">
        <div className="brand"><span className="dot" aria-hidden="true"></span><div><div className="t-name">${st.tournament.name}</div><div className="t-meta">${sport.label} · tournament engine mockup</div></div></div>
        <div className="row">
          <${Pill} tone=${st.tournament.status === 'PUBLISHED' ? 'good' : 'warn'}>${st.tournament.status === 'PUBLISHED' ? 'Published' : 'Draft'}<//>
          <${Btn} kind="ghost" onClick=${() => ask('Reset the example?', 'This replaces everything with the padel example tournament.', 'Reset', () => { const s = seed(); save(s); setSt(s); setCatId(s.categories[0].id); say('Example tournament restored.'); }, true)}>Reset example<//>
        </div>
      </header>
      <div className="layout">
        <nav className="side" aria-label="Setup">
          <div className="progress"><div className="progress-label">Setup progress</div><div className="progress-num"><b>${doneCount}</b> of ${setupItems.length} complete</div><div className="bar"><span style=${{ width: (100 * doneCount) / setupItems.length + '%' }}></span></div></div>
          ${nav.map((n, i) => html`${n.id === 'games' ? html`<div className="side-sep">Run the event</div>` : null}
            <button key=${n.id} className=${'nav-item' + (view === n.id ? ' active' : '')} onClick=${() => setView(n.id)}>
              <span className=${'check' + (n.done && !n.run ? ' on' : '') + (n.run ? ' run' : '')} aria-hidden="true">${n.run ? '' : n.done ? '✓' : i + 1}</span>
              <span className="nav-text"><span className="nav-label">${n.label}${n.optional ? html` <em>optional</em>` : null}</span><span className="nav-info">${n.info}</span></span>
            </button>`)}
        </nav>
        <main className="main">
          ${cur.perCat ? html`<div className="cat-tabs" role="tablist" aria-label="Category">${st.categories.map((c) => html`<button key=${c.id} role="tab" aria-selected=${c.id === cat.id} className=${'cat-tab' + (c.id === cat.id ? ' on' : '')} onClick=${() => setCatId(c.id)}>${c.name}</button>`)}</div>` : null}
          ${view === 'event' ? html`<${EventView} ...${ctx} />` : null}
          ${view === 'format' ? html`<${FormatView} key=${cat.id} ...${ctx} />` : null}
          ${view === 'rules' ? html`<${RulesView} key=${cat.id} ...${ctx} />` : null}
          ${view === 'categories' ? html`<${CategoriesView} ...${ctx} />` : null}
          ${view === 'teams' ? html`<${TeamsView} key=${cat.id} ...${ctx} />` : null}
          ${view === 'rounds' ? html`<${RoundsView} key=${cat.id} ...${ctx} />` : null}
          ${view === 'venues' ? html`<${VenuesView} ...${ctx} />` : null}
          ${view === 'schedule' ? html`<${ScheduleView} ...${ctx} />` : null}
          ${view === 'games' ? html`<${GamesView} ...${ctx} />` : null}
          ${view === 'standings' ? html`<${StandingsView} ...${ctx} />` : null}
        </main>
      </div>
      ${modal}
      ${toast ? html`<div className=${'toast ' + (toast.tone || '')} role="status">${toast.msg}</div>` : null}
    </div>`;
  }
  const isAm = (cat) => !!(cat.format && TE.TEMPLATES.find((t) => t.id === cat.format.templateId).americano);

  // ---------- Event ----------
  function EventView({ st, act, ask, say, setCatId }) {
    const [sport, setSport] = useState(st.tournament.sport);
    const [name, setName] = useState('');
    const t = st.tournament;
    return html`<div className="stack">
      <${Section} title="Event" sub="Basics that apply to every category.">
        <div className="grid2">
          <${Field} label="Name" id="ev-name"><input id="ev-name" value=${t.name} onChange=${(e) => act((d) => { d.tournament.name = e.target.value; })} /><//>
          <${Field} label="Sport" id="ev-sport" hint="Fixed for this event. Start a new one to change it."><input id="ev-sport" value=${TE.SPORTS[t.sport].label} disabled /><//>
          <${Field} label="Minimum rest between a team's games (minutes)" id="ev-rest" hint=${`Default for ${TE.SPORTS[t.sport].label}: ${TE.SPORTS[t.sport].rest} min. 0 turns it off.`}><input id="ev-rest" type="number" min="0" step="5" value=${t.restMinutes} onChange=${(e) => act((d) => { d.tournament.restMinutes = Math.max(0, +e.target.value || 0); })} /><//>
          <${Field} label="Status" id="ev-status" hint="Results can be entered only after publishing.">
            <div className="row" id="ev-status"><${Pill} tone=${t.status === 'PUBLISHED' ? 'good' : 'warn'}>${t.status === 'PUBLISHED' ? 'Published' : 'Draft'}<//>
            <${Btn} onClick=${() => act((d) => { d.tournament.status = d.tournament.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED'; })}>${t.status === 'PUBLISHED' ? 'Back to draft' : 'Publish'}<//></div><//>
        </div>
      <//>
      <${Section} title="Start a new tournament" sub="Creates an empty event for another sport. The current event is replaced.">
        <div className="grid2">
          <${Field} label="Name" id="nt-name"><input id="nt-name" placeholder="e.g. Summer Futsal Cup" value=${name} onChange=${(e) => setName(e.target.value)} /><//>
          <${Field} label="Sport" id="nt-sport"><select id="nt-sport" value=${sport} onChange=${(e) => setSport(e.target.value)}>${Object.entries(TE.SPORTS).map(([k, v]) => html`<option value=${k}>${v.label}</option>`)}</select><//>
        </div>
        <div className="row"><${Btn} kind="primary" onClick=${() => ask('Replace the current event?', 'All categories, teams, rounds and results of the current event will be removed.', 'Create event', () => {
          const s = TE.newState(sport, name.trim() || `${TE.SPORTS[sport].label} tournament`);
          act((d) => { Object.keys(d).forEach((k) => delete d[k]); Object.assign(d, s); });
          setCatId(s.categories[0].id); say('New event created. Pick a format next.');
        }, true)}>Create event<//></div>
      <//>
      <${SportCard} sport=${t.sport} />
    </div>`;
  }
  function SportCard({ sport }) {
    const s = TE.SPORTS[sport];
    const rows = [['Space', `${s.space[0]} / ${s.space[1]}`], ['Draws in pools', s.ties ? 'Allowed' : 'Not allowed'], ['Scoring', s.sets ? `Sets (best of ${s.bestOf}), ${s.unit[1]} inside sets` : s.unit[1]], ['Default points', `Win ${s.points.win} · Tie ${s.points.tie} · Loss ${s.points.loss}`], ['Forfeit score', s.sets ? `${s.forfeitSet.join('-')} per set` : `${s.forfeit.home}-${s.forfeit.away}`], ['Default rest', `${s.rest} min`], ['Players on teams', s.players ? 'Yes (pairs)' : 'No'], ['Americano', s.americano ? 'Available' : '—'], ['Recommended scheduling', s.scheduling === 'QUEUE' ? `Next available ${s.space[0]}` : 'Fixed times']];
    return html`<${Section} title=${`${s.label} settings`} sub="Built-in sport rules used by the engine."><dl className="kv">${rows.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl><//>`;
  }

  // ---------- Format ----------
  function FormatView({ st, cat, act, ask, say }) {
    const tpls = TE.templatesFor(st.tournament.sport).slice().sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0));
    const [sel, setSel] = useState(cat.format ? cat.format.templateId : 'RR_SE');
    const [flights, setFlights] = useState(cat.format ? cat.format.flights : 1);
    const tpl = tpls.find((t) => t.id === sel) || tpls[0];
    const hasPlayoff = tpl.rounds.length > 1 && !tpl.americano;
    const preview = tpl.rounds.flatMap((r, i) => (i > 0 && hasPlayoff && flights > 1 ? Array.from({ length: flights }, (_, k) => ({ name: `${TE.letter(k)} Flight`, type: r.type })) : [r]));
    const typeName = { RR: 'Round robin', SE: 'Single elimination', DE: 'Double elimination', AM: 'Americano' };
    function apply() {
      const doit = () => { act((d, c) => TE.applyFormat(d, c, tpl.id, flights)); say(`Format saved for ${cat.name}.`); };
      if (cat.games.length) ask('Change the format?', `Changing the format deletes all ${cat.games.length} games of ${cat.name}.`, 'Change format', doit, true); else doit();
    }
    return html`<div className="stack">
      <${Section} title="Format" sub=${`Pick how ${cat.name} is played. Each category can use its own format.`}>
        <div className="tpl-grid" role="radiogroup" aria-label="Format">
          ${tpls.map((t) => html`<button key=${t.id} role="radio" aria-checked=${sel === t.id} className=${'tpl' + (sel === t.id ? ' on' : '')} onClick=${() => setSel(t.id)}>
            <span className="tpl-flow">${t.rounds.map((r, i) => html`${i ? html`<span className="arrow">→</span>` : null}<span className=${'chip t-' + r.type}>${typeName[r.type]}</span>`)}</span>
            <span className="tpl-name">${t.name}${t.recommended ? html` <${Pill} tone="accent">Recommended<//>` : null}</span>
            <span className="tpl-desc">${t.desc}</span></button>`)}
        </div>
      <//>
      ${hasPlayoff ? html`<${Section} title="Playoff brackets" sub="Use more than one bracket so every team keeps playing after pool play (A Flight for the best teams, B Flight for the next ones, …).">
        <${Field} label="How many brackets?" id="fl-n"><select id="fl-n" value=${flights} onChange=${(e) => setFlights(+e.target.value)}>${[1, 2, 3, 4, 5].map((n) => html`<option value=${n}>${n} ${n === 1 ? 'bracket' : 'brackets'}</option>`)}</select><//>
      <//>` : null}
      <${Section} title="Review" sub="Rounds that will be created." actions=${html`<${Btn} kind="primary" onClick=${apply}>${cat.format ? 'Update format' : 'Create format'}<//>`}>
        <ol className="flow">${preview.map((r) => html`<li><span className=${'chip t-' + r.type}>${typeName[r.type]}</span> ${r.name}</li>`)}</ol>
        ${cat.games.length ? html`<${Note} tone="warn">${cat.name} already has ${cat.games.length} games. Saving a format deletes them.<//>` : null}
      <//>
    </div>`;
  }

  // ---------- Standings rules ----------
  function RulesView({ st, cat, sport, act }) {
    const [newRule, setNewRule] = useState('WINS');
    const [newScope, setNewScope] = useState('O');
    if (!cat.format) return html`<${Note}>Choose a format for ${cat.name} first.<//>`;
    const f = cat.format;
    const set = (fn) => act((d, c) => fn(c.format));
    const rules = TE.rulesFor(st.tournament.sport).filter((r) => !(r === 'POINTS' && f.pointsSystem === 'NONE'));
    const am = isAm(cat);
    const pf = [['win', 'Win'], ...(sport.ties ? [['tie', 'Tie']] : []), ['loss', 'Loss'], ['cancel', 'Cancelled'], ['forfeitWin', 'Forfeit win'], ['forfeitLoss', 'Forfeit loss'], ...(sport.sets ? [['setWin', 'Per set won'], ['setLoss', 'Per set lost']] : [])];
    return html`<div className="stack">
      ${am ? html`<${Section} title="Americano" sub="Each game is played to a points total. Every player scores the points their side wins.">
        <div className="grid3">
          <${Field} label="Points per game" id="am-t" hint="Both sides together, e.g. 24."><input id="am-t" type="number" min="4" value=${f.americano.target} onChange=${(e) => set((x) => { x.americano.target = +e.target.value || 24; })} /><//>
          <${Field} label="Rounds" id="am-r" hint="Empty = everyone partners everyone (players − 1)."><input id="am-r" type="number" min="1" value=${f.americano.rounds || ''} onChange=${(e) => set((x) => { x.americano.rounds = +e.target.value || null; })} /><//>
          ${f.templateId === 'AM_SE' ? html`<${Field} label="Players in the playoff" id="am-p" hint="Top players are paired 1st + last, 2nd + second-last…"><select id="am-p" value=${f.americano.playoffPlayers} onChange=${(e) => set((x) => { x.americano.playoffPlayers = +e.target.value; })}>${[4, 8, 16].map((n) => html`<option value=${n}>${n} players (${n / 2} pairs)</option>`)}</select><//>` : null}
        </div>
        <${Note}>Player ranking: points won, then games won, then point difference, then head-to-head.<//>
      <//>` : html`
      <${Section} title="Points" sub="How will teams earn points?">
        <div className="seg" role="radiogroup">${[['POINTS', 'Based on game results'], ['AWARDED', 'Manually awarded'], ['NONE', 'Tiebreakers only']].map(([k, l]) => html`<button role="radio" aria-checked=${f.pointsSystem === k} className=${f.pointsSystem === k ? 'on' : ''} onClick=${() => set((x) => { x.pointsSystem = k; })}>${l}</button>`)}</div>
        ${f.pointsSystem === 'POINTS' ? html`<div className="grid4">${pf.map(([k, l]) => html`<${Field} label=${l} id=${'pt-' + k}><input id=${'pt-' + k} type="number" value=${f.points[k]} onChange=${(e) => set((x) => { x.points[k] = parseInt(e.target.value, 10) || 0; })} /><//>`)}</div>` : null}
        ${f.pointsSystem === 'AWARDED' ? html`<${Note}>Enter points per team on the Standings page.<//>` : null}
        ${sport.sets ? html`<${Field} label="Sets per game" id="bo"><select id="bo" value=${f.bestOf} onChange=${(e) => set((x) => { x.bestOf = +e.target.value; })}>${[1, 3, 5].map((n) => html`<option value=${n}>Best of ${n}</option>`)}</select><//>` : null}
      <//>
      <${Section} title="Tiebreakers" sub="Applied in order. Overall uses every game a team played; head-to-head uses only the games between the tied teams.">
        <ol className="tb-list">${f.tiebreakers.map((t, i) => html`<li key=${i}>
          <span className="tb-rank">${i + 1}</span>
          <span className="tb-name">${TE.RULES[t.rule].name}<small>${TE.RULES[t.rule].eq}</small></span>
          <${Pill} tone=${t.scope === 'H' ? 'accent' : ''}>${t.scope === 'H' ? 'Head to head' : 'Overall'}<//>
          <span className="row tight">
            <button className="icon-btn" aria-label="Move up" disabled=${i === 0} onClick=${() => set((x) => { const a = x.tiebreakers; [a[i - 1], a[i]] = [a[i], a[i - 1]]; })}>↑</button>
            <button className="icon-btn" aria-label="Move down" disabled=${i === f.tiebreakers.length - 1} onClick=${() => set((x) => { const a = x.tiebreakers; [a[i + 1], a[i]] = [a[i], a[i + 1]]; })}>↓</button>
            <button className="icon-btn" aria-label="Remove" onClick=${() => set((x) => { x.tiebreakers.splice(i, 1); })}>×</button>
          </span></li>`)}</ol>
        <div className="row wrap">
          <select aria-label="Rule" value=${newRule} onChange=${(e) => setNewRule(e.target.value)}>${rules.map((r) => html`<option value=${r}>${TE.RULES[r].name} (${TE.RULES[r].eq})</option>`)}</select>
          <select aria-label="Scope" value=${newScope} onChange=${(e) => setNewScope(e.target.value)}><option value="O">Overall</option><option value="H">Head to head</option></select>
          <${Btn} disabled=${f.tiebreakers.some((t) => t.rule === newRule && t.scope === newScope)} onClick=${() => set((x) => { x.tiebreakers.push({ rule: newRule, scope: newScope }); })}>Add tiebreaker<//>
          <${Btn} kind="ghost" onClick=${() => set((x) => { x.tiebreakers = TE.DEFAULT_TIEBREAKERS[st.tournament.sport].map(([rule, scope]) => ({ rule, scope })); })}>Use ${sport.label} defaults<//>
        </div>
        <${Note}>Cross-pool comparisons (wildcards, “1st of 2nds”, overall rankings) use per-game averages, so pools of different sizes compare fairly. Ties left after the last tiebreaker are ordered by the organiser when the round is confirmed.<//>
      <//>
      <${Section} title="Standings columns" sub="Shown in the public tables.">
        <div className="checks">${Object.entries(TE.COLUMNS).filter(([k]) => sport.sets || !['SF', 'SA', 'SD'].includes(k)).filter(([k]) => sport.ties || k !== 'T').map(([k, l]) => html`<label key=${k} className="check-item"><input type="checkbox" checked=${f.columns.includes(k)} onChange=${(e) => set((x) => { x.columns = e.target.checked ? Object.keys(TE.COLUMNS).filter((c) => x.columns.includes(c) || c === k) : x.columns.filter((c) => c !== k); })} /> <b>${k}</b> ${l}</label>`)}</div>
      <//>`}
    </div>`;
  }

  // ---------- Categories ----------
  function CategoriesView({ st, act, ask, say, setCatId }) {
    const [name, setName] = useState('');
    return html`<${Section} title="Categories" sub="Group participants (e.g. Men, Women, Under 12). Each category has its own teams, format, rounds and standings.">
      <ul className="list">${st.categories.map((c) => html`<li key=${c.id} className="list-row">
        <input aria-label="Category name" value=${c.name} onChange=${(e) => act((d) => { TE.findCat(d, c.id).name = e.target.value; })} />
        <span className="muted">${c.teams.length} teams · ${c.players.length} players · ${c.games.length} games</span>
        <${Btn} kind="ghost" disabled=${st.categories.length === 1} onClick=${() => ask(`Delete ${c.name}?`, 'Its teams, rounds and games are removed.', 'Delete', () => { act((d) => { d.categories = d.categories.filter((x) => x.id !== c.id); }); setCatId(st.categories.find((x) => x.id !== c.id).id); }, true)}>Delete<//>
      </li>`)}</ul>
      <form className="row" onSubmit=${(e) => { e.preventDefault(); if (!name.trim()) return; const c = TE.newCategory(name.trim()); act((d) => { d.categories.push(c); }); setName(''); setCatId(c.id); say(`${c.name} created.`); }}>
        <input aria-label="New category" placeholder="New category name" value=${name} onChange=${(e) => setName(e.target.value)} /><button className="btn primary" type="submit">Add category</button>
      </form>
    <//>`;
  }

  // ---------- Teams / players ----------
  function TeamsView({ st, cat, sport, act, ask, say }) {
    const [bulk, setBulk] = useState('');
    const am = isAm(cat);
    const list = am ? cat.players : cat.teams;
    function add() {
      const names = bulk.split('\n').map((s) => s.trim()).filter(Boolean);
      if (!names.length) return say('Enter at least one name, one per line.', 'bad');
      if (list.length + names.length > 128) return say('A category can have at most 128 entries.', 'bad');
      const doit = () => {
        act((d, c) => {
          if (am) names.forEach((n) => c.players.push({ id: TE.uid('pl'), name: n }));
          else names.forEach((n) => { const ps = sport.players ? n.split('/').map((x) => x.trim()).filter(Boolean).slice(0, 2) : []; c.teams.push({ id: TE.uid('team'), name: n, seed: null, players: ps.map((p) => ({ id: TE.uid('pl'), name: p })) }); });
          c.rounds.forEach((r) => {
            if (TE.isBracketType(r.type) && !r.fromRoundId) r.config.entrants = [];
            if (!c.games.length) return;
            TE.removeRoundGamesAndAfter(d, c, r); r.built = false;
          });
        });
        setBulk(''); say(`${names.length} added.`);
      };
      if (cat.games.length) ask('Add and reset games?', `Adding ${am ? 'players' : 'teams'} resets the ${cat.games.length} games of ${cat.name}.`, 'Yes, add', doit, true); else doit();
    }
    return html`<div className="stack">
      <${Section} title=${am ? 'Players' : 'Teams'} sub=${am ? 'Americano is played by individual players. Partners rotate each round.' : `Seeds decide pool placement and bracket order (1 = strongest).${sport.players ? ' Each team is a pair of players.' : ''}`}>
        <${Field} label=${am ? 'Add players' : 'Add teams'} id="bulk" hint=${am ? 'One player per line.' : sport.players ? 'One team per line. Write players as “Name / Name” to fill both players.' : 'One team per line.'}>
          <textarea id="bulk" rows="4" placeholder=${am ? 'Giulia\nMarco' : sport.players ? 'Rossi / Bianchi\nFerrari / Esposito' : 'Team name'} value=${bulk} onChange=${(e) => setBulk(e.target.value)}></textarea><//>
        <div className="row"><${Btn} kind="primary" onClick=${add}>Save<//><span className="muted">${list.length} / 128</span></div>
      <//>
      <${Section} title=${`${list.length} ${am ? 'players' : 'teams'} in ${cat.name}`}>
        ${list.length ? html`<div className="table-wrap"><table className="tbl"><thead><tr>${am ? null : html`<th className="num">Seed</th>`}<th>Name</th>${!am && sport.players ? html`<th>Player 1</th><th>Player 2</th>` : null}<th></th></tr></thead><tbody>
          ${list.map((t) => html`<tr key=${t.id}>
            ${am ? null : html`<td className="num"><input className="seed" aria-label="Seed" type="number" min="1" value=${t.seed || ''} onChange=${(e) => act((d, c) => { c.teams.find((x) => x.id === t.id).seed = +e.target.value || null; })} /></td>`}
            <td><input aria-label="Name" value=${t.name} onChange=${(e) => act((d, c) => { (am ? c.players : c.teams).find((x) => x.id === t.id).name = e.target.value; })} /></td>
            ${!am && sport.players ? [0, 1].map((k) => html`<td><input aria-label=${'Player ' + (k + 1)} value=${(t.players[k] || {}).name || ''} placeholder="Player" onChange=${(e) => act((d, c) => { const tt = c.teams.find((x) => x.id === t.id); if (!tt.players[k]) tt.players[k] = { id: TE.uid('pl'), name: '' }; tt.players[k].name = e.target.value; })} /></td>`) : null}
            <td className="end"><button className="icon-btn" aria-label="Remove" onClick=${() => ask('Remove?', `${t.name} will be removed${cat.games.length ? ' and the games of this category reset' : ''}.`, 'Remove', () => act((d, c) => { if (am) c.players = c.players.filter((x) => x.id !== t.id); else c.teams = c.teams.filter((x) => x.id !== t.id); c.rounds.forEach((r) => { if (r.config.pools) r.config.pools.forEach((p) => { p.teamIds = p.teamIds.filter((x) => x !== t.id); }); if (TE.isBracketType(r.type) && !r.fromRoundId) r.config.entrants = []; TE.removeRoundGamesAndAfter(d, c, r); r.built = false; }); }), true)}>×</button></td>
          </tr>`)}</tbody></table></div>` : html`<${Note}>No ${am ? 'players' : 'teams'} yet. Paste a list above.<//>`}
      <//>
    </div>`;
  }

  // ---------- Rounds ----------
  function RoundsView(p) {
    const { cat } = p;
    if (!cat.format) return html`<${Note}>Choose a format for ${cat.name} first.<//>`;
    return html`<div className="stack">${cat.rounds.map((r) => html`<${RoundCard} key=${r.id} ...${p} round=${r} />`)}</div>`;
  }
  function RoundCard(p) {
    const { round } = p;
    const kind = { RR: 'Round robin', SE: 'Single elimination', DE: 'Double elimination', AM: 'Americano' }[round.type];
    return html`<${Section} title=${round.name} sub=${kind + (round.built ? ' · ready' : ' · not set up')}>
      ${round.type === 'RR' ? html`<${PoolSetup} ...${p} />` : null}
      ${round.type === 'AM' ? html`<${AmericanoSetup} ...${p} />` : null}
      ${(round.type === 'RR' || round.type === 'AM') && p.cat.rounds.some((r) => r.fromRoundId === round.id) ? html`<${Advancing} ...${p} />` : null}
      ${TE.isBracketType(round.type) ? html`<${BracketSetup} ...${p} />` : null}
    <//>`;
  }
  function PoolSetup({ st, cat, round, act, ask, say, sport }) {
    const cfg = round.config;
    const ids = TE.seededTeams(cat);
    const maxPools = Math.max(1, Math.floor(ids.length / 2));
    const pools = cfg.pools.length ? cfg.pools : [];
    const games = TE.roundGames(cat, round.id);
    const odd = cfg.gamesMode === 'N' && cfg.gamesPerTeam % 2 === 1 && pools.some((x) => x.teamIds.length % 2 === 1);
    const guard = (fn, what) => () => (games.length ? ask('Reset this round?', `${what} clears the ${games.length} games of this round and anything after it.`, 'Continue', fn, true) : fn());
    if (ids.length < 2) return html`<${Note}>Add at least two teams first.<//>`;
    return html`<div className="stack sm">
      <div className="grid3">
        <${Field} label="Number of pools" id=${'np-' + round.id}><select id=${'np-' + round.id} value=${pools.length || ''} onChange=${(e) => { const n = +e.target.value; guard(() => act((d, c) => { const r = c.rounds.find((x) => x.id === round.id); TE.removeRoundGamesAndAfter(d, c, r); r.built = false; r.config.pools = TE.snakePools(TE.seededTeams(c), n); r.config.crossovers = []; TE.clearAdvancement(d, c, r); }), 'Changing the pools')(); }}>
          <option value="" disabled>Choose…</option>${Array.from({ length: maxPools }, (_, i) => html`<option value=${i + 1}>${i + 1} ${i ? 'pools' : 'pool'}</option>`)}</select><//>
        <${Field} label="Games per team" id=${'gm-' + round.id}><select id=${'gm-' + round.id} value=${cfg.gamesMode === 'ALL' ? 'ALL' : cfg.gamesPerTeam} onChange=${(e) => act((d, c) => { const r = c.rounds.find((x) => x.id === round.id); if (e.target.value === 'ALL') r.config.gamesMode = 'ALL'; else { r.config.gamesMode = 'N'; r.config.gamesPerTeam = +e.target.value; } })}>
          <option value="ALL">Play all teams in pool once</option>${Array.from({ length: 30 }, (_, i) => html`<option value=${i + 1}>${i + 1} ${i ? 'games' : 'game'}</option>`)}</select><//>
        <${Field} label=${`Game length (min)`} id=${'gl-' + round.id}><input id=${'gl-' + round.id} type="number" min="5" step="5" value=${TE.gameLengthFor(st, cat, round)} onChange=${(e) => act((d, c) => { c.rounds.find((x) => x.id === round.id).config.gameLength = +e.target.value || null; })} /><//>
      </div>
      ${odd ? html`<${Note} tone="warn">A pool has an odd number of teams and each team plays an odd number of games, so one team plays an extra game.<//>` : null}
      ${pools.length ? html`<div className="pools">${pools.map((pl) => html`<div key=${pl.number} className="pool"><div className="pool-head">${pl.name}<span className="muted">${pl.teamIds.length} teams</span></div>
        <ul>${pl.teamIds.map((tid) => html`<li key=${tid}><span>${TE.teamName(cat, tid)}</span>
          <select aria-label="Move to pool" value=${pl.number} onChange=${(e) => { const to = +e.target.value; guard(() => act((d, c) => { const r = c.rounds.find((x) => x.id === round.id); TE.removeRoundGamesAndAfter(d, c, r); r.built = false; r.config.pools.forEach((q) => { q.teamIds = q.teamIds.filter((x) => x !== tid); }); r.config.pools.find((q) => q.number === to).teamIds.push(tid); }), 'Moving a team')(); }}>${pools.map((q) => html`<option value=${q.number}>${q.name}</option>`)}</select></li>`)}</ul></div>`)}</div>` : null}
      ${pools.length > 1 ? html`<${Crossovers} ...${{ cat, round, act }} />` : null}
      <div className="row">
        <${Btn} kind="primary" disabled=${!pools.length} onClick=${guard(() => { act((d, c) => TE.generatePoolGames(d, c, c.rounds.find((x) => x.id === round.id))); say('Pool games generated.'); }, 'Generating games')}>${games.length ? 'Regenerate games' : 'Generate games'}<//>
        ${games.length ? html`<span className="muted">${games.length} games · numbers ${games[0].number}–${games[games.length - 1].number}</span>` : null}
      </div>
      ${games.length ? html`<details className="disclose"><summary>Preview games</summary><div className="game-mini">${games.map((g) => html`<div key=${g.id}><b>#${g.number}</b> <span className="muted">${g.label}</span> ${TE.sourceLabel(st, cat, g.home)} – ${TE.sourceLabel(st, cat, g.away)}</div>`)}</div></details>` : null}
    </div>`;
  }
  function Crossovers({ cat, round, act }) {
    const cfg = round.config;
    const [a, setA] = useState(1); const [b, setB] = useState(2);
    return html`<div className="sub-block"><div className="sub-title">Crossover pools <span className="hint">Teams of two paired pools play each other instead of their own pool.</span></div>
      ${cfg.crossovers.map(([x, y], i) => html`<div className="row" key=${i}><span>${cfg.pools[x - 1].name} ⇄ ${cfg.pools[y - 1].name}</span><button className="icon-btn" aria-label="Remove crossover" onClick=${() => act((d, c) => { c.rounds.find((r) => r.id === round.id).config.crossovers.splice(i, 1); })}>×</button></div>`)}
      <div className="row wrap"><select aria-label="First pool" value=${a} onChange=${(e) => setA(+e.target.value)}>${cfg.pools.map((q) => html`<option value=${q.number}>${q.name}</option>`)}</select><span>⇄</span>
        <select aria-label="Second pool" value=${b} onChange=${(e) => setB(+e.target.value)}>${cfg.pools.map((q) => html`<option value=${q.number}>${q.name}</option>`)}</select>
        <${Btn} disabled=${a === b || cfg.crossovers.flat().some((n) => n === a || n === b)} onClick=${() => act((d, c) => { c.rounds.find((r) => r.id === round.id).config.crossovers.push([a, b]); })}>Add crossover<//></div></div>`;
  }
  function AmericanoSetup({ st, cat, round, act, say, ask }) {
    const n = cat.players.length, games = TE.roundGames(cat, round.id);
    const rounds = cat.format.americano.rounds || n - 1;
    const ok = n >= 4 && n % 4 === 0;
    return html`<div className="stack sm">
      <dl className="kv"><div><dt>Players</dt><dd>${n}</dd></div><div><dt>Rounds</dt><dd>${rounds}</dd></div><div><dt>Games per round</dt><dd>${Math.floor(n / 4)}</dd></div><div><dt>Points per game</dt><dd>${cat.format.americano.target}</dd></div></dl>
      ${!ok ? html`<${Note} tone="bad">Americano needs a multiple of 4 players. You have ${n}.<//>` : null}
      <div className="row"><${Btn} kind="primary" disabled=${!ok} onClick=${() => { const go = () => { const r = act((d, c) => TE.generateAmericano(d, c, c.rounds.find((x) => x.id === round.id))); r && r.error ? say(r.error, 'bad') : say('Americano rounds generated.'); }; games.length ? ask('Regenerate rounds?', 'All Americano games and results are replaced.', 'Regenerate', go, true) : go(); }}>${games.length ? 'Regenerate rounds' : 'Generate rounds'}<//>
      ${games.length ? html`<span className="muted">${games.length} games. Partners rotate so repeat partnerships are avoided.</span>` : null}</div>
    </div>`;
  }
  function Advancing({ st, cat, round, act, say, ask }) {
    const next = cat.rounds.filter((r) => r.fromRoundId === round.id);
    const adv = round.config.advancement;
    const nTeams = round.config.pools ? round.config.pools.reduce((s, q) => s + q.teamIds.length, 0) : 0;
    const [method, setMethod] = useState(adv && adv.method !== 'AMERICANO' ? adv.method : 'POOL');
    const [wild, setWild] = useState(adv ? !!adv.wildcards : false);
    const [counts, setCounts] = useState(() => (adv && adv.counts) || Object.fromEntries(next.map((r, i) => [r.id, Math.min(4, Math.max(0, nTeams - 4 * i))])));
    const [err, setErr] = useState(null);
    if (round.type === 'AM') {
      return html`<div className="sub-block"><div className="sub-title">Advancing players</div>${adv ? html`<p>The top ${adv.players} players are paired for ${next[0].name}: ${Object.values(adv.slots).flat().map((s) => s.label).join(', ')}.</p>` : html`<p className="muted">Generate the rounds to create the playoff pairs.</p>`}</div>`;
    }
    const total = Object.values(counts).reduce((s, n) => s + (+n || 0), 0);
    const bracketGames = next.reduce((s, r) => s + TE.roundGames(cat, r.id).filter((g) => g.result).length, 0);
    function generate() {
      const res = TE.generateSlots(cat, round, method, wild, counts);
      if (res.error) { setErr(res.error); return; }
      setErr(null);
      const go = () => { act((d, c) => TE.setAdvancement(d, c, c.rounds.find((x) => x.id === round.id), { method, wildcards: wild, counts, slots: res.slots })); say('Advancing teams saved. Brackets were rebuilt.'); };
      bracketGames ? ask('Update advancing teams?', 'This clears results in the playoff rounds.', 'Yes, update', go, true) : go();
    }
    const move = (fromR, i, toR, j) => act((d, c) => TE.moveSlot(d, c, c.rounds.find((x) => x.id === round.id), fromR, i, toR, j));
    return html`<div className="sub-block">
      <div className="sub-title">Advancing teams <span className="hint">Decide which finishing positions go to each bracket.</span></div>
      <div className="grid3">
        <${Field} label="How will teams be ranked?" id=${'m-' + round.id}><select id=${'m-' + round.id} value=${method} onChange=${(e) => setMethod(e.target.value)}>
          <option value="POOL">Pool rankings (1st Pool A…)</option><option value="OVERALL">Overall rankings (one table)</option><option value="CROSS">Cross-pool rankings (1st of 2nds…)</option></select><//>
        ${method === 'POOL' ? html`<label className="check-item toggle"><input type="checkbox" checked=${wild} onChange=${(e) => setWild(e.target.checked)} /> <span><b>Use wildcards</b><br /><span className="hint">If not every team of a finishing position fits, the remaining spots go to the best of them across pools.</span></span></label>` : html`<div></div>`}
        <div></div>
      </div>
      <div className="grid4">${next.map((r) => html`<${Field} key=${r.id} label=${r.name} id=${'c-' + r.id}><select id=${'c-' + r.id} value=${counts[r.id] || 0} onChange=${(e) => setCounts(Object.assign({}, counts, { [r.id]: +e.target.value }))}>${Array.from({ length: nTeams + 1 }, (_, i) => html`<option value=${i}>${i} teams</option>`)}</select><//>`)}</div>
      ${total > nTeams ? html`<${Note} tone="bad">${total} spots but only ${nTeams} teams.<//>` : html`<${Note} tone=${total === nTeams ? 'good' : ''}>${total === nTeams ? 'All teams advance.' : `${nTeams - total} teams will not advance.`}<//>`}
      ${err ? html`<${Note} tone="bad">${err}<//>` : null}
      <div className="row"><${Btn} kind="primary" disabled=${!round.config.pools.length || total > nTeams} onClick=${generate}>${adv ? 'Regenerate advancing teams' : 'Generate advancing teams'}<//></div>
      ${adv ? html`<div className="flights">${next.map((r) => html`<div key=${r.id} className="flight"><div className="pool-head">${r.name}<span className="muted">${(adv.slots[r.id] || []).length} spots</span></div>
        <ol>${(adv.slots[r.id] || []).map((s, i) => html`<li key=${s.key}><span className="seedno">${i + 1}</span><span className=${'slot t-' + s.type}>${s.label}</span>
          <span className="row tight">
            <button className="icon-btn" aria-label="Move up" disabled=${i === 0} onClick=${() => move(r.id, i, r.id, i - 1)}>↑</button>
            <button className="icon-btn" aria-label="Move down" disabled=${i === adv.slots[r.id].length - 1} onClick=${() => move(r.id, i, r.id, i + 1)}>↓</button>
            ${next.length > 1 ? html`<select aria-label="Move to flight" value="" onChange=${(e) => e.target.value && move(r.id, i, e.target.value, 999)}><option value="">Move…</option>${next.filter((x) => x.id !== r.id).map((x) => html`<option value=${x.id}>${x.name}</option>`)}</select>` : null}
          </span></li>`)}</ol></div>`)}</div>
        <p className="hint">Spots are seeded top to bottom (1 = best seed). Drag order here decides the first-round matchups.</p>` : null}
    </div>`;
  }
  function BracketSetup({ st, cat, round, act, say, ask }) {
    const cfg = round.config;
    const fed = !!round.fromRoundId;
    const games = TE.roundGames(cat, round.id);
    const n = cfg.entrants.length;
    const played = games.some((g) => g.result);
    const rebuild = (fn, msg) => { const go = () => { act((d, c) => { const r = c.rounds.find((x) => x.id === round.id); fn(r, d, c); TE.buildBracket(d, c, r); }); if (msg) say(msg); }; played ? ask('Rebuild the bracket?', 'Results already entered in this bracket are removed.', 'Rebuild', go, true) : go(); };
    const [ca, setCa] = useState(''); const [cb, setCb] = useState(''); const [ra, setRa] = useState('L'); const [rb, setRb] = useState('L');
    return html`<div className="stack sm">
      ${!fed ? html`<div className="row"><${Btn} kind="primary" disabled=${cat.teams.length < 2} onClick=${() => rebuild((r, d, c) => { r.config.entrants = TE.teamEntrants(c); }, 'Bracket built from seeds.')}>${games.length ? 'Rebuild from seeds' : 'Build bracket from seeds'}<//><span className="muted">${cat.teams.length} teams. Byes go to the top seeds.</span></div>` : n ? null : html`<${Note}>Set up the advancing teams in ${cat.rounds.find((r) => r.id === round.fromRoundId).name} to fill this bracket.<//>`}
      ${!fed && n ? html`<details className="disclose"><summary>Seeding order (first-round matchups)</summary><ol className="seed-list">${cfg.entrants.map((e, i) => html`<li key=${i}><span className="seedno">${i + 1}</span>${TE.sourceLabel(st, cat, e)}<span className="row tight"><button className="icon-btn" aria-label="Move up" disabled=${i === 0} onClick=${() => rebuild((r) => { const a = r.config.entrants; [a[i - 1], a[i]] = [a[i], a[i - 1]]; })}>↑</button><button className="icon-btn" aria-label="Move down" disabled=${i === n - 1} onClick=${() => rebuild((r) => { const a = r.config.entrants; [a[i + 1], a[i]] = [a[i], a[i + 1]]; })}>↓</button></span></li>`)}</ol></details>` : null}
      ${n >= 2 ? html`<div className="grid3">
        ${round.type === 'SE' ? html`<div className="field"><span className="field-label">Placement games</span><div className="checks">${[[3, 4], [5, 8], [7, 8]].map(([pl, min]) => html`<label key=${pl} className="check-item"><input type="checkbox" disabled=${n < min || (pl === 7 && !cfg.placements.includes(5))} checked=${cfg.placements.includes(pl)} onChange=${(e) => rebuild((r) => { const s = new Set(r.config.placements); e.target.checked ? s.add(pl) : (s.delete(pl), pl === 5 && s.delete(7)); r.config.placements = [...s].sort((x, y) => x - y); })} /> ${TE.ordinal(pl)} place</label>`)}</div></div>` : html`<label className="check-item toggle"><input type="checkbox" checked=${cfg.trueDouble} onChange=${(e) => rebuild((r) => { r.config.trueDouble = e.target.checked; })} /> <span><b>Bracket reset</b><br /><span className="hint">If the lower-bracket team wins the grand final, a deciding game is played.</span></span></label>`}
      </div>` : null}
      ${round.type === 'SE' && games.length ? html`<div className="sub-block"><div className="sub-title">Consolation games <span className="hint">Extra games between winners or losers of earlier games.</span></div>
        <div className="row wrap">
          <select aria-label="Home result" value=${ra} onChange=${(e) => setRa(e.target.value)}><option value="L">Loser of</option><option value="W">Winner of</option></select>
          <select aria-label="Home game" value=${ca} onChange=${(e) => setCa(e.target.value)}><option value="">game…</option>${games.filter((g) => g.bracket !== 'C').map((g) => html`<option value=${g.number}>#${g.number} ${g.label}</option>`)}</select>
          <span>vs</span>
          <select aria-label="Away result" value=${rb} onChange=${(e) => setRb(e.target.value)}><option value="L">Loser of</option><option value="W">Winner of</option></select>
          <select aria-label="Away game" value=${cb} onChange=${(e) => setCb(e.target.value)}><option value="">game…</option>${games.filter((g) => g.bracket !== 'C').map((g) => html`<option value=${g.number}>#${g.number} ${g.label}</option>`)}</select>
          <${Btn} disabled=${!ca || !cb || (ca === cb && ra === rb)} onClick=${() => { rebuild((r) => { r.config.consolations.push({ home: { t: 'dep', game: +ca, res: ra }, away: { t: 'dep', game: +cb, res: rb } }); }, 'Consolation game added.'); setCa(''); setCb(''); }}>Add game<//>
        </div>
        ${cfg.consolations.map((c, i) => html`<div className="row" key=${i}><span>${c.home.res === 'W' ? 'Winner' : 'Loser'} of ${c.home.game} vs ${c.away.res === 'W' ? 'Winner' : 'Loser'} of ${c.away.game}</span><button className="icon-btn" aria-label="Remove" onClick=${() => rebuild((r) => { r.config.consolations.splice(i, 1); })}>×</button></div>`)}
      </div>` : null}
      ${games.length ? html`<${BracketView} st=${st} cat=${cat} round=${round} />` : null}
    </div>`;
  }

  // ---------- bracket rendering ----------
  function BracketView({ st, cat, round, onGame }) {
    const games = TE.roundGames(cat, round.id);
    const groups = {};
    const order = [];
    games.forEach((g) => { const key = (g.bracket === 'L' ? 'Lower · ' : g.bracket === 'P' || g.bracket === 'C' ? 'Placement · ' : '') + g.label; if (!groups[key]) { groups[key] = []; order.push(key); } groups[key].push(g); });
    const sections = round.type === 'DE' ? [['Upper bracket', order.filter((k) => groups[k][0].bracket === 'U')], ['Lower bracket', order.filter((k) => groups[k][0].bracket === 'L')], ['Grand final', order.filter((k) => groups[k][0].bracket === 'GF')]] : [['Main bracket', order.filter((k) => groups[k][0].bracket === 'M')], ['Placement & consolation', order.filter((k) => groups[k][0].bracket !== 'M')]];
    return html`<div className="bracket-wrap">${sections.filter(([, ks]) => ks.length).map(([title, ks]) => html`<div key=${title}><div className="sub-title">${title}</div><div className="bracket">${ks.map((k) => html`<div className="b-col" key=${k}><div className="b-col-head">${k.replace(/^(Lower|Placement) · /, '')}</div>${groups[k].map((g) => html`<${GameCard} key=${g.id} st=${st} cat=${cat} g=${g} onClick=${onGame} />`)}</div>`)}</div></div>`)}</div>`;
  }
  function GameCard({ st, cat, g, onClick }) {
    const n = TE.gameNumbers(st, cat, g);
    const needed = TE.isNeeded(st, cat, g);
    const playable = TE.isPlayable(st, cat, g);
    const side = (src, which) => {
      const win = n && n.winner === which;
      const score = !n ? '' : g.americano || !TE.SPORTS[st.tournament.sport].sets ? (which === 'home' ? n.hp : n.ap) : which === 'home' ? n.hs : n.as;
      return html`<div className=${'g-side' + (win ? ' win' : '')}><span className=${'g-name' + (TE.resolve(st, cat, src) || src.t === 'team' || src.t === 'pair' ? '' : ' ph')}>${TE.sourceLabel(st, cat, src)}</span><span className="g-score">${score}</span></div>`;
    };
    const status = !needed ? html`<${Pill}>Not needed<//>` : g.status === 'FORFEIT' ? html`<${Pill} tone="warn">Forfeit<//>` : g.status === 'CANCELLED' ? html`<${Pill}>Cancelled<//>` : g.status === 'FINAL' ? null : playable ? html`<${Pill} tone="accent">Ready<//>` : null;
    return html`<button type="button" className=${'game' + (onClick && playable ? ' clickable' : '') + (!needed ? ' dim' : '')} disabled=${!onClick || !playable} onClick=${() => onClick && onClick(g)}>
      <div className="g-top"><span>#${g.number}</span>${status}</div>${side(g.home, 'home')}${side(g.away, 'away')}</button>`;
  }

  // ---------- result entry ----------
  function openResult(ctx, g) {
    const { st, cat, setModal } = ctx;
    setModal(html`<${ResultModal} ...${ctx} game=${g} onClose=${() => setModal(null)} />`);
  }
  function ResultModal({ st, cat, sport, act, say, game, onClose, setView }) {
    const round = cat.rounds.find((r) => r.id === game.roundId);
    const prev = game.result || {};
    const bestOf = (cat.format && cat.format.bestOf) || 3;
    const [status, setStatus] = useState(game.status === 'SCHEDULED' ? 'FINAL' : game.status);
    const [home, setHome] = useState(prev.home != null ? prev.home : '');
    const [away, setAway] = useState(prev.away != null ? prev.away : '');
    const [sets, setSets] = useState(() => { const s = (prev.sets || []).map((x) => x.slice()); while (s.length < bestOf) s.push(['', '']); return s; });
    const [forfeitBy, setForfeitBy] = useState(prev.forfeitBy || '');
    const [err, setErr] = useState(null);
    const hName = TE.sourceLabel(st, cat, game.home), aName = TE.sourceLabel(st, cat, game.away);
    const usesSets = sport.sets && !game.americano;
    const confirmed = round.config.advancement && round.config.advancement.confirmed;
    if (st.tournament.status !== 'PUBLISHED') {
      return html`<${Modal} title=${`Game #${game.number}`} onClose=${onClose} footer=${html`<${Btn} kind="ghost" onClick=${onClose}>Close<//><${Btn} kind="primary" onClick=${() => { act((d) => { d.tournament.status = 'PUBLISHED'; }); onClose(); say('Published. You can now enter results.'); }}>Publish now<//>`}><p>Publish the tournament to enter results.</p><//>`;
    }
    function submit() {
      const result = { status };
      if (status === 'FINAL') {
        if (usesSets) result.sets = sets.filter((s) => s[0] !== '' && s[1] !== '').map((s) => [+s[0], +s[1]]);
        else { result.home = home === '' ? NaN : +home; result.away = away === '' ? NaN : +away; }
      }
      if (status === 'FORFEIT') result.forfeitBy = forfeitBy;
      const out = act((d, c) => TE.recordResult(d, c, c.games.find((x) => x.id === game.id), result));
      if (!out.ok) { setErr(out.error); return; }
      onClose();
      say(out.reset ? 'Result saved. The following rounds were reset; confirm the round again.' : out.warnings && out.warnings.length ? `Saved with a warning: ${out.warnings.join(' ')}` : 'Result saved.', out.reset || (out.warnings && out.warnings.length) ? 'warn' : 'good');
    }
    const num = (v, set, label) => html`<input className="score" aria-label=${label} type="number" min="0" inputMode="numeric" value=${v} onChange=${(e) => set(e.target.value)} />`;
    return html`<${Modal} title=${`Game #${game.number} · ${game.label}`} onClose=${onClose} footer=${html`
      ${game.result ? html`<${Btn} kind="ghost" onClick=${() => { act((d, c) => TE.clearResult(d, c, c.games.find((x) => x.id === game.id))); onClose(); say('Result cleared.'); }}>Clear result<//>` : null}
      <span className="spacer"></span><${Btn} kind="ghost" onClick=${onClose}>Cancel<//><${Btn} kind="primary" onClick=${submit}>Save result<//>`}>
      <div className="seg" role="radiogroup">${[['FINAL', 'Result'], ['FORFEIT', 'Forfeit'], ['CANCELLED', 'Cancel game']].map(([k, l]) => html`<button role="radio" aria-checked=${status === k} className=${status === k ? 'on' : ''} onClick=${() => setStatus(k)}>${l}</button>`)}</div>
      ${status === 'FINAL' ? usesSets ? html`<table className="sets"><thead><tr><th></th>${sets.map((_, i) => html`<th>Set ${i + 1}</th>`)}</tr></thead><tbody>
          ${[0, 1].map((side) => html`<tr><th>${side ? aName : hName}</th>${sets.map((s, i) => html`<td>${num(s[side], (v) => setSets(sets.map((x, k) => (k === i ? (side ? [x[0], v] : [v, x[1]]) : x))), `${side ? aName : hName} set ${i + 1}`)}</td>`)}</tr>`)}</tbody></table>
          <p className="hint">Leave unplayed sets empty. ${sport.unit[1][0].toUpperCase() + sport.unit[1].slice(1)} per set; tie-breaks like 7-6 or a super tie-break 10-8 are fine.</p>`
        : html`<div className="score-row"><label>${hName}${num(home, setHome, hName)}</label><span>–</span><label>${num(away, setAway, aName)}${aName}</label></div>
          ${game.americano ? html`<p className="hint">Points won by each side. They usually add up to ${cat.format.americano.target}.</p>` : null}` : null}
      ${status === 'FORFEIT' ? html`<div className="stack sm"><p>Which side forfeits? The other side wins with the default score (${sport.sets ? sport.forfeitSet.join('-') + ' per set' : sport.forfeit.home + '-' + sport.forfeit.away}).</p>
        <div className="seg">${[['home', hName], ['away', aName]].map(([k, l]) => html`<button className=${forfeitBy === k ? 'on' : ''} onClick=${() => setForfeitBy(k)}>${l}</button>`)}</div></div>` : null}
      ${status === 'CANCELLED' ? html`<p>Neither side gets points. The game no longer counts as played.</p>` : null}
      ${confirmed ? html`<${Note} tone="warn">This round is already confirmed. Saving resets the following rounds.<//>` : null}
      ${err ? html`<${Note} tone="bad">${err}<//>` : null}
    <//>`;
  }

  // ---------- Games ----------
  function GamesView(ctx) {
    const { st, cat, act, say } = ctx;
    if (!cat.games.length) return html`<${Note}>No games yet. Set up the rounds of ${cat.name} first.<//>`;
    return html`<div className="stack">${cat.rounds.map((r) => {
      const games = TE.roundGames(cat, r.id);
      if (!games.length) return null;
      const left = games.filter((g) => g.status === 'SCHEDULED' && TE.isNeeded(st, cat, g)).length;
      const ready = games.filter((g) => g.status === 'SCHEDULED' && TE.isPlayable(st, cat, g)).length;
      return html`<${Section} key=${r.id} title=${r.name} sub=${`${games.length - left} of ${games.length} played · ${ready} ready to play`} actions=${html`<${Btn} kind="ghost" disabled=${!ready || st.tournament.status !== 'PUBLISHED'} title="Fills in random results so you can test the flow" onClick=${() => { const n = act((d, c) => TE.simulateRound(d, c, c.rounds.find((x) => x.id === r.id))); say(`${n} example results entered.`); }}>Fill example results<//>`}>
        ${TE.isBracketType(r.type) ? html`<${BracketView} st=${st} cat=${cat} round=${r} onGame=${(g) => openResult(ctx, g)} />`
        : html`<div className="game-grid">${games.map((g) => html`<div key=${g.id} className="game-cell"><div className="muted small">${g.label}${g.matchday ? ` · ${r.type === 'AM' ? 'round' : 'matchday'} ${g.matchday}` : ''}</div><${GameCard} st=${st} cat=${cat} g=${g} onClick=${(x) => openResult(ctx, x)} /></div>`)}</div>`}
      <//>`;
    })}</div>`;
  }

  // ---------- Standings ----------
  function StandingsView(ctx) {
    const { st, cat } = ctx;
    if (!cat.format || !cat.rounds.some((r) => r.built)) return html`<${Note}>Standings appear once the rounds of ${cat.name} are set up.<//>`;
    return html`<div className="stack">${cat.rounds.map((r) => {
      if (!r.built) return null;
      if (r.type === 'RR') return html`<${PoolTables} key=${r.id} ...${ctx} round=${r} />`;
      if (r.type === 'AM') return html`<${AmericanoTable} key=${r.id} ...${ctx} round=${r} />`;
      return html`<${Section} key=${r.id} title=${r.name} sub="Bracket"><${BracketView} st=${st} cat=${cat} round=${r} onGame=${(g) => openResult(ctx, g)} /><//>`;
    })}</div>`;
  }
  function StandingsTable({ rows, cols, nameOf, markRanks, cat, editAwarded, act }) {
    return html`<div className="table-wrap"><table className="tbl stand"><thead><tr><th className="num">#</th><th>Team</th>${cols.map((c) => html`<th className="num" title=${TE.COLUMNS[c]}>${c}</th>`)}</tr></thead>
      <tbody>${rows.map((r) => html`<tr key=${r.id} className=${markRanks && markRanks.has(r.rank) ? 'adv' : ''}><td className="num">${r.rank}${r.tied ? html`<span className="tie" title="Tied: order is decided at confirmation">=</span>` : null}</td><td>${nameOf(r.id)}</td>
        ${cols.map((c) => html`<td className="num">${c === 'PTS' && editAwarded ? html`<input className="seed" aria-label="Awarded points" type="number" value=${(cat.format.awarded || {})[r.id] || 0} onChange=${(e) => act((d, cc) => { cc.format.awarded = cc.format.awarded || {}; cc.format.awarded[r.id] = +e.target.value || 0; })} />` : c === 'PD' || c === 'SD' ? (r[c] > 0 ? '+' : '') + r[c] : r[c]}</td>`)}</tr>`)}</tbody></table></div>`;
  }
  function PoolTables(ctx) {
    const { st, cat, round, act } = ctx;
    const adv = round.config.advancement;
    const ps = TE.poolStandings(st, cat, round, adv ? adv.tieOrders : {});
    const cols = cat.format.columns;
    const slots = adv ? Object.values(adv.slots).flat() : [];
    return html`<${Section} title=${round.name} sub="Pool standings">
      <div className="pool-tables">${ps.map((p) => html`<div key=${p.pool.number}><div className="sub-title">${p.pool.name}</div>
        <${StandingsTable} rows=${p.rows} cols=${cols} cat=${cat} act=${act} editAwarded=${cat.format.pointsSystem === 'AWARDED'} nameOf=${(id) => TE.teamName(cat, id)} markRanks=${new Set(slots.filter((s) => (s.type === 'POOL' && s.pool === p.pool.number)).map((s) => s.rank))} /></div>`)}</div>
      ${adv && ps.length > 1 ? html`<details className="disclose"><summary>Overall table (per-game averages decide across pools)</summary><${StandingsTable} rows=${TE.overallStandings(st, cat, round, adv.tieOrders)} cols=${cols} cat=${cat} nameOf=${(id) => TE.teamName(cat, id)} /></details>` : null}
      ${adv ? html`<${Transition} ...${ctx} />` : null}
    <//>`;
  }
  function AmericanoTable(ctx) {
    const { st, cat, round } = ctx;
    const adv = round.config.advancement;
    const rows = TE.americanoStandings(st, cat, round, adv ? adv.tieOrders : {});
    return html`<${Section} title=${round.name} sub="Player standings: points won, then wins, then point difference">
      <${StandingsTable} rows=${rows} cols=${['GP', 'W', 'L', 'PF', 'PA', 'PD', 'PTS']} cat=${cat} nameOf=${(id) => TE.playerName(cat, id)} markRanks=${new Set(adv ? Array.from({ length: adv.players }, (_, i) => i + 1) : [])} />
      ${adv ? html`<${Transition} ...${ctx} />` : null}
    <//>`;
  }
  function Transition({ st, cat, round, act, say }) {
    const adv = round.config.advancement;
    const next = cat.rounds.filter((r) => r.fromRoundId === round.id);
    const games = TE.roundGames(cat, round.id);
    const left = games.filter((g) => g.status === 'SCHEDULED').length;
    const ties = TE.relevantTies(st, cat, round, true);
    const isPl = round.type === 'AM';
    const name = (id) => (isPl ? TE.playerName(cat, id) : TE.teamName(cat, id));
    const orderOf = (t) => { const m = adv.tieOrders[t.key]; return m && m.length === t.ids.length && m.every((x) => t.ids.includes(x)) ? m : null; };
    const unresolved = ties.filter((t) => !orderOf(t));
    const setOrder = (key, ids) => act((d, c) => { c.rounds.find((x) => x.id === round.id).config.advancement.tieOrders[key] = ids; });
    if (adv.confirmed) {
      return html`<div className="transition done"><div className="sub-title">${next.map((r) => r.name).join(' · ')}</div>
        <${Note} tone="good">Teams have moved into the next round.<//>
        <ul className="resolved">${Object.values(adv.slots).flat().map((s) => html`<li key=${s.key}><span className="muted">${s.label}</span> → <b>${TE.teamName(cat, adv.resolved[s.key])}</b></li>`)}</ul>
        <div className="row"><${Btn} kind="ghost" onClick=${() => { act((d, c) => TE.unconfirm(d, c, c.rounds.find((x) => x.id === round.id))); say('Confirmation undone. Playoff results were cleared.', 'warn'); }}>Undo confirmation<//></div></div>`;
    }
    return html`<div className="transition">
      <div className="sub-title">Ready to start ${next.map((r) => r.name).join(' and ')}?</div>
      ${left ? html`<${Note}>${left} ${left === 1 ? 'game needs' : 'games need'} a result first. Cancel or forfeit games that will not be played.<//>` : html`
        ${ties.length ? html`<p>Resolve the ties that decide who advances. Order the teams, then keep the order.</p>
          <div className="ties">${ties.map((t) => { const ids = orderOf(t) || t.ids; return html`<div key=${t.key} className=${'tie-box' + (orderOf(t) ? ' ok' : '')}><div className="tie-title">${t.title}${orderOf(t) ? html` <${Pill} tone="good">Ordered<//>` : null}</div>
            <ol>${ids.map((id, i) => html`<li key=${id}>${name(id)}<span className="row tight"><button className="icon-btn" aria-label="Move up" disabled=${i === 0} onClick=${() => { const a = ids.slice(); [a[i - 1], a[i]] = [a[i], a[i - 1]]; setOrder(t.key, a); }}>↑</button><button className="icon-btn" aria-label="Move down" disabled=${i === ids.length - 1} onClick=${() => { const a = ids.slice(); [a[i + 1], a[i]] = [a[i], a[i + 1]]; setOrder(t.key, a); }}>↓</button></span></li>`)}</ol>
            ${orderOf(t) ? null : html`<${Btn} onClick=${() => setOrder(t.key, ids)}>Keep this order<//>`}</div>`; })}</div>` : html`<${Note} tone="good">There are no ties to resolve.<//>`}
        <div className="row"><${Btn} kind="primary" disabled=${unresolved.length > 0} onClick=${() => { const r = act((d, c) => { const out = TE.confirmAdvancement(d, c, c.rounds.find((x) => x.id === round.id)); if (out.ok && d.tournament.scheduling === 'QUEUE') TE.fillCourts(d); return out; }); r.ok ? say('Teams have moved into the next round.', 'good') : say(r.error, 'bad'); }}>Confirm ${next.length > 1 ? 'brackets' : 'bracket'}<//></div>`}
    </div>`;
  }

  // ---------- Venues ----------
  function VenuesView({ st, sport, act, ask }) {
    const [name, setName] = useState(''); const [n, setN] = useState(4);
    return html`<div className="stack"><${Section} title="Venues" sub=${`Each venue has one or more ${sport.space[1]}. Removing a ${sport.space[0]} leaves its games unscheduled.`}>
      ${st.venues.map((v) => html`<div key=${v.id} className="venue">
        <div className="row"><input aria-label="Venue name" value=${v.name} onChange=${(e) => act((d) => { d.venues.find((x) => x.id === v.id).name = e.target.value; })} />
          <${Btn} kind="ghost" onClick=${() => act((d) => { const vv = d.venues.find((x) => x.id === v.id); const sp = { id: TE.uid('sp'), name: `${sport.space[0][0].toUpperCase() + sport.space[0].slice(1)} ${vv.spaces.length + 1}`, categoryIds: [] }; vv.spaces.push(sp); if (d.tournament.scheduling === 'QUEUE') d.schedule.courts[sp.id] = null; })}>Add ${sport.space[0]}<//>
          <${Btn} kind="ghost" onClick=${() => ask(`Delete ${v.name}?`, `Games on its ${sport.space[1]} become unscheduled.`, 'Delete', () => act((d) => { const vv = d.venues.find((x) => x.id === v.id); vv.spaces.forEach((s) => { delete d.schedule.courts[s.id]; d.schedule.blocks.forEach((b) => { b.spaceIds = b.spaceIds.filter((x) => x !== s.id); }); Object.keys(d.schedule.assignments).forEach((g) => { if (d.schedule.assignments[g].spaceId === s.id) delete d.schedule.assignments[g]; }); }); d.venues = d.venues.filter((x) => x.id !== v.id); }), true)}>Delete venue<//></div>
        <div className="table-wrap"><table className="tbl"><thead><tr><th>${sport.space[0][0].toUpperCase() + sport.space[0].slice(1)}</th><th>Only for categories</th><th></th></tr></thead><tbody>
          ${v.spaces.map((s) => html`<tr key=${s.id}><td><input aria-label="Name" value=${s.name} onChange=${(e) => act((d) => { d.venues.find((x) => x.id === v.id).spaces.find((x) => x.id === s.id).name = e.target.value; })} /></td>
            <td><div className="checks">${st.categories.map((c) => html`<label key=${c.id} className="check-item"><input type="checkbox" checked=${(s.categoryIds || []).includes(c.id)} onChange=${(e) => act((d) => { const ss = d.venues.find((x) => x.id === v.id).spaces.find((x) => x.id === s.id); ss.categoryIds = e.target.checked ? [...(ss.categoryIds || []), c.id] : ss.categoryIds.filter((x) => x !== c.id); })} /> ${c.name}</label>`)}</div></td>
            <td className="end"><button className="icon-btn" aria-label="Remove" onClick=${() => act((d) => { const vv = d.venues.find((x) => x.id === v.id); vv.spaces = vv.spaces.filter((x) => x.id !== s.id); delete d.schedule.courts[s.id]; d.schedule.blocks.forEach((b) => { b.spaceIds = b.spaceIds.filter((x) => x !== s.id); }); Object.keys(d.schedule.assignments).forEach((g) => { if (d.schedule.assignments[g].spaceId === s.id) delete d.schedule.assignments[g]; }); })}>×</button></td></tr>`)}
        </tbody></table></div><p className="hint">No category ticked = any category can play there.</p></div>`)}
      <form className="row wrap" onSubmit=${(e) => { e.preventDefault(); if (!name.trim()) return; act((d) => { const sp = Array.from({ length: Math.max(1, n) }, (_, i) => ({ id: TE.uid('sp'), name: `${sport.space[0][0].toUpperCase() + sport.space[0].slice(1)} ${i + 1}`, categoryIds: [] })); d.venues.push({ id: TE.uid('ven'), name: name.trim(), spaces: sp }); if (d.tournament.scheduling === 'QUEUE') sp.forEach((s) => { d.schedule.courts[s.id] = null; }); }); setName(''); }}>
        <input aria-label="Venue name" placeholder="Venue name" value=${name} onChange=${(e) => setName(e.target.value)} />
        <input aria-label=${`Number of ${sport.space[1]}`} className="seed" type="number" min="1" value=${n} onChange=${(e) => setN(+e.target.value)} /><span className="muted">${sport.space[1]}</span>
        <button className="btn primary" type="submit">Add venue</button></form>
    <//></div>`;
  }

  // ---------- Schedule ----------
  function ScheduleView(ctx) {
    const { st, sport, act } = ctx;
    if (!st.venues.length) return html`<${Note}>Add a venue first.<//>`;
    return html`<div className="stack">
      <${Section} title="How will games be scheduled?">
        <div className="seg" role="radiogroup">${[['FIXED', `Assigned ${sport.space[1]} & times`], ['QUEUE', `Next available ${sport.space[0]}`]].map(([k, l]) => html`<button role="radio" aria-checked=${st.tournament.scheduling === k} className=${st.tournament.scheduling === k ? 'on' : ''} onClick=${() => act((d) => { d.tournament.scheduling = k; if (k === 'QUEUE' && !Object.keys(d.schedule.courts).length) TE.allSpaces(d).forEach((s) => { d.schedule.courts[s.id] = null; }); })}>${l}</button>`)}</div>
        <p className="hint">${st.tournament.scheduling === 'FIXED' ? 'Every game gets a time and a place up front.' : `Games wait in a queue. Each finished game frees its ${sport.space[0]} for the next game in line. Recommended for padel.`} Minimum rest between a team's games: ${st.tournament.restMinutes} min (change it under Event).</p>
      <//>
      ${st.tournament.scheduling === 'FIXED' ? html`<${FixedSchedule} ...${ctx} />` : html`<${QueueSchedule} ...${ctx} />`}
    </div>`;
  }
  function FixedSchedule(ctx) {
    const { st, sport, act, say } = ctx;
    const spaces = TE.allSpaces(st);
    const s = st.schedule;
    const rows = Object.entries(s.assignments).map(([gid, a]) => { const f = TE.findGame(st, gid); return f && Object.assign({ f }, a); }).filter(Boolean).sort((x, y) => (x.day + x.start).localeCompare(y.day + y.start) || spaces.findIndex((q) => q.id === x.spaceId) - spaces.findIndex((q) => q.id === y.spaceId));
    return html`<${Section} title="Time blocks" sub=${`When games can be played, and on which ${sport.space[1]}.`} actions=${html`<${Btn} kind="primary" disabled=${!s.blocks.length} onClick=${() => { const r = act((d) => TE.generateFixedSchedule(d)); say(r.unplaced ? `${r.placed} games scheduled. ${r.unplaced} did not fit.` : `All ${r.placed} games scheduled.`, r.unplaced ? 'warn' : 'good'); }}>Generate schedule<//>`}>
        ${s.blocks.map((b, i) => html`<div key=${b.id} className="block-row">
          <input aria-label="Day" type="date" value=${b.day} onChange=${(e) => act((d) => { d.schedule.blocks[i].day = e.target.value; })} />
          <input aria-label="Start" type="time" value=${b.start} onChange=${(e) => act((d) => { d.schedule.blocks[i].start = e.target.value; })} />
          <input aria-label="End" type="time" value=${b.end} onChange=${(e) => act((d) => { d.schedule.blocks[i].end = e.target.value; })} />
          <div className="checks">${spaces.map((sp) => html`<label key=${sp.id} className="check-item"><input type="checkbox" checked=${b.spaceIds.includes(sp.id)} onChange=${(e) => act((d) => { const bb = d.schedule.blocks[i]; bb.spaceIds = e.target.checked ? [...bb.spaceIds, sp.id] : bb.spaceIds.filter((x) => x !== sp.id); })} /> ${sp.name}</label>`)}</div>
          <button className="icon-btn" aria-label="Remove block" onClick=${() => act((d) => { d.schedule.blocks.splice(i, 1); })}>×</button></div>`)}
        <div className="row"><${Btn} onClick=${() => act((d) => { const last = d.schedule.blocks[d.schedule.blocks.length - 1]; d.schedule.blocks.push({ id: TE.uid('blk'), day: last ? last.day : '2026-11-07', start: '09:00', end: '18:00', spaceIds: TE.allSpaces(d).map((x) => x.id) }); })}>Add time block<//><span className="hint">Game lengths are set per round on the Rounds page.</span></div>
        ${s.unplaced.length ? html`<${Note} tone="warn">${s.unplaced.length} games did not fit. Lengthen a block, add a ${sport.space[0]} or shorten games, then generate again.<//>` : null}
        ${rows.length ? html`<div className="table-wrap"><table className="tbl"><thead><tr><th>Day</th><th>Time</th><th>${sport.space[0]}</th><th>Category</th><th className="num">#</th><th>Game</th></tr></thead><tbody>
          ${rows.map((r) => html`<tr key=${r.f.game.id}><td>${r.day}</td><td className="num">${r.start}–${r.end}</td><td>${(spaces.find((q) => q.id === r.spaceId) || {}).name}</td><td>${r.f.cat.name}</td><td className="num">${r.f.game.number}</td><td><span className="muted">${r.f.game.label}</span> ${TE.sourceLabel(st, r.f.cat, r.f.game.home)} – ${TE.sourceLabel(st, r.f.cat, r.f.game.away)}</td></tr>`)}</tbody></table></div>` : null}
      <//>`;
  }
  function QueueSchedule(ctx) {
    const { st, sport, act, say } = ctx;
    const s = st.schedule;
    const spaces = TE.allSpaces(st);
    const now = Date.now();
    const rest = (+st.tournament.restMinutes || 0) * 60000;
    const busy = new Set();
    Object.values(s.courts).filter(Boolean).forEach((gid) => { const f = TE.findGame(st, gid); if (f) { const sd = TE.sidesOf(st, f.cat, f.game); [...(sd.home || []), ...(sd.away || [])].forEach((p) => busy.add(p)); } });
    const why = (f) => {
      if (!TE.isPlayable(st, f.cat, f.game)) return 'Waiting for earlier results';
      const sd = TE.sidesOf(st, f.cat, f.game); const ps = [...sd.home, ...sd.away];
      if (ps.some((p) => busy.has(p))) return 'A team is on court';
      const r = ps.map((p) => (s.lastFinished[p] ? rest - (now - s.lastFinished[p]) : 0)).filter((x) => x > 0);
      if (r.length) return `Resting · ${Math.ceil(Math.max(...r) / 60000)} min`;
      return 'Ready';
    };
    const queue = s.queue.map((id) => TE.findGame(st, id)).filter(Boolean).filter((f) => !Object.values(s.courts).includes(f.game.id));
    return html`<div className="stack">
      <${Section} title=${`${sport.space[1][0].toUpperCase() + sport.space[1].slice(1)} in use`} actions=${html`<label className="check-item"><input type="checkbox" checked=${s.auto} onChange=${(e) => act((d) => { d.schedule.auto = e.target.checked; if (e.target.checked) TE.fillCourts(d); })} /> Automatic assignment</label><${Btn} onClick=${() => { act((d) => { TE.fillCourts(d); }); }}>Fill free ${sport.space[1]}<//>`}>
        <div className="checks">${spaces.map((sp) => html`<label key=${sp.id} className="check-item"><input type="checkbox" checked=${sp.id in s.courts} onChange=${(e) => act((d) => { if (e.target.checked) d.schedule.courts[sp.id] = null; else delete d.schedule.courts[sp.id]; })} /> ${sp.name}</label>`)}</div>
        <div className="courts">${spaces.filter((sp) => sp.id in s.courts).map((sp) => { const gid = s.courts[sp.id]; const f = gid && TE.findGame(st, gid); return html`<div key=${sp.id} className=${'court' + (f ? ' busy' : '')}>
          <div className="court-head"><b>${sp.name}</b>${f ? html`<${Pill} tone="accent">Playing<//>` : html`<${Pill}>Free<//>`}</div>
          ${f ? html`<div className="court-game"><div className="muted small">${f.cat.name} · #${f.game.number} ${f.game.label}</div><div>${TE.sourceLabel(st, f.cat, f.game.home)}</div><div className="muted">vs</div><div>${TE.sourceLabel(st, f.cat, f.game.away)}</div></div>
            <div className="row"><${Btn} kind="primary" onClick=${() => openResult(Object.assign({}, ctx, { cat: f.cat, act: (fn) => act((d) => fn(d, TE.findCat(d, f.cat.id))) }), f.game)}>Enter result<//><${Btn} kind="ghost" onClick=${() => act((d) => { d.schedule.courts[sp.id] = null; })}>Back to queue<//></div>`
          : !s.auto ? html`<select aria-label="Assign game" value="" onChange=${(e) => e.target.value && act((d) => { d.schedule.courts[sp.id] = e.target.value; })}><option value="">Assign a game…</option>${queue.filter((q) => why(q) === 'Ready').map((q) => html`<option value=${q.game.id}>#${q.game.number} ${TE.sourceLabel(st, q.cat, q.game.home)} – ${TE.sourceLabel(st, q.cat, q.game.away)}</option>`)}</select>` : html`<p className="muted small">No game can start: every queued game is waiting for a team or a result.</p>`}
        </div>`; })}</div>
      <//>
      <${Section} title="Upcoming games" sub="The first ready game takes the next free court. Reorder to spread out a team's games or prioritise a category." actions=${html`<${Btn} kind="ghost" onClick=${() => { act((d) => { TE.buildQueue(d); }); say('Queue rebuilt from the rounds.'); }}>Rebuild queue<//>`}>
        ${queue.length ? html`<ol className="queue">${queue.slice(0, 40).map((f, i) => html`<li key=${f.game.id}><span className="seedno">${i + 1}</span><span className="q-game"><span className="muted small">${f.cat.name} · #${f.game.number} ${f.game.label}</span><span>${TE.sourceLabel(st, f.cat, f.game.home)} – ${TE.sourceLabel(st, f.cat, f.game.away)}</span></span>
          <${Pill} tone=${why(f) === 'Ready' ? 'good' : ''}>${why(f)}<//>
          <span className="row tight"><button className="icon-btn" aria-label="Move up" disabled=${i === 0} onClick=${() => act((d) => { const q = d.schedule.queue; const a = q.indexOf(f.game.id), b = q.indexOf(queue[i - 1].game.id); [q[a], q[b]] = [q[b], q[a]]; })}>↑</button><button className="icon-btn" aria-label="Move down" disabled=${i === queue.length - 1} onClick=${() => act((d) => { const q = d.schedule.queue; const a = q.indexOf(f.game.id), b = q.indexOf(queue[i + 1].game.id); [q[a], q[b]] = [q[b], q[a]]; })}>↓</button></span></li>`)}</ol>
          ${queue.length > 40 ? html`<p className="hint">+ ${queue.length - 40} more</p>` : null}` : html`<${Note}>The queue is empty. Rebuild it after generating games.<//>`}
      <//>
    </div>`;
  }

  ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
})();
