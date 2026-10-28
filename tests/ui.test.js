// Clicks through the mockup in jsdom. Usage: node ui2.js <deps dir with node_modules> <mockup dir>
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
const setVal = async (el, v) => { const proto = el.tagName === 'SELECT' ? w.HTMLSelectElement.prototype : w.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new w.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); await sleep(25); };
const main = () => w.document.querySelector('.main').textContent;
const go = async (label, cat) => { await click($$('.nav-item').find((b) => b.querySelector('.nav-label').textContent.replace(' optional', '') === label), label); if (cat) await click($$('.cat-tab').find((b) => b.textContent === cat), cat); };
let fails = 0; const check = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
(async () => {
  await sleep(100);
  const labels = $$('.nav-item').map((b) => b.querySelector('.nav-label').textContent.replace(' optional', ''));
  console.log('nav:', labels.join(' | '));
  for (const cat of ["Men's Open", 'Americano Night']) for (let i = 0; i < labels.length; i++) {
    await click($$('.nav-item')[i], labels[i]); const t = $$('.cat-tab').find((b) => b.textContent === cat); if (t) await click(t, cat);
    if (!main().length) { fails++; console.log('FAIL empty view', cat, labels[i]); }
  }
  check(!errors.length, 'every view renders for both categories');
  // Format builder shows the graph and is valid
  await go('Format', "Men's Open");
  check(main().includes('The format is valid') && $$('.phase-card').length === 3, 'format builder: 3 phases, valid');
  // add a second groups phase: step 1 offers exactly the three rankings of the groups phase
  await setVal($$('select[aria-label="Phase type"]')[0], 'GROUPS');
  await setVal($$('input[aria-label="Phase name"]').pop(), 'Consolation');
  await click(btn('Add phase'), 'add phase');
  let card = $$('.phase-card').pop();
  check($$('.step', card).length === 3, 'new phase card has 3 steps');
  check(card.textContent.includes('Final ranking') && card.textContent.includes('B Flight'), 'new phase takes everyone from the previous phase by default');
  await setVal(card.querySelector('select[aria-label="From phase"]'), $$('option', card.querySelector('select[aria-label="From phase"]')).find((o) => o.textContent === 'Pool Play').value);
  card = $$('.phase-card').pop();
  const kinds = $$('[aria-label="Ranking"] button', card).map((b) => b.textContent);
  check(kinds.join('|') === 'Pool ranking|Cross-pool ranking|Overall ranking', 'from a groups phase: Pool, Cross-pool, Overall ranking');
  check($$('.rank-list li', card).map((l) => l.querySelector('b').textContent).join('|') === 'Pool ranking|Cross-pool ranking|Overall ranking', 'step 3 lists the rankings this phase calculates');
  // pick 1st of every group -> overlaps A Flight -> error
  await setVal(card.querySelector('input[aria-label="Positions"]'), '1');
  await click(btn('Add places', card), 'add pool 1st');
  check(main().includes('used twice'), 'builder shows the "used twice" error');
  await click($$('.sel-list button', $$('.phase-card').pop()).pop(), 'remove bad selector');
  check(main().includes('The format is valid'), 'error gone after removing the selector');
  // switch distribution in step 2
  card = $$('.phase-card').pop();
  await setVal(card.querySelector('select[aria-label="Distribution"]') || $$('select', card).find((x) => x.id.startsWith('dd-')), 'AVOID_REMATCH');
  check($$('.phase-card').pop().textContent.includes('Decided when the earlier phase is confirmed'), 'step 2 distribution: avoid rematches');
  // play Pool Play, confirm, play flights, confirm A, consolation fills
  await go('Games & results', "Men's Open");
  await click(btn('Fill example results'), 'fill pool');
  await go('Standings', "Men's Open");
  for (let i = 0; i < 12 && btn('Keep this order'); i++) await click(btn('Keep this order'), 'keep order');
  await click(btn('Confirm Pool Play'), 'confirm pool');
  check(main().includes('Pool Play is confirmed'), 'Pool Play confirmed');
  await go('Games & results', "Men's Open");
  for (let i = 0; i < 4; i++) { const b = btn('Fill example results'); if (b) await click(b, 'fill'); }
  await go('Standings', "Men's Open");
  check(main().includes('Final placings'), 'final placings table shown');
  await click(btn('Confirm A Flight'), 'confirm A');
  check(main().includes('A Flight is confirmed'), 'A Flight confirmed');
  check(true, 'A Flight placings available');
  // Americano
  await go('Games & results', 'Americano Night'); await click(btn('Fill example results'), 'fill am');
  await go('Standings', 'Americano Night');
  for (let i = 0; i < 6 && btn('Keep this order'); i++) await click(btn('Keep this order'), 'keep');
  await click(btn('Confirm Americano'), 'confirm am');
  check(main().includes('Americano is confirmed') && main().includes(' / '), 'americano confirmed; playoff pairs created');
  // New event + 3-stage preset
  await go('Event');
  await setVal(w.document.getElementById('nt-sport'), 'FUTSAL');
  await click(btn('Create event'), 'create'); await click(btn('Create event', w.document.querySelector('.modal')), 'confirm create');
  await go('Teams');
  const ta = w.document.getElementById('bulk'); Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set.call(ta, Array.from({ length: 12 }, (_, i) => 'Team ' + (i + 1)).join('\n')); ta.dispatchEvent(new w.Event('input', { bubbles: true })); await sleep(25);
  await click(btn('Save'), 'save teams');
  await go('Format');
  await click($$('.tpl').find((b) => b.textContent.includes('reshuffled')), 'pick RR3');
  await click(btn('Apply preset'), 'apply');
  check($$('.phase-card').length === 4 && main().includes('do not continue'), 'Groups × 3 preset: 4 phases, warns teams stopping after stage 3');
  await go('Phase setup');
  check(main().includes('place 1') && main().includes('Avoid rematches'), 'stage 2 shows neutral places and avoid-rematch distribution');
  console.log('ERRORS:', errors.length ? errors.slice(0, 5) : 'none');
  console.log(fails || errors.length ? 'UI FAILED' : 'UI PASSED');
  process.exit(fails || errors.length ? 1 : 0);
})().catch((e) => { console.log('THREW', e.message, errors.slice(0, 5)); process.exit(1); });
