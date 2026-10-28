/* Tournament mockup UI. Logic lives in engine.js (window.TE): a category is a graph of phases linked by connectors. */
(function () {
  'use strict';
  const { useState, useEffect } = React;
  const html = htm.bind(React.createElement);
  const STORE = 'tournament-mockup-v2';

  // ---------- persistence ----------
  function load() {
    try { const s = localStorage.getItem(STORE); if (s) { const p = JSON.parse(s); if (p && p.version === 2) return p; } } catch (e) { /* storage unavailable */ }
    return seed();
  }
  function save(s) { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) { /* ignore */ } }
  function xorshift(seed) { let s = seed; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e6) / 1e6; }; }

  // ---------- sample tournament (clearly labelled as example data) ----------
  function seed() {
    const st = TE.newState('PADEL', 'Autumn Padel Open (example)');
    st.tournament.status = 'PUBLISHED';
    const men = st.categories[0]; men.name = "Men's Open"; men.format = TE.defaultRules('PADEL');
    const pairs = [['Rossi', 'Bianchi'], ['Ferrari', 'Esposito'], ['Romano', 'Colombo'], ['Ricci', 'Marino'], ['Greco', 'Bruno'], ['Gallo', 'Conti'], ['De Luca', 'Mancini'], ['Costa', 'Giordano'], ['Rizzo', 'Lombardi'], ['Moretti', 'Barbieri']];
    pairs.forEach(([a, b], i) => men.teams.push({ id: TE.uid('team'), name: `${a} / ${b}`, seed: i + 1, players: [{ id: TE.uid('pl'), name: a }, { id: TE.uid('pl'), name: b }] }));
    TE.applyTemplate(st, men, 'RR_SE', 2);
    const A = TE.sortedPhases(men)[1]; A.config.placements = [1, 3]; TE.rebuildPhase(st, men, A);
    const rand = xorshift(20261101);
    const pool = TE.sortedPhases(men)[0];
    TE.phaseGames(men, pool.id).slice(0, 8).forEach((g) => TE.recordResult(st, men, g, TE.randomResult(st, men, g, rand)));

    const am = TE.newCategory('Americano Night', 'PADEL'); st.categories.push(am);
    ['Giulia', 'Marco', 'Sara', 'Luca', 'Elena', 'Paolo', 'Chiara', 'Davide'].forEach((n) => am.players.push({ id: TE.uid('pl'), name: n }));
    am.format.americano.rounds = 7;
    TE.applyTemplate(st, am, 'AM_SE');

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
  const statusTone = { DRAFT: 'warn', READY: '', IN_PROGRESS: 'accent', COMPLETE: 'warn', CONFIRMED: 'good' };
  const StatusPill = ({ st, cat, phase }) => { const s = TE.phaseStatus(st, cat, phase); return html`<${Pill} tone=${statusTone[s]}>${TE.STATUS_LABEL[s]}<//>`; };
  const typeChip = (type) => html`<span className=${'chip t-' + type}>${TE.PHASE_TYPES[type].label}</span>`;

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
    const [view, setView] = useState(() => { try { return localStorage.getItem(STORE + ':view') || 'format'; } catch (e) { return 'format'; } });
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
    const phases = TE.sortedPhases(cat);
    const graph = TE.validateGraph(st, cat);

    const nav = [
      { id: 'event', label: 'Event', done: true, info: `${sport.label} · ${st.tournament.status === 'PUBLISHED' ? 'Published' : 'Draft'}` },
      { id: 'rules', label: 'Standings rules', done: true, info: 'Points, tiebreakers, columns', perCat: true },
      { id: 'categories', label: 'Categories', done: true, optional: true, info: st.categories.map((c) => c.name).join(' · ') },
      { id: 'teams', label: usesPlayers(cat) ? 'Players' : 'Teams', done: usesPlayers(cat) ? cat.players.length >= 4 : cat.teams.filter((t) => !t.fromAmericano).length >= 2, info: usesPlayers(cat) ? `${cat.players.length} players` : `${cat.teams.filter((t) => !t.fromAmericano).length} teams`, perCat: true },
      { id: 'format', label: 'Format', done: phases.length > 0 && !graph.errors.length, info: phases.length ? phases.map((p) => p.name).join(' → ') : 'Build the phases', perCat: true },
      { id: 'phases', label: 'Phase setup', done: phases.length > 0 && phases.every((p) => p.built), info: `${phases.filter((p) => p.built).length} of ${phases.length} ready`, perCat: true },
      { id: 'venues', label: 'Venues', done: st.venues.length > 0, info: `${TE.allSpaces(st).length} ${sport.space[1]}` },
      { id: 'schedule', label: 'Schedule', done: st.tournament.scheduling === 'QUEUE' ? Object.keys(st.schedule.courts).length > 0 : Object.keys(st.schedule.assignments).length > 0, info: st.tournament.scheduling === 'QUEUE' ? `Next available ${sport.space[0]}` : 'Fixed times' },
      { id: 'games', label: 'Games & results', run: true, info: `${cat.games.filter((g) => g.status !== 'SCHEDULED').length}/${cat.games.length} played`, perCat: true },
      { id: 'standings', label: 'Standings', run: true, info: 'Rankings, brackets, confirm phases', perCat: true },
    ];
    const setupItems = nav.filter((n) => !n.run && !n.optional);
    const doneCount = setupItems.filter((n) => n.done).length;
    const cur = nav.find((n) => n.id === view) || nav[0];
    const views = { event: EventView, rules: RulesView, categories: CategoriesView, teams: TeamsView, format: FormatView, phases: PhasesView, venues: VenuesView, schedule: ScheduleView, games: GamesView, standings: StandingsView };
    const View = views[cur.id];

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
          <${View} key=${cur.perCat ? cat.id : cur.id} ...${ctx} />
        </main>
      </div>
      ${modal}
      ${toast ? html`<div className=${'toast ' + (toast.tone || '')} role="status">${toast.msg}</div>` : null}
    </div>`;
  }
  const usesPlayers = (cat) => cat.phases.some((p) => TE.PHASE_TYPES[p.type].kind === 'PLAYER' && TE.isRoot(cat, p));
  const resultsIn = (cat) => cat.games.filter((g) => g.result).length;

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
        <div className="row"><${Btn} kind="primary" onClick=${() => ask('Replace the current event?', 'All categories, teams, phases and results of the current event will be removed.', 'Create event', () => {
          const s = TE.newState(sport, name.trim() || `${TE.SPORTS[sport].label} tournament`);
          act((d) => { Object.keys(d).forEach((k) => delete d[k]); Object.assign(d, s); });
          setCatId(s.categories[0].id); say('New event created. Add teams, then build the format.');
        }, true)}>Create event<//></div>
      <//>
      <${SportCard} sport=${t.sport} />
    </div>`;
  }
  function SportCard({ sport }) {
    const s = TE.SPORTS[sport];
    const rows = [['Space', `${s.space[0]} / ${s.space[1]}`], ['Draws in groups', s.ties ? 'Allowed' : 'Not allowed'], ['Scoring', s.sets ? `Sets (best of ${s.bestOf}), ${s.unit[1]} inside sets` : s.unit[1]], ['Default points', `Win ${s.points.win} · Tie ${s.points.tie} · Loss ${s.points.loss}`], ['Forfeit score', s.sets ? `${s.forfeitSet.join('-')} per set` : `${s.forfeit.home}-${s.forfeit.away}`], ['Default rest', `${s.rest} min`], ['Players on teams', s.players ? 'Yes (pairs)' : 'No'], ['Americano', s.americano ? 'Available' : '—'], ['Recommended scheduling', s.scheduling === 'QUEUE' ? `Next available ${s.space[0]}` : 'Fixed times']];
    return html`<${Section} title=${`${s.label} settings`} sub="Built-in sport rules used by the engine."><dl className="kv">${rows.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl><//>`;
  }

  // ---------- Format: presets + phase builder ----------
  function FormatView(ctx) {
    const { st, cat, act, ask, say } = ctx;
    const tpls = TE.templatesFor(st.tournament.sport);
    const [sel, setSel] = useState('RR_SE');
    const [flights, setFlights] = useState(1);
    const [newType, setNewType] = useState('GROUPS');
    const [newName, setNewName] = useState('');
    const phases = TE.sortedPhases(cat);
    const graph = TE.validateGraph(st, cat);
    const tpl = tpls.find((t) => t.id === sel) || tpls[0];
    const types = Object.entries(TE.PHASE_TYPES).filter(([k]) => k !== 'AMERICANO' || TE.SPORTS[st.tournament.sport].americano);
    return html`<div className="stack">
      <${Section} title="Start from a preset" sub="Presets create a ready-made chain of phases that you can then change below.">
        <div className="tpl-grid" role="radiogroup" aria-label="Preset">
          ${tpls.map((t) => html`<button key=${t.id} role="radio" aria-checked=${sel === t.id} className=${'tpl' + (sel === t.id ? ' on' : '')} onClick=${() => setSel(t.id)}>
            <span className="tpl-flow">${t.flow.map((ty, i) => html`${i ? html`<span className="arrow">→</span>` : null}${typeChip(ty)}`)}</span>
            <span className="tpl-name">${t.name}${t.recommended ? html` <${Pill} tone="accent">Recommended<//>` : null}</span>
            <span className="tpl-desc">${t.desc}</span></button>`)}
        </div>
        <div className="row">
          ${sel === 'RR_SE' || sel === 'RR_DE' ? html`<label className="row" htmlFor="fl-n"><span className="field-label">Playoff brackets</span><select id="fl-n" value=${flights} onChange=${(e) => setFlights(+e.target.value)}>${[1, 2, 3, 4, 5].map((n) => html`<option value=${n}>${n}</option>`)}</select></label>` : null}
          <${Btn} kind="primary" onClick=${() => { const go = () => { act((d, c) => TE.applyTemplate(d, c, tpl.id, flights)); say(`${tpl.name} applied to ${cat.name}.`); }; phases.length ? ask('Replace the current phases?', `All phases of ${cat.name}${resultsIn(cat) ? ` and its ${resultsIn(cat)} results` : ''} are replaced by the preset.`, 'Replace', go, true) : go(); }}>Apply preset<//>
        </div>
      <//>

      <${Section} title="Phases" sub="Each phase takes participants from earlier phases (or the team list), plays its games and produces rankings. Later phases pick places from those rankings.">
        ${graph.errors.length ? html`<${Note} tone="bad"><b>${graph.errors.length} problem${graph.errors.length > 1 ? 's' : ''} to fix</b><ul className="msgs">${graph.errors.map((e) => html`<li>${e.msg}</li>`)}</ul><//>` : phases.length ? html`<${Note} tone="good">The format is valid.<//>` : null}
        ${graph.warnings.length ? html`<${Note} tone="warn"><ul className="msgs">${graph.warnings.map((e) => html`<li>${e.msg}</li>`)}</ul><//>` : null}
        ${phases.length ? html`<ol className="graph">${phases.map((p) => html`<li key=${p.id}><span className="seedno">${p.order}</span>${typeChip(p.type)}<b>${p.name}</b><span className="muted small">${p.entrants.length} places</span>${TE.sourcesOf(cat, p).length ? html`<span className="muted small">← ${TE.sourcesOf(cat, p).map((s) => s.name).join(', ')}</span>` : html`<span className="muted small">← ${TE.PHASE_TYPES[p.type].kind === 'PLAYER' ? 'player list' : 'team list'}</span>`}</li>`)}</ol>` : html`<${Note}>No phases yet. Apply a preset or add a phase.<//>`}
        <div className="phase-list">${phases.map((p) => html`<${PhaseEditor} key=${p.id} ...${ctx} phase=${p} errors=${graph.errors.filter((e) => e.phase === p.id)} />`)}</div>
        <div className="row wrap add-phase">
          <select aria-label="Phase type" value=${newType} onChange=${(e) => setNewType(e.target.value)}>${types.map(([k, v]) => html`<option value=${k}>${v.label}</option>`)}</select>
          <input aria-label="Phase name" placeholder="Phase name (optional)" value=${newName} onChange=${(e) => setNewName(e.target.value)} />
          <${Btn} kind="primary" onClick=${() => { act((d, c) => { const p = TE.addPhase(d, c, newType, newName.trim() || null); TE.rebuildPhase(d, c, p); }); setNewName(''); say('Phase added. Choose where its participants come from.'); }}>Add phase<//>
          <span className="hint">${TE.PHASE_TYPES[newType].desc}</span>
        </div>
      <//>
    </div>`;
  }
  function PhaseEditor({ st, cat, phase, act, ask, say, errors }) {
    const guard = useGuard({ cat, phase, ask });
    const conn = TE.connectorTo(cat, phase.id);
    const earlier = TE.sortedPhases(cat).filter((p) => p.order < phase.order);
    const selectors = conn ? conn.selectors : [];
    const [from, setFrom] = useState(earlier.length ? earlier[earlier.length - 1].id : '');
    const src = earlier.find((p) => p.id === from);
    const catalog = src ? TE.rankingCatalog(cat, src) : [];
    const [rk, setRk] = useState('');
    const [pos, setPos] = useState('1-2');
    const ranking = catalog.find((r) => r.id === rk) ? rk : catalog[0] ? catalog[0].id : '';
    const saveConn = (sels, extra) => guard('Change where this phase takes participants from', () => act((d, c) => {
      const old = TE.connectorTo(c, phase.id);
      const fromAm = sels.some((s) => { const p = TE.findPhase(c, s.fromPhase); return p && TE.PHASE_TYPES[p.type].kind === 'PLAYER'; }) && TE.PHASE_TYPES[phase.type].kind === 'TEAM';
      TE.setConnector(d, c, phase.id, Object.assign({ selectors: sels, seeding: old ? old.seeding : 'BY_SOURCE_POSITION', transform: fromAm ? 'PAIRS' : null }, extra || {}));
    }));
    const rankName = (s) => { const p = TE.findPhase(cat, s.fromPhase); const r = p && TE.rankingCatalog(cat, p).find((x) => x.id === s.ranking); return `${p ? p.name : '?'} · ${r ? r.label : s.ranking}`; };
    return html`<div className=${'phase-card' + (errors.length ? ' has-error' : '')}>
      <div className="phase-head">
        <span className="seedno">${phase.order}</span>${typeChip(phase.type)}
        <input aria-label="Phase name" className="phase-name" value=${phase.name} onChange=${(e) => act((d, c) => { TE.findPhase(c, phase.id).name = e.target.value; })} />
        <${StatusPill} st=${st} cat=${cat} phase=${phase} />
        <button className="icon-btn" aria-label="Remove phase" onClick=${() => ask(`Remove ${phase.name}?`, 'Its games are deleted and later phases stop taking places from it.', 'Remove', () => act((d, c) => TE.removePhase(d, c, phase.id)), true)}>×</button>
      </div>
      <div className="phase-body">
        <div className="sub-title">Participants come from</div>
        ${!selectors.length ? html`<p className="muted">The ${TE.PHASE_TYPES[phase.type].kind === 'PLAYER' ? 'player' : 'team'} list of ${cat.name} (${phase.entrants.length}).</p>` : html`<ul className="sel-list">${selectors.map((s, i) => html`<li key=${i}><span><b>${TE.formatPositions(s.positions)}</b> from ${rankName(s)}</span><button className="icon-btn" aria-label="Remove" onClick=${() => saveConn(selectors.filter((_, k) => k !== i))}>×</button></li>`)}</ul>`}
        ${earlier.length ? html`<div className="row wrap">
          <select aria-label="From phase" value=${from} onChange=${(e) => { setFrom(e.target.value); setRk(''); }}>${earlier.map((p) => html`<option value=${p.id}>${p.name}</option>`)}</select>
          <select aria-label="Ranking" value=${ranking} onChange=${(e) => setRk(e.target.value)}>${catalog.map((r) => html`<option value=${r.id}>${r.label} (${r.size})</option>`)}</select>
          <input aria-label="Positions" className="pos-input" value=${pos} onChange=${(e) => setPos(e.target.value)} placeholder="1-4, 6" />
          <${Btn} disabled=${!ranking || !TE.parsePositions(pos).length} onClick=${() => saveConn([...selectors, { fromPhase: from, ranking, positions: TE.parsePositions(pos) }])}>Add places<//>
        </div>` : null}
        ${selectors.length ? html`<div className="row wrap">
          <label className="row" htmlFor=${'sd-' + phase.id}><span className="field-label">Seeds</span><select id=${'sd-' + phase.id} value=${conn.seeding} onChange=${(e) => saveConn(selectors, { seeding: e.target.value })}><option value="BY_SOURCE_POSITION">By place (all 1sts, then all 2nds…)</option><option value="SELECTOR_ORDER">In the order listed</option></select></label>
          ${phase.type === 'GROUPS' ? html`<label className="check-item"><input type="checkbox" checked=${phase.inheritPoints} onChange=${(e) => guard('Change carried-over points', () => act((d, c) => TE.updatePhase(d, c, phase.id, { inheritPoints: e.target.checked })))} /> Carry over points and stats from the previous phase</label>` : null}
          ${conn.transform === 'PAIRS' ? html`<${Pill} tone="accent">Players are paired 1st + last, 2nd + second-last…<//>` : null}
        </div>` : null}
        ${phase.entrants.length ? html`<details className="disclose"><summary>${phase.entrants.length} places${phase.entrants.length && phase.entrants.every((e) => e.participant) ? '' : ' (placeholders until earlier phases are confirmed)'}</summary><ol className="chips-list">${phase.entrants.map((e) => html`<li key=${e.id}>${TE.entrantLabel(cat, phase, e)}</li>`)}</ol></details>` : null}
        ${errors.map((e) => html`<${Note} tone="bad">${e.msg}<//>`)}
      </div>
    </div>`;
  }

  // ---------- Standings rules ----------
  function RulesView({ st, cat, sport, act }) {
    const [newRule, setNewRule] = useState('WINS');
    const [newScope, setNewScope] = useState('O');
    const f = cat.format;
    const set = (fn, rebuildAm) => act((d, c) => { fn(c.format); if (rebuildAm) c.phases.filter((p) => p.type === 'AMERICANO').forEach((p) => TE.rebuildPhase(d, c, p)); });
    const rules = TE.rulesFor(st.tournament.sport).filter((r) => !(r === 'POINTS' && f.pointsSystem === 'NONE'));
    const am = cat.phases.some((p) => p.type === 'AMERICANO');
    const pf = [['win', 'Win'], ...(sport.ties ? [['tie', 'Tie']] : []), ['loss', 'Loss'], ['cancel', 'Cancelled'], ['forfeitWin', 'Forfeit win'], ['forfeitLoss', 'Forfeit loss'], ...(sport.sets ? [['setWin', 'Per set won'], ['setLoss', 'Per set lost']] : [])];
    return html`<div className="stack">
      ${am ? html`<${Section} title="Americano" sub="Each game is played to a points total. Every player scores the points their side wins.">
        <div className="grid3">
          <${Field} label="Points per game" id="am-t" hint="Both sides together, e.g. 24."><input id="am-t" type="number" min="4" value=${f.americano.target} onChange=${(e) => set((x) => { x.americano.target = +e.target.value || 24; })} /><//>
          <${Field} label="Rounds" id="am-r" hint="Empty = everyone partners everyone (players − 1). Changing it regenerates the Americano."><input id="am-r" type="number" min="1" value=${f.americano.rounds || ''} onChange=${(e) => set((x) => { x.americano.rounds = +e.target.value || null; }, true)} /><//>
        </div>
      <//>` : null}
      <${Section} title="Points" sub="How will teams earn points? Applies to every phase of this category.">
        <div className="seg" role="radiogroup">${[['POINTS', 'Based on game results'], ['AWARDED', 'Manually awarded'], ['NONE', 'Tiebreakers only']].map(([k, l]) => html`<button role="radio" aria-checked=${f.pointsSystem === k} className=${f.pointsSystem === k ? 'on' : ''} onClick=${() => set((x) => { x.pointsSystem = k; })}>${l}</button>`)}</div>
        ${f.pointsSystem === 'POINTS' ? html`<div className="grid4">${pf.map(([k, l]) => html`<${Field} label=${l} id=${'pt-' + k}><input id=${'pt-' + k} type="number" value=${f.points[k]} onChange=${(e) => set((x) => { x.points[k] = parseInt(e.target.value, 10) || 0; })} /><//>`)}</div>` : null}
        ${f.pointsSystem === 'AWARDED' ? html`<${Note}>Enter points per team on the Standings page.<//>` : null}
        ${sport.sets ? html`<${Field} label="Sets per game" id="bo"><select id="bo" value=${f.bestOf} onChange=${(e) => set((x) => { x.bestOf = +e.target.value; })}>${[1, 3, 5].map((n) => html`<option value=${n}>Best of ${n}</option>`)}</select><//>` : null}
      <//>
      <${Section} title="Tiebreakers" sub="Applied in order in every ranking: groups, overall, best k-th placed, and to order teams knocked out in the same round.">
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
        <${Note}>Rankings that compare teams from different groups (overall, best k-th placed) use per-game averages. Ties left after the last tiebreaker are ordered by the organiser when the phase is confirmed.<//>
      <//>
      <${Section} title="Standings columns" sub="Shown in the public tables.">
        <div className="checks">${Object.entries(TE.COLUMNS).filter(([k]) => sport.sets || !['SF', 'SA', 'SD'].includes(k)).filter(([k]) => sport.ties || k !== 'T').map(([k, l]) => html`<label key=${k} className="check-item"><input type="checkbox" checked=${f.columns.includes(k)} onChange=${(e) => set((x) => { x.columns = e.target.checked ? Object.keys(TE.COLUMNS).filter((c) => x.columns.includes(c) || c === k) : x.columns.filter((c) => c !== k); })} /> <b>${k}</b> ${l}</label>`)}</div>
      <//>
    </div>`;
  }

  // ---------- Categories ----------
  function CategoriesView({ st, act, ask, say, setCatId }) {
    const [name, setName] = useState('');
    return html`<${Section} title="Categories" sub="Group participants (e.g. Men, Women, Under 12). Each category has its own teams, phases and standings.">
      <ul className="list">${st.categories.map((c) => html`<li key=${c.id} className="list-row">
        <input aria-label="Category name" value=${c.name} onChange=${(e) => act((d) => { TE.findCat(d, c.id).name = e.target.value; })} />
        <span className="muted">${c.teams.filter((t) => !t.fromAmericano).length} teams · ${c.players.length} players · ${c.phases.length} phases · ${c.games.length} games</span>
        <${Btn} kind="ghost" disabled=${st.categories.length === 1} onClick=${() => ask(`Delete ${c.name}?`, 'Its teams, phases and games are removed.', 'Delete', () => { act((d) => { d.categories = d.categories.filter((x) => x.id !== c.id); }); setCatId(st.categories.find((x) => x.id !== c.id).id); }, true)}>Delete<//>
      </li>`)}</ul>
      <form className="row" onSubmit=${(e) => { e.preventDefault(); if (!name.trim()) return; const c = TE.newCategory(name.trim(), st.tournament.sport); act((d) => { d.categories.push(c); }); setName(''); setCatId(c.id); say(`${c.name} created.`); }}>
        <input aria-label="New category" placeholder="New category name" value=${name} onChange=${(e) => setName(e.target.value)} /><button className="btn primary" type="submit">Add category</button>
      </form>
    <//>`;
  }

  // ---------- Teams / players ----------
  function TeamsView({ st, cat, sport, act, ask, say }) {
    const [bulk, setBulk] = useState('');
    const pl = usesPlayers(cat);
    const list = pl ? cat.players : cat.teams.filter((t) => !t.fromAmericano);
    const changed = (fn, msg) => { const go = () => { act((d, c) => { fn(d, c); TE.participantsChanged(d, c); }); if (msg) say(msg); }; resultsIn(cat) ? ask('Change participants and reset games?', `${cat.name} has ${resultsIn(cat)} results. Changing the ${pl ? 'players' : 'teams'} regenerates the first phases and clears every result that depends on them.`, 'Continue', go, true) : go(); };
    function add() {
      const names = bulk.split('\n').map((s) => s.trim()).filter(Boolean);
      if (!names.length) return say('Enter at least one name, one per line.', 'bad');
      if (list.length + names.length > 128) return say('A category can have at most 128 entries.', 'bad');
      changed((d, c) => {
        if (pl) names.forEach((n) => c.players.push({ id: TE.uid('pl'), name: n }));
        else names.forEach((n) => { const ps = sport.players ? n.split('/').map((x) => x.trim()).filter(Boolean).slice(0, 2) : []; c.teams.push({ id: TE.uid('team'), name: n, seed: null, players: ps.map((p) => ({ id: TE.uid('pl'), name: p })) }); });
      }, `${names.length} added.`);
      setBulk('');
    }
    return html`<div className="stack">
      <${Section} title=${pl ? 'Players' : 'Teams'} sub=${pl ? 'This category starts with an Americano, played by individual players.' : `Seeds decide group placement and bracket order (1 = strongest).${sport.players ? ' Each team is a pair of players.' : ''}`}>
        <${Field} label=${pl ? 'Add players' : 'Add teams'} id="bulk" hint=${pl ? 'One player per line.' : sport.players ? 'One team per line. Write players as “Name / Name” to fill both players.' : 'One team per line.'}>
          <textarea id="bulk" rows="4" placeholder=${pl ? 'Giulia\nMarco' : sport.players ? 'Rossi / Bianchi\nFerrari / Esposito' : 'Team name'} value=${bulk} onChange=${(e) => setBulk(e.target.value)}></textarea><//>
        <div className="row"><${Btn} kind="primary" onClick=${add}>Save<//><span className="muted">${list.length} / 128</span></div>
      <//>
      <${Section} title=${`${list.length} ${pl ? 'players' : 'teams'} in ${cat.name}`}>
        ${list.length ? html`<div className="table-wrap"><table className="tbl"><thead><tr>${pl ? null : html`<th className="num">Seed</th>`}<th>Name</th>${!pl && sport.players ? html`<th>Player 1</th><th>Player 2</th>` : null}<th></th></tr></thead><tbody>
          ${list.map((t) => html`<tr key=${t.id}>
            ${pl ? null : html`<td className="num"><input className="seed" aria-label="Seed" type="number" min="1" value=${t.seed || ''} onChange=${(e) => act((d, c) => { c.teams.find((x) => x.id === t.id).seed = +e.target.value || null; })} /></td>`}
            <td><input aria-label="Name" value=${t.name} onChange=${(e) => act((d, c) => { (pl ? c.players : c.teams).find((x) => x.id === t.id).name = e.target.value; c.phases.forEach((p) => p.entrants.forEach((en) => { if ((en.source.team || en.source.player) === t.id) en.label = e.target.value; })); })} /></td>
            ${!pl && sport.players ? [0, 1].map((k) => html`<td><input aria-label=${'Player ' + (k + 1)} value=${(t.players[k] || {}).name || ''} placeholder="Player" onChange=${(e) => act((d, c) => { const tt = c.teams.find((x) => x.id === t.id); if (!tt.players[k]) tt.players[k] = { id: TE.uid('pl'), name: '' }; tt.players[k].name = e.target.value; })} /></td>`) : null}
            <td className="end"><button className="icon-btn" aria-label="Remove" onClick=${() => changed((d, c) => { if (pl) c.players = c.players.filter((x) => x.id !== t.id); else c.teams = c.teams.filter((x) => x.id !== t.id); }, `${t.name} removed.`)}>×</button></td>
          </tr>`)}</tbody></table></div>
          ${!pl ? html`<div className="row"><${Btn} onClick=${() => changed(() => {}, 'Seeds applied to the first phases.')}>Apply seeds<//><span className="hint">Seeds take effect when the first phases are regenerated.</span></div>` : null}` : html`<${Note}>No ${pl ? 'players' : 'teams'} yet. Paste a list above.<//>`}
      <//>
    </div>`;
  }

  // ---------- Phase setup ----------
  function PhasesView(p) {
    const { cat } = p;
    const phases = TE.sortedPhases(cat);
    if (!phases.length) return html`<${Note}>Build the format of ${cat.name} first.<//>`;
    return html`<div className="stack">${phases.map((ph) => html`<${PhaseSetup} key=${ph.id} ...${p} phase=${ph} />`)}</div>`;
  }
  function PhaseSetup(p) {
    const { st, cat, phase } = p;
    return html`<${Section} title=${html`<span className="row">${typeChip(phase.type)} ${phase.name}</span>`} sub=${`${phase.entrants.length} places${TE.sourcesOf(cat, phase).length ? ` · from ${TE.sourcesOf(cat, phase).map((s) => s.name).join(', ')}` : ''}`} actions=${html`<${StatusPill} st=${st} cat=${cat} phase=${phase} />`}>
      ${!phase.built ? html`<${Note} tone="warn">${phase.type === 'AMERICANO' ? `Americano needs a multiple of 4 players (now ${phase.entrants.length}).` : 'This phase needs at least two places. Add teams or choose where its participants come from on the Format page.'}<//>` : null}
      ${phase.type === 'GROUPS' && phase.entrants.length >= 2 ? html`<${GroupsSetup} ...${p} />` : null}
      ${(phase.type === 'KNOCKOUT' || phase.type === 'DOUBLE_KNOCKOUT') && phase.built ? html`<${BracketSetup} ...${p} />` : null}
      ${phase.type === 'AMERICANO' && phase.built ? html`<${AmericanoSetup} ...${p} />` : null}
    <//>`;
  }
  function useGuard({ cat, phase, ask }) {
    return (what, fn) => {
      const n = TE.phaseGames(cat, phase.id).filter((g) => g.result).length + TE.downstreamOf(cat, phase).reduce((s, d) => s + TE.phaseGames(cat, d.id).filter((g) => g.result).length, 0);
      return n ? ask(`${what}?`, `This clears ${n} results in this phase and the phases after it.`, 'Continue', fn, true) : fn();
    };
  }
  function GroupsSetup({ st, cat, phase, act, ask, say }) {
    const cfg = phase.config;
    const guard = useGuard({ cat, phase, ask });
    const upd = (patch, what) => guard(what || 'Change this phase', () => act((d, c) => TE.updatePhase(d, c, phase.id, { config: patch })));
    const games = TE.phaseGames(cat, phase.id);
    const maxPools = Math.max(1, Math.floor(phase.entrants.length / 2));
    const odd = cfg.games === 'N' && cfg.gamesPerTeam % 2 === 1 && phase.pools.some((x) => x.ids.length % 2 === 1);
    const dynamic = cfg.distribution === 'AVOID_REMATCH';
    const [ca, setCa] = useState(1); const [cb, setCb] = useState(2);
    return html`<div className="stack sm">
      <div className="grid4">
        <${Field} label="Number of groups" id=${'np-' + phase.id}><select id=${'np-' + phase.id} value=${cfg.pools} onChange=${(e) => upd({ pools: +e.target.value, manualPools: null }, 'Change the groups')}>${Array.from({ length: maxPools }, (_, i) => html`<option value=${i + 1}>${i + 1}</option>`)}</select><//>
        <${Field} label="Distribution" id=${'ds-' + phase.id} hint=${dynamic ? 'Decided when earlier phases are confirmed.' : null}><select id=${'ds-' + phase.id} value=${cfg.distribution} onChange=${(e) => upd({ distribution: e.target.value, manualPools: null }, 'Change the distribution')}>${Object.entries(TE.DISTRIBUTIONS).filter(([k]) => k !== 'AVOID_REMATCH' || !TE.isRoot(cat, phase)).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select><//>
        <${Field} label="Games" id=${'gm-' + phase.id}><select id=${'gm-' + phase.id} value=${cfg.games === 'N' ? cfg.gamesPerTeam : cfg.games} onChange=${(e) => { const v = e.target.value; upd(v === 'ALL_ONCE' || v === 'ALL_TWICE' ? { games: v } : { games: 'N', gamesPerTeam: +v }, 'Change the games'); }}>
          <option value="ALL_ONCE">Everyone once</option><option value="ALL_TWICE">Everyone twice (home and away)</option>${Array.from({ length: 30 }, (_, i) => html`<option value=${i + 1}>${i + 1} ${i ? 'games' : 'game'} per team</option>`)}</select><//>
        <${Field} label="Game length (min)" id=${'gl-' + phase.id}><input id=${'gl-' + phase.id} type="number" min="5" step="5" value=${TE.gameLengthFor(st, cat, phase)} onChange=${(e) => act((d, c) => { TE.findPhase(c, phase.id).config.gameLength = +e.target.value || null; })} /><//>
      </div>
      ${odd ? html`<${Note} tone="warn">A group has an odd number of teams and each team plays an odd number of games, so one team plays an extra game.<//>` : null}
      ${phase.rematches ? html`<${Note} tone="warn">${phase.rematches} rematch${phase.rematches > 1 ? 'es' : ''} could not be avoided with these groups.<//>` : null}
      <div className="pools">${phase.pools.map((pl) => html`<div key=${pl.number} className="pool"><div className="pool-head">${pl.name}<span className="muted">${pl.ids.length}</span></div>
        <ul>${pl.ids.map((eid) => { const e = phase.entrants.find((x) => x.id === eid); return html`<li key=${eid}><span>${TE.entrantLabel(cat, phase, e)}</span>
          ${dynamic ? null : html`<select aria-label="Move to group" value=${pl.number} onChange=${(ev) => { const to = +ev.target.value; guard('Move a team', () => act((d, c) => TE.movePoolEntrant(d, c, phase.id, eid, to))); }}>${phase.pools.map((q) => html`<option value=${q.number}>${q.name}</option>`)}</select>`}</li>`; })}</ul></div>`)}</div>
      ${phase.pools.length > 1 ? html`<div className="sub-block"><div className="sub-title">Crossover groups <span className="hint">Teams of two paired groups play each other instead of their own group.</span></div>
        ${cfg.crossovers.map(([x, y], i) => html`<div className="row" key=${i}><span>${phase.pools[x - 1].name} ⇄ ${phase.pools[y - 1].name}</span><button className="icon-btn" aria-label="Remove crossover" onClick=${() => upd({ crossovers: cfg.crossovers.filter((_, k) => k !== i) })}>×</button></div>`)}
        <div className="row wrap"><select aria-label="First group" value=${ca} onChange=${(e) => setCa(+e.target.value)}>${phase.pools.map((q) => html`<option value=${q.number}>${q.name}</option>`)}</select><span>⇄</span>
          <select aria-label="Second group" value=${cb} onChange=${(e) => setCb(+e.target.value)}>${phase.pools.map((q) => html`<option value=${q.number}>${q.name}</option>`)}</select>
          <${Btn} disabled=${ca === cb || cfg.crossovers.flat().some((n) => n === ca || n === cb)} onClick=${() => upd({ crossovers: [...cfg.crossovers, [ca, cb]] })}>Add crossover<//></div></div>` : null}
      ${games.length ? html`<details className="disclose"><summary>${games.length} games · numbers ${games[0].number}–${games[games.length - 1].number}</summary><div className="game-mini">${games.map((g) => html`<div key=${g.id}><b>#${g.number}</b> <span className="muted">${g.label}</span> ${TE.sourceLabel(st, cat, g.home)} – ${TE.sourceLabel(st, cat, g.away)}</div>`)}</div></details>` : null}
    </div>`;
  }
  function AmericanoSetup({ st, cat, phase }) {
    const n = phase.entrants.length, games = TE.phaseGames(cat, phase.id);
    return html`<dl className="kv"><div><dt>Players</dt><dd>${n}</dd></div><div><dt>Rounds</dt><dd>${cat.format.americano.rounds || n - 1}</dd></div><div><dt>Games per round</dt><dd>${Math.floor(n / 4)}</dd></div><div><dt>Points per game</dt><dd>${cat.format.americano.target}</dd></div><div><dt>Games</dt><dd>${games.length}</dd></div></dl>`;
  }
  function BracketSetup({ st, cat, phase, act, ask, say }) {
    const cfg = phase.config;
    const guard = useGuard({ cat, phase, ask });
    const upd = (patch) => guard('Rebuild the bracket', () => act((d, c) => TE.updatePhase(d, c, phase.id, { config: patch })));
    const games = TE.phaseGames(cat, phase.id);
    const n = phase.entrants.length;
    const [ca, setCa] = useState(''); const [cb, setCb] = useState(''); const [ra, setRa] = useState('L'); const [rb, setRb] = useState('L');
    return html`<div className="stack sm">
      <details className="disclose"><summary>Seeding order (first-round matchups). Byes go to the top seeds.</summary><ol className="seed-list">${phase.entrants.map((e, i) => html`<li key=${e.id}><span className="seedno">${i + 1}</span>${TE.entrantLabel(cat, phase, e)}<span className="row tight"><button className="icon-btn" aria-label="Move up" disabled=${i === 0} onClick=${() => guard('Change the seeding', () => act((d, c) => TE.moveEntrant(d, c, phase.id, i, i - 1)))}>↑</button><button className="icon-btn" aria-label="Move down" disabled=${i === n - 1} onClick=${() => guard('Change the seeding', () => act((d, c) => TE.moveEntrant(d, c, phase.id, i, i + 1)))}>↓</button></span></li>`)}</ol></details>
      ${phase.type === 'KNOCKOUT' ? html`<div className="field"><span className="field-label">Placement games</span><div className="checks">${[[3, 4], [5, 8], [7, 8]].map(([pl, min]) => html`<label key=${pl} className="check-item"><input type="checkbox" disabled=${n < min || (pl === 7 && !cfg.placements.includes(5))} checked=${cfg.placements.includes(pl)} onChange=${(e) => { const s = new Set(cfg.placements); e.target.checked ? s.add(pl) : (s.delete(pl), pl === 5 && s.delete(7)); upd({ placements: [...s].sort((x, y) => x - y) }); }} /> ${TE.ordinal(pl)} place</label>`)}</div><span className="hint">Places not played are decided by the tiebreakers among teams knocked out in the same round.</span></div>`
      : html`<label className="check-item toggle"><input type="checkbox" checked=${cfg.bracketReset} onChange=${(e) => upd({ bracketReset: e.target.checked })} /> <span><b>Bracket reset</b><br /><span className="hint">If the lower-bracket team wins the grand final, a deciding game is played.</span></span></label>`}
      ${phase.type === 'KNOCKOUT' && games.length ? html`<div className="sub-block"><div className="sub-title">Consolation games <span className="hint">Extra games between winners or losers of earlier games. They do not change the final placings.</span></div>
        <div className="row wrap">
          <select aria-label="Home result" value=${ra} onChange=${(e) => setRa(e.target.value)}><option value="L">Loser of</option><option value="W">Winner of</option></select>
          <select aria-label="Home game" value=${ca} onChange=${(e) => setCa(e.target.value)}><option value="">game…</option>${games.filter((g) => g.bracket !== 'C').map((g) => html`<option value=${g.number}>#${g.number} ${g.label}</option>`)}</select>
          <span>vs</span>
          <select aria-label="Away result" value=${rb} onChange=${(e) => setRb(e.target.value)}><option value="L">Loser of</option><option value="W">Winner of</option></select>
          <select aria-label="Away game" value=${cb} onChange=${(e) => setCb(e.target.value)}><option value="">game…</option>${games.filter((g) => g.bracket !== 'C').map((g) => html`<option value=${g.number}>#${g.number} ${g.label}</option>`)}</select>
          <${Btn} disabled=${!ca || !cb || (ca === cb && ra === rb)} onClick=${() => { upd({ consolations: [...cfg.consolations, { home: { t: 'dep', game: +ca, res: ra }, away: { t: 'dep', game: +cb, res: rb } }] }); setCa(''); setCb(''); }}>Add game<//>
        </div>
        ${cfg.consolations.map((c, i) => html`<div className="row" key=${i}><span>${c.home.res === 'W' ? 'Winner' : 'Loser'} of ${c.home.game} vs ${c.away.res === 'W' ? 'Winner' : 'Loser'} of ${c.away.game}</span><button className="icon-btn" aria-label="Remove" onClick=${() => upd({ consolations: cfg.consolations.filter((_, k) => k !== i) })}>×</button></div>`)}
      </div>` : null}
      ${games.length ? html`<${BracketView} st=${st} cat=${cat} phase=${phase} />` : null}
    </div>`;
  }

  // ---------- bracket rendering ----------
  function BracketView({ st, cat, phase, onGame }) {
    const games = TE.phaseGames(cat, phase.id);
    const groups = {}, order = [];
    games.forEach((g) => { const key = (g.bracket === 'L' ? 'Lower · ' : g.bracket === 'P' || g.bracket === 'C' ? 'Placement · ' : '') + g.label; if (!groups[key]) { groups[key] = []; order.push(key); } groups[key].push(g); });
    const sections = phase.type === 'DOUBLE_KNOCKOUT' ? [['Upper bracket', order.filter((k) => groups[k][0].bracket === 'U')], ['Lower bracket', order.filter((k) => groups[k][0].bracket === 'L')], ['Grand final', order.filter((k) => groups[k][0].bracket === 'GF')]] : [['Main bracket', order.filter((k) => groups[k][0].bracket === 'M')], ['Placement & consolation', order.filter((k) => groups[k][0].bracket !== 'M')]];
    return html`<div className="bracket-wrap">${sections.filter(([, ks]) => ks.length).map(([title, ks]) => html`<div key=${title}><div className="sub-title">${title}</div><div className="bracket">${ks.map((k) => html`<div className="b-col" key=${k}><div className="b-col-head">${k.replace(/^(Lower|Placement) · /, '')}</div>${groups[k].map((g) => html`<${GameCard} key=${g.id} st=${st} cat=${cat} g=${g} onClick=${onGame} />`)}</div>`)}</div></div>`)}</div>`;
  }
  function GameCard({ st, cat, g, onClick }) {
    const n = TE.gameNumbers(st, cat, g);
    const needed = TE.isNeeded(st, cat, g);
    const playable = TE.isPlayable(st, cat, g);
    const side = (src, which) => {
      const win = n && n.winner === which;
      const score = !n ? '' : g.americano || !TE.SPORTS[st.tournament.sport].sets ? (which === 'home' ? n.hp : n.ap) : which === 'home' ? n.hs : n.as;
      const known = src.t === 'pair' || TE.resolve(st, cat, src);
      return html`<div className=${'g-side' + (win ? ' win' : '')}><span className=${'g-name' + (known ? '' : ' ph')}>${TE.sourceLabel(st, cat, src)}</span><span className="g-score">${score}</span></div>`;
    };
    const status = !needed ? html`<${Pill}>Not needed<//>` : g.status === 'FORFEIT' ? html`<${Pill} tone="warn">Forfeit<//>` : g.status === 'CANCELLED' ? html`<${Pill}>Cancelled<//>` : g.status === 'FINAL' ? null : playable ? html`<${Pill} tone="accent">Ready<//>` : null;
    return html`<button type="button" className=${'game' + (onClick && playable ? ' clickable' : '') + (!needed ? ' dim' : '')} disabled=${!onClick || !playable} onClick=${() => onClick && onClick(g)}>
      <div className="g-top"><span>#${g.number}</span>${status}</div>${side(g.home, 'home')}${side(g.away, 'away')}</button>`;
  }

  // ---------- result entry ----------
  function openResult(ctx, g) { ctx.setModal(html`<${ResultModal} ...${ctx} game=${g} onClose=${() => ctx.setModal(null)} />`); }
  function ResultModal({ st, cat, sport, act, say, game, onClose }) {
    const phase = TE.findPhase(cat, game.phaseId);
    const prev = game.result || {};
    const bestOf = cat.format.bestOf || 3;
    const [status, setStatus] = useState(game.status === 'SCHEDULED' ? 'FINAL' : game.status);
    const [home, setHome] = useState(prev.home != null ? prev.home : '');
    const [away, setAway] = useState(prev.away != null ? prev.away : '');
    const [sets, setSets] = useState(() => { const s = (prev.sets || []).map((x) => x.slice()); while (s.length < bestOf) s.push(['', '']); return s; });
    const [forfeitBy, setForfeitBy] = useState(prev.forfeitBy || '');
    const [err, setErr] = useState(null);
    const hName = TE.sourceLabel(st, cat, game.home), aName = TE.sourceLabel(st, cat, game.away);
    const usesSets = sport.sets && !game.americano;
    const downstreamStarted = phase.confirmed;
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
      say(out.reset ? 'Result saved. Later phases went back to placeholders; confirm this phase again.' : out.warnings && out.warnings.length ? `Saved with a warning: ${out.warnings.join(' ')}` : 'Result saved.', out.reset || (out.warnings && out.warnings.length) ? 'warn' : 'good');
    }
    const num = (v, set, label) => html`<input className="score" aria-label=${label} type="number" min="0" inputMode="numeric" value=${v} onChange=${(e) => set(e.target.value)} />`;
    return html`<${Modal} title=${`Game #${game.number} · ${game.label}`} onClose=${onClose} footer=${html`
      ${game.result ? html`<${Btn} kind="ghost" onClick=${() => { act((d, c) => TE.clearResult(d, c, c.games.find((x) => x.id === game.id))); onClose(); say('Result cleared.'); }}>Clear result<//>` : null}
      <span className="spacer"></span><${Btn} kind="ghost" onClick=${onClose}>Cancel<//><${Btn} kind="primary" onClick=${submit}>Save result<//>`}>
      <div className="seg" role="radiogroup">${[['FINAL', 'Result'], ['FORFEIT', 'Forfeit'], ['CANCELLED', 'Cancel game']].map(([k, l]) => html`<button role="radio" aria-checked=${status === k} className=${status === k ? 'on' : ''} onClick=${() => setStatus(k)}>${l}</button>`)}</div>
      ${status === 'FINAL' ? usesSets ? html`<table className="sets"><thead><tr><th></th>${sets.map((_, i) => html`<th>Set ${i + 1}</th>`)}</tr></thead><tbody>
          ${[0, 1].map((side) => html`<tr><th>${side ? aName : hName}</th>${sets.map((s, i) => html`<td>${num(s[side], (v) => setSets(sets.map((x, k) => (k === i ? (side ? [x[0], v] : [v, x[1]]) : x))), `${side ? aName : hName} set ${i + 1}`)}</td>`)}</tr>`)}</tbody></table>
          <p className="hint">Leave unplayed sets empty. Tie-breaks like 7-6 or a super tie-break 10-8 are fine.</p>`
        : html`<div className="score-row"><label>${hName}${num(home, setHome, hName)}</label><span>–</span><label>${num(away, setAway, aName)}${aName}</label></div>
          ${game.americano ? html`<p className="hint">Points won by each side. They usually add up to ${cat.format.americano.target}.</p>` : null}` : null}
      ${status === 'FORFEIT' ? html`<div className="stack sm"><p>Which side forfeits? The other side wins with the default score (${sport.sets ? sport.forfeitSet.join('-') + ' per set' : sport.forfeit.home + '-' + sport.forfeit.away}).</p>
        <div className="seg">${[['home', hName], ['away', aName]].map(([k, l]) => html`<button className=${forfeitBy === k ? 'on' : ''} onClick=${() => setForfeitBy(k)}>${l}</button>`)}</div></div>` : null}
      ${status === 'CANCELLED' ? html`<p>Neither side gets points. The game no longer counts as played.</p>` : null}
      ${downstreamStarted ? html`<${Note} tone="warn">${phase.name} is already confirmed. Saving sends every later phase back to placeholders.<//>` : null}
      ${err ? html`<${Note} tone="bad">${err}<//>` : null}
    <//>`;
  }

  // ---------- Games ----------
  function GamesView(ctx) {
    const { st, cat, act, say } = ctx;
    if (!cat.games.length) return html`<${Note}>No games yet. Build the format of ${cat.name} first.<//>`;
    return html`<div className="stack">${TE.sortedPhases(cat).map((ph) => {
      const games = TE.phaseGames(cat, ph.id);
      if (!games.length) return null;
      const left = games.filter((g) => g.status === 'SCHEDULED' && TE.isNeeded(st, cat, g)).length;
      const ready = games.filter((g) => g.status === 'SCHEDULED' && TE.isPlayable(st, cat, g)).length;
      return html`<${Section} key=${ph.id} title=${html`<span className="row">${typeChip(ph.type)} ${ph.name}</span>`} sub=${`${games.length - left} of ${games.length} played · ${ready} ready to play`} actions=${html`<${StatusPill} st=${st} cat=${cat} phase=${ph} /><${Btn} kind="ghost" disabled=${!ready || st.tournament.status !== 'PUBLISHED'} title="Fills in random results so you can test the flow" onClick=${() => { const n = act((d, c) => TE.simulatePhase(d, c, TE.findPhase(c, ph.id))); say(`${n} example results entered.`); }}>Fill example results<//>`}>
        ${TE.phaseStatus(st, cat, ph) === 'READY' ? html`<${Note}>Waiting for ${TE.sourcesOf(cat, ph).filter((s) => !s.confirmed).map((s) => s.name).join(', ')} to be confirmed. Games show placeholders until then.<//>` : null}
        ${ph.type === 'KNOCKOUT' || ph.type === 'DOUBLE_KNOCKOUT' ? html`<${BracketView} st=${st} cat=${cat} phase=${ph} onGame=${(g) => openResult(ctx, g)} />`
        : html`<div className="game-grid">${games.map((g) => html`<div key=${g.id} className="game-cell"><div className="muted small">${g.label}${g.matchday ? ` · ${ph.type === 'AMERICANO' ? 'round' : 'matchday'} ${g.matchday}` : ''}</div><${GameCard} st=${st} cat=${cat} g=${g} onClick=${(x) => openResult(ctx, x)} /></div>`)}</div>`}
      <//>`;
    })}</div>`;
  }

  // ---------- Standings ----------
  function StandingsView(ctx) {
    const { st, cat } = ctx;
    const phases = TE.sortedPhases(cat).filter((p) => p.built);
    if (!phases.length) return html`<${Note}>Standings appear once the phases of ${cat.name} are set up.<//>`;
    return html`<div className="stack">${phases.map((p) => html`<${PhaseStandings} key=${p.id} ...${ctx} phase=${p} />`)}</div>`;
  }
  function StandingsTable({ rows, cols, nameOf, marked, cat, editAwarded, act }) {
    return html`<div className="table-wrap"><table className="tbl stand"><thead><tr><th className="num">#</th><th>${'Name'}</th>${cols.map((c) => html`<th className="num" title=${TE.COLUMNS[c]}>${c}</th>`)}</tr></thead>
      <tbody>${rows.map((r) => html`<tr key=${r.id} className=${marked && marked.has(r.rank) ? 'adv' : ''}><td className="num">${r.pending ? '–' : r.rank}${r.tied ? html`<span className="tie" title="Tied: order is decided at confirmation">=</span>` : null}</td><td>${nameOf(r.id)}</td>
        ${cols.map((c) => html`<td className="num">${c === 'PTS' && editAwarded ? html`<input className="seed" aria-label="Awarded points" type="number" value=${(cat.format.awarded || {})[r.id] || 0} onChange=${(e) => act((d, cc) => { cc.format.awarded = cc.format.awarded || {}; cc.format.awarded[r.id] = +e.target.value || 0; })} />` : c === 'PD' || c === 'SD' ? (r[c] > 0 ? '+' : '') + r[c] : r[c]}</td>`)}</tr>`)}</tbody></table></div>`;
  }
  function PhaseStandings(ctx) {
    const { st, cat, phase, act } = ctx;
    const status = TE.phaseStatus(st, cat, phase);
    const nameOf = (id) => TE.participantName(cat, phase, id);
    const used = {};
    cat.connectors.forEach((c) => c.selectors.filter((s) => s.fromPhase === phase.id).forEach((s) => {
      if (s.ranking === 'pool:*') phase.pools.forEach((p) => { used[`pool:${p.number}`] = new Set([...(used[`pool:${p.number}`] || []), ...s.positions]); });
      else used[s.ranking] = new Set([...(used[s.ranking] || []), ...s.positions]);
    }));
    const cols = phase.type === 'AMERICANO' ? ['GP', 'W', 'L', 'PF', 'PA', 'PD', 'PTS'] : cat.format.columns;
    const head = html`<span className="row">${typeChip(phase.type)} ${phase.name}</span>`;
    const actions = html`<${StatusPill} st=${st} cat=${cat} phase=${phase} />`;
    if (status === 'READY') return html`<${Section} title=${head} actions=${actions}><${Note}>Starts when ${TE.sourcesOf(cat, phase).filter((s) => !s.confirmed).map((s) => s.name).join(', ')} ${TE.sourcesOf(cat, phase).filter((s) => !s.confirmed).length > 1 ? 'are' : 'is'} confirmed.<//><//>`;
    let body;
    if (phase.type === 'GROUPS') {
      const crossIds = TE.rankingCatalog(cat, phase).filter((r) => r.id.startsWith('cross:'));
      body = html`<div className="pool-tables">${phase.pools.map((p) => html`<div key=${p.number}><div className="sub-title">${p.name}</div><${StandingsTable} rows=${TE.ranking(st, cat, phase, `pool:${p.number}`)} cols=${cols} cat=${cat} act=${act} editAwarded=${cat.format.pointsSystem === 'AWARDED'} nameOf=${nameOf} marked=${used[`pool:${p.number}`]} /></div>`)}</div>
        ${phase.inheritPoints ? html`<${Note}>Includes points and stats carried over from the previous phase.<//>` : null}
        <details className="disclose" open=${!!used.overall}><summary>Overall table (per-game averages)</summary><${StandingsTable} rows=${TE.ranking(st, cat, phase, 'overall')} cols=${cols} cat=${cat} nameOf=${nameOf} marked=${used.overall} /></details>
        ${phase.pools.length > 1 ? html`<details className="disclose"><summary>Best k-th placed (per-game averages)</summary><div className="pool-tables">${crossIds.map((r) => html`<div key=${r.id}><div className="sub-title">${r.label}</div><${StandingsTable} rows=${TE.ranking(st, cat, phase, r.id)} cols=${cols} cat=${cat} nameOf=${nameOf} marked=${used[r.id]} /></div>`)}</div></details>` : null}`;
    } else if (phase.type === 'AMERICANO') {
      body = html`<${StandingsTable} rows=${TE.ranking(st, cat, phase, 'overall')} cols=${cols} cat=${cat} nameOf=${nameOf} marked=${used.overall} />`;
    } else {
      body = html`<${BracketView} st=${st} cat=${cat} phase=${phase} onGame=${(g) => openResult(ctx, g)} />
        <div className="sub-title">Final placings</div><${StandingsTable} rows=${TE.ranking(st, cat, phase, 'final')} cols=${cols} cat=${cat} nameOf=${nameOf} marked=${used.final} />
        <p className="hint">Places decided on court come first; teams knocked out in the same round are ordered by the tiebreakers, then by seed. “–” = still playing.</p>`;
    }
    return html`<${Section} title=${head} actions=${actions}>${body}<${ConfirmPanel} ...${ctx} /><//>`;
  }
  function ConfirmPanel({ st, cat, phase, act, say }) {
    const status = TE.phaseStatus(st, cat, phase);
    const next = TE.downstreamOf(cat, phase);
    const nameOf = (id) => TE.participantName(cat, phase, id);
    if (status === 'CONFIRMED') {
      return html`<div className="transition done"><${Note} tone="good">${phase.name} is confirmed.${next.length ? ` ${next.map((n) => n.name).join(', ')} ${next.length > 1 ? 'have' : 'has'} the real ${TE.PHASE_TYPES[phase.type].kind === 'PLAYER' ? 'participants' : 'teams'} now.` : ''}<//>
        ${next.map((n) => html`<div key=${n.id}><div className="sub-title">${n.name}</div><ul className="resolved">${n.entrants.map((e) => html`<li key=${e.id}><span className="muted">${e.label}</span> → <b>${e.participant ? TE.participantName(cat, n, e.participant) : 'TBD'}</b></li>`)}</ul></div>`)}
        <div className="row"><${Btn} kind="ghost" onClick=${() => { act((d, c) => TE.unconfirmPhase(d, c, TE.findPhase(c, phase.id))); say('Confirmation undone. Later phases went back to placeholders.', 'warn'); }}>Undo confirmation<//></div></div>`;
    }
    if (status !== 'COMPLETE') {
      const left = TE.phaseGames(cat, phase.id).filter((g) => g.status === 'SCHEDULED' && TE.isNeeded(st, cat, g)).length;
      return left ? html`<${Note}>${left} ${left === 1 ? 'game needs' : 'games need'} a result before ${phase.name} can be confirmed.<//>` : null;
    }
    const ties = TE.relevantTies(st, cat, phase, true);
    const orderOf = (t) => { const m = phase.tieOrders[t.key]; return m && m.length === t.ids.length && m.every((x) => t.ids.includes(x)) ? m : null; };
    const unresolved = ties.filter((t) => !orderOf(t));
    const setOrder = (key, ids) => act((d, c) => { TE.findPhase(c, phase.id).tieOrders[key] = ids; });
    return html`<div className="transition">
      <div className="sub-title">Confirm ${phase.name}${next.length ? ` and fill ${next.map((n) => n.name).join(', ')}` : ''}</div>
      ${ties.length ? html`<p>Order the tied ${TE.PHASE_TYPES[phase.type].kind === 'PLAYER' ? 'players' : 'teams'} where it decides a place, then keep the order.</p>
        <div className="ties">${ties.map((t) => { const ids = orderOf(t) || t.ids; return html`<div key=${t.key} className=${'tie-box' + (orderOf(t) ? ' ok' : '')}><div className="tie-title">${t.title}${orderOf(t) ? html` <${Pill} tone="good">Ordered<//>` : null}</div>
          <ol>${ids.map((id, i) => html`<li key=${id}>${nameOf(id)}<span className="row tight"><button className="icon-btn" aria-label="Move up" disabled=${i === 0} onClick=${() => { const a = ids.slice(); [a[i - 1], a[i]] = [a[i], a[i - 1]]; setOrder(t.key, a); }}>↑</button><button className="icon-btn" aria-label="Move down" disabled=${i === ids.length - 1} onClick=${() => { const a = ids.slice(); [a[i + 1], a[i]] = [a[i], a[i + 1]]; setOrder(t.key, a); }}>↓</button></span></li>`)}</ol>
          ${orderOf(t) ? null : html`<${Btn} onClick=${() => setOrder(t.key, ids)}>Keep this order<//>`}</div>`; })}</div>` : html`<${Note} tone="good">There are no ties to resolve.<//>`}
      <div className="row"><${Btn} kind="primary" disabled=${unresolved.length > 0} onClick=${() => { const r = act((d, c) => { const out = TE.confirmPhase(d, c, TE.findPhase(c, phase.id)); if (out.ok && d.tournament.scheduling === 'QUEUE') TE.fillCourts(d); return out; }); r.ok ? say(`${phase.name} confirmed.`, 'good') : say(r.error, 'bad'); }}>Confirm ${phase.name}<//></div>
    </div>`;
  }

  // ---------- Venues ----------
  function VenuesView({ st, sport, act, ask }) {
    const [name, setName] = useState(''); const [n, setN] = useState(4);
    const cap = sport.space[0][0].toUpperCase() + sport.space[0].slice(1);
    const dropSpace = (d, sid) => { delete d.schedule.courts[sid]; d.schedule.blocks.forEach((b) => { b.spaceIds = b.spaceIds.filter((x) => x !== sid); }); Object.keys(d.schedule.assignments).forEach((g) => { if (d.schedule.assignments[g].spaceId === sid) delete d.schedule.assignments[g]; }); };
    return html`<div className="stack"><${Section} title="Venues" sub=${`Each venue has one or more ${sport.space[1]}. Removing a ${sport.space[0]} leaves its games unscheduled.`}>
      ${st.venues.map((v) => html`<div key=${v.id} className="venue">
        <div className="row"><input aria-label="Venue name" value=${v.name} onChange=${(e) => act((d) => { d.venues.find((x) => x.id === v.id).name = e.target.value; })} />
          <${Btn} kind="ghost" onClick=${() => act((d) => { const vv = d.venues.find((x) => x.id === v.id); const sp = { id: TE.uid('sp'), name: `${cap} ${vv.spaces.length + 1}`, categoryIds: [] }; vv.spaces.push(sp); if (d.tournament.scheduling === 'QUEUE') d.schedule.courts[sp.id] = null; })}>Add ${sport.space[0]}<//>
          <${Btn} kind="ghost" onClick=${() => ask(`Delete ${v.name}?`, `Games on its ${sport.space[1]} become unscheduled.`, 'Delete', () => act((d) => { const vv = d.venues.find((x) => x.id === v.id); vv.spaces.forEach((s) => dropSpace(d, s.id)); d.venues = d.venues.filter((x) => x.id !== v.id); }), true)}>Delete venue<//></div>
        <div className="table-wrap"><table className="tbl"><thead><tr><th>${cap}</th><th>Only for categories</th><th></th></tr></thead><tbody>
          ${v.spaces.map((s) => html`<tr key=${s.id}><td><input aria-label="Name" value=${s.name} onChange=${(e) => act((d) => { d.venues.find((x) => x.id === v.id).spaces.find((x) => x.id === s.id).name = e.target.value; })} /></td>
            <td><div className="checks">${st.categories.map((c) => html`<label key=${c.id} className="check-item"><input type="checkbox" checked=${(s.categoryIds || []).includes(c.id)} onChange=${(e) => act((d) => { const ss = d.venues.find((x) => x.id === v.id).spaces.find((x) => x.id === s.id); ss.categoryIds = e.target.checked ? [...(ss.categoryIds || []), c.id] : ss.categoryIds.filter((x) => x !== c.id); })} /> ${c.name}</label>`)}</div></td>
            <td className="end"><button className="icon-btn" aria-label="Remove" onClick=${() => act((d) => { const vv = d.venues.find((x) => x.id === v.id); vv.spaces = vv.spaces.filter((x) => x.id !== s.id); dropSpace(d, s.id); })}>×</button></td></tr>`)}
        </tbody></table></div><p className="hint">No category ticked = any category can play there.</p></div>`)}
      <form className="row wrap" onSubmit=${(e) => { e.preventDefault(); if (!name.trim()) return; act((d) => { const sp = Array.from({ length: Math.max(1, n) }, (_, i) => ({ id: TE.uid('sp'), name: `${cap} ${i + 1}`, categoryIds: [] })); d.venues.push({ id: TE.uid('ven'), name: name.trim(), spaces: sp }); if (d.tournament.scheduling === 'QUEUE') sp.forEach((s) => { d.schedule.courts[s.id] = null; }); }); setName(''); }}>
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
        <p className="hint">${st.tournament.scheduling === 'FIXED' ? 'Every game gets a time and a place up front. A phase is scheduled after all the phases it takes teams from.' : `Games wait in a queue. Each finished game frees its ${sport.space[0]} for the next game in line. Recommended for padel.`} Minimum rest between a team's games: ${st.tournament.restMinutes} min (change it under Event).</p>
      <//>
      ${st.tournament.scheduling === 'FIXED' ? html`<${FixedSchedule} ...${ctx} />` : html`<${QueueSchedule} ...${ctx} />`}
    </div>`;
  }
  function FixedSchedule({ st, sport, act, say }) {
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
        <div className="row"><${Btn} onClick=${() => act((d) => { const last = d.schedule.blocks[d.schedule.blocks.length - 1]; d.schedule.blocks.push({ id: TE.uid('blk'), day: last ? last.day : '2026-11-07', start: '09:00', end: '18:00', spaceIds: TE.allSpaces(d).map((x) => x.id) }); })}>Add time block<//><span className="hint">Game lengths are set per phase on the Phase setup page.</span></div>
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
    const capPl = sport.space[1][0].toUpperCase() + sport.space[1].slice(1);
    return html`<div className="stack">
      <${Section} title=${`${capPl} in use`} actions=${html`<label className="check-item"><input type="checkbox" checked=${s.auto} onChange=${(e) => act((d) => { d.schedule.auto = e.target.checked; if (e.target.checked) TE.fillCourts(d); })} /> Automatic assignment</label><${Btn} onClick=${() => act((d) => { TE.fillCourts(d); })}>Fill free ${sport.space[1]}<//>`}>
        <div className="checks">${spaces.map((sp) => html`<label key=${sp.id} className="check-item"><input type="checkbox" checked=${sp.id in s.courts} onChange=${(e) => act((d) => { if (e.target.checked) d.schedule.courts[sp.id] = null; else delete d.schedule.courts[sp.id]; })} /> ${sp.name}</label>`)}</div>
        <div className="courts">${spaces.filter((sp) => sp.id in s.courts).map((sp) => { const gid = s.courts[sp.id]; const f = gid && TE.findGame(st, gid); return html`<div key=${sp.id} className=${'court' + (f ? ' busy' : '')}>
          <div className="court-head"><b>${sp.name}</b>${f ? html`<${Pill} tone="accent">Playing<//>` : html`<${Pill}>Free<//>`}</div>
          ${f ? html`<div className="court-game"><div className="muted small">${f.cat.name} · #${f.game.number} ${f.game.label}</div><div>${TE.sourceLabel(st, f.cat, f.game.home)}</div><div className="muted">vs</div><div>${TE.sourceLabel(st, f.cat, f.game.away)}</div></div>
            <div className="row"><${Btn} kind="primary" onClick=${() => openResult(Object.assign({}, ctx, { cat: f.cat, act: (fn) => act((d) => fn(d, TE.findCat(d, f.cat.id))) }), f.game)}>Enter result<//><${Btn} kind="ghost" onClick=${() => act((d) => { d.schedule.courts[sp.id] = null; })}>Back to queue<//></div>`
          : !s.auto ? html`<select aria-label="Assign game" value="" onChange=${(e) => e.target.value && act((d) => { d.schedule.courts[sp.id] = e.target.value; })}><option value="">Assign a game…</option>${queue.filter((q) => why(q) === 'Ready').map((q) => html`<option value=${q.game.id}>#${q.game.number} ${TE.sourceLabel(st, q.cat, q.game.home)} – ${TE.sourceLabel(st, q.cat, q.game.away)}</option>`)}</select>` : html`<p className="muted small">No game can start: every queued game is waiting for a team or a result.</p>`}
        </div>`; })}</div>
      <//>
      <${Section} title="Upcoming games" sub="The first ready game takes the next free court. Reorder to spread out a team's games or prioritise a category." actions=${html`<${Btn} kind="ghost" onClick=${() => { act((d) => { TE.buildQueue(d); }); say('Queue rebuilt from the phases.'); }}>Rebuild queue<//>`}>
        ${queue.length ? html`<ol className="queue">${queue.slice(0, 40).map((f, i) => html`<li key=${f.game.id}><span className="seedno">${i + 1}</span><span className="q-game"><span className="muted small">${f.cat.name} · #${f.game.number} ${f.game.label}</span><span>${TE.sourceLabel(st, f.cat, f.game.home)} – ${TE.sourceLabel(st, f.cat, f.game.away)}</span></span>
          <${Pill} tone=${why(f) === 'Ready' ? 'good' : ''}>${why(f)}<//>
          <span className="row tight"><button className="icon-btn" aria-label="Move up" disabled=${i === 0} onClick=${() => act((d) => { const q = d.schedule.queue; const a = q.indexOf(f.game.id), b = q.indexOf(queue[i - 1].game.id); [q[a], q[b]] = [q[b], q[a]]; })}>↑</button><button className="icon-btn" aria-label="Move down" disabled=${i === queue.length - 1} onClick=${() => act((d) => { const q = d.schedule.queue; const a = q.indexOf(f.game.id), b = q.indexOf(queue[i + 1].game.id); [q[a], q[b]] = [q[b], q[a]]; })}>↓</button></span></li>`)}</ol>
          ${queue.length > 40 ? html`<p className="hint">+ ${queue.length - 40} more</p>` : null}` : html`<${Note}>The queue is empty. Rebuild it after generating games.<//>`}
      <//>
    </div>`;
  }

  ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
})();
