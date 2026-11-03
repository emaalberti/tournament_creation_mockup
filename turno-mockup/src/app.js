/* Turno — mockup navigabile della sezione Fasi.
   Logica: engine.js (window.TE) invariato, dalla repo tournament_creation_mockup.
   UI: grafica Turno (sidebar, mappa torneo a chip, finestra "Tabellone fase"), testi in italiano via i18n.js (window.T). */
(function () {
  'use strict';
  const { useState, useEffect } = React;
  const html = htm.bind(React.createElement);
  const STORE = 'turno-fasi-mockup-v1';
  const T = window.T;

  // ---------- persistenza (solo comodità locale) ----------
  function load() {
    try { const s = localStorage.getItem(STORE); if (s) { const p = JSON.parse(s); if (p && p.version === 2) return TE.migrateState(p); } } catch (e) { /* storage non disponibile */ }
    return demoState();
  }
  function save(s) { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) { /* ignora */ } }
  const getPref = (k, d) => { try { return localStorage.getItem(STORE + ':' + k) || d; } catch (e) { return d; } };
  const setPref = (k, v) => { try { localStorage.setItem(STORE + ':' + k, v); } catch (e) { /* ignora */ } };

  // ---------- torneo di esempio: padel, 9 coppie, Gironi → Oro (BYE alle migliori prime) + Argento ----------
  function demoState() {
    const st = TE.emptyState();
    st.tournament.name = 'Torneo d’autunno';
    TE.setSport(st, 'PADEL');
    const c = TE.newCategory('Open maschile', 'PADEL');
    st.categories.push(c);
    [['Rossi', 'Bianchi'], ['Ferrari', 'Esposito'], ['Romano', 'Colombo'], ['Ricci', 'Marino'], ['Greco', 'Bruno'], ['Gallo', 'Conti'], ['De Luca', 'Mancini'], ['Costa', 'Giordano'], ['Rizzo', 'Lombardi']]
      .forEach(([a, b], i) => c.teams.push({ id: TE.uid('team'), name: `${a} / ${b}`, seed: i + 1, players: [{ id: TE.uid('pl'), name: a }, { id: TE.uid('pl'), name: b }] }));
    const g = TE.addPhase(st, c, 'GROUPS', 'Gironi');
    g.config.pools = 3;
    const oro = TE.addPhase(st, c, 'KNOCKOUT', 'Oro');
    oro.config.placements = [1, 3];
    const arg = TE.addPhase(st, c, 'KNOCKOUT', 'Argento');
    TE.rebuildPhase(st, c, g, true);
    c.connectors.push({ id: TE.uid('con'), to: oro.id, seeding: 'SELECTOR_ORDER', transform: null, selectors: [{ fromPhase: g.id, ranking: 'cross:1', positions: [1, 2, 3] }, { fromPhase: g.id, ranking: 'cross:2', positions: [1, 2, 3] }] });
    c.connectors.push({ id: TE.uid('con'), to: arg.id, seeding: 'SELECTOR_ORDER', transform: null, selectors: [{ fromPhase: g.id, ranking: 'cross:3', positions: [1, 2, 3] }] });
    TE.rebuildAll(st, c);
    st.venues.push({ id: TE.uid('ven'), name: 'Circolo Padel Città', spaces: [1, 2, 3, 4].map((i) => ({ id: TE.uid('sp'), name: `Campo ${i}`, categoryIds: [] })) });
    TE.allSpaces(st).forEach((s) => { st.schedule.courts[s.id] = null; });
    try { TE.buildQueue(st); } catch (e) { /* coda opzionale */ }
    return st;
  }

  // ---------- piccoli componenti ----------
  const Tag = ({ tone, children }) => html`<span className=${'tag ' + (tone || '')}><span>${children}</span></span>`;
  const Btn = ({ kind, onClick, disabled, children, title, id }) => html`<button type="button" id=${id} className=${'btn ' + (kind || '')} onClick=${onClick} disabled=${disabled} title=${title}>${children}</button>`;
  const Note = ({ tone, children }) => html`<div className=${'note ' + (tone || '')}>${children}</div>`;
  const Field = ({ label, hint, id, children }) => html`<label className="field" htmlFor=${id}><span className="field-label">${label}</span>${children}${hint ? html`<span className="hint">${hint}</span>` : null}</label>`;
  const Card = ({ eb, title, sub, actions, children, id }) => html`<section className="card cut" id=${id}>
    ${title || eb ? html`<header className="card-h"><div>${eb ? html`<div className="eb">${eb}</div>` : null}${title ? html`<h2>${title}</h2>` : null}${sub ? html`<p>${sub}</p>` : null}</div>${actions ? html`<div className="row">${actions}</div>` : null}</header>` : null}
    ${children}</section>`;
  const statusTone = { DRAFT: 'warn', READY: '', IN_PROGRESS: 'blue', COMPLETE: 'warn', CONFIRMED: 'green' };
  const StatusTag = ({ st, cat, phase }) => { const s = TE.phaseStatus(st, cat, phase); return html`<${Tag} tone=${statusTone[s]}>${TE.STATUS_LABEL[s]}<//>`; };
  const typeLabel = (t) => TE.PHASE_TYPES[t].label;
  const kindWord = (phase) => (TE.PHASE_TYPES[phase.type].kind === 'PLAYER' ? 'giocatori' : 'squadre');

  function Modal({ title, children, onClose, footer }) {
    useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
    return html`<div className="modal-back" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal cut" role="dialog" aria-modal="true" aria-label=${title}>
        <header className="modal-h"><h3>${title}</h3><button className="icon-btn" aria-label="Chiudi" onClick=${onClose}>×</button></header>
        <div className="modal-b">${children}</div>
        ${footer ? html`<footer className="modal-f">${footer}</footer>` : null}
      </div></div>`;
  }

  // ---------- app ----------
  function App() {
    const [st, setSt] = useState(load);
    const [view, setView0] = useState(() => getPref('view', 'fasi'));
    const [catId, setCatId] = useState(() => (st.categories[0] ? st.categories[0].id : null));
    const [sel, setSel] = useState(null);
    const [modal, setModal] = useState(null);
    const [toast, setToast] = useState(null);
    const setView = (v) => { setView0(v); setPref('view', v); window.scrollTo(0, 0); };

    const cat = TE.findCat(st, catId) || st.categories[0] || null;
    const sport = st.tournament.sport ? TE.SPORTS[st.tournament.sport] : null;
    function act(fn) { const d = TE.clone(st); const out = fn(d, cat ? TE.findCat(d, cat.id) : null); save(d); setSt(d); return out; }
    function say(msg, tone) { setToast({ msg: T(msg), tone }); clearTimeout(say.t); say.t = setTimeout(() => setToast(null), 3800); }
    function ask(title, body, confirmText, fn, danger) {
      setModal(html`<${Modal} title=${title} onClose=${() => setModal(null)} footer=${html`<${Btn} kind="ghost" onClick=${() => setModal(null)}>Annulla<//><${Btn} kind=${danger ? 'primary danger' : 'primary'} onClick=${() => { setModal(null); fn(); }}>${confirmText}<//>`}><p style=${{ margin: 0 }}>${body}</p><//>`);
    }
    const ctx = { st, cat, sport, act, say, ask, setModal, setView, setCatId, sel, setSel, setSt };
    const pub = st.tournament.status === 'PUBLISHED';
    const nTeams = cat ? cat.teams.filter((t) => !t.fromAmericano).length : 0;
    const nav = [
      { id: 'info', label: 'Informazioni' },
      { id: 'categorie', label: 'Categorie', cnt: st.categories.length },
      { id: 'partecipanti', label: 'Partecipanti', cnt: nTeams, perCat: true },
      { id: 'campi', label: 'Campi di gioco', cnt: TE.allSpaces(st).length },
      { id: 'fasi', label: 'Fasi', cnt: cat ? cat.phases.length : 0, perCat: true },
      { id: 'programma', label: 'Programma', run: true },
      { id: 'risultati', label: 'Risultati', run: true, perCat: true, cnt: cat ? `${cat.games.filter((g) => g.result).length}/${cat.games.length}` : '' },
      { id: 'classifiche', label: 'Classifiche', run: true, perCat: true },
    ].map((n) => Object.assign(n, { locked: !sport && n.id !== 'info' }));
    const cur = nav.find((n) => n.id === view && !n.locked) || nav[0];
    const views = { info: InfoView, categorie: CategoriesView, partecipanti: TeamsView, campi: VenuesView, fasi: FasiView, programma: ScheduleView, risultati: GamesView, classifiche: StandingsView };
    const View = views[cur.id];

    return html`<div className="app">
      <aside className="side">
        <div className="logo">Turno<small>GESTIONE TORNEI</small></div>
        <div className="side-active">◆ TORNEO ${pub ? 'ATTIVO' : 'IN BOZZA'}</div>
        <div className="side-t">${st.tournament.name || 'Torneo senza nome'}</div>
        <nav className="nav" aria-label="Sezioni del torneo">
          ${nav.map((n) => html`<${React.Fragment} key=${n.id}>${n.id === 'programma' ? html`<div className="nav-sep">GIORNO DI GARA</div>` : null}
            <button className=${cur.id === n.id ? 'on' : ''} disabled=${n.locked} onClick=${() => setView(n.id)}>${n.label}${n.cnt !== undefined && n.cnt !== '' ? html`<span className="cnt">${n.cnt}</span>` : null}</button><//>`)}
        </nav>
        <div className="side-foot">Mockup navigabile. Logica: engine.js della repo tournament_creation_mockup. I dati restano in questo browser.
          <button onClick=${() => ask('Ripristinare il torneo di esempio?', 'Tutto quello che hai cambiato in questo browser viene sostituito dal torneo di padel di esempio.', 'Ripristina', () => { const d = demoState(); save(d); setSt(d); setCatId(d.categories[0].id); setSel(null); say('Torneo di esempio ripristinato.', 'good'); })}>Ripristina esempio</button></div>
      </aside>
      <div style=${{ minWidth: 0 }}>
        <header className="top">
          <${Tag} tone=${pub ? 'green' : ''}>${pub ? 'Attivo' : 'Bozza'}<//>
          <span className="t-name">${st.tournament.name || 'Torneo senza nome'}</span>
          ${sport ? html`<span className="sport-pill">Sport <b>${sport.label}</b></span>` : null}
          <span className="grow"></span>
          <button className=${'btn bev ' + (pub ? '' : 'primary')} onClick=${() => { act((d) => { d.tournament.status = pub ? 'DRAFT' : 'PUBLISHED'; }); say(pub ? 'Torneo riportato in bozza.' : 'Torneo attivo: ora puoi inserire i risultati.', 'good'); }}>${pub ? 'Riporta in bozza' : 'Attiva torneo →'}</button>
        </header>
        <main className="main">
          ${cur.perCat && st.categories.length > 1 ? html`<div className="cat-chips" role="tablist" aria-label="Categoria">${st.categories.map((c) => html`<button key=${c.id} role="tab" aria-selected=${c.id === cat.id} className=${c.id === cat.id ? 'on' : ''} onClick=${() => { setCatId(c.id); setSel(null); }}>${c.name}</button>`)}</div>` : null}
          ${cur.perCat && !cat ? html`<div className="empty-hero cut"><div className="eb">Nessuna categoria</div><p style=${{ margin: 0 }}>Squadre, fasi e classifiche appartengono a una categoria. Creane una per iniziare.</p><${Btn} kind="primary" onClick=${() => setView('categorie')}>Vai a Categorie<//></div>`
            : html`<${View} key=${cur.perCat ? cat.id + cur.id : cur.id} ...${ctx} />`}
        </main>
      </div>
      ${modal}
      ${toast ? html`<div className=${'toast ' + (toast.tone || '')} role="status">${toast.msg}</div>` : null}
    </div>`;
  }
  const resultsIn = (cat) => cat.games.filter((g) => g.result).length;
  const PageHead = ({ title, lead }) => html`<header><h1 className="h1">${title}</h1>${lead ? html`<p className="lead">${lead}</p>` : html`<div style=${{ height: 16 }}></div>`}</header>`;

  // ---------- Informazioni ----------
  function InfoView({ st, act, ask, say, setCatId, setSt, setSel }) {
    const t = st.tournament;
    const locked = st.categories.some((c) => c.teams.length || c.players.length || c.phases.length);
    return html`<div>
      <${PageHead} title="Informazioni" lead="Dati generali validi per tutte le categorie." />
      <div className="stack">
        <${Card} eb="Torneo">
          <div className="grid2">
            <${Field} label="Nome" id="ev-name"><input id="ev-name" placeholder="Nome del torneo" value=${t.name} onChange=${(e) => act((d) => { d.tournament.name = e.target.value; })} /><//>
            <${Field} label="Sport" id="ev-sport" hint=${locked ? 'Per cambiare sport togli prima squadre e fasi.' : null}><select id="ev-sport" value=${t.sport || ''} disabled=${locked} onChange=${(e) => act((d) => TE.setSport(d, e.target.value))}>
              <option value="" disabled>Scegli lo sport</option>${Object.entries(TE.SPORTS).map(([k, v]) => html`<option value=${k}>${v.label}</option>`)}</select><//>
            ${t.sport ? html`<${Field} label="Riposo minimo tra due partite (minuti)" id="ev-rest" hint=${`Predefinito per ${TE.SPORTS[t.sport].label}: ${TE.SPORTS[t.sport].rest} min. 0 lo disattiva.`}><input id="ev-rest" type="number" min="0" step="5" value=${t.restMinutes} onChange=${(e) => act((d) => { d.tournament.restMinutes = Math.max(0, +e.target.value || 0); })} /><//>` : null}
          </div>
        <//>
        ${t.sport ? html`<${SportCard} sport=${t.sport} />` : null}
        <${Card} eb="Dati del mockup" sub="Il mockup parte da un torneo di padel di esempio: 9 coppie, tre gironi, tabellone Oro con BYE alle migliori prime e tabellone Argento.">
          <div className="row">
            <${Btn} onClick=${() => ask('Ripristinare il torneo di esempio?', 'Le modifiche fatte in questo browser vengono sostituite.', 'Ripristina', () => { const d = demoState(); save(d); setSt(d); setCatId(d.categories[0].id); setSel(null); say('Torneo di esempio ripristinato.', 'good'); })}>Ripristina esempio<//>
            <${Btn} kind="danger" onClick=${() => ask('Svuotare tutto?', 'Nome, sport, categorie, squadre, fasi, campi e risultati vengono rimossi.', 'Svuota', () => { act((d) => { Object.keys(d).forEach((k) => delete d[k]); Object.assign(d, TE.emptyState()); }); setCatId(null); setSel(null); say('Torneo svuotato.'); }, true)}>Parti da zero<//>
          </div>
        <//>
      </div></div>`;
  }
  function SportCard({ sport }) {
    const s = TE.SPORTS[sport];
    const rows = [['Spazio di gioco', `${s.space[0]} / ${s.space[1]}`], ['Pareggi nei gironi', s.ties ? 'Ammessi' : 'Non ammessi'], ['Punteggio', s.sets ? `Set (al meglio dei ${s.bestOf}), ${s.unit[1]} nei set` : s.unit[1]], ['Punti predefiniti', `V ${s.points.win} · N ${s.points.tie} · P ${s.points.loss}`], ['Forfait', s.sets ? `${s.forfeitSet.join('-')} a set` : `${s.forfeit.home}-${s.forfeit.away}`], ['Squadre a coppie', s.players ? 'Sì' : 'No'], ['Programmazione consigliata', s.scheduling === 'QUEUE' ? 'Primo campo libero' : 'Orari fissi']];
    return html`<${Card} eb=${`Regole ${s.label}`} sub="Regole di sport usate dal motore."><dl className="kv">${rows.map(([k, v]) => html`<div key=${k}><dt>${k}</dt><dd>${v}</dd></div>`)}</dl><//>`;
  }

  // ---------- Categorie + regole di classifica ----------
  function CategoriesView(ctx) {
    const { st, cat, act, ask, say, setCatId } = ctx;
    const [name, setName] = useState('');
    return html`<div>
      <${PageHead} title="Categorie" lead="Ogni categoria ha le sue squadre, le sue fasi e le sue classifiche." />
      <div className="stack">
        <${Card} eb="Elenco">
          ${st.categories.map((c) => html`<div key=${c.id} className="list-row">
            <input aria-label="Nome categoria" value=${c.name} onChange=${(e) => act((d) => { TE.findCat(d, c.id).name = e.target.value; })} />
            <span className="muted small">${c.teams.filter((t) => !t.fromAmericano).length} squadre · ${c.phases.length} fasi · ${c.games.length} partite</span>
            <span className="spacer"></span>
            ${cat && cat.id === c.id ? html`<${Tag} tone="dark">Regole sotto<//>` : html`<${Btn} kind="ghost sm" onClick=${() => setCatId(c.id)}>Regole<//>`}
            <${Btn} kind="ghost sm danger" onClick=${() => ask(`Eliminare ${c.name}?`, 'Squadre, fasi e partite della categoria vengono rimosse.', 'Elimina', () => { act((d) => { d.categories = d.categories.filter((x) => x.id !== c.id); }); const o = st.categories.find((x) => x.id !== c.id); setCatId(o ? o.id : null); }, true)}>Elimina<//>
          </div>`)}
          <form className="row" style=${{ marginTop: 14 }} onSubmit=${(e) => { e.preventDefault(); if (!name.trim()) return; const c = TE.newCategory(name.trim(), st.tournament.sport); act((d) => { d.categories.push(c); }); setName(''); setCatId(c.id); say(`${c.name} creata.`, 'good'); }}>
            <input id="new-cat" aria-label="Nuova categoria" placeholder="Es. Open femminile" value=${name} onChange=${(e) => setName(e.target.value)} /><button className="btn primary" type="submit">Aggiungi categoria</button>
          </form>
        <//>
        ${cat ? html`<${RulesView} ...${ctx} />` : null}
      </div></div>`;
  }
  function RulesView({ st, cat, sport, act }) {
    const [newRule, setNewRule] = useState('WINS');
    const [newScope, setNewScope] = useState('O');
    const f = cat.format;
    const set = (fn) => act((d, c) => { fn(TE.findCat(d, cat.id).format); });
    const rules = TE.rulesFor(st.tournament.sport).filter((r) => !(r === 'POINTS' && f.pointsSystem === 'NONE'));
    const pf = [['win', 'Vittoria'], ...(sport.ties ? [['tie', 'Pareggio']] : []), ['loss', 'Sconfitta'], ['cancel', 'Annullata'], ['forfeitWin', 'Vittoria a forfait'], ['forfeitLoss', 'Sconfitta a forfait'], ...(sport.sets ? [['setWin', 'Per set vinto'], ['setLoss', 'Per set perso']] : [])];
    return html`<${Card} eb=${`Regole di classifica · ${cat.name}`} sub="Valgono per tutte le fasi della categoria.">
      <div className="stack">
        <div>
          <div className="sub-t">Punti</div>
          <div className="seg" role="radiogroup">${[['POINTS', 'Dai risultati'], ['AWARDED', 'Assegnati a mano'], ['NONE', 'Solo criteri']].map(([k, l]) => html`<button key=${k} role="radio" aria-checked=${f.pointsSystem === k} className=${f.pointsSystem === k ? 'on' : ''} onClick=${() => set((x) => { x.pointsSystem = k; })}>${l}</button>`)}</div>
          ${f.pointsSystem === 'POINTS' ? html`<div className="grid4" style=${{ marginTop: 12 }}>${pf.map(([k, l]) => html`<${Field} key=${k} label=${l} id=${'pt-' + k}><input id=${'pt-' + k} type="number" value=${f.points[k]} onChange=${(e) => set((x) => { x.points[k] = parseInt(e.target.value, 10) || 0; })} /><//>`)}</div>` : null}
          ${sport.sets ? html`<div style=${{ marginTop: 12, maxWidth: 220 }}><${Field} label="Set per partita" id="bo"><select id="bo" value=${f.bestOf} onChange=${(e) => set((x) => { x.bestOf = +e.target.value; })}>${[1, 3, 5].map((n) => html`<option key=${n} value=${n}>Al meglio dei ${n}</option>`)}</select><//></div>` : null}
        </div>
        <div>
          <div className="sub-t">Criteri di spareggio, in ordine</div>
          <ol className="tb-list">${f.tiebreakers.map((t, i) => html`<li key=${i}>
            <span className="rk">${i + 1}</span>
            <span className="nm">${TE.RULES[t.rule].name}<small>${TE.RULES[t.rule].eq}</small></span>
            <${Tag} tone=${t.scope === 'H' ? 'blue' : ''}>${t.scope === 'H' ? 'Scontri diretti' : 'Generale'}<//>
            <span className="row tight">
              <button className="icon-btn" aria-label="Su" disabled=${i === 0} onClick=${() => set((x) => { const a = x.tiebreakers; [a[i - 1], a[i]] = [a[i], a[i - 1]]; })}>↑</button>
              <button className="icon-btn" aria-label="Giù" disabled=${i === f.tiebreakers.length - 1} onClick=${() => set((x) => { const a = x.tiebreakers; [a[i + 1], a[i]] = [a[i], a[i + 1]]; })}>↓</button>
              <button className="icon-btn" aria-label="Rimuovi" onClick=${() => set((x) => { x.tiebreakers.splice(i, 1); })}>×</button>
            </span></li>`)}</ol>
          <div className="row">
            <select id="tb-rule" aria-label="Criterio" value=${newRule} onChange=${(e) => setNewRule(e.target.value)}>${rules.map((r) => html`<option key=${r} value=${r}>${TE.RULES[r].name} (${TE.RULES[r].eq})</option>`)}</select>
            <select id="tb-scope" aria-label="Ambito" value=${newScope} onChange=${(e) => setNewScope(e.target.value)}><option value="O">Generale</option><option value="H">Scontri diretti</option></select>
            <${Btn} disabled=${f.tiebreakers.some((t) => t.rule === newRule && t.scope === newScope)} onClick=${() => set((x) => { x.tiebreakers.push({ rule: newRule, scope: newScope }); })}>Aggiungi criterio<//>
            <${Btn} kind="ghost" onClick=${() => set((x) => { x.tiebreakers = TE.DEFAULT_TIEBREAKERS[st.tournament.sport].map(([rule, scope]) => ({ rule, scope })); })}>Usa i criteri del ${sport.label}<//>
          </div>
          <p className="hint">Le classifiche che confrontano squadre di gironi diversi (generale, migliori k-esime) usano le medie per partita. Le parità rimaste dopo l’ultimo criterio le ordina l’organizzatore quando conferma la fase.</p>
        </div>
        <div>
          <div className="sub-t">Colonne delle classifiche</div>
          <div className="checks">${Object.entries(TE.COLUMNS).filter(([k]) => sport.sets || !['SF', 'SA', 'SD'].includes(k)).filter(([k]) => sport.ties || k !== 'T').map(([k, l]) => html`<label key=${k} className="check"><input type="checkbox" checked=${f.columns.includes(k)} onChange=${(e) => set((x) => { x.columns = e.target.checked ? Object.keys(TE.COLUMNS).filter((c) => x.columns.includes(c) || c === k) : x.columns.filter((c) => c !== k); })} /> <b>${window.COL_SHORT[k]}</b> ${l}</label>`)}</div>
        </div>
      </div>
    <//>`;
  }

  // ---------- Partecipanti ----------
  function TeamsView({ st, cat, sport, act, ask, say }) {
    const [bulk, setBulk] = useState('');
    const list = cat.teams.filter((t) => !t.fromAmericano);
    const changed = (fn, msg) => { const go = () => { act((d, c) => { fn(d, c); TE.participantsChanged(d, c); }); if (msg) say(msg, 'good'); }; resultsIn(cat) ? ask('Cambiare le squadre e azzerare le partite?', `${cat.name} ha ${resultsIn(cat)} risultati. Cambiare le squadre rigenera le prime fasi e cancella i risultati che ne dipendono.`, 'Continua', go, true) : go(); };
    function add() {
      const names = bulk.split('\n').map((s) => s.trim()).filter(Boolean);
      if (!names.length) return say('Scrivi almeno un nome, uno per riga.', 'bad');
      if (list.length + names.length > 128) return say('Una categoria può avere al massimo 128 squadre.', 'bad');
      changed((d, c) => names.forEach((n) => { const ps = sport.players ? n.split('/').map((x) => x.trim()).filter(Boolean).slice(0, 2) : []; c.teams.push({ id: TE.uid('team'), name: n, seed: null, players: ps.map((p) => ({ id: TE.uid('pl'), name: p })) }); }), `${names.length} aggiunte.`);
      setBulk('');
    }
    return html`<div>
      <${PageHead} title="Partecipanti" lead=${`Le teste di serie decidono la composizione dei gironi e l’ordine del tabellone (1 = la più forte).${sport.players ? ' Ogni squadra è una coppia.' : ''}`} />
      <div className="stack">
        <${Card} eb="Aggiungi squadre">
          <${Field} label="Una squadra per riga" id="bulk" hint=${sport.players ? 'Scrivi “Cognome / Cognome” per compilare i due giocatori.' : null}>
            <textarea id="bulk" rows="4" placeholder=${sport.players ? 'Neri / Villa\nFontana / Moretti' : 'Nome squadra'} value=${bulk} onChange=${(e) => setBulk(e.target.value)}></textarea><//>
          <div className="row" style=${{ marginTop: 10 }}><${Btn} kind="primary" onClick=${add}>Salva<//><span className="muted small">${list.length} / 128</span></div>
        <//>
        <${Card} eb=${`${list.length} squadre · ${cat.name}`}>
          ${list.length ? html`<div className="tbl-wrap"><table className="tbl"><thead><tr><th className="n">Testa di serie</th><th>Nome</th>${sport.players ? html`<th>Giocatore 1</th><th>Giocatore 2</th>` : null}<th></th></tr></thead><tbody>
            ${list.map((t) => html`<tr key=${t.id}>
              <td className="n"><input className="num" id=${'seed-' + t.id} aria-label="Testa di serie" type="number" min="1" value=${t.seed || ''} onChange=${(e) => act((d, c) => { c.teams.find((x) => x.id === t.id).seed = +e.target.value || null; })} /></td>
              <td><input id=${'nm-' + t.id} aria-label="Nome" value=${t.name} onChange=${(e) => act((d, c) => { c.teams.find((x) => x.id === t.id).name = e.target.value; c.phases.forEach((p) => p.entrants.forEach((en) => { if (en.source.team === t.id) en.label = e.target.value; })); })} /></td>
              ${sport.players ? [0, 1].map((k) => html`<td key=${k}><input aria-label=${'Giocatore ' + (k + 1)} value=${(t.players[k] || {}).name || ''} placeholder="Giocatore" onChange=${(e) => act((d, c) => { const tt = c.teams.find((x) => x.id === t.id); if (!tt.players[k]) tt.players[k] = { id: TE.uid('pl'), name: '' }; tt.players[k].name = e.target.value; })} /></td>`) : null}
              <td className="n"><button className="icon-btn" aria-label="Rimuovi" onClick=${() => changed((d, c) => { c.teams = c.teams.filter((x) => x.id !== t.id); }, `${t.name} rimossa.`)}>×</button></td>
            </tr>`)}</tbody></table></div>
            <div className="row" style=${{ marginTop: 12 }}><${Btn} onClick=${() => changed(() => {}, 'Teste di serie applicate alle prime fasi.')}>Applica teste di serie<//><span className="hint">Hanno effetto quando le prime fasi vengono rigenerate.</span></div>`
          : html`<${Note}>Nessuna squadra. Incolla un elenco qui sopra.<//>`}
        <//>
      </div></div>`;
  }

  // ---------- logica di selezione (dal mockup, invariata) ----------
  const RANKING_KINDS = {
    POOL: { label: 'Classifica del girone', help: 'Posizioni dentro ogni girone. “1°–2°” = le prime due di ogni girone.' },
    CROSS: { label: 'Classifica tra gironi', help: 'Squadre con lo stesso piazzamento in gironi diversi, confrontate sulle medie per partita. “1° tra le 2°” = la migliore seconda.' },
    OVERALL: { label: 'Classifica generale', help: 'Tutte le squadre della fase in un’unica tabella, sulle medie per partita.' },
    FINAL: { label: 'Piazzamenti finali', help: '1°, 2°, poi per turno di eliminazione e criteri di spareggio.' },
    PLAYERS: { label: 'Classifica giocatori', help: 'Giocatori per punti conquistati.' },
  };
  const kindsFor = (src) => (src.type === 'GROUPS' ? ['POOL', 'CROSS', 'OVERALL'] : src.type === 'KNOCKOUT' ? ['FINAL'] : ['PLAYERS']);
  const kindOfRanking = (rid, src) => (rid.startsWith('pool:') ? 'POOL' : rid.startsWith('cross:') ? 'CROSS' : rid === 'final' ? 'FINAL' : src.type === 'AMERICANO' ? 'PLAYERS' : 'OVERALL');
  function describeSelector(cat, s) {
    const p = TE.findPhase(cat, s.fromPhase); const pos = s.positions.map((x) => x + '°').join(', ');
    if (!p) return ['?', ''];
    if (s.ranking === 'pool:*') return ['Classifica del girone', `${pos} di ogni girone`];
    if (s.ranking.startsWith('pool:')) { const g = p.pools.find((q) => `pool:${q.number}` === s.ranking); return ['Classifica del girone', `${pos} del ${g ? T(g.name) : 'girone'}`]; }
    if (s.ranking.startsWith('cross:')) return ['Classifica tra gironi', `${pos} tra le ${s.ranking.slice(6)}° classificate`];
    if (s.ranking === 'final') return ['Piazzamenti finali', pos];
    return [p.type === 'AMERICANO' ? 'Classifica giocatori' : 'Classifica generale', pos];
  }
  function rankingItems(cat, src, kind) {
    const name = (rid, pos) => { const id = src.snapshot && src.snapshot[rid] && src.snapshot[rid][pos - 1]; return id ? TE.participantName(cat, src, id) : null; };
    const item = (rid, pos, label, group) => ({ key: `${rid}|${pos}`, ranking: rid, pos, label, group, who: name(rid, pos) });
    if (kind === 'POOL') return src.pools.flatMap((p) => p.ids.map((_, i) => item(`pool:${p.number}`, i + 1, `${i + 1}° ${T(p.name)}`, T(p.name))));
    if (kind === 'CROSS') {
      const max = Math.max(0, ...src.pools.map((p) => p.ids.length)), out = [];
      for (let k = 1; k <= max; k++) { const n = src.pools.filter((p) => p.ids.length >= k).length; for (let j = 1; j <= n; j++) out.push(item(`cross:${k}`, j, `${j}° tra le ${k}°`, `${k}° classificate`)); }
      return out;
    }
    const rid = kind === 'FINAL' ? 'final' : 'overall';
    return src.entrants.map((_, i) => item(rid, i + 1, i === src.entrants.length - 1 && i > 0 ? `${i + 1}° (ultima)` : `${i + 1}°`, null));
  }
  function selectorKeys(src, sels) {
    const keys = new Set();
    sels.filter((s) => s.fromPhase === src.id).forEach((s) => {
      const rids = s.ranking === 'pool:*' ? src.pools.map((p) => `pool:${p.number}`) : [s.ranking];
      rids.forEach((rid) => s.positions.forEach((pos) => keys.add(`${rid}|${pos}`)));
    });
    return keys;
  }
  function keysToSelectors(src, keys) {
    const by = {};
    [...keys].forEach((k) => { const [rid, pos] = k.split('|'); (by[rid] = by[rid] || []).push(+pos); });
    Object.values(by).forEach((a) => a.sort((x, y) => x - y));
    const out = [];
    const pools = src.pools.map((p) => `pool:${p.number}`);
    const poolSel = pools.filter((r) => by[r]);
    if (poolSel.length) {
      const union = [...new Set(poolSel.flatMap((r) => by[r]))].sort((a, b) => a - b);
      const every = src.pools.every((p) => { const want = union.filter((x) => x <= p.ids.length); const got = by[`pool:${p.number}`] || []; return want.length === got.length && want.every((x, i) => x === got[i]); });
      if (every) out.push({ fromPhase: src.id, ranking: 'pool:*', positions: union });
      else poolSel.forEach((r) => out.push({ fromPhase: src.id, ranking: r, positions: by[r] }));
    }
    Object.keys(by).filter((r) => r.startsWith('cross:')).sort((a, b) => +a.slice(6) - +b.slice(6)).forEach((r) => out.push({ fromPhase: src.id, ranking: r, positions: by[r] }));
    ['overall', 'final'].forEach((r) => { if (by[r]) out.push({ fromPhase: src.id, ranking: r, positions: by[r] }); });
    return out;
  }
  // posti di "src" già presi da altre fasi: chiave → nome della fase
  function takenKeys(cat, src, exceptPhaseId) {
    const taken = {};
    cat.connectors.filter((c) => c.to !== exceptPhaseId).forEach((c) => selectorKeys(src, c.selectors).forEach((k) => { taken[k] = (TE.findPhase(cat, c.to) || {}).name; }));
    return taken;
  }
  // connettore per una nuova fase: prende i posti ancora liberi di src, nello stesso tipo di classifica già usato
  function freeConnector(cat, src, type, kindHint) {
    const used = cat.connectors.flatMap((c) => c.selectors).find((s) => s.fromPhase === src.id);
    const kind = kindHint || (used ? kindOfRanking(used.ranking, src) : src.type === 'GROUPS' ? (type === 'GROUPS' ? 'OVERALL' : 'POOL') : src.type === 'KNOCKOUT' ? 'FINAL' : 'PLAYERS');
    const taken = takenKeys(cat, src, null);
    const free = rankingItems(cat, src, kind).filter((x) => !taken[x.key]).map((x) => x.key);
    if (!free.length) return null;
    const seeding = kind === 'POOL' ? 'BY_SOURCE_POSITION' : 'SELECTOR_ORDER';
    return { id: TE.uid('con'), seeding, transform: null, selectors: keysToSelectors(src, new Set(free)) };
  }
  function useGuard({ cat, phase, ask }) {
    return (what, fn) => {
      const n = TE.phaseGames(cat, phase.id).filter((g) => g.result).length + TE.downstreamOf(cat, phase).reduce((s, d) => s + TE.phaseGames(cat, d.id).filter((g) => g.result).length, 0);
      return n ? ask(`${what}?`, `Vengono cancellati ${n} risultati di questa fase e delle fasi successive.`, 'Continua', fn, true) : fn();
    };
  }

  // ---------- Fasi: UX delle tavole W9 / W10 (mappa + tabellone fase), W5 / W6 (tabellone a menu, tra gironi), P2 (gironi drag & drop), W2 (nuova fase) ----------
  const ORD_F = ['', 'prima', 'seconda', 'terza', 'quarta', 'quinta', 'sesta', 'settima', 'ottava', 'nona', 'decima'];
  const ordF = (k) => ORD_F[k] || `${k}ª`;
  const BRANCH = ['Oro', 'Argento', 'Bronzo'];
  const BRANCH_COLOR = ['#D97706', '#9CA3AF', '#B7794A', '#2B63F1'];
  const ROUND = { 2: ['Finale', 'F', 'dalla finale'], 4: ['Semifinale', 'SF', 'dalle semifinali'], 8: ['Quarti', 'Q', 'dai quarti'], 16: ['Ottavi', 'O', 'dagli ottavi'], 32: ['Sedicesimi', 'S', 'dai sedicesimi'], 64: ['Trentaduesimi', 'T', 'dai trentaduesimi'] };
  const ROUND_BTNS = [32, 16, 8, 4, 2];
  const nextPow2 = (n) => { let p = 1; while (p < n) p *= 2; return p; };
  const kid = (k) => `${k.fromPhase}|${k.ranking}|${k.position}`;
  const LETTER = (n) => String.fromCharCode(64 + n);
  const firstGroups = (cat) => TE.sortedPhases(cat).find((p) => p.type === 'GROUPS');
  function poolName(cat, phase, pool) { const f = firstGroups(cat); return f && f.id === phase.id ? `Girone ${LETTER(pool.number)}` : `Girone ${phase.order}${LETTER(pool.number)}`; }
  const poolCode = (cat, phase, pool) => poolName(cat, phase, pool).replace('Girone ', '');
  function posLabel(cat, k) {
    const src = TE.findPhase(cat, k.fromPhase); if (!src) return '?';
    if (k.ranking.startsWith('pool:')) { const p = src.pools.find((q) => `pool:${q.number}` === k.ranking); return `${k.position}° ${p ? poolName(cat, src, p) : 'girone'}`; }
    if (k.ranking.startsWith('cross:')) return `${k.position}ª miglior ${ordF(+k.ranking.slice(6))}`;
    if (k.ranking === 'final') return `${k.position}° ${src.name}`;
    return `${k.position}° generale`;
  }
  const isCross = (k) => k && k.ranking && k.ranking.startsWith('cross:');
  const keysOf = (phase) => phase.entrants.filter((e) => e.source.fromPhase).map((e) => ({ fromPhase: e.source.fromPhase, ranking: e.source.ranking, position: e.source.position }));
  function entLabel(cat, phase, e) {
    if (e.participant) return TE.participantName(cat, phase, e.participant);
    if (e.source.fromPhase) return posLabel(cat, e.source);
    return T(TE.entrantLabel(cat, phase, e));
  }
  // testo di un lato partita: squadra reale se nota, altrimenti posizione / vincente / perdente
  function srcLabel(st, cat, src, codes) {
    const id = src.t !== 'pair' && src.t !== 'bye' ? TE.resolve(st, cat, src) : null;
    if (id) return { text: TE.teamName(cat, id), known: true };
    if (src.t === 'slot') { const p = TE.findPhase(cat, src.phase); const e = p && p.entrants.find((x) => x.id === src.id); return { text: e ? entLabel(cat, p, e) : 'Da definire', cross: e && isCross(e.source) }; }
    if (src.t === 'dep') return { text: `${src.res === 'W' ? 'Vincente' : 'Perdente'} ${(codes && codes[src.game]) || '#' + src.game}` };
    return { text: T(TE.sourceLabel(st, cat, src)) };
  }
  function writeKeys(d, c, phaseId, keys) { TE.setConnector(d, c, phaseId, { selectors: keys.map((k) => ({ fromPhase: k.fromPhase, ranking: k.ranking, positions: [k.position] })), seeding: 'SELECTOR_ORDER', transform: null }); }
  // chi usa già una posizione: id → nome della fase
  function ownerMap(cat, exceptId) {
    const m = {};
    cat.phases.filter((p) => p.id !== exceptId).forEach((p) => p.entrants.forEach((e) => { if (e.source.fromPhase) m[kid(e.source)] = p; }));
    return m;
  }
  const KIND_TITLE = { POOL: 'Per girone', CROSS: 'Tra gironi', OVERALL: 'Generale', FINAL: 'Piazzamenti finali', PLAYERS: 'Giocatori' };
  function optionGroups(cat, phase, onlySrc) {
    const srcs = TE.sortedPhases(cat).filter((p) => p.order < phase.order && p.built && (!onlySrc || p.id === onlySrc));
    return srcs.flatMap((src) => kindsFor(src).map((kind) => ({ src, kind, title: KIND_TITLE[kind] + (srcs.length > 1 ? ` · #${src.order} ${src.name}` : ''), items: rankingItems(cat, src, kind).map((x) => ({ k: { fromPhase: src.id, ranking: x.ranking, position: x.pos }, who: x.who })) })));
  }
  const siblingsOf = (cat, phase) => { if (TE.isRoot(cat, phase)) return [phase]; const key = (p) => TE.sourcesOf(cat, p).map((s) => s.id).sort().join(','); return TE.sortedPhases(cat).filter((p) => !TE.isRoot(cat, p) && key(p) === key(phase)); };
  function branchColor(cat, phase) { if (phase.type !== 'KNOCKOUT') return null; const s = siblingsOf(cat, phase).filter((p) => p.type === 'KNOCKOUT'); return s.length > 1 ? BRANCH_COLOR[Math.min(s.indexOf(phase), 3)] : null; }
  // posti finali decisi dalle fasi che chiudono un ramo
  // posti finali: le posizioni che non proseguono in nessuna fase. Prima le fasi più avanti nella mappa, a pari livello in ordine di fase
  function placeRanges(cat) {
    const out = {}; let start = 1;
    const { pos } = layout(cat);
    const used = {}; cat.phases.forEach((p) => p.entrants.forEach((e) => { if (e.source.fromPhase) used[e.source.fromPhase] = (used[e.source.fromPhase] || 0) + 1; }));
    TE.sortedPhases(cat).filter((p) => p.built).sort((a, b) => pos[b.id].d - pos[a.id].d || a.order - b.order).forEach((p) => {
      const k = p.entrants.length - (used[p.id] || 0);
      if (k > 0) { out[p.id] = [start, start + k - 1]; start += k; }
    });
    return { ranges: out, last: start - 1 };
  }
  // ordine "di merito" di una posizione: prime di tutti i gironi, poi seconde… (tra gironi: tutte le 1ª, poi le 2ª…)
  const rankOrder = (k) => (k.ranking.startsWith('pool:') ? [k.position, +k.ranking.slice(5)] : k.ranking.startsWith('cross:') ? [+k.ranking.slice(6), k.position] : [k.position, 0]);
  const byRank = (a, b) => { const x = rankOrder(a), y = rankOrder(b); return x[0] - y[0] || x[1] - y[1]; };
  // posizioni distribuite a serpentina nei gironi: 1ª riga A→C, 2ª riga C→A…
  function snakeFill(keys, P) { const pk = Array.from({ length: P }, () => []); keys.forEach((k, i) => { const r = Math.floor(i / P), c = i % P; pk[r % 2 ? P - 1 - c : c].push(k); }); return pk; }
  const snakePlaces = (sizes) => { const out = []; const R = Math.max(0, ...sizes); for (let r = 0; r < R; r++) { const row = []; sizes.forEach((z, p) => { if (r < z) row.push([p, r]); }); out.push(...(r % 2 ? row.reverse() : row)); } return out; };
  function manualCfg(phaseId, pk, sizes) { let o = 0; return { distribution: 'MANUAL', pools: pk.length, manualPools: pk.map((list, pi) => ({ number: pi + 1, name: `Group ${LETTER(pi + 1)}`, ids: list.map(() => `e_${phaseId}_${++o}`) })), poolSizes: sizes || pk.map((l) => l.length) }; }
  // primo turno del tabellone: config.layout (estensione dell'engine) oppure ordine standard delle teste di serie
  function koSlots(phase) {
    const n = phase.entrants.length;
    if (TE.validLayout(phase.config.layout, n)) return phase.config.layout.slice();
    return TE.seedOrder(nextPow2(Math.max(2, n))).map((s) => (s <= n ? s - 1 : null));
  }
  const byeByePair = (slots) => { for (let i = 0; i < slots.length; i += 2) if (slots[i] == null && slots[i + 1] == null) return true; return false; };
  // codici partita in stile tavole: Q1, SF2, F … (tabelloni a eliminazione singola)
  function koLayout(cat, phase) {
    const n = phase.entrants.length, slots = koSlots(phase), size = slots.length;
    const games = TE.phaseGames(cat, phase.id);
    const main = games.filter((g) => g.bracket === 'M');
    const depths = [...new Set(main.map((g) => g.depth))].sort((a, b) => a - b);
    const codes = {}; const cols = [];
    const r0 = main.filter((g) => g.depth === 0); let gi = 0;
    const pairs = [];
    for (let i = 0; i < size / 2; i++) {
      const a = slots[2 * i], b = slots[2 * i + 1];
      const bye = a == null || b == null;
      const code = `${ROUND[size] ? ROUND[size][1] : 'T'}${size === 2 ? '' : i + 1}`;
      const g = bye ? null : r0[gi++];
      if (g) codes[g.number] = code;
      pairs.push({ slots: [2 * i, 2 * i + 1], code, bye, g });
    }
    depths.filter((d) => d > 0).forEach((d) => {
      const sz = size >> d; const list = main.filter((g) => g.depth === d);
      list.forEach((g, j) => { codes[g.number] = `${ROUND[sz] ? ROUND[sz][1] : 'T'}${sz === 2 ? '' : j + 1}`; });
      cols.push({ title: ROUND[sz] ? ROUND[sz][0] : `Turno ${d + 1}`, games: list, final: sz === 2 });
    });
    const place = games.filter((g) => g.bracket === 'P');
    place.forEach((g) => { codes[g.number] = T(g.label).replace(' posto', ''); });
    const cons = games.filter((g) => g.bracket === 'C');
    cons.forEach((g, j) => { codes[g.number] = `C${j + 1}`; });
    const slotCode = (si) => pairs[Math.floor(si / 2)].code;
    const slotHasBye = (si) => pairs[Math.floor(si / 2)].bye;
    const entrantCode = (idx) => { const si = slots.indexOf(idx); return si < 0 ? '?' : slotCode(si) + (slotHasBye(si) ? ' · BYE' : ''); };
    return { n, size, slots, pairs, cols, codes, place, cons, slotCode, entrantCode };
  }
  function phaseStateLabel(st, cat, p, on, err) {
    if (on) return ['In modifica', ''];
    if (err) return ['Da correggere', 'bad'];
    if (!p.built) return ['Da configurare', 'warn'];
    if (st.tournament.status === 'PUBLISHED') return [TE.STATUS_LABEL[TE.phaseStatus(st, cat, p)], 'ok'];
    return ['✓ Salvata', 'ok'];
  }
  function chipSummary(cat, p, ranges) {
    const n = p.entrants.length;
    if (p.type === 'GROUPS') { const k = p.pools.length || p.config.pools; return `${k} ${k === 1 ? 'girone' : 'gironi'} · ${n} squadre`; }
    const size = nextPow2(Math.max(2, n)); const byes = size - n;
    const r = ranges[p.id];
    return `${p.config.eliminations === 2 ? 'Doppia elim.' : ROUND[size] ? ROUND[size][0] : ''} · ${n} sq.${byes && p.config.eliminations !== 2 ? ` · ${byes} BYE` : ''}${r ? ` · posti ${r[0]}°–${r[1]}°` : ''}`;
  }
  // il "chi passa" vive nella fase successiva: questa hook prova un nuovo elenco ordinato di posizioni e lo salva se il motore lo accetta
  function useKeys(ctx, phase) {
    const { st, cat, setSt, say, ask } = ctx;
    const guard = useGuard({ cat, phase, ask });
    const before = new Set(TE.validateGraph(st, cat).errors.map((e) => e.msg));
    const build = (keys, cfg) => { const d = TE.clone(st); const c = TE.findCat(d, cat.id); const p = TE.findPhase(c, phase.id); if (cfg) Object.assign(p.config, cfg); writeKeys(d, c, phase.id, keys); return { d, c }; };
    const check = (keys, cfg) => { const { d, c } = build(keys, cfg); const e = TE.validateGraph(d, c).errors.find((x) => !before.has(x.msg)); return e ? T(e.msg) : null; };
    const commit = (keys, cfg, msg) => {
      if (!keys.length) return say('Serve almeno una posizione: questa fase prende squadre da una fase precedente.', 'bad');
      const err = check(keys, cfg); if (err) return say(err, 'bad');
      guard('Cambiare le posizioni di questa fase', () => { const { d } = build(keys, cfg); save(d); setSt(d); if (msg) say(msg, 'good'); });
    };
    return { check, commit, guard };
  }

  function FasiView(ctx) {
    const { st, cat, sel, setSel } = ctx;
    const [adding, setAdding] = useState(null);
    const { phases, cols, pos } = layout(cat);
    const graph = TE.validateGraph(st, cat);
    const riep = sel === 'riepilogo' && phases.length > 0;
    const selected = riep ? null : phases.find((p) => p.id === sel) || phases[0] || null;
    useEffect(() => { if (!riep && selected && selected.id !== sel) setSel(selected.id); }, [selected && selected.id, riep]);
    useEffect(() => { if (!phases.length && !adding) setAdding({ mode: 'first' }); }, [phases.length]);
    const open = (id) => { setAdding(null); setSel(id); window.scrollTo({ top: 0 }); };
    const wctx = Object.assign({}, ctx, { onAdd: (mode, refId) => setAdding({ mode, refId }), open });
    return html`<div>
      <${PageHead} title="Fasi" lead="La mappa mostra come le squadre passano da una fase all’altra. Clicca una fase per aprire il suo tabellone: chi passa si sceglie nella fase che riceve le squadre." />
      <${TournamentMap} ...${wctx} phases=${phases} cols=${cols} pos=${pos} graph=${graph} selected=${selected} adding=${adding} riep=${riep} />
      ${adding ? html`<${AddPhasePanel} ...${wctx} adding=${adding} onCancel=${() => setAdding(null)} />`
        : riep ? html`<${RiepilogoPanel} ...${wctx} graph=${graph} />`
        : selected ? html`<${PhaseWindow} key=${selected.id} ...${wctx} phase=${selected} errors=${graph.errors.filter((e) => e.phase === selected.id)} />` : null}
      <details className="disc" style=${{ marginTop: 18 }}><summary>Modello dati della categoria (per l’integrazione con il backend)</summary>
        <pre className="json">${JSON.stringify({ phases: TE.sortedPhases(cat).map((p) => ({ id: p.id, name: p.name, type: p.type, order: p.order, config: p.config, inheritPoints: p.inheritPoints, confirmed: p.confirmed, entrants: p.entrants.map((e) => ({ label: e.label, source: e.source, participant: e.participant })) })), connectors: cat.connectors }, null, 2)}</pre>
      </details>
    </div>`;
  }

  const W = 236, H = 88, GX = 112, GY = 26, GH = 52;
  function layout(cat) {
    const phases = TE.sortedPhases(cat), depth = {}, cols = {}, pos = {};
    phases.forEach((p) => { const s = TE.sourcesOf(cat, p); depth[p.id] = s.length ? 1 + Math.max(...s.map((x) => depth[x.id] || 0)) : 0; });
    phases.forEach((p) => { (cols[depth[p.id]] = cols[depth[p.id]] || []).push(p); });
    Object.entries(cols).forEach(([d, list]) => list.forEach((p, i) => { pos[p.id] = { x: +d * (W + GX), y: i * (H + GY), d: +d, i }; }));
    return { phases, cols, pos };
  }
  function freeOf(cat, src, kind) { const own = ownerMap(cat, null); return rankingItems(cat, src, kind).filter((x) => !own[`${src.id}|${x.ranking}|${x.pos}`]); }
  const defaultKind = (src, cat) => { const used = cat && cat.connectors.flatMap((c) => c.selectors).find((s) => s.fromPhase === src.id); return used ? kindOfRanking(used.ranking, src) : src.type === 'GROUPS' ? 'POOL' : src.type === 'KNOCKOUT' ? 'FINAL' : 'PLAYERS'; };

  function TournamentMap({ st, cat, phases, cols, pos, graph, selected, adding, riep, onAdd, open }) {
    const scRef = React.useRef(null);
    useEffect(() => { const el = scRef.current; if (!el || !selected || !pos[selected.id]) return; const x = pos[selected.id].x; const right = x + W + GX + 200; if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth; else if (x < el.scrollLeft) el.scrollLeft = Math.max(0, x - 40); }, [selected && selected.id]);
    const { ranges, last } = placeRanges(cat);
    const teams = cat.teams.filter((t) => !t.fromAmericano).length;
    const ghosts = [];
    if (!phases.length) ghosts.push({ mode: 'first', x: 0, y: 0, label: 'Prima fase', note: `${teams} squadre iscritte` });
    else if (selected) {
      const p = pos[selected.id];
      const nextCol = cols[p.d + 1] || [];
      const fn = freeOf(cat, selected, defaultKind(selected, cat)).length;
      ghosts.push({ mode: 'next', ref: selected.id, x: (p.d + 1) * (W + GX), y: nextCol.length * (H + GY) + (H - GH) / 2, from: p, label: 'Fase successiva', disabled: !selected.built || !fn, title: fn ? `${fn} posizioni libere di #${selected.order}` : 'Nessuna posizione libera' });
      const koSibs = selected.type === 'KNOCKOUT' && !TE.isRoot(cat, selected) ? siblingsOf(cat, selected).filter((q) => q.type === 'KNOCKOUT' && q.built) : [];
      if (koSibs.length > 1) ghosts.push({ mode: 'merge', ref: selected.id, x: (p.d + 1) * (W + GX), y: nextCol.length * (H + GY) + (H - GH) / 2 + GH + 18, from: p, label: `Unisci ${koSibs.map((q) => q.name).join(' + ')}`, title: 'Una fase che prende posizioni da più tabelloni, per esempio una finale tra le vincitrici' });
      if (!TE.isRoot(cat, selected)) {
        const src = TE.sourcesOf(cat, selected)[0];
        const sk = TE.connectorTo(cat, selected.id).selectors.find((s) => s.fromPhase === src.id);
        const free = freeOf(cat, src, sk ? kindOfRanking(sk.ranking, src) : defaultKind(src));
        const ex = free.slice(0, 3).map((x) => x.label).join(', ');
        ghosts.push({ mode: 'par', ref: selected.id, x: p.d * (W + GX), y: cols[p.d].length * (H + GY) + (H - GH) / 2, from: pos[src.id], label: `In parallelo da #${src.order}`, disabled: !free.length, note: free.length ? `${free.length} ${free.length === 1 ? 'posizione libera' : 'posizioni libere'} (${ex}${free.length > 3 ? '…' : ''})` : 'nessuna posizione libera' });
      }
    }
    const maxD = Math.max(0, ...Object.keys(cols).map(Number));
    const rows = Math.max(1, ...Object.values(cols).map((l) => l.length + 1), ...ghosts.map((g) => Math.ceil((g.y + GH) / (H + GY))));
    const width = (maxD + 1) * (W + GX) + 420;
    const height = Math.max(H, rows * (H + GY) - GY);
    const edges = [];
    phases.forEach((p) => TE.sourcesOf(cat, p).forEach((s) => {
      const a = pos[s.id], b = pos[p.id];
      const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2, xm = x1 + 26;
      const n = p.entrants.filter((e) => e.source.fromPhase === s.id).length;
      const sib = siblingsOf(cat, p);
      const bad = graph.errors.some((e) => e.phase === p.id);
      edges.push({ key: s.id + p.id, d: `M${x1},${y1} H${xm} V${y2} H${x2 - 6}`, px: (xm + x2) / 2 + 4, py: y2, n, bad, label: sib.length > 1 ? p.name : 'Qualificate' });
    }));
    const errN = graph.errors.length;
    return html`<section className="map-card cut">
      <div className="card-h" style=${{ marginBottom: 0 }}>
        <div className="eb">Mappa torneo · ${cat.name}</div>
        <span className="muted small">Clicca una fase o un tabellone per aprirlo</span>
      </div>
      <div className="map-wrap">
        <div className="map-scroll" ref=${scRef}>
          <div className="map" style=${{ width, height }}>
            <svg width=${width} height=${height} aria-hidden="true">
              <defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#059669" /></marker>
                <marker id="arrb" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#B91C1C" /></marker></defs>
              ${edges.map((e) => html`<path key=${e.key} d=${e.d} fill="none" stroke=${e.bad ? '#B91C1C' : '#059669'} strokeWidth="2" markerEnd=${e.bad ? 'url(#arrb)' : 'url(#arr)'} />`)}
              ${ghosts.filter((g) => g.from).map((g) => { const x1 = g.from.x + W, y1 = g.from.y + H / 2, y2 = g.y + GH / 2, xm = x1 + 26; return html`<path key=${'g' + g.mode} d=${g.mode !== 'par' && Math.abs(y1 - y2) < 2 ? `M${x1},${y1} H${g.x}` : `M${x1},${y1} H${xm} V${y2} H${g.x}`} fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeDasharray="5 4" />`; })}
            </svg>
            ${edges.map((e) => html`<div key=${'p' + e.key} className=${'conn-pill' + (e.bad ? ' bad' : '')} style=${{ left: e.px, top: e.py }}><b>${e.n} ${e.bad ? '!' : '✓'}</b><span>${e.label}</span></div>`)}
            ${phases.map((p) => { const on = !adding && selected && selected.id === p.id; const err = graph.errors.some((e) => e.phase === p.id); const [sl, tone] = phaseStateLabel(st, cat, p, on, err); const col = branchColor(cat, p);
              return html`<button key=${p.id} className=${'chip' + (on ? ' on' : '') + (err ? ' err' : tone === 'ok' ? ' ok' : '')} style=${{ left: pos[p.id].x, top: pos[p.id].y, width: W, height: H }} onClick=${() => open(p.id)} aria-pressed=${on}>
                <span className="c-top"><${Tag} tone=${on ? '' : 'dark'}>#${p.order}<//>${col ? html`<i className="sq" style=${{ background: col }}></i>` : null}<b>${p.name}</b><span className=${'c-st ' + tone}>${sl}</span></span>
                <span className="c-name">${p.type === 'GROUPS' ? 'Fase a gironi' : 'Eliminazione diretta'}</span>
                <span className="c-sum">${chipSummary(cat, p, ranges)}</span>
              </button>`; })}
            ${ghosts.map((g) => html`<div key=${'gh' + g.mode} className="ghost-wrap" style=${{ left: g.x, top: g.y }}>
              <button className=${'chip ghost' + (adding && adding.mode === g.mode ? ' on' : '')} style=${{ height: GH }} disabled=${g.disabled} title=${g.title || g.note} onClick=${() => onAdd(g.mode, g.ref)}>+ ${g.label}</button>
              ${g.note && g.mode !== 'first' ? html`<span className="ghost-note">${g.note}</span>` : null}</div>`)}
          </div>
        </div>
        <button className=${'map-riep' + (riep ? ' on' : '')} onClick=${() => phases.length && open('riepilogo')} disabled=${!phases.length}>
          <span className="eb" style=${{ color: 'inherit' }}>Riepilogo</span>
          ${errN ? html`<b className="warn-t">${errN} ${errN === 1 ? 'problema' : 'problemi'} da correggere</b>` : phases.length ? html`<span><b>${teams} squadre</b> · posti decisi ${last ? `1°–${last}°` : '—'}</span>` : html`<b className="warn-t">Aggiungi la prima fase</b>`}
          <span className="small muted">${last && last < teams ? `${teams - last} ${teams - last === 1 ? 'squadra esce' : 'squadre escono'} senza piazzamento finale.` : 'Ogni ramo finisce con la fase che decide i suoi piazzamenti.'}</span>
        </button>
      </div>
    </section>`;
  }

  // W2 · scegli il tipo della nuova fase
  function AddPhasePanel({ st, cat, act, say, adding, onCancel, open }) {
    const ref = adding.refId && TE.findPhase(cat, adding.refId);
    const parSrc = adding.mode === 'par' ? TE.sourcesOf(cat, ref)[0] : null;
    const initial = adding.mode === 'next' ? [ref.id] : adding.mode === 'par' ? [parSrc.id] : adding.mode === 'merge' ? siblingsOf(cat, ref).filter((p) => p.type === 'KNOCKOUT' && p.built).map((p) => p.id) : [];
    const [srcIds, setSrcIds] = useState(initial);
    const [type, setType] = useState(adding.mode === 'par' ? ref.type : adding.mode === 'first' ? 'GROUPS' : 'KNOCKOUT');
    const all = TE.sortedPhases(cat).filter((p) => p.built);
    const srcs = all.filter((p) => srcIds.includes(p.id));
    const own = ownerMap(cat, null);
    const parKind = parSrc ? (() => { const s = TE.connectorTo(cat, ref.id).selectors.find((x) => x.fromPhase === parSrc.id); return s ? kindOfRanking(s.ranking, parSrc) : null; })() : null;
    const perSrc = srcs.map((src) => {
      const kind = (parSrc && src.id === parSrc.id && parKind) || defaultKind(src, cat);
      const items = rankingItems(cat, src, kind).map((x) => { const k = { fromPhase: src.id, ranking: x.ranking, position: x.pos }; return { k, owner: own[kid(k)] }; });
      return { src, kind, items, free: items.filter((i) => !i.owner).map((i) => i.k).sort(byRank) };
    });
    const multi = perSrc.length > 1;
    const freeN = perSrc.reduce((s, p) => s + p.free.length, 0);
    const newOrder = cat.phases.length + 1;
    const teams = cat.teams.filter((t) => !t.fromAmericano).length;
    const needSrc = adding.mode !== 'first';
    // posizioni di partenza: con una sola origine tutte le libere (tabellone: fino al turno pieno), con più origini le prime di ognuna
    const startKeys = () => {
      if (multi) return type === 'KNOCKOUT' ? perSrc.map((p) => p.free[0]).filter(Boolean) : perSrc.flatMap((p) => p.free);
      let keys = perSrc.length ? perSrc[0].free.slice() : [];
      if (type === 'KNOCKOUT') { let m = 1; while (m * 2 <= keys.length) m *= 2; keys = keys.slice(0, Math.max(2, m)); }
      return keys;
    };
    const preview = startKeys();
    function create() {
      const keys = startKeys();
      const id = act((d, c) => {
        const s = !multi && srcs[0] && TE.findPhase(c, srcs[0].id);
        const sibKO = s ? c.phases.filter((p) => p.type === 'KNOCKOUT' && TE.sourcesOf(c, p).length === 1 && TE.sourcesOf(c, p)[0].id === s.id).length : 0;
        let name = type === 'KNOCKOUT' ? (multi ? (keys.length === 2 ? 'Finale unica' : 'Tabellone unico') : sibKO ? BRANCH[sibKO] || `Tabellone ${sibKO + 1}` : 'Tabellone') : newOrder === 1 ? 'Gironi' : `Gironi ${newOrder}`;
        if (type === 'KNOCKOUT' && sibKO === 1) c.phases.filter((p) => p.type === 'KNOCKOUT' && TE.sourcesOf(c, p).length === 1 && TE.sourcesOf(c, p)[0].id === s.id && p.name === 'Tabellone').forEach((p) => { p.name = 'Oro'; });
        const p = TE.addPhase(d, c, type, name);
        if (keys.length) {
          if (type === 'GROUPS') { const P = Math.max(1, Math.min(Math.floor(keys.length / 2), (s && s.pools.length) || 2)); const pk = snakeFill(keys, P); Object.assign(p.config, manualCfg(p.id, pk)); writeKeys(d, c, p.id, pk.flat()); }
          else writeKeys(d, c, p.id, keys);
        } else TE.rebuildPhase(d, c, p);
        return p.id;
      });
      open(id);
      say(type === 'KNOCKOUT' ? (multi ? 'Fase creata con le prime di ogni tabellone: aggiungi altre posizioni dall’elenco se servono.' : 'Tabellone creato con le posizioni libere: trascina squadre e BYE per cambiare gli accoppiamenti.') : 'Fase a gironi creata: trascina le posizioni per cambiare la composizione.', 'good');
    }
    const opt = (t, title, icon, bullets, foot) => html`<button className=${'opt cut' + (type === t ? ' on' : '')} onClick=${() => setType(t)} aria-pressed=${type === t}>
      <span className="opt-h"><span className="opt-i">${icon}</span><span className="opt-t">${title}</span>${type === t ? html`<${Tag} tone="blue">Scelta<//>` : null}</span>
      ${bullets.map((b, i) => html`<span key=${i} className="li"><span className="ck">✓</span>${b}</span>`)}
      <span className="opt-f">${foot}</span></button>`;
    const toggleSrc = (id) => setSrcIds(srcIds.includes(id) ? srcIds.filter((x) => x !== id) : [...srcIds, id]);
    const pv = new Set(preview.map(kid));
    return html`<section className="win cut">
      <div className="add-body">
        <div className="row"><${Tag} tone="blue">Fase ${newOrder}<//>${adding.mode === 'par' ? html`<${Tag} tone="ghost">In parallelo a #${ref.order} ${ref.name}<//>` : adding.mode === 'merge' ? html`<${Tag} tone="ghost">Unisce ${srcs.map((p) => p.name).join(' + ')}<//>` : null}</div>
        <h2 className="add-h">Che tipo di fase vuoi aggiungere?</h2>
        ${needSrc ? html`<div className="stack" style=${{ gap: 10 }}>
          <div className="eb">Prende le posizioni da</div>
          <div className="pchips">${all.map((p) => { const on = srcIds.includes(p.id); const col = branchColor(cat, p); return html`<button key=${p.id} className=${'srcchip' + (on ? ' on' : '')} aria-pressed=${on} onClick=${() => toggleSrc(p.id)}>${on ? '✓ ' : '+ '}#${p.order} ${col ? html`<i className="sq" style=${{ background: col }}></i> ` : null}${p.name}</button>`; })}</div>
          <span className="hint">Scegli una o più fasi. Con più fasi (per esempio Oro e Argento) la nuova fase le unisce: si parte dalle prime classificate di ognuna.</span>
          ${perSrc.map((ps) => html`<div key=${ps.src.id} className="stack" style=${{ gap: 6 }}>
            <span className="field-label">#${ps.src.order} ${ps.src.name} · ${KIND_TITLE[ps.kind]}</span>
            <div className="pchips">${ps.items.map((i) => html`<span key=${kid(i.k)} className=${'pchip' + (i.owner ? ' used' : pv.has(kid(i.k)) ? '' : ' idle')} title=${i.owner ? `già in ${i.owner.name}` : pv.has(kid(i.k)) ? 'entra nella nuova fase' : 'libera, la puoi aggiungere dopo'}>${posLabel(cat, i.k)}${i.owner ? html` <small>· ${i.owner.name}</small>` : null}</span>`)}</div>
          </div>`)}
          <p className="hint" style=${{ margin: 0 }}>In verde le posizioni che entrano subito: poi le cambi trascinandole. Quelle che nessuna fase usa escono dal torneo.</p>
        </div>` : html`<p className="hint" style=${{ margin: 0 }}>È la prima fase: entrano tutte le ${teams} squadre iscritte, in ordine di testa di serie.</p>`}
        <div className="opts">
          ${opt('GROUPS', 'Fase a gironi', '▦', [needSrc ? 'Le posizioni entrano nei gironi a serpentina; le sposti trascinandole.' : 'Le squadre vengono distribuite nei gironi per testa di serie; puoi spostarle trascinandole.', 'Produce le classifiche per girone, tra gironi e generale.', 'Dopo puoi aggiungere altre fasi.'], 'Il torneo continua →')}
          ${opt('KNOCKOUT', 'Eliminazione diretta', '⊐', [needSrc ? 'Le posizioni entrano nel tabellone dal turno che scegli; squadre e BYE si spostano trascinandoli.' : 'Tabellone dalle teste di serie; squadre e BYE si spostano trascinandoli.', 'Produce i piazzamenti finali (finale, 3°/4° e altri se li attivi).', 'Puoi affiancare altri tabelloni (Oro, Argento…) o unirli in una fase successiva.'], 'Decide i piazzamenti del ramo')}
        </div>
      </div>
      <footer className="win-foot">
        <button className="btn" onClick=${onCancel} disabled=${!cat.phases.length}>← Annulla</button>
        <span className="spacer"></span>
        ${needSrc && !srcs.length ? html`<span className="foot-msg warn">Scegli almeno una fase da cui prendere le posizioni.</span>` : needSrc && !freeN ? html`<span className="foot-msg warn">Nessuna posizione libera: liberane una da un’altra fase.</span>` : null}
        <button className="btn primary bev" disabled=${needSrc && (!srcs.length || !freeN)} onClick=${create}>Continua: configura ${type === 'GROUPS' ? 'i gironi' : 'il tabellone'} →</button>
      </footer>
    </section>`;
  }

  function RiepilogoPanel({ st, cat, graph, open, setView, act, say }) {
    const { ranges, last } = placeRanges(cat);
    const teams = cat.teams.filter((t) => !t.fromAmericano).length;
    const pub = st.tournament.status === 'PUBLISHED';
    return html`<section className="win cut"><div className="add-body">
      <div className="eb">Riepilogo · ${cat.name}</div>
      <h2 className="add-h">${teams} squadre · posti decisi ${last ? `1°–${last}°` : '—'}</h2>
      ${graph.errors.length ? html`<${Note} tone="bad"><b>Da correggere prima di attivare</b><ul>${graph.errors.map((e, i) => html`<li key=${i}>${T(e.msg)}</li>`)}</ul><//>` : html`<${Note} tone="good">La struttura è valida.<//>`}
      ${graph.warnings.length ? html`<${Note} tone="warn"><ul>${graph.warnings.map((e, i) => html`<li key=${i}>${T(e.msg)}</li>`)}</ul><//>` : null}
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Fase</th><th>Tipo</th><th>Prende da</th><th className="n">Squadre</th><th className="n">Partite</th><th>Posti finali</th></tr></thead><tbody>
        ${TE.sortedPhases(cat).map((p) => { const r = ranges[p.id]; const col = branchColor(cat, p); return html`<tr key=${p.id} className="clickrow" onClick=${() => open(p.id)}><td><b>#${p.order} ${col ? html`<i className="sq" style=${{ background: col }}></i> ` : null}${p.name}</b></td><td>${typeLabel(p.type)}</td><td>${TE.sourcesOf(cat, p).map((s) => `#${s.order} ${s.name}`).join(', ') || 'Squadre iscritte'}</td><td className="n">${p.entrants.length}</td><td className="n">${TE.phaseGames(cat, p.id).length}</td><td>${r ? `${r[0]}°–${r[1]}°` : html`<span className="muted">prosegue</span>`}</td></tr>`; })}
      </tbody></table></div>
      <div className="row"><${Btn} onClick=${() => setView('programma')}>Vai al programma<//>${pub ? null : html`<${Btn} kind="primary bev" disabled=${graph.errors.length > 0} onClick=${() => { act((d) => { d.tournament.status = 'PUBLISHED'; }); say('Torneo attivo: ora puoi inserire i risultati.', 'good'); }}>Attiva torneo →<//>`}</div>
    </div></section>`;
  }

  function PhaseWindow(ctx) {
    const { st, cat, phase, act, ask, open, errors } = ctx;
    const from = TE.sourcesOf(cat, phase);
    const sibs = siblingsOf(cat, phase);
    const root = TE.isRoot(cat, phase);
    return html`<section className="win cut" aria-label=${'Tabellone fase ' + phase.name}>
      <div className="win-top">
        <div className="stack" style=${{ gap: 6 }}>
          <div className="eb">Tabellone fase</div>
          <div className="row"><${Tag} tone="blue">Fase ${phase.order}<//><h2 className="win-title">${phase.type === 'GROUPS' ? 'Fase a gironi' : 'Eliminazione diretta'}</h2><span className="muted small">· ${from.length ? `prende le posizioni da ${from.map((s) => `#${s.order} ${s.name}`).join(', ')}` : 'tutte le squadre iscritte'}</span></div>
        </div>
        <div className="win-tabs" role="tablist">
          ${sibs.length > 1 || phase.type === 'KNOCKOUT' ? sibs.map((p) => { const col = branchColor(cat, p) || 'var(--blue)'; return html`<button key=${p.id} role="tab" aria-selected=${p.id === phase.id} className=${p.id === phase.id ? 'on' : ''} style=${{ borderBottomColor: p.id === phase.id ? col : 'transparent' }} onClick=${() => open(p.id)}><i className="sq" style=${{ background: col }}></i><b>${p.name}</b> <span className="muted">${p.entrants.length} squadre</span></button>`; }) : null}
          ${!root ? html`<button className="tab-add" onClick=${() => ctx.onAdd('par', phase.id)}>+ ${phase.type === 'KNOCKOUT' ? 'Tabellone' : 'In parallelo'}</button>` : null}
          <button className="tab-del" title="Elimina questa fase" onClick=${() => ask(`Eliminare ${phase.name}?`, 'Le sue partite vengono cancellate e le fasi che prendevano posizioni da qui perdono quegli slot.', 'Elimina fase', () => { act((d, c) => TE.removePhase(d, c, phase.id)); ctx.setSel(null); }, true)}>Elimina</button>
        </div>
      </div>
      ${errors.length ? html`<div style=${{ padding: '12px 24px 0' }}>${errors.map((e, i) => html`<${Note} key=${i} tone="bad">${T(e.msg)}<//>`)}</div>` : null}
      ${phase.type === 'GROUPS' ? (root ? html`<${GroupsRootEditor} ...${ctx} />` : html`<${GroupsSlotEditor} ...${ctx} />`) : html`<${KoEditor} ...${ctx} />`}
    </section>`;
  }

  function WinFoot({ st, cat, phase, errors, open, onAdd, setView, msg, tone }) {
    const prev = TE.sortedPhases(cat).filter((p) => p.order < phase.order).pop();
    const next = TE.downstreamOf(cat, phase).sort((a, b) => a.order - b.order)[0];
    const primary = next ? [`Avanti: #${next.order} ${next.name} →`, () => open(next.id)] : phase.type === 'KNOCKOUT' ? ['Avanti: riepilogo →', () => open('riepilogo')] : [`Avanti: aggiungi fase ${cat.phases.length + 1} →`, () => onAdd('next', phase.id)];
    return html`<footer className="win-foot">
      <button className="btn" onClick=${() => (prev ? open(prev.id) : setView('partecipanti'))}>← ${prev ? `Fase ${prev.order} · ${prev.name}` : 'Squadre'}</button>
      <span className="spacer"></span>
      ${msg ? html`<span className=${'foot-msg ' + (tone || '')}>${msg}</span>` : null}
      <button className="btn primary bev" disabled=${errors.length > 0} onClick=${primary[1]}>${primary[0]}</button>
    </footer>`;
  }
  const Stepper = ({ id, label, value, min, max, onChange, readOnly, hint }) => html`<div className="field"><span className="field-label" id=${id + '-l'}>${label}</span>
    <div className="stepper" role="group" aria-labelledby=${id + '-l'}>${readOnly ? null : html`<button className="stp" aria-label="Diminuisci" disabled=${value <= min} onClick=${() => onChange(value - 1)}>−</button>`}<span className="stp-v" id=${id}>${value}</span>${readOnly ? null : html`<button className="stp" aria-label="Aumenta" disabled=${value >= max} onClick=${() => onChange(value + 1)}>+</button>`}</div>${hint ? html`<span className="hint">${hint}</span>` : null}</div>`;
  const gamesPerTeam = (phase) => { const c = phase.config; const m = Math.max(0, ...phase.pools.map((p) => p.ids.length)); return c.games === 'ALL_ONCE' ? m - 1 : c.games === 'ALL_TWICE' ? 2 * (m - 1) : c.gamesPerTeam; };
  function GamesOptions({ st, cat, phase, act, ask }) {
    const cfg = phase.config;
    const guard = useGuard({ cat, phase, ask });
    const upd = (patch, what) => guard(what, () => act((d, c) => TE.updatePhase(d, c, phase.id, { config: patch })));
    return html`<div className="stack" style=${{ gap: 12 }}>
      <${Field} label="Partite" id=${'gm-' + phase.id}><select id=${'gm-' + phase.id} value=${cfg.games === 'N' ? cfg.gamesPerTeam : cfg.games} onChange=${(e) => { const v = e.target.value; upd(v === 'ALL_ONCE' || v === 'ALL_TWICE' ? { games: v } : { games: 'N', gamesPerTeam: +v }, 'Cambiare le partite'); }}>
        <option value="ALL_ONCE">Tutte contro tutte</option><option value="ALL_TWICE">Andata e ritorno</option>${Array.from({ length: 12 }, (_, i) => html`<option key=${i} value=${i + 1}>${i + 1} ${i ? 'partite' : 'partita'} a squadra</option>`)}</select><//>
      <${Field} label="Durata stimata di una partita (min)" id=${'gl-' + phase.id} hint="Serve solo a preparare il programma: è una stima, non un tempo da giocare per forza."><input id=${'gl-' + phase.id} type="number" min="5" step="5" value=${TE.gameLengthFor(st, cat, phase)} onChange=${(e) => act((d, c) => { TE.findPhase(c, phase.id).config.gameLength = +e.target.value || null; })} /><//>
    </div>`;
  }

  // P2 / W1 · prima fase a gironi: composizione con drag & drop
  function GroupsRootEditor(ctx) {
    const { st, cat, phase, act, ask, say } = ctx;
    const cfg = phase.config;
    const guard = useGuard({ cat, phase, ask });
    const [drag, setDrag] = useState(null); const [over, setOver] = useState(null);
    const n = phase.entrants.length, maxPools = Math.max(1, Math.floor(n / 2));
    const inPools = phase.pools.reduce((s, p) => s + p.ids.length, 0);
    const games = TE.phaseGames(cat, phase.id).length;
    const poolOf = (eid) => phase.pools.find((p) => p.ids.includes(eid));
    const swap = (a, b) => { if (!a || a === b) return; const pa = poolOf(a), pb = poolOf(b); if (!pa || !pb || pa.number === pb.number) return; guard('Scambiare due squadre', () => act((d, c) => { TE.movePoolEntrant(d, c, phase.id, a, pb.number); TE.movePoolEntrant(d, c, phase.id, b, pa.number); })); };
    const move = (a, to) => { const pa = poolOf(a); if (!pa || pa.number === to) return; guard('Spostare una squadra', () => act((d, c) => TE.movePoolEntrant(d, c, phase.id, a, to))); };
    const end = () => { setDrag(null); setOver(null); };
    const sizes = phase.pools.map((p) => p.ids.length);
    const unbalanced = Math.max(...sizes) - Math.min(...sizes) > 1;
    return html`<div className="win-body">
      <aside className="win-aside">
        <div className="row" style=${{ gap: 16, alignItems: 'flex-start' }}>
          <${Stepper} id=${'np-' + phase.id} label="N° gironi" value=${cfg.pools} min=${1} max=${maxPools} onChange=${(v) => guard('Cambiare i gironi', () => act((d, c) => TE.updatePhase(d, c, phase.id, { config: { pools: v, manualPools: null, distribution: cfg.distribution === 'MANUAL' ? 'SNAKE' : cfg.distribution } })))} />
          <${Stepper} id=${'sp-' + phase.id} label="Squadre per girone" value=${sizes.join(' · ')} readOnly=${true} hint="Cambiale trascinando le squadre" />
        </div>
        <div className="count-box"><span className="eb" style=${{ color: 'var(--green-ink)' }}>Squadre nei gironi</span><b>${inPools}<small> / ${n}</small></b><span className="small">Ogni girone gioca ${gamesPerTeam(phase)} partite a squadra · totale ${games}</span></div>
        <${GamesOptions} ...${ctx} />
        <p className="info">I gironi vengono riempiti per testa di serie, a serpentina. Trascina una squadra su un’altra per <b>scambiarle</b>, o nello spazio “Trascina qui” di un girone per spostarla: così cambi anche quante squadre ha ogni girone.</p>
      </aside>
      <div className="win-main">
        <div className="row" style=${{ justifyContent: 'space-between' }}><span className="sub-t" style=${{ margin: 0 }}>Composizione gironi</span><button className="btn sm" onClick=${() => guard('Ridistribuire le squadre', () => act((d, c) => TE.updatePhase(d, c, phase.id, { config: { distribution: 'SNAKE', manualPools: null } })))}>↻ Ridistribuisci per testa di serie</button></div>
        <div className="pools">${phase.pools.map((pl) => html`<div key=${pl.number} className=${'pool' + (over === 'p' + pl.number ? ' over' : '')} onDragOver=${(e) => { e.preventDefault(); setOver('p' + pl.number); }} onDrop=${(e) => { e.preventDefault(); move(drag || e.dataTransfer.getData('text/plain'), pl.number); end(); }}>
          <div className="pool-h">${poolName(cat, phase, pl)}<span>${pl.ids.length} squadre</span></div>
          <ul>${pl.ids.map((eid) => { const e = phase.entrants.find((x) => x.id === eid); return html`<li key=${eid} draggable="true" className=${'drag' + (drag === eid ? ' dragging' : '') + (over === eid ? ' over' : '')}
              onDragStart=${(ev) => { ev.dataTransfer.setData('text/plain', eid); ev.dataTransfer.effectAllowed = 'move'; setDrag(eid); }} onDragEnd=${end}
              onDragOver=${(ev) => { ev.preventDefault(); ev.stopPropagation(); setOver(eid); }} onDrop=${(ev) => { ev.preventDefault(); ev.stopPropagation(); swap(drag || ev.dataTransfer.getData('text/plain'), eid); end(); }}>
            <span className="handle" aria-hidden="true">⠿</span><span className="nm">${entLabel(cat, phase, e)}</span>
            <select className="mini-sel" aria-label=${'Sposta ' + entLabel(cat, phase, e)} value=${pl.number} onChange=${(ev) => move(eid, +ev.target.value)}>${phase.pools.map((q) => html`<option key=${q.number} value=${q.number}>${poolCode(cat, phase, q)}</option>`)}</select></li>`; })}
            <li className="drop-here" aria-hidden="true">Trascina qui per spostare una squadra in questo girone</li></ul></div>`)}</div>
        <div className="sub-t" style=${{ marginTop: 6 }}>Regole del drag & drop</div>
        <div className="rules3"><div><b>Su una squadra</b> · le due squadre si scambiano di girone.</div><div><b>Su uno spazio libero</b> · la squadra si sposta; il girone di partenza resta con un posto in meno.</div><div><b>Gironi sbilanciati</b> · consentiti${unbalanced ? html`: <span className="warn-t">ora le dimensioni differiscono di più di 1</span>` : ''}.</div></div>
        <${Crossovers} ...${ctx} />
      </div>
      <${WinFoot} ...${ctx} msg=${`${n} posizioni finali disponibili per la fase successiva`} />
    </div>`;
  }
  function Crossovers({ cat, phase, act, ask }) {
    const cfg = phase.config;
    const guard = useGuard({ cat, phase, ask });
    const upd = (patch) => guard('Cambiare gli incroci', () => act((d, c) => TE.updatePhase(d, c, phase.id, { config: patch })));
    const [ca, setCa] = useState(1); const [cb, setCb] = useState(2);
    if (phase.pools.length < 2) return null;
    return html`<details className="disc"><summary>Gironi incrociati${cfg.crossovers.length ? ` (${cfg.crossovers.length})` : ''}</summary>
      <p className="hint" style=${{ marginTop: 0 }}>Le squadre di due gironi abbinati giocano contro l’altro girone invece che nel proprio.</p>
      ${cfg.crossovers.map(([x, y], i) => html`<div className="row" key=${i}><span>${poolName(cat, phase, phase.pools[x - 1])} ⇄ ${poolName(cat, phase, phase.pools[y - 1])}</span><button className="icon-btn" aria-label="Rimuovi incrocio" onClick=${() => upd({ crossovers: cfg.crossovers.filter((_, k) => k !== i) })}>×</button></div>`)}
      <div className="row"><select aria-label="Primo girone" value=${ca} onChange=${(e) => setCa(+e.target.value)}>${phase.pools.map((q) => html`<option key=${q.number} value=${q.number}>${poolName(cat, phase, q)}</option>`)}</select><span>⇄</span>
        <select aria-label="Secondo girone" value=${cb} onChange=${(e) => setCb(+e.target.value)}>${phase.pools.map((q) => html`<option key=${q.number} value=${q.number}>${poolName(cat, phase, q)}</option>`)}</select>
        <${Btn} kind="sm" disabled=${ca === cb || cfg.crossovers.flat().some((x) => x === ca || x === cb)} onClick=${() => upd({ crossovers: [...cfg.crossovers, [ca, cb]] })}>Aggiungi incrocio<//></div>
    </details>`;
  }

  const kb = (fn) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
  // ---- trascinamento condiviso: una posizione dall'elenco, o il contenuto di un posto (tabellone / girone) ----
  let DRAG = null;
  const dragProps = (payload, setDragging) => ({
    draggable: 'true',
    onDragStart: (e) => { DRAG = payload; try { e.dataTransfer.setData('text/plain', 'x'); e.dataTransfer.effectAllowed = 'move'; } catch (x) { /* ignora */ } setDragging && setDragging(payload); },
    onDragEnd: () => { DRAG = null; setDragging && setDragging(null); },
  });
  const dropProps = (id, over, setOver, onDrop) => ({
    onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); if (over !== id) setOver(id); },
    onDragLeave: () => setOver(null),
    onDrop: (e) => { e.preventDefault(); e.stopPropagation(); const p = DRAG; DRAG = null; setOver(null); if (p) onDrop(p); },
  });

  // elenco "Posizioni da #N" (colonna sinistra): stato di ogni posizione; clic o trascina per aggiungere, riporta qui per togliere
  function PositionsList({ cat, phase, keys, statusOf, onToggle, kind, setKind, srcId, setSrc, title, onDropBack, over, setOver }) {
    const earlier = TE.sortedPhases(cat).filter((p) => p.order < phase.order && p.built);
    const src = earlier.find((p) => p.id === srcId) || earlier[earlier.length - 1];
    if (!src) return html`<${Note}>Nessuna fase precedente configurata.<//>`;
    const kinds = kindsFor(src);
    const k = kinds.includes(kind) ? kind : kinds[0];
    const items = rankingItems(cat, src, k);
    const own = ownerMap(cat, phase.id);
    const mine = new Set(keys.map(kid));
    const used = items.filter((x) => mine.has(`${src.id}|${x.ranking}|${x.pos}`)).length;
    const freeN = items.filter((x) => { const id = `${src.id}|${x.ranking}|${x.pos}`; return !mine.has(id) && !own[id]; }).length;
    return html`<div className=${'stack plist-wrap' + (over === 'list' ? ' over' : '')} style=${{ gap: 8 }} ...${dropProps('list', over, setOver, (p) => p.from !== 'list' && onDropBack(p))}>
      <div className="row" style=${{ justifyContent: 'space-between' }}><span className="field-label">Posizioni da #${src.order}</span><span className="small b" style=${{ color: 'var(--green-ink)' }}>${title(used, freeN)}</span></div>
      ${earlier.length > 1 ? html`<select aria-label="Fase di origine" value=${src.id} onChange=${(e) => setSrc(e.target.value)}>${earlier.map((p) => html`<option key=${p.id} value=${p.id}>#${p.order} ${p.name}</option>`)}</select>` : null}
      ${kinds.length > 1 ? html`<div className="seg full" role="radiogroup" aria-label="Classifica">${kinds.map((kk) => html`<button key=${kk} role="radio" aria-checked=${k === kk} className=${(k === kk ? 'on' : '') + (kk === 'CROSS' ? ' cross' : '')} onClick=${() => setKind(kk)}>${KIND_TITLE[kk]}</button>`)}</div>` : null}
      <div className="plist">${items.map((x) => { const key = { fromPhase: src.id, ranking: x.ranking, position: x.pos }; const id = kid(key); const s = statusOf(key, mine.has(id), own[id]);
        return html`<div role="button" tabIndex=${s.disabled ? -1 : 0} aria-disabled=${!!s.disabled} key=${id} className=${'prow ' + s.cls + (isCross(key) ? ' cross' : '') + (s.disabled ? ' dis' : '')} title=${s.title || ''} onClick=${() => !s.disabled && onToggle(key, mine.has(id))} onKeyDown=${kb(() => !s.disabled && onToggle(key, mine.has(id)))} ...${s.disabled ? {} : dragProps({ from: 'list', key })}><span><span className="handle" aria-hidden="true">⠿</span> ${posLabel(cat, key)}${x.who ? html` <small className="muted">${x.who}</small>` : null}</span><span className="pst">${s.text}</span></div>`; })}</div>
      <span className="hint">Clic per aggiungere o togliere, oppure trascina una posizione su un posto. Per togliere una squadra puoi anche riportarla qui.</span>
    </div>`;
  }

  // menu di un posto (W5): posizioni raggruppate per classifica; già usate in grigio; conflitti del motore spiegati
  function SlotMenu({ cat, phase, keys, curIdx, whereIs, nextKeys, check, onPick, onRemove, removeLabel, onClose }) {
    useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); const c = (e) => { if (!e.target.closest('.slot-menu') && !e.target.closest('.slot-btn')) onClose(); }; window.addEventListener('keydown', k); document.addEventListener('mousedown', c); return () => { window.removeEventListener('keydown', k); document.removeEventListener('mousedown', c); }; }, []);
    const own = ownerMap(cat, phase.id);
    const at = new Map(keys.map((k, i) => [kid(k), i]));
    return html`<div className="slot-menu" role="menu">
      ${optionGroups(cat, phase).map((g) => html`<div key=${g.src.id + g.kind}><div className=${'m-h' + (g.kind === 'CROSS' ? ' cross' : '')}>${g.title}</div>
        ${g.items.map((it) => { const id = kid(it.k); const t = at.get(id); const o = own[id];
          let state = '', dis = false, err = '';
          if (t !== undefined && t === curIdx) state = '✓';
          else if (t !== undefined) state = whereIs(t);
          else if (o) { state = `in ${o.name}`; dis = true; }
          else { err = check(nextKeys(it.k)) || ''; if (err) { state = 'non compatibile'; dis = true; } }
          return html`<button key=${id} role="menuitem" disabled=${dis} title=${err} className=${(t === curIdx && t !== undefined ? 'cur ' : '') + (g.kind === 'CROSS' ? 'cross' : '')} onClick=${() => onPick(it.k, t)}><span>${posLabel(cat, it.k)}${it.who ? html` <small>${it.who}</small>` : null}</span><small>${state}</small></button>`; })}</div>`)}
      ${onRemove ? html`<div className="m-sep"></div><button role="menuitem" className="rm" onClick=${onRemove}>${removeLabel}</button>` : null}
    </div>`;
  }

  // W10 · gironi successivi: posti in ogni girone, numero di posti per girone a mano, drag & drop e menu
  function GroupsSlotEditor(ctx) {
    const { st, cat, phase, act, say } = ctx;
    const cfg = phase.config;
    const keys = keysOf(phase);
    const { check, commit, guard } = useKeys(ctx, phase);
    const [openPlace, setOpen] = useState(null);
    const [over, setOver] = useState(null); const [dragging, setDragging] = useState(null);
    const [kind, setKind] = useState(() => (keys[0] ? kindOfRanking(keys[0].ranking, TE.findPhase(cat, keys[0].fromPhase)) : 'POOL'));
    const [srcId, setSrc] = useState(() => (keys[0] ? keys[0].fromPhase : null));
    // composizione voluta: manualPools (anche se il motore, con poche squadre, ne usa meno) oppure i gironi calcolati
    const idx = Object.fromEntries(phase.entrants.map((e, i) => [e.id, i]));
    const manualOk = cfg.distribution === 'MANUAL' && Array.isArray(cfg.manualPools) && cfg.manualPools.flatMap((p) => p.ids).length === keys.length && cfg.manualPools.every((p) => p.ids.every((x) => x in idx));
    const auto = !manualOk;
    const groups = (manualOk ? cfg.manualPools : phase.pools).map((p) => p.ids.map((x) => idx[x]));
    const sizes = groups.map((g, i) => Math.max(g.length, (cfg.poolSizes || [])[i] || 0, auto ? g.length : 0));
    const keyAt = groups.map((g) => g.map((i) => keys[i]));
    const enginePools = phase.pools.length;
    // salva: chiavi in ordine girone per girone + manualPools con gli id che il motore assegnerà (e_<fase>_<n>)
    const save = (pk, sz, msg) => commit(pk.flat(), manualCfg(phase.id, pk, sz), msg);
    const locate = (k) => { for (let p = 0; p < keyAt.length; p++) { const j = keyAt[p].findIndex((x) => kid(x) === kid(k)); if (j >= 0) return [p, j]; } return null; };
    const clonePK = () => keyAt.map((l) => l.slice());
    // metti la posizione k nel posto (p, j): scambio se è già nella fase, sostituzione o riempimento se è libera
    const place = (k, p, j) => {
      const pk = clonePK(); const sz = sizes.slice(); const from = locate(k);
      const cur = pk[p][j];
      if (from) { const [fp, fj] = from; if (fp === p && fj === j) return; pk[fp][fj] = cur || null; pk[p][j] = k; }
      else if (j < pk[p].length) pk[p][j] = k; else pk[p].push(k);
      save(pk.map((l) => l.filter(Boolean)), sz);
    };
    const movePlace = (fp, fj, p, j) => { const k = keyAt[fp][fj]; if (k) place(k, p, j); };
    const removeAt = (p, j) => { const pk = clonePK(); pk[p].splice(j, 1); save(pk, sizes); };
    const setSize = (p, v) => { const pk = clonePK(); const sz = sizes.slice(); sz[p] = Math.max(1, v); if (pk[p].length > sz[p]) pk[p] = pk[p].slice(0, sz[p]); save(pk, sz); };
    const setAllSizes = (v) => { const pk = clonePK().map((l) => l.slice(0, Math.max(1, v))); save(pk, pk.map(() => Math.max(1, v))); };
    const setPools = (v) => { const pk = clonePK(); const sz = sizes.slice(); while (pk.length < v) { pk.push([]); sz.push(sz[sz.length - 1] || 2); } while (pk.length > v) { pk.pop(); sz.pop(); } save(pk, sz, null); };
    const fillEmpty = () => {
      const own = ownerMap(cat, phase.id); const mine = new Set(keys.map(kid));
      const src = TE.findPhase(cat, srcId) || TE.findPhase(cat, (keys[0] || {}).fromPhase); if (!src) return;
      const free = rankingItems(cat, src, kindsFor(src).includes(kind) ? kind : kindsFor(src)[0]).map((x) => ({ fromPhase: src.id, ranking: x.ranking, position: x.pos })).filter((k) => !own[kid(k)] && !mine.has(kid(k))).sort(byRank);
      const pk = clonePK(); let added = 0;
      snakePlaces(sizes).forEach(([p, r]) => { if (r >= pk[p].length && free.length) { pk[p].push(free.shift()); added++; } });
      if (!added) return say('Nessuna posizione libera da mettere nei posti vuoti.', 'warn');
      save(pk, sizes, `${added} posti riempiti con le posizioni libere.`);
    };
    const toggle = (k, isMine) => { if (isMine) { const at = locate(k); if (at) removeAt(at[0], at[1]); return; } let p = sizes.findIndex((s, i) => keyAt[i].length < s); if (p < 0) p = keyAt.reduce((b, l, i) => (l.length < keyAt[b].length ? i : b), 0); place(k, p, keyAt[p].length); };
    const statusOf = (k, isMine, owner) => {
      if (isMine) { const at = locate(k); return { cls: 'mine', text: at ? `${poolCode(cat, phase, { number: at[0] + 1 })} · ${at[1] + 1}°` : '✓', title: 'Clic per togliere' }; }
      if (owner) return { cls: 'other', text: owner.name, disabled: true, title: `Già in ${owner.name}` };
      return { cls: 'free', text: 'Libera', title: 'Clic o trascina per aggiungere' };
    };
    const dropOn = (p, j) => (pl) => (pl.from === 'list' ? place(pl.key, p, j) : pl.from === 'gplace' ? movePlace(pl.p, pl.j, p, j) : null);
    // cambio di classifica: le posizioni già messe da quella fase vengono sostituite con la nuova classifica, negli stessi posti
    const switchKind = (kk) => {
      setKind(kk);
      const src = TE.findPhase(cat, srcId) || TE.findPhase(cat, (keys[0] || {}).fromPhase); if (!src) return;
      const placesOf = snakePlaces(sizes).filter(([p, r]) => keyAt[p][r] && keyAt[p][r].fromPhase === src.id);
      if (!placesOf.length || placesOf.every(([p, r]) => kindOfRanking(keyAt[p][r].ranking, src) === kk)) return;
      const own = ownerMap(cat, phase.id); const keep = new Set(keys.filter((k) => k.fromPhase !== src.id).map(kid));
      const cand = rankingItems(cat, src, kk).map((x) => ({ fromPhase: src.id, ranking: x.ranking, position: x.pos })).filter((k) => !own[kid(k)] && !keep.has(kid(k))).sort(byRank);
      const pk = clonePK(); placesOf.forEach(([p, r]) => { pk[p][r] = cand.shift() || null; });
      save(pk.map((l) => l.filter(Boolean)), sizes, `Posizioni sostituite con la classifica “${KIND_TITLE[kk]}”.`);
    };
    const nextFor = (p, j) => (k) => { const pk = clonePK(); if (j < pk[p].length) pk[p][j] = k; else pk[p].push(k); return pk.flat(); };
    const empties = sizes.reduce((s, z, i) => s + Math.max(0, z - keyAt[i].length), 0);
    return html`<div className="win-body">
      <aside className="win-aside">
        <div className="row" style=${{ gap: 16, alignItems: 'flex-start' }}>
          <${Stepper} id=${'np-' + phase.id} label="N° gironi" value=${keyAt.length} min=${1} max=${16} onChange=${setPools} />
          <${Stepper} id=${'sp-' + phase.id} label="Posti per girone" value=${Math.max(...sizes)} min=${1} max=${16} onChange=${setAllSizes} hint=${new Set(sizes).size > 1 ? `ora: ${sizes.join(' · ')}` : null} />
        </div>
        <${PositionsList} cat=${cat} phase=${phase} keys=${keys} statusOf=${statusOf} onToggle=${toggle} kind=${kind} setKind=${switchKind} srcId=${srcId} setSrc=${setSrc} title=${(u, f) => `${u} usate · ${f} libere`} over=${over} setOver=${setOver} onDropBack=${(pl) => pl.from === 'gplace' && removeAt(pl.p, pl.j)} />
        <p className="info">Le posizioni libere si possono usare in una fase <b>in parallelo</b>. Se restano libere, quelle squadre escono dal torneo.</p>
        <label className="check"><input type="checkbox" checked=${phase.inheritPoints} onChange=${(e) => guard('Cambiare i punti ereditati', () => act((d, c) => TE.updatePhase(d, c, phase.id, { inheritPoints: e.target.checked })))} /> Porta punti e statistiche dalla fase precedente</label>
        <${GamesOptions} ...${ctx} />
      </aside>
      <div className="win-main">
        <div className="row" style=${{ justifyContent: 'space-between' }}><span className="sub-t" style=${{ margin: 0 }}>Composizione gironi</span>${empties ? html`<button className="btn sm" onClick=${fillEmpty}>Riempi i ${empties} posti vuoti</button>` : null}</div>
        ${!auto && enginePools !== keyAt.length && phase.built ? html`<${Note} tone="warn">Con ${keys.length} squadre il motore può fare al massimo ${enginePools} ${enginePools === 1 ? 'girone' : 'gironi'} (almeno 2 squadre per girone in media): riempi i posti o togli un girone.<//>` : null}
        <div className="pools wide">${keyAt.map((list, p) => html`<div key=${p} className="pool">
          <div className="pool-h light">${poolName(cat, phase, { number: p + 1 })}<span className="pool-size"><button className="stp xs" aria-label="Un posto in meno" disabled=${sizes[p] <= 1} onClick=${() => setSize(p, sizes[p] - 1)}>−</button>${sizes[p]} posti<button className="stp xs" aria-label="Un posto in più" onClick=${() => setSize(p, sizes[p] + 1)}>+</button></span></div>
          <div className="slots">${Array.from({ length: sizes[p] }, (_, j) => { const k = list[j]; const ent = k ? phase.entrants[keys.findIndex((x) => kid(x) === kid(k))] : null; const id = `${p}-${j}`;
            const lb = ent ? entLabel(cat, phase, ent) : null;
            return html`<div key=${id} className=${'slot-wrap' + (over === id ? ' over' : '')} ...${dropProps(id, over, setOver, dropOn(p, j))}>
              <div role="button" tabIndex="0" onKeyDown=${kb(() => setOpen(openPlace === id ? null : id))} className=${'slot-btn' + (k ? '' : ' empty') + (k && isCross(k) ? ' cross' : '') + (openPlace === id ? ' open' : '') + (dragging && dragging.from === 'gplace' && dragging.p === p && dragging.j === j ? ' dragging' : '')} onClick=${() => setOpen(openPlace === id ? null : id)} ...${k ? dragProps({ from: 'gplace', p, j }, setDragging) : {}}>
                <span>${k ? html`<span className="handle" aria-hidden="true">⠿</span> ${ent && ent.participant ? html`<b>${lb}</b> <small>${posLabel(cat, k)}</small>` : lb}` : 'Scegli o trascina qui…'}</span><span className="chev">▾</span></div>
              ${openPlace === id ? html`<${SlotMenu} cat=${cat} phase=${phase} keys=${keys} curIdx=${k ? keys.findIndex((x) => kid(x) === kid(k)) : -1} whereIs=${(t) => { const at = locate(keys[t]); return at ? `scambia con ${poolCode(cat, phase, { number: at[0] + 1 })}` : ''; }} nextKeys=${nextFor(p, j)} check=${check} onPick=${(nk) => { setOpen(null); place(nk, p, j); }} onRemove=${k ? () => { setOpen(null); removeAt(p, j); } : null} removeLabel="Svuota questo posto" onClose=${() => setOpen(null)} />` : null}
            </div>`; })}</div></div>`)}</div>
        <p className="info">Trascina una posizione dall’elenco su un posto, o un posto su un altro per <b>scambiarli</b>. Con − e + decidi quanti posti ha ogni girone. Chi passa da questa fase si decide nella <b>fase successiva</b>.</p>
        <${Crossovers} ...${ctx} />
      </div>
      <${WinFoot} ...${ctx} msg=${empties ? `${empties} posti ancora vuoti` : phase.built ? `${keys.length} posizioni finali disponibili per la fase successiva` : 'Servono almeno due posizioni.'} tone=${empties || !phase.built ? 'warn' : ''} />
    </div>`;
  }

  // W9 / W5 / W6 · tabellone: posti del primo turno a mano (squadre e BYE), drag & drop e menu
  function KoEditor(ctx) {
    const { st, cat, phase, act, say } = ctx;
    const cfg = phase.config;
    const root = TE.isRoot(cat, phase);
    const keys = keysOf(phase);
    const { check, commit, guard } = useKeys(ctx, phase);
    const [openSlot, setOpen] = useState(null);
    const [over, setOver] = useState(null); const [dragging, setDragging] = useState(null);
    const [kind, setKind] = useState(() => (keys[0] ? kindOfRanking(keys[0].ranking, TE.findPhase(cat, keys[0].fromPhase)) : 'POOL'));
    const [srcId, setSrc] = useState(() => (keys[0] ? keys[0].fromPhase : null));
    const lay = koLayout(cat, phase);
    const slots = lay.slots;
    const n = phase.entrants.length;
    const upd = (patch, what) => guard(what || 'Rigenerare il tabellone', () => act((d, c) => TE.updatePhase(d, c, phase.id, { config: patch })));
    const col = branchColor(cat, phase);
    const own = ownerMap(cat, phase.id);
    const mineIds = new Set(keys.map(kid));
    // salva elenco posizioni + disposizione del primo turno (indici nell'elenco, null = BYE)
    const saveKO = (nk, ns, msg) => {
      if (byeByePair(ns)) return say('Ogni partita del primo turno deve avere almeno una squadra: sposta un BYE.', 'bad');
      if (root) return guard('Cambiare il primo turno', () => act((d, c) => TE.updatePhase(d, c, phase.id, { config: { layout: ns } })));
      commit(nk, { layout: ns }, msg);
    };
    const swapSlots = (a, b) => { if (a === b) return; const ns = slots.slice(); [ns[a], ns[b]] = [ns[b], ns[a]]; saveKO(keys, ns); };
    const placeKey = (k, si) => {
      const t = keys.findIndex((x) => kid(x) === kid(k));
      if (t >= 0) return swapSlots(slots.indexOf(t), si);
      const nk = keys.slice(); const ns = slots.slice();
      if (ns[si] != null) nk[ns[si]] = k; else { nk.push(k); ns[si] = nk.length - 1; }
      saveKO(nk, ns);
    };
    const removeSlot = (si) => { const t = slots[si]; if (t == null) return; const nk = keys.filter((_, i) => i !== t); const ns = slots.map((x) => (x == null || x === t ? null : x > t ? x - 1 : x)); saveKO(nk, ns); };
    const freeKeys = () => { const src = TE.findPhase(cat, srcId) || TE.findPhase(cat, (keys[0] || {}).fromPhase) || TE.sortedPhases(cat).filter((p) => p.order < phase.order).pop(); if (!src) return []; return rankingItems(cat, src, kindsFor(src).includes(kind) ? kind : kindsFor(src)[0]).map((x) => ({ fromPhase: src.id, ranking: x.ranking, position: x.pos })).filter((k) => !own[kid(k)] && !mineIds.has(kid(k))).sort(byRank); };
    const avail = root ? n : n + freeKeys().length;
    // "Parti da": cambia la dimensione del tabellone, aggiunge posizioni libere o toglie le ultime teste di serie
    const setRound = (size) => {
      let nk = keys.slice();
      if (nk.length > size) nk = nk.slice(0, size);
      else if (!root) { const free = freeKeys(); while (nk.length < size && free.length) nk.push(free.shift()); }
      const cnt = root ? n : nk.length; const ns = TE.seedOrder(size).map((s) => (s <= cnt ? s - 1 : null));
      if (root) return saveKO(nk, ns);
      commit(nk, { layout: ns }, `Il tabellone parte ${ROUND[size][2]}: trascina squadre e BYE per cambiare gli accoppiamenti.`);
    };
    const toggle = (k, isMine) => {
      if (isMine) return removeSlot(slots.indexOf(keys.findIndex((x) => kid(x) === kid(k))));
      const si = slots.findIndex((x, i) => x == null && slots[i ^ 1] != null);
      if (si < 0) return say('Il tabellone è pieno: scegli un turno più grande in “Parti da” o togli una squadra.', 'warn');
      placeKey(k, si);
    };
    const statusOf = (k, isMine, owner) => {
      if (isMine) return { cls: 'mine', text: lay.entrantCode(keys.findIndex((x) => kid(x) === kid(k))), title: 'Clic per togliere dal tabellone' };
      if (owner) return { cls: 'other', text: owner.name, disabled: true, title: `Già in ${owner.name}` };
      return { cls: 'free', text: 'Non usata', title: 'Clic o trascina per aggiungere' };
    };
    const dropOn = (si) => (pl) => (pl.from === 'list' ? placeKey(pl.key, si) : pl.from === 'kslot' ? swapSlots(pl.si, si) : null);
    // cambio di classifica: stesse teste di serie e stessi posti, posizioni prese dalla nuova classifica in ordine di merito
    const switchKind = (kk) => {
      setKind(kk);
      if (root) return;
      const src = TE.findPhase(cat, srcId) || TE.findPhase(cat, (keys[0] || {}).fromPhase); if (!src) return;
      const idxs = keys.map((k, i) => i).filter((i) => keys[i].fromPhase === src.id);
      if (!idxs.length || idxs.every((i) => kindOfRanking(keys[i].ranking, src) === kk)) return;
      const keep = new Set(keys.filter((k) => k.fromPhase !== src.id).map(kid));
      const cand = rankingItems(cat, src, kk).map((x) => ({ fromPhase: src.id, ranking: x.ranking, position: x.pos })).filter((k) => !own[kid(k)] && !keep.has(kid(k))).sort(byRank);
      const nk = keys.slice(); idxs.forEach((i) => { nk[i] = cand.shift() || null; });
      const drop = new Set(nk.map((k, i) => (k ? -1 : i)).filter((i) => i >= 0));
      const remap = {}; let c = 0; nk.forEach((k, i) => { if (k) remap[i] = c++; });
      let ns = slots.map((x) => (x == null || drop.has(x) ? null : remap[x]));
      const fk = nk.filter(Boolean);
      if (byeByePair(ns)) ns = TE.seedOrder(nextPow2(Math.max(2, fk.length))).map((x) => (x <= fk.length ? x - 1 : null));
      commit(fk, { layout: ns }, `Posizioni sostituite con la classifica “${KIND_TITLE[kk]}”.`);
    };
    const sameGroup = lay.pairs.filter((p) => !p.bye).map((p) => { const [a, b] = p.slots.map((s) => keys[slots[s]]); return a && b && a.ranking.startsWith('pool:') && a.ranking === b.ranking && a.fromPhase === b.fromPhase ? p.code : null; }).filter(Boolean);
    const slotEl = (si) => {
      const t = slots[si]; const e = t == null ? null : phase.entrants[t]; const id = 'k' + si;
      const lb = e ? entLabel(cat, phase, e) : null; const cross = e && isCross(e.source);
      const isDrag = dragging && dragging.from === 'kslot' && dragging.si === si;
      return html`<div key=${id} className=${'slot-wrap' + (over === id ? ' over' : '')} ...${dropProps(id, over, setOver, dropOn(si))}>
        <div role="button" tabIndex="0" onKeyDown=${kb(() => setOpen(openSlot === si ? null : si))} className=${'s slot-btn' + (e ? '' : ' bye') + (cross ? ' cross' : '') + (openSlot === si ? ' open' : '') + (isDrag ? ' dragging' : '')} onClick=${() => setOpen(openSlot === si ? null : si)} title=${e ? 'Trascina su un altro posto per scambiare, o clicca per scegliere' : 'BYE: chi è nell’altro posto passa direttamente. Trascina qui una squadra o scegline una.'} ...${dragProps({ from: 'kslot', si }, setDragging)}>
          <span>${e ? html`<span className="handle" aria-hidden="true">⠿</span> ${e.participant && e.source.fromPhase ? html`<b>${lb}</b> <small>${posLabel(cat, e.source)}</small>` : lb}` : html`<span className="handle" aria-hidden="true">⠿</span> BYE`}</span><span className="chev">▾</span></div>
        ${openSlot === si ? (root
          ? html`<div className="slot-menu" role="menu"><div className="m-h">Scambia con</div>${slots.map((x, j) => (j === si ? null : html`<button key=${j} role="menuitem" onClick=${() => { setOpen(null); swapSlots(si, j); }}><span>${x == null ? 'BYE' : entLabel(cat, phase, phase.entrants[x])}</span><small>${lay.slotCode(j)}</small></button>`))}</div>`
          : html`<${SlotMenu} cat=${cat} phase=${phase} keys=${keys} curIdx=${t == null ? -1 : t} whereIs=${(x) => (t == null ? `sposta qui da ${lay.slotCode(slots.indexOf(x))}` : `scambia con ${lay.slotCode(slots.indexOf(x))}`)} nextKeys=${(k) => { const nk = keys.slice(); if (t != null) nk[t] = k; else nk.push(k); return nk; }} check=${check} onPick=${(k) => { setOpen(null); placeKey(k, si); }} onRemove=${e ? () => { setOpen(null); removeSlot(si); } : null} removeLabel="Lascia BYE (togli dal tabellone)" onClose=${() => setOpen(null)} />`) : null}
      </div>`;
    };
    const has3 = (cfg.placements || []).includes(3);
    return html`<div className="win-body">
      <aside className="win-aside">
        ${cfg.eliminations !== 2 ? html`<div className="stack" style=${{ gap: 8 }}><span className="field-label">Parti da</span>
          <div className="rounds">${ROUND_BTNS.map((sz) => { const cur = lay.size === sz; const after = Math.min(sz, avail); const ok = root ? sz >= n && n > sz / 2 : sz === 2 ? avail >= 2 : after > sz / 2; return html`<button key=${sz} className=${cur ? 'on' : ''} disabled=${!ok && !cur} onClick=${() => !cur && setRound(sz)}>${ROUND[sz][0]}</button>`; })}</div>
          <span className="hint">Proposti i turni che ${avail} ${root ? 'squadre' : 'posizioni'} possono riempire. I posti vuoti sono BYE: puoi spostarli dove vuoi.</span></div>` : null}
        ${root ? html`<div className="stack" style=${{ gap: 6 }}><span className="field-label">Squadre iscritte</span><div className="plist">${phase.entrants.map((e, i) => html`<div key=${e.id} className="prow mine"><span>${entLabel(cat, phase, e)}</span><span className="pst">${lay.entrantCode(i)}</span></div>`)}</div></div>`
          : html`<${PositionsList} cat=${cat} phase=${phase} keys=${keys} statusOf=${statusOf} onToggle=${toggle} kind=${kind} setKind=${switchKind} srcId=${srcId} setSrc=${setSrc} title=${() => `${n} nel tabellone`} over=${over} setOver=${setOver} onDropBack=${(pl) => pl.from === 'kslot' && removeSlot(pl.si)} />`}
        ${kind === 'CROSS' && !root ? html`<${CrossCriteria} ...${ctx} />` : null}
        <div className="stack" style=${{ gap: 8 }}><span className="field-label">Formato</span>
          <div className="seg full" role="radiogroup">${[[1, 'Fuori dopo 1 sconfitta'], [2, 'Dopo 2 (tabellone perdenti)']].map(([k, l]) => html`<button key=${k} role="radio" aria-checked=${cfg.eliminations === k} className=${cfg.eliminations === k ? 'on' : ''} onClick=${() => cfg.eliminations !== k && upd({ eliminations: k })}>${l}</button>`)}</div>
          ${cfg.eliminations === 2 ? html`<label className="check"><input type="checkbox" checked=${cfg.bracketReset} onChange=${(e) => upd({ bracketReset: e.target.checked })} /> Bella se vince il tabellone perdenti</label>` : null}</div>
      </aside>
      <div className="win-main">
        <div className="ko-h">
          <div className="row">${col ? html`<i className="sq lg" style=${{ background: col }}></i>` : null}<span className="b" style=${{ fontSize: 18 }}>Tabellone</span><input className="name" id=${'pn-' + phase.id} aria-label="Nome del tabellone" value=${phase.name} onChange=${(e) => act((d, c) => { TE.findPhase(c, phase.id).name = e.target.value; })} /><span className="muted small">· parte ${ROUND[lay.size] ? ROUND[lay.size][2] : ''}</span></div>
          ${cfg.eliminations !== 2 ? html`<div className="row">
            <label className="switch"><span>Finale 3°/4° posto</span><input type="checkbox" role="switch" disabled=${n < 4} checked=${has3} onChange=${(e) => { const s = new Set(cfg.placements); e.target.checked ? s.add(3) : s.delete(3); upd({ placements: [...s].sort((a, b) => a - b) }); }} /><i></i></label>
            <details className="more"><summary>Altri piazzamenti</summary><div className="more-pop">${[[5, 8], [7, 8]].map(([pl, min]) => html`<label key=${pl} className="check"><input type="checkbox" disabled=${n < min || (pl === 7 && !cfg.placements.includes(5))} checked=${cfg.placements.includes(pl)} onChange=${(e) => { const s = new Set(cfg.placements); e.target.checked ? s.add(pl) : (s.delete(pl), pl === 5 && s.delete(7)); upd({ placements: [...s].sort((x, y) => x - y) }); }} /> Finale ${pl}°/${pl + 1}°</label>`)}<span className="hint">I posti non giocati si decidono con i criteri di spareggio tra chi esce nello stesso turno.</span></div></details>
          </div>` : null}
        </div>
        ${cfg.eliminations === 2 ? html`<${Note}>Doppia eliminazione: le teste di serie seguono l’ordine delle posizioni a sinistra. Tabellone vincenti, perdenti e finalissima sono generati dal motore.<//><${BracketView} st=${st} cat=${cat} phase=${phase} />`
        : !phase.built ? html`<${Note} tone="warn">Servono almeno due squadre nel tabellone: aggiungile dall’elenco a sinistra.<//>`
        : html`<div className="ko">
          <div className="ko-col"><div className="colh">${ROUND[lay.size] ? ROUND[lay.size][0] : 'Primo turno'}</div><div className="lane">
            ${lay.pairs.map((p) => html`<div key=${p.code} className="m"><div className="ml"><span>${p.code}${p.g ? html` <small>#${p.g.number}</small>` : null}</span>${p.bye ? html`<span className="ok-t">Passa direttamente</span>` : sameGroup.includes(p.code) ? html`<span className="warn-t">Stesso girone</span>` : null}</div>${slotEl(p.slots[0])}${slotEl(p.slots[1])}</div>`)}
          </div></div>
          ${lay.cols.map((c) => html`<div key=${c.title} className="ko-col"><div className="colh">${c.final ? 'Finali' : c.title}</div><div className="lane">
            ${c.games.map((g) => html`<${KoCard} key=${g.id} st=${st} cat=${cat} g=${g} code=${lay.codes[g.number]} codes=${lay.codes} tone=${c.final ? 'gold' : ''} title=${c.final ? 'Finale · 1°/2°' : null} />`)}
            ${c.final ? lay.place.filter((g) => g.winnerPlace === 3).map((g) => html`<${KoCard} key=${g.id} st=${st} cat=${cat} g=${g} code=${lay.codes[g.number]} codes=${lay.codes} tone="blue" title="Finale · 3°/4°" />`) : null}
          </div></div>`)}
          ${lay.place.filter((g) => g.winnerPlace !== 3).length ? html`<div className="ko-col"><div className="colh">Piazzamenti</div><div className="lane">${lay.place.filter((g) => g.winnerPlace !== 3).map((g) => html`<${KoCard} key=${g.id} st=${st} cat=${cat} g=${g} code=${lay.codes[g.number]} codes=${lay.codes} title=${T(g.label)} />`)}</div></div>` : null}
        </div>
        <p className="info">Trascina una squadra o un <b>BYE</b> su un altro posto per scambiarli; trascina una posizione dall’elenco su un posto per metterla lì. Clicca un posto per scegliere dal menu.</p>`}
        ${cfg.eliminations !== 2 && phase.built ? html`<${Consolations} ...${ctx} codes=${lay.codes} />` : null}
      </div>
      <${WinFoot} ...${ctx} msg=${sameGroup.length ? `${sameGroup.join(' e ')} ${sameGroup.length > 1 ? 'mettono' : 'mette'} di fronte due squadre dello stesso girone.` : phase.built ? `${TE.phaseGames(cat, phase.id).length} partite · ${lay.size - n} BYE` : 'Aggiungi almeno due squadre.'} tone=${sameGroup.length ? 'warn' : ''} />
    </div>`;
  }
  function CrossCriteria({ cat, act }) {
    const f = cat.format;
    const set = (fn) => act((d, c) => fn(c.format));
    return html`<div className="stack" style=${{ gap: 6 }}><div className="row" style=${{ justifyContent: 'space-between' }}><span className="field-label">Criteri classifica tra gironi</span><span className="hint">ordine</span></div>
      <ol className="tb-list compact">${f.tiebreakers.filter((t) => t.scope === 'O').map((t, i, arr) => { const gi = f.tiebreakers.indexOf(t); return html`<li key=${gi}><span className="rk">${i + 1}</span><span className="nm">${TE.RULES[t.rule].name}</span><span className="row tight"><button className="icon-btn" aria-label="Su" disabled=${i === 0} onClick=${() => set((x) => { const a = x.tiebreakers; const gj = a.indexOf(a.filter((q) => q.scope === 'O')[i - 1]); [a[gj], a[gi]] = [a[gi], a[gj]]; })}>↑</button><button className="icon-btn" aria-label="Giù" disabled=${i === arr.length - 1} onClick=${() => set((x) => { const a = x.tiebreakers; const gj = a.indexOf(a.filter((q) => q.scope === 'O')[i + 1]); [a[gj], a[gi]] = [a[gi], a[gj]]; })}>↓</button></span></li>`; })}</ol>
      <span className="hint">Con gironi di dimensioni diverse si confronta la <b>media per partita</b>. Valgono per tutta la categoria.</span></div>`;
  }
  function KoCard({ st, cat, g, code, codes, onGame, tone, title }) {
    const n = TE.gameNumbers(st, cat, g);
    const playable = TE.isPlayable(st, cat, g);
    const side = (src, which) => { const l = srcLabel(st, cat, src, codes); const win = n && n.winner === which; const score = !n ? '' : g.result && g.result.sets ? g.result.sets.map((s) => s[which === 'home' ? 0 : 1]).join(' ') : which === 'home' ? n.hp : n.ap; return html`<div className=${'s' + (win ? ' w' : '') + (l.known ? '' : ' tbd') + (l.cross ? ' cross' : '')}><span className="nm">${l.text}</span><span className="sc">${score}</span></div>`; };
    const Tagx = onGame && playable ? 'button' : 'div';
    return html`<${Tagx} className=${'m' + (tone ? ' ' + tone : '') + (onGame && playable ? ' click' : '') + (!TE.isNeeded(st, cat, g) ? ' dim' : '')} onClick=${onGame && playable ? () => onGame(g) : undefined}><div className="ml"><span>${title || code} <small>#${g.number}</small></span><span>${g.status === 'FINAL' ? 'Giocata' : g.status === 'FORFEIT' ? 'Forfait' : g.status === 'CANCELLED' ? 'Annullata' : playable ? 'Da giocare' : ''}</span></div>${side(g.home, 'home')}${side(g.away, 'away')}<//>`;
  }
  function Consolations({ cat, phase, act, ask, codes }) {
    const cfg = phase.config;
    const guard = useGuard({ cat, phase, ask });
    const upd = (patch) => guard('Rigenerare il tabellone', () => act((d, c) => TE.updatePhase(d, c, phase.id, { config: patch })));
    const games = TE.phaseGames(cat, phase.id).filter((g) => g.bracket !== 'C');
    const [ca, setCa] = useState(''); const [cb, setCb] = useState(''); const [ra, setRa] = useState('L'); const [rb, setRb] = useState('L');
    return html`<details className="disc"><summary>Partite di consolazione${cfg.consolations.length ? ` (${cfg.consolations.length})` : ''}</summary>
      <p className="hint" style=${{ marginTop: 0 }}>Partite extra tra vincenti o perdenti di partite precedenti. Non cambiano i piazzamenti finali.</p>
      <div className="row">
        <select aria-label="Casa" value=${ra} onChange=${(e) => setRa(e.target.value)}><option value="L">Perdente</option><option value="W">Vincente</option></select>
        <select aria-label="Partita casa" value=${ca} onChange=${(e) => setCa(e.target.value)}><option value="">partita…</option>${games.map((g) => html`<option key=${g.id} value=${g.number}>${codes[g.number] || '#' + g.number}</option>`)}</select>
        <span>contro</span>
        <select aria-label="Ospite" value=${rb} onChange=${(e) => setRb(e.target.value)}><option value="L">Perdente</option><option value="W">Vincente</option></select>
        <select aria-label="Partita ospite" value=${cb} onChange=${(e) => setCb(e.target.value)}><option value="">partita…</option>${games.map((g) => html`<option key=${g.id} value=${g.number}>${codes[g.number] || '#' + g.number}</option>`)}</select>
        <${Btn} kind="sm" disabled=${!ca || !cb || (ca === cb && ra === rb)} onClick=${() => { upd({ consolations: [...cfg.consolations, { home: { t: 'dep', game: +ca, res: ra }, away: { t: 'dep', game: +cb, res: rb } }] }); setCa(''); setCb(''); }}>Aggiungi<//>
      </div>
      ${cfg.consolations.map((c, i) => html`<div className="row" key=${i} style=${{ marginTop: 6 }}><span>${c.home.res === 'W' ? 'Vincente' : 'Perdente'} ${codes[c.home.game] || '#' + c.home.game} contro ${c.away.res === 'W' ? 'Vincente' : 'Perdente'} ${codes[c.away.game] || '#' + c.away.game}</span><button className="icon-btn" aria-label="Rimuovi" onClick=${() => upd({ consolations: cfg.consolations.filter((_, k) => k !== i) })}>×</button></div>`)}
    </details>`;
  }
  // tabellone in sola lettura per Risultati e Classifiche (stesso disegno, partite cliccabili)
  function KoBoard({ st, cat, phase, onGame }) {
    if (phase.config.eliminations === 2) return html`<${BracketView} st=${st} cat=${cat} phase=${phase} onGame=${onGame} />`;
    const lay = koLayout(cat, phase);
    const byeCard = (p) => { const t = lay.slots[p.slots[0]] != null ? lay.slots[p.slots[0]] : lay.slots[p.slots[1]]; const e = t == null ? null : phase.entrants[t]; return html`<div key=${p.code} className="m"><div className="ml"><span>${p.code}</span><span className="ok-t">Passa direttamente</span></div><div className="s"><span className="nm">${e ? entLabel(cat, phase, e) : ''}</span></div><div className="s bye">BYE</div></div>`; };
    return html`<div className="ko">
      <div className="ko-col"><div className="colh">${ROUND[lay.size] ? ROUND[lay.size][0] : 'Primo turno'}</div><div className="lane">${lay.pairs.map((p) => (p.bye ? byeCard(p) : html`<${KoCard} key=${p.code} st=${st} cat=${cat} g=${p.g} code=${p.code} codes=${lay.codes} onGame=${onGame} />`))}</div></div>
      ${lay.cols.map((c) => html`<div key=${c.title} className="ko-col"><div className="colh">${c.final ? 'Finali' : c.title}</div><div className="lane">
        ${c.games.map((g) => html`<${KoCard} key=${g.id} st=${st} cat=${cat} g=${g} code=${lay.codes[g.number]} codes=${lay.codes} onGame=${onGame} tone=${c.final ? 'gold' : ''} title=${c.final ? 'Finale · 1°/2°' : null} />`)}
        ${c.final ? lay.place.filter((g) => g.winnerPlace === 3).map((g) => html`<${KoCard} key=${g.id} st=${st} cat=${cat} g=${g} code=${lay.codes[g.number]} codes=${lay.codes} onGame=${onGame} tone="blue" title="Finale · 3°/4°" />`) : null}
      </div></div>`)}
      ${lay.place.filter((g) => g.winnerPlace !== 3).length || lay.cons.length ? html`<div className="ko-col"><div className="colh">Piazzamenti</div><div className="lane">${[...lay.place.filter((g) => g.winnerPlace !== 3), ...lay.cons].map((g) => html`<${KoCard} key=${g.id} st=${st} cat=${cat} g=${g} code=${lay.codes[g.number]} codes=${lay.codes} onGame=${onGame} title=${g.bracket === 'C' ? 'Consolazione' : T(g.label)} />`)}</div></div>` : null}
    </div>`;
  }

  // ---------- tabellone ----------
  function BracketView({ st, cat, phase, onGame }) {
    const games = TE.phaseGames(cat, phase.id);
    const groups = {}, order = [];
    games.forEach((g) => { const key = (g.bracket === 'L' ? 'L · ' : g.bracket === 'P' || g.bracket === 'C' ? 'P · ' : '') + g.label; if (!groups[key]) { groups[key] = []; order.push(key); } groups[key].push(g); });
    const sections = phase.config.eliminations === 2
      ? [['Tabellone vincenti', order.filter((k) => groups[k][0].bracket === 'U')], ['Tabellone perdenti', order.filter((k) => groups[k][0].bracket === 'L')], ['Finalissima', order.filter((k) => groups[k][0].bracket === 'GF')]]
      : [['Tabellone principale', order.filter((k) => groups[k][0].bracket === 'M')], ['Piazzamenti e consolazione', order.filter((k) => groups[k][0].bracket !== 'M')]];
    return html`<div>${sections.filter(([, ks]) => ks.length).map(([title, ks]) => html`<div key=${title} className="bracket-sec"><div className="sub-t">${title}</div>
      <div className="bracket">${ks.map((k) => html`<div className="b-col" key=${k}><div className="b-col-h">${T(k.replace(/^(L|P) · /, ''))}</div>${groups[k].map((g) => html`<${GameCard} key=${g.id} st=${st} cat=${cat} g=${g} onClick=${onGame} />`)}</div>`)}</div></div>`)}</div>`;
  }
  function GameCard({ st, cat, g, onClick }) {
    const n = TE.gameNumbers(st, cat, g);
    const needed = TE.isNeeded(st, cat, g);
    const playable = TE.isPlayable(st, cat, g);
    const side = (src, which) => {
      const win = n && n.winner === which;
      const score = !n ? '' : g.americano || !TE.SPORTS[st.tournament.sport].sets ? (which === 'home' ? n.hp : n.ap) : (g.result && g.result.sets ? g.result.sets.map((s) => s[which === 'home' ? 0 : 1]).join(' ') : which === 'home' ? n.hs : n.as);
      const known = src.t === 'pair' || TE.resolve(st, cat, src);
      return html`<div className=${'g-side' + (win ? ' w' : '')}><span className=${'nm' + (known ? '' : ' ph')}>${srcLabel(st, cat, src).text}</span><span className="sc">${score}</span></div>`;
    };
    const status = !needed ? 'Non necessaria' : g.status === 'FORFEIT' ? 'Forfait' : g.status === 'CANCELLED' ? 'Annullata' : g.status === 'FINAL' ? 'Giocata' : playable ? 'Da giocare' : 'In attesa';
    return html`<button type="button" className=${'game' + (onClick && playable ? ' click' : '') + (!needed ? ' dim' : '')} disabled=${!onClick || !playable} onClick=${() => onClick && onClick(g)}>
      <div className="g-top"><span>#${g.number}</span><span>${status}</span></div>${side(g.home, 'home')}${side(g.away, 'away')}</button>`;
  }

  // ---------- inserimento risultato ----------
  function openResult(ctx, g) { ctx.setModal(html`<${ResultModal} ...${ctx} game=${g} onClose=${() => ctx.setModal(null)} />`); }
  function ResultModal({ st, cat, sport, act, say, game, onClose, setView }) {
    const phase = TE.findPhase(cat, game.phaseId);
    const prev = game.result || {};
    const bestOf = cat.format.bestOf || 3;
    const [status, setStatus] = useState(game.status === 'SCHEDULED' ? 'FINAL' : game.status);
    const [home, setHome] = useState(prev.home != null ? prev.home : '');
    const [away, setAway] = useState(prev.away != null ? prev.away : '');
    const [sets, setSets] = useState(() => { const s = (prev.sets || []).map((x) => x.slice()); while (s.length < bestOf) s.push(['', '']); return s; });
    const [forfeitBy, setForfeitBy] = useState(prev.forfeitBy || '');
    const [err, setErr] = useState(null);
    const hName = T(TE.sourceLabel(st, cat, game.home)), aName = T(TE.sourceLabel(st, cat, game.away));
    const usesSets = sport.sets && !game.americano;
    if (st.tournament.status !== 'PUBLISHED') {
      return html`<${Modal} title=${`Partita #${game.number}`} onClose=${onClose} footer=${html`<${Btn} kind="ghost" onClick=${onClose}>Chiudi<//><${Btn} kind="primary" onClick=${() => { act((d) => { d.tournament.status = 'PUBLISHED'; }); onClose(); say('Torneo attivo: ora puoi inserire i risultati.', 'good'); }}>Attiva torneo<//>`}><p style=${{ margin: 0 }}>Per inserire i risultati il torneo deve essere attivo.</p><//>`;
    }
    function submit() {
      const result = { status };
      if (status === 'FINAL') {
        if (usesSets) result.sets = sets.filter((s) => s[0] !== '' && s[1] !== '').map((s) => [+s[0], +s[1]]);
        else { result.home = home === '' ? NaN : +home; result.away = away === '' ? NaN : +away; }
      }
      if (status === 'FORFEIT') result.forfeitBy = forfeitBy;
      const out = act((d, c) => TE.recordResult(d, c, c.games.find((x) => x.id === game.id), result));
      if (!out.ok) { setErr(T(out.error)); return; }
      onClose();
      say(out.reset ? 'Risultato salvato. Le fasi successive sono tornate ai segnaposto: conferma di nuovo la fase.' : out.warnings && out.warnings.length ? `Salvato con un avviso: ${out.warnings.map(T).join(' ')}` : 'Risultato salvato.', out.reset || (out.warnings && out.warnings.length) ? 'warn' : 'good');
    }
    const num = (v, set, label, id) => html`<input className="num" id=${id} aria-label=${label} type="number" min="0" inputMode="numeric" value=${v} onChange=${(e) => set(e.target.value)} />`;
    return html`<${Modal} title=${`Partita #${game.number} · ${T(game.label)}`} onClose=${onClose} footer=${html`
      ${game.result ? html`<${Btn} kind="ghost danger" onClick=${() => { act((d, c) => TE.clearResult(d, c, c.games.find((x) => x.id === game.id))); onClose(); say('Risultato cancellato.'); }}>Cancella risultato<//>` : null}
      <span className="spacer"></span><${Btn} kind="ghost" onClick=${onClose}>Annulla<//><${Btn} kind="primary" onClick=${submit}>Salva risultato<//>`}>
      <div className="seg" role="radiogroup">${[['FINAL', 'Risultato'], ['FORFEIT', 'Forfait'], ['CANCELLED', 'Annulla partita']].map(([k, l]) => html`<button key=${k} role="radio" aria-checked=${status === k} className=${status === k ? 'on' : ''} onClick=${() => setStatus(k)}>${l}</button>`)}</div>
      ${status === 'FINAL' ? usesSets ? html`<div className="tbl-wrap"><table className="sets"><thead><tr><th></th>${sets.map((_, i) => html`<th key=${i}>Set ${i + 1}</th>`)}</tr></thead><tbody>
          ${[0, 1].map((side) => html`<tr key=${side}><th>${side ? aName : hName}</th>${sets.map((s, i) => html`<td key=${i}>${num(s[side], (v) => setSets(sets.map((x, k) => (k === i ? (side ? [x[0], v] : [v, x[1]]) : x))), `${side ? aName : hName} set ${i + 1}`, `set-${side}-${i}`)}</td>`)}</tr>`)}</tbody></table></div>
          <p className="hint" style=${{ margin: 0 }}>Lascia vuoti i set non giocati. Vanno bene tie-break come 7-6 o 10-8.</p>`
        : html`<div className="row"><span>${hName}</span>${num(home, setHome, hName, 'sc-h')}<span>–</span>${num(away, setAway, aName, 'sc-a')}<span>${aName}</span></div>` : null}
      ${status === 'FORFEIT' ? html`<div className="stack"><p style=${{ margin: 0 }}>Chi dà forfait? L’altra squadra vince con il punteggio predefinito (${sport.sets ? sport.forfeitSet.join('-') + ' a set' : sport.forfeit.home + '-' + sport.forfeit.away}).</p>
        <div className="seg">${[['home', hName], ['away', aName]].map(([k, l]) => html`<button key=${k} className=${forfeitBy === k ? 'on' : ''} onClick=${() => setForfeitBy(k)}>${l}</button>`)}</div></div>` : null}
      ${status === 'CANCELLED' ? html`<p style=${{ margin: 0 }}>Nessuna squadra prende punti. La partita non conta come giocata.</p>` : null}
      ${phase.confirmed ? html`<${Note} tone="warn">${phase.name} è già confermata. Salvando, tutte le fasi successive tornano ai segnaposto.<//>` : null}
      ${err ? html`<${Note} tone="bad">${err}<//>` : null}
    <//>`;
  }

  // ---------- Risultati ----------
  function GamesView(ctx) {
    const { st, cat, act, say } = ctx;
    const pub = st.tournament.status === 'PUBLISHED';
    const body = !cat.games.length ? html`<${Note}>Nessuna partita. Costruisci prima le fasi di ${cat.name}.<//>` : TE.sortedPhases(cat).map((ph) => {
      const games = TE.phaseGames(cat, ph.id);
      if (!games.length) return null;
      const left = games.filter((g) => g.status === 'SCHEDULED' && TE.isNeeded(st, cat, g)).length;
      const ready = games.filter((g) => g.status === 'SCHEDULED' && TE.isPlayable(st, cat, g)).length;
      return html`<${Card} key=${ph.id} eb=${`#${ph.order} · ${typeLabel(ph.type)}`} title=${ph.name} sub=${`${games.length - left} di ${games.length} giocate · ${ready} da giocare`} actions=${html`<${StatusTag} st=${st} cat=${cat} phase=${ph} /><${Btn} kind="sm" disabled=${!ready || !pub} title=${pub ? 'Inserisce risultati casuali per provare il flusso' : 'Attiva il torneo per inserire risultati'} onClick=${() => { const n = act((d, c) => TE.simulatePhase(d, c, TE.findPhase(c, ph.id))); say(`${n} risultati di esempio inseriti.`, 'good'); }}>Simula risultati<//>`}>
        ${TE.phaseStatus(st, cat, ph) === 'READY' ? html`<div style=${{ marginBottom: 12 }}><${Note}>In attesa della conferma di ${TE.sourcesOf(cat, ph).filter((s) => !s.confirmed).map((s) => s.name).join(', ')}. Fino ad allora le partite mostrano i segnaposto.<//></div>` : null}
        ${ph.type === 'KNOCKOUT' ? html`<${KoBoard} st=${st} cat=${cat} phase=${ph} onGame=${(g) => openResult(ctx, g)} />`
        : html`<div className="game-grid">${games.map((g) => html`<div key=${g.id}><div className="muted small" style=${{ marginBottom: 4 }}>${g.pool ? poolName(cat, ph, ph.pools.find((q) => q.number === g.pool) || { number: g.pool }) : T(g.label)}${g.matchday ? ` · giornata ${g.matchday}` : ''}</div><${GameCard} st=${st} cat=${cat} g=${g} onClick=${(x) => openResult(ctx, x)} /></div>`)}</div>`}
      <//>`;
    });
    return html`<div><${PageHead} title="Risultati" lead="Clicca una partita da giocare per inserire il risultato. “Simula risultati” compila una fase con punteggi casuali." />
      ${!pub ? html`<div style=${{ marginBottom: 18 }}><${Note} tone="warn">Il torneo è in bozza: attivalo dall’intestazione per inserire i risultati.<//></div>` : null}
      <div className="stack">${body}</div></div>`;
  }

  // ---------- Classifiche ----------
  function StandingsView(ctx) {
    const { cat } = ctx;
    const phases = TE.sortedPhases(cat).filter((p) => p.built);
    return html`<div><${PageHead} title="Classifiche" lead="Quando tutte le partite di una fase hanno un risultato, ordini le eventuali parità e confermi: la conferma riempie le fasi successive." />
      <div className="stack">${phases.length ? phases.map((p) => html`<${PhaseStandings} key=${p.id} ...${ctx} phase=${p} />`) : html`<${Note}>Le classifiche compaiono quando le fasi di ${cat.name} sono configurate.<//>`}</div></div>`;
  }
  function StandingsTable({ rows, cols, nameOf, marked, cat, editAwarded, act }) {
    return html`<div className="tbl-wrap"><table className="tbl"><thead><tr><th className="n">#</th><th>Squadra</th>${cols.map((c) => html`<th key=${c} className="n" title=${TE.COLUMNS[c]}>${window.COL_SHORT[c]}</th>`)}</tr></thead>
      <tbody>${rows.map((r) => html`<tr key=${r.id} className=${marked && marked.has(r.rank) ? 'adv' : ''}><td className="n">${r.pending ? '–' : r.rank}${r.tied ? html`<span className="tie" title="Pari merito: l’ordine si decide alla conferma">=</span>` : null}</td><td>${nameOf(r.id)}</td>
        ${cols.map((c) => html`<td key=${c} className="n">${c === 'PTS' && editAwarded ? html`<input className="num" aria-label="Punti assegnati" type="number" value=${(cat.format.awarded || {})[r.id] || 0} onChange=${(e) => act((d, cc) => { cc.format.awarded = cc.format.awarded || {}; cc.format.awarded[r.id] = +e.target.value || 0; })} />` : c === 'PD' || c === 'SD' ? (r[c] > 0 ? '+' : '') + r[c] : r[c]}</td>`)}</tr>`)}</tbody></table></div>`;
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
    const cols = cat.format.columns;
    const props = { eb: `#${phase.order} · ${typeLabel(phase.type)}`, title: phase.name, actions: html`<${StatusTag} st=${st} cat=${cat} phase=${phase} />` };
    if (status === 'READY') return html`<${Card} ...${props}><${Note}>Parte quando ${TE.sourcesOf(cat, phase).filter((s) => !s.confirmed).map((s) => s.name).join(', ')} viene confermata.<//><//>`;
    let body;
    if (phase.type === 'GROUPS') {
      const crossIds = TE.rankingCatalog(cat, phase).filter((r) => r.id.startsWith('cross:'));
      body = html`<div className="pools" style=${{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>${phase.pools.map((p) => html`<div key=${p.number}><div className="sub-t">${poolName(cat, phase, p)}</div><${StandingsTable} rows=${TE.ranking(st, cat, phase, `pool:${p.number}`)} cols=${cols} cat=${cat} act=${act} editAwarded=${cat.format.pointsSystem === 'AWARDED'} nameOf=${nameOf} marked=${used[`pool:${p.number}`]} /></div>`)}</div>
        ${phase.inheritPoints ? html`<${Note}>Include punti e statistiche portati dalla fase precedente.<//>` : null}
        ${phase.pools.length > 1 ? html`<details className="disc" open=${Object.keys(used).some((k) => k.startsWith('cross:'))}><summary>Classifiche tra gironi (medie per partita)</summary><div className="pools" style=${{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>${crossIds.map((r) => html`<div key=${r.id}><div className="sub-t">${T(r.label)}</div><${StandingsTable} rows=${TE.ranking(st, cat, phase, r.id)} cols=${cols} cat=${cat} nameOf=${nameOf} marked=${used[r.id]} /></div>`)}</div></details>` : null}
        <details className="disc" open=${!!used.overall}><summary>Classifica generale (medie per partita)</summary><${StandingsTable} rows=${TE.ranking(st, cat, phase, 'overall')} cols=${cols} cat=${cat} nameOf=${nameOf} marked=${used.overall} /></details>`;
    } else {
      body = html`<${KoBoard} st=${st} cat=${cat} phase=${phase} onGame=${(g) => openResult(ctx, g)} />
        <div className="sub-t" style=${{ marginTop: 16 }}>Piazzamenti finali</div><${StandingsTable} rows=${TE.ranking(st, cat, phase, 'final')} cols=${cols} cat=${cat} nameOf=${nameOf} marked=${used.final} />
        <p className="hint">Prima i posti decisi in campo; le squadre eliminate nello stesso turno sono ordinate con i criteri di spareggio, poi per testa di serie. “–” = ancora in gioco.</p>`;
    }
    return html`<${Card} ...${props}><div className="stack">${body}</div><${ConfirmPanel} ...${ctx} /><//>`;
  }
  function ConfirmPanel({ st, cat, phase, act, say }) {
    const status = TE.phaseStatus(st, cat, phase);
    const next = TE.downstreamOf(cat, phase);
    const nameOf = (id) => TE.participantName(cat, phase, id);
    if (status === 'CONFIRMED') {
      return html`<div className="confirm"><${Note} tone="good">${phase.name} è confermata.${next.length ? ` ${next.map((x) => x.name).join(', ')} ${next.length > 1 ? 'hanno' : 'ha'} ora le squadre reali.` : ''}<//>
        ${next.map((x) => html`<div key=${x.id}><div className="sub-t">${x.name}</div><ul className="resolved">${x.entrants.map((e) => html`<li key=${e.id}><span className="muted">${T(e.label)}</span> → <b>${e.participant ? TE.participantName(cat, x, e.participant) : 'Da definire'}</b></li>`)}</ul></div>`)}
        <div className="row"><${Btn} kind="ghost" onClick=${() => { act((d, c) => TE.unconfirmPhase(d, c, TE.findPhase(c, phase.id))); say('Conferma annullata. Le fasi successive sono tornate ai segnaposto.', 'warn'); }}>Annulla conferma<//></div></div>`;
    }
    if (status !== 'COMPLETE') {
      const left = TE.phaseGames(cat, phase.id).filter((g) => g.status === 'SCHEDULED' && TE.isNeeded(st, cat, g)).length;
      return left ? html`<div className="confirm"><p className="hint" style=${{ margin: 0 }}>${left === 1 ? 'Manca il risultato di 1 partita' : `Mancano i risultati di ${left} partite`} prima di poter confermare ${phase.name}.</p></div>` : null;
    }
    const ties = TE.relevantTies(st, cat, phase, true);
    const orderOf = (t) => { const m = phase.tieOrders[t.key]; return m && m.length === t.ids.length && m.every((x) => t.ids.includes(x)) ? m : null; };
    const unresolved = ties.filter((t) => !orderOf(t));
    const setOrder = (key, ids) => act((d, c) => { TE.findPhase(c, phase.id).tieOrders[key] = ids; });
    return html`<div className="confirm">
      <div className="sub-t">Conferma ${phase.name}${next.length ? ` e riempi ${next.map((x) => x.name).join(', ')}` : ''}</div>
      ${ties.length ? html`<p style=${{ margin: 0 }}>Ordina le squadre a pari merito dove decidono un posto, poi tieni l’ordine.</p>
        <div className="ties">${ties.map((t) => { const ids = orderOf(t) || t.ids; return html`<div key=${t.key} className=${'tie-box' + (orderOf(t) ? ' ok' : '')}><div className="b small">${T(t.title)}${orderOf(t) ? ' · ordinata' : ''}</div>
          <ol>${ids.map((id, i) => html`<li key=${id}>${nameOf(id)}<span className="row tight"><button className="icon-btn" aria-label="Su" disabled=${i === 0} onClick=${() => { const a = ids.slice(); [a[i - 1], a[i]] = [a[i], a[i - 1]]; setOrder(t.key, a); }}>↑</button><button className="icon-btn" aria-label="Giù" disabled=${i === ids.length - 1} onClick=${() => { const a = ids.slice(); [a[i + 1], a[i]] = [a[i], a[i + 1]]; setOrder(t.key, a); }}>↓</button></span></li>`)}</ol>
          ${orderOf(t) ? null : html`<${Btn} kind="sm" onClick=${() => setOrder(t.key, ids)}>Tieni questo ordine<//>`}</div>`; })}</div>` : html`<${Note} tone="good">Non ci sono parità da risolvere.<//>`}
      <div className="row"><${Btn} kind="primary" disabled=${unresolved.length > 0} onClick=${() => { const r = act((d, c) => { const out = TE.confirmPhase(d, c, TE.findPhase(c, phase.id)); if (out.ok && d.tournament.scheduling === 'QUEUE') TE.fillCourts(d); return out; }); r.ok ? say(`${phase.name} confermata.`, 'good') : say(r.error, 'bad'); }}>Conferma ${phase.name}<//></div>
    </div>`;
  }

  // ---------- Campi di gioco ----------
  function VenuesView({ st, sport, act, ask }) {
    const [name, setName] = useState(''); const [n, setN] = useState(4);
    const dropSpace = (d, sid) => { delete d.schedule.courts[sid]; d.schedule.blocks.forEach((b) => { b.spaceIds = b.spaceIds.filter((x) => x !== sid); }); Object.keys(d.schedule.assignments).forEach((g) => { if (d.schedule.assignments[g].spaceId === sid) delete d.schedule.assignments[g]; }); };
    return html`<div><${PageHead} title="Campi di gioco" lead="Ogni struttura ha uno o più campi. Se togli un campo, le sue partite tornano da programmare." />
      <div className="stack">
      ${st.venues.map((v) => html`<${Card} key=${v.id} eb="Struttura" actions=${html`<${Btn} kind="sm" onClick=${() => act((d) => { const vv = d.venues.find((x) => x.id === v.id); const sp = { id: TE.uid('sp'), name: `Campo ${vv.spaces.length + 1}`, categoryIds: [] }; vv.spaces.push(sp); if (d.tournament.scheduling === 'QUEUE') d.schedule.courts[sp.id] = null; })}>Aggiungi campo<//><${Btn} kind="ghost sm danger" onClick=${() => ask(`Eliminare ${v.name}?`, 'Le partite sui suoi campi tornano da programmare.', 'Elimina', () => act((d) => { const vv = d.venues.find((x) => x.id === v.id); vv.spaces.forEach((s) => dropSpace(d, s.id)); d.venues = d.venues.filter((x) => x.id !== v.id); }), true)}>Elimina<//>`}>
        <input id=${'vn-' + v.id} aria-label="Nome struttura" style=${{ fontWeight: 800, marginBottom: 12 }} value=${v.name} onChange=${(e) => act((d) => { d.venues.find((x) => x.id === v.id).name = e.target.value; })} />
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Campo</th><th>Solo per le categorie</th><th></th></tr></thead><tbody>
          ${v.spaces.map((s) => html`<tr key=${s.id}><td><input aria-label="Nome campo" value=${s.name} onChange=${(e) => act((d) => { d.venues.find((x) => x.id === v.id).spaces.find((x) => x.id === s.id).name = e.target.value; })} /></td>
            <td><div className="checks">${st.categories.map((c) => html`<label key=${c.id} className="check"><input type="checkbox" checked=${(s.categoryIds || []).includes(c.id)} onChange=${(e) => act((d) => { const ss = d.venues.find((x) => x.id === v.id).spaces.find((x) => x.id === s.id); ss.categoryIds = e.target.checked ? [...(ss.categoryIds || []), c.id] : ss.categoryIds.filter((x) => x !== c.id); })} /> ${c.name}</label>`)}</div></td>
            <td className="n"><button className="icon-btn" aria-label="Rimuovi campo" onClick=${() => act((d) => { const vv = d.venues.find((x) => x.id === v.id); vv.spaces = vv.spaces.filter((x) => x.id !== s.id); dropSpace(d, s.id); })}>×</button></td></tr>`)}
        </tbody></table></div><p className="hint">Nessuna categoria spuntata = il campo vale per tutte.</p>
      <//>`)}
      <${Card} eb="Nuova struttura">
        <form className="row" onSubmit=${(e) => { e.preventDefault(); if (!name.trim()) return; act((d) => { const sp = Array.from({ length: Math.max(1, n) }, (_, i) => ({ id: TE.uid('sp'), name: `Campo ${i + 1}`, categoryIds: [] })); d.venues.push({ id: TE.uid('ven'), name: name.trim(), spaces: sp }); if (d.tournament.scheduling === 'QUEUE') sp.forEach((s) => { d.schedule.courts[s.id] = null; }); }); setName(''); }}>
          <input id="new-venue" aria-label="Nome struttura" placeholder="Nome struttura" value=${name} onChange=${(e) => setName(e.target.value)} />
          <input id="new-venue-n" aria-label="Numero di campi" className="num" type="number" min="1" value=${n} onChange=${(e) => setN(+e.target.value)} /><span className="muted">campi</span>
          <button className="btn primary" type="submit">Aggiungi struttura</button></form>
      <//></div></div>`;
  }

  // ---------- Programma ----------
  function ScheduleView(ctx) {
    const { st, sport, act } = ctx;
    return html`<div><${PageHead} title="Programma" lead=${`Riposo minimo tra due partite della stessa squadra: ${st.tournament.restMinutes} min (si cambia in Informazioni).`} />
      ${!st.venues.length ? html`<${Note}>Aggiungi prima una struttura in Campi di gioco.<//>` : html`<div className="stack">
      <${Card} eb="Come si programmano le partite">
        <div className="seg" role="radiogroup">${[['FIXED', 'Campi e orari assegnati'], ['QUEUE', 'Primo campo libero']].map(([k, l]) => html`<button key=${k} role="radio" aria-checked=${st.tournament.scheduling === k} className=${st.tournament.scheduling === k ? 'on' : ''} onClick=${() => act((d) => { d.tournament.scheduling = k; if (k === 'QUEUE' && !Object.keys(d.schedule.courts).length) TE.allSpaces(d).forEach((s) => { d.schedule.courts[s.id] = null; }); })}>${l}</button>`)}</div>
        <p className="hint">${st.tournament.scheduling === 'FIXED' ? 'Ogni partita riceve subito orario e campo. Una fase si programma dopo le fasi da cui prende squadre.' : 'Le partite aspettano in coda: ogni partita finita libera il campo per la prossima pronta. Consigliato per il padel.'}</p>
      <//>
      ${st.tournament.scheduling === 'FIXED' ? html`<${FixedSchedule} ...${ctx} />` : html`<${QueueSchedule} ...${ctx} />`}
    </div>`}</div>`;
  }
  function FixedSchedule({ st, act, say }) {
    const spaces = TE.allSpaces(st);
    const s = st.schedule;
    const rows = Object.entries(s.assignments).map(([gid, a]) => { const f = TE.findGame(st, gid); return f && Object.assign({ f }, a); }).filter(Boolean).sort((x, y) => (x.day + x.start).localeCompare(y.day + y.start) || spaces.findIndex((q) => q.id === x.spaceId) - spaces.findIndex((q) => q.id === y.spaceId));
    return html`<${Card} eb="Fasce orarie" sub="Quando si può giocare e su quali campi." actions=${html`<${Btn} kind="primary" disabled=${!s.blocks.length} onClick=${() => { const r = act((d) => TE.generateFixedSchedule(d)); say(r.unplaced ? `${r.placed} partite programmate, ${r.unplaced} non ci stanno.` : `Tutte le ${r.placed} partite programmate.`, r.unplaced ? 'warn' : 'good'); }}>Genera programma<//>`}>
        <div className="stack">
        ${s.blocks.map((b, i) => html`<div key=${b.id} className="row">
          <input aria-label="Giorno" type="date" value=${b.day} onChange=${(e) => act((d) => { d.schedule.blocks[i].day = e.target.value; })} />
          <input aria-label="Inizio" type="time" value=${b.start} onChange=${(e) => act((d) => { d.schedule.blocks[i].start = e.target.value; })} />
          <input aria-label="Fine" type="time" value=${b.end} onChange=${(e) => act((d) => { d.schedule.blocks[i].end = e.target.value; })} />
          <div className="checks">${spaces.map((sp) => html`<label key=${sp.id} className="check"><input type="checkbox" checked=${b.spaceIds.includes(sp.id)} onChange=${(e) => act((d) => { const bb = d.schedule.blocks[i]; bb.spaceIds = e.target.checked ? [...bb.spaceIds, sp.id] : bb.spaceIds.filter((x) => x !== sp.id); })} /> ${sp.name}</label>`)}</div>
          <button className="icon-btn" aria-label="Rimuovi fascia" onClick=${() => act((d) => { d.schedule.blocks.splice(i, 1); })}>×</button></div>`)}
        <div className="row"><${Btn} onClick=${() => act((d) => { const last = d.schedule.blocks[d.schedule.blocks.length - 1]; d.schedule.blocks.push({ id: TE.uid('blk'), day: last ? last.day : '2026-11-07', start: '09:00', end: '18:00', spaceIds: TE.allSpaces(d).map((x) => x.id) }); })}>Aggiungi fascia oraria<//><span className="hint">La durata delle partite si imposta per fase (Fasi → Struttura).</span></div>
        ${s.unplaced.length ? html`<${Note} tone="warn">${s.unplaced.length} partite non ci stanno. Allunga una fascia, aggiungi un campo o accorcia le partite, poi rigenera.<//>` : null}
        ${rows.length ? html`<div className="tbl-wrap"><table className="tbl"><thead><tr><th>Giorno</th><th>Orario</th><th>Campo</th><th>Categoria</th><th className="n">#</th><th>Partita</th></tr></thead><tbody>
          ${rows.map((r) => html`<tr key=${r.f.game.id}><td>${r.day}</td><td className="n">${r.start}–${r.end}</td><td>${(spaces.find((q) => q.id === r.spaceId) || {}).name}</td><td>${r.f.cat.name}</td><td className="n">${r.f.game.number}</td><td><span className="muted">${T(r.f.game.label)}</span> ${T(TE.sourceLabel(st, r.f.cat, r.f.game.home))} – ${T(TE.sourceLabel(st, r.f.cat, r.f.game.away))}</td></tr>`)}</tbody></table></div>` : null}
        </div>
      <//>`;
  }
  function QueueSchedule(ctx) {
    const { st, act, say } = ctx;
    const s = st.schedule;
    const spaces = TE.allSpaces(st);
    const now = Date.now();
    const rest = (+st.tournament.restMinutes || 0) * 60000;
    const busy = new Set();
    Object.values(s.courts).filter(Boolean).forEach((gid) => { const f = TE.findGame(st, gid); if (f) { const sd = TE.sidesOf(st, f.cat, f.game); [...(sd.home || []), ...(sd.away || [])].forEach((p) => busy.add(p)); } });
    const why = (f) => {
      if (!TE.isPlayable(st, f.cat, f.game)) return 'Attende risultati';
      const sd = TE.sidesOf(st, f.cat, f.game); const ps = [...sd.home, ...sd.away];
      if (ps.some((p) => busy.has(p))) return 'Squadra in campo';
      const r = ps.map((p) => (s.lastFinished[p] ? rest - (now - s.lastFinished[p]) : 0)).filter((x) => x > 0);
      if (r.length) return `Riposo · ${Math.ceil(Math.max(...r) / 60000)} min`;
      return 'Pronta';
    };
    const queue = s.queue.map((id) => TE.findGame(st, id)).filter(Boolean).filter((f) => !Object.values(s.courts).includes(f.game.id));
    return html`<div className="stack">
      <${Card} eb="Campi in uso" actions=${html`<label className="check"><input type="checkbox" checked=${s.auto} onChange=${(e) => act((d) => { d.schedule.auto = e.target.checked; if (e.target.checked) TE.fillCourts(d); })} /> Assegnazione automatica</label><${Btn} kind="sm" onClick=${() => act((d) => { TE.fillCourts(d); })}>Riempi i campi liberi<//>`}>
        <div className="checks">${spaces.map((sp) => html`<label key=${sp.id} className="check"><input type="checkbox" checked=${sp.id in s.courts} onChange=${(e) => act((d) => { if (e.target.checked) d.schedule.courts[sp.id] = null; else delete d.schedule.courts[sp.id]; })} /> ${sp.name}</label>`)}</div>
        <div className="courts">${spaces.filter((sp) => sp.id in s.courts).map((sp) => { const gid = s.courts[sp.id]; const f = gid && TE.findGame(st, gid); return html`<div key=${sp.id} className=${'court' + (f ? ' busy' : '')}>
          <div className="row" style=${{ justifyContent: 'space-between' }}><b>${sp.name}</b>${f ? html`<${Tag} tone="blue">In gioco<//>` : html`<${Tag}>Libero<//>`}</div>
          ${f ? html`<div className="small"><div className="muted">${f.cat.name} · #${f.game.number} ${T(f.game.label)}</div><b>${T(TE.sourceLabel(st, f.cat, f.game.home))}</b><div className="muted">contro</div><b>${T(TE.sourceLabel(st, f.cat, f.game.away))}</b></div>
            <div className="row"><${Btn} kind="primary sm" onClick=${() => openResult(Object.assign({}, ctx, { cat: f.cat, act: (fn) => act((d) => fn(d, TE.findCat(d, f.cat.id))) }), f.game)}>Risultato<//><${Btn} kind="ghost sm" onClick=${() => act((d) => { d.schedule.courts[sp.id] = null; })}>Rimetti in coda<//></div>`
          : !s.auto ? html`<select aria-label="Assegna partita" value="" onChange=${(e) => e.target.value && act((d) => { d.schedule.courts[sp.id] = e.target.value; })}><option value="">Assegna una partita…</option>${queue.filter((q) => why(q) === 'Pronta').map((q) => html`<option key=${q.game.id} value=${q.game.id}>#${q.game.number} ${T(TE.sourceLabel(st, q.cat, q.game.home))} – ${T(TE.sourceLabel(st, q.cat, q.game.away))}</option>`)}</select>` : html`<p className="hint" style=${{ margin: 0 }}>Nessuna partita può iniziare: quelle in coda aspettano una squadra o un risultato.</p>`}
        </div>`; })}</div>
      <//>
      <${Card} eb="Prossime partite" sub="La prima partita pronta prende il prossimo campo libero. Riordina per distanziare le partite di una squadra o dare priorità a una categoria." actions=${html`<${Btn} kind="ghost sm" onClick=${() => { act((d) => { TE.buildQueue(d); }); say('Coda ricostruita dalle fasi.', 'good'); }}>Ricostruisci coda<//>`}>
        ${queue.length ? html`<ol className="queue">${queue.slice(0, 40).map((f, i) => html`<li key=${f.game.id}><span className="tag dark"><span>${i + 1}</span></span><span className="q"><span className="muted small">${f.cat.name} · #${f.game.number} ${T(f.game.label)}</span><span>${T(TE.sourceLabel(st, f.cat, f.game.home))} – ${T(TE.sourceLabel(st, f.cat, f.game.away))}</span></span>
          <${Tag} tone=${why(f) === 'Pronta' ? 'green' : ''}>${why(f)}<//>
          <span className="row tight"><button className="icon-btn" aria-label="Su" disabled=${i === 0} onClick=${() => act((d) => { const q = d.schedule.queue; const a = q.indexOf(f.game.id), b = q.indexOf(queue[i - 1].game.id); [q[a], q[b]] = [q[b], q[a]]; })}>↑</button><button className="icon-btn" aria-label="Giù" disabled=${i === queue.length - 1} onClick=${() => act((d) => { const q = d.schedule.queue; const a = q.indexOf(f.game.id), b = q.indexOf(queue[i + 1].game.id); [q[a], q[b]] = [q[b], q[a]]; })}>↓</button></span></li>`)}</ol>
          ${queue.length > 40 ? html`<p className="hint">+ altre ${queue.length - 40}</p>` : null}` : html`<${Note}>La coda è vuota. Ricostruiscila dopo aver generato le partite.<//>`}
      <//>
    </div>`;
  }

  ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
})();
