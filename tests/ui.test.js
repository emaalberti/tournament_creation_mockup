// Builds two tournaments from an empty event in the mockup (jsdom). Usage: node ui.test.js [deps dir] [mockup dir]
const path = require('path'), fs = require('fs');
const deps = process.argv[2] || path.join(__dirname, '..'), mock = process.argv[3] || path.join(__dirname, '../mockup');
const { JSDOM } = require(path.join(deps, 'node_modules/jsdom'));
const dom = new JSDOM('<!doctype html><div id="root"></div>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.test/' });
const w = dom.window; const errors = [];
w.addEventListener('error', (e) => errors.push(e.message));
w.console.error = (...a) => errors.push(a.join(' '));
for (const f of ['react/umd/react.production.min.js', 'react-dom/umd/react-dom.production.min.js', 'htm/dist/htm.umd.js']) w.eval(fs.readFileSync(path.join(deps, 'node_modules', f), 'utf8'));
w.eval(fs.readFileSync(path.join(mock, 'engine.js'), 'utf8'));
w.eval(fs.readFileSync(path.join(mock, 'app.js'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $$ = (s, root) => [...(root || w.document).querySelectorAll(s)];
const btn = (text, root) => $$('button', root).find((b) => b.textContent.trim().startsWith(text) && !b.disabled);
const click = async (el, what) => { if (!el) throw new Error('missing element: ' + what); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await sleep(25); };
const setVal = async (el, v, what) => { if (!el) throw new Error('missing field: ' + what); const proto = el.tagName === 'SELECT' ? w.HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new w.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); await sleep(25); };
const main = () => w.document.querySelector('.main').textContent;
const go = async (label) => click($$('.nav-item').find((b) => b.querySelector('.nav-label').textContent.replace(' optional', '') === label), label);
const card = () => $$('.phase-card').pop();
const rows = () => $$('.rank-pick .pick-label', card()).map((x) => x.textContent);
const pickKind = async (label) => click($$('[aria-label="Ranking"] button', card()).find((b) => b.textContent === label), label);
const tick = async (label) => click($$('.pick', card()).find((l) => l.querySelector('.pick-label').textContent === label).querySelector('input'), label);
const fromPhase = async (name) => { const s = card().querySelector('select[aria-label="From phase"]'); await setVal(s, $$('option', s).find((o) => o.textContent === name).value, 'from ' + name); };
const addPhase = async (type, name) => { await setVal($$('select[aria-label="Phase type"]')[0], type, 'type'); await setVal($$('input[aria-label="Phase name"]').pop(), name, 'name'); await click(btn('Add phase'), 'add phase'); };
const fillAll = async () => { for (let i = 0; i < 6; i++) { const b = btn('Fill example results'); if (!b) break; await click(b, 'fill'); } };
const confirm = async (name) => { for (let i = 0; i < 12 && btn('Keep this order'); i++) await click(btn('Keep this order'), 'keep'); await click(btn('Confirm ' + name), 'confirm ' + name); };
let fails = 0; const check = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

(async () => {
  await sleep(100);
  check(w.document.querySelector('.t-name').textContent === 'New tournament' && !btn('Reset example'), 'starts from an empty event, no example');
  const labels = $$('.nav-item').map((b) => b.querySelector('.nav-label').textContent.replace(' optional', ''));
  for (let i = 0; i < labels.length; i++) { await click($$('.nav-item')[i], labels[i]); if (!main().length) { fails++; console.log('FAIL empty view', labels[i]); } }
  check(!errors.length, 'every view renders on an empty event');

  // ---- football: Pool Play -> A Flight + B Flight
  await go('Teams');
  await setVal(w.document.getElementById('bulk'), Array.from({ length: 10 }, (_, i) => 'Team ' + (i + 1)).join('\n'), 'bulk');
  await click(btn('Save'), 'save teams');
  await go('Format');
  check(!main().includes('Start from a preset') && $$('.schema-row').length === 3, 'no presets; schema of the 3 phase types');
  check($$('.schema-row').every((r) => r.textContent.includes('Input') && r.textContent.includes('What it does') && r.textContent.includes('Output')), 'each phase type shows input, what it does, output');
  check($$('.schema-row')[0].textContent.includes('Cross-pool ranking') && $$('.schema-row')[1].textContent.includes('Final ranking'), 'outputs listed per type');
  await addPhase('GROUPS', 'Pool Play');
  await setVal($$('select', card()).find((s) => s.id.startsWith('ng-')), '3', 'groups');
  check(card().textContent.includes('Group A: 3 · Group B: 3 · Group C: 4'), 'Pool Play: 10 teams in 3 groups');
  await addPhase('KNOCKOUT', 'A Flight');
  check(card().textContent.includes('Overall ranking') && card().textContent.includes('places 1-10'), 'new phase starts with everyone from the previous phase');
  await click(btn('Clear this list', card()), 'clear overall');
  await pickKind('Pool ranking');
  for (const g of ['A', 'B', 'C']) { await tick(`1st Group ${g}`); await tick(`2nd Group ${g}`); }
  await click(btn('Save selection', card()), 'save A');
  check(card().textContent.includes('Pool ranking · places 1-2 of every group'), 'A Flight = top 2 of every group');
  await addPhase('KNOCKOUT', 'B Flight');
  await fromPhase('Pool Play');
  await pickKind('Cross-pool ranking');
  check(rows().length === 10 && rows()[0] === '1st of 1sts' && rows()[9] === '1st of 4ths', 'cross-pool list has all 10 places');
  await pickKind('Overall ranking');
  check(rows().length === 10 && rows()[9] === '10th (last)', 'overall list has 1st … 10th (last)');
  await pickKind('Pool ranking');
  check($$('.pick.taken', card()).length === 6, 'places used by A Flight are marked');
  for (const l of ['3rd Group A', '3rd Group B', '3rd Group C', '4th Group C']) await tick(l);
  await click(btn('Save selection', card()), 'save B pool');
  await fromPhase('A Flight');
  await click(btn('Clear this list', card()), 'clear A final');
  await click(btn('Save selection', card()), 'save B');
  check(card().textContent.includes('Pool ranking · places 3-4 of every group') && !card().textContent.includes('of A Flight'), 'B Flight = 3rd and 4th of every group');
  check(main().includes('The format is valid'), 'format valid');

  // ---- play it
  await go('Event'); await click(btn('Publish'), 'publish');
  await go('Games & results'); await click(btn('Fill example results'), 'fill pool');
  await go('Standings'); await confirm('Pool Play');
  check(main().includes('Pool Play is confirmed'), 'Pool Play confirmed, flights filled');
  await go('Games & results'); await fillAll();
  await go('Standings');
  check(main().includes('Final placings'), 'final placings shown');
  await confirm('A Flight');
  check(main().includes('A Flight is confirmed'), 'A Flight confirmed');

  // step 2: a reshuffled group stage after the flights
  await go('Format');
  await addPhase('GROUPS', 'Stage 2');
  await setVal($$('select', card()).find((s) => s.id.startsWith('dd-')), 'AVOID_REMATCH', 'distribution');
  check(card().textContent.includes('Decided when the earlier phase is confirmed'), 'step 2: avoid rematches');

  // ---- padel Americano -> pairs knockout
  await go('Event');
  await setVal(w.document.getElementById('nt-sport'), 'PADEL', 'sport');
  await click(btn('Create event'), 'create'); await click(btn('Create event', w.document.querySelector('.modal')), 'confirm create');
  await go('Format'); await addPhase('AMERICANO', 'Americano');
  await go('Players');
  await setVal(w.document.getElementById('bulk'), ['Giulia', 'Marco', 'Sara', 'Luca', 'Elena', 'Paolo', 'Chiara', 'Davide'].join('\n'), 'players');
  await click(btn('Save'), 'save players');
  await go('Event'); await click(btn('Publish'), 'publish padel');
  await go('Games & results'); await click(btn('Fill example results'), 'fill am');
  await go('Standings'); await confirm('Americano');
  await go('Format'); await addPhase('KNOCKOUT', 'Playoffs');
  check(card().textContent.includes('Players are paired'), 'knockout after Americano pairs the players');
  await go('Games & results');
  check(main().includes(' / '), 'playoff game shows the pairs');

  console.log('ERRORS:', errors.length ? errors.slice(0, 5) : 'none');
  console.log(fails || errors.length ? 'UI FAILED' : 'UI PASSED');
  process.exit(fails || errors.length ? 1 : 0);
})().catch((e) => { console.log('THREW', e.message, errors.slice(0, 5)); process.exit(1); });
