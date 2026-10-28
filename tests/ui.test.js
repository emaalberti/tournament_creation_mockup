const path = require('path'), fs = require('fs');
const deps = path.join(__dirname, '..'), mock = path.join(__dirname, '../mockup');
const { JSDOM } = require(path.join(deps, 'node_modules/jsdom'));
const dom = new JSDOM('<!doctype html><div id="root"></div>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.test/' });
const w = dom.window; const errors = [];
w.addEventListener('error', (e) => errors.push(e.message));
w.console.error = (...a) => errors.push(a.join(' '));
for (const f of ['react/umd/react.production.min.js', 'react-dom/umd/react-dom.production.min.js', 'htm/dist/htm.umd.js']) w.eval(fs.readFileSync(path.join(deps, 'node_modules', f), 'utf8'));
w.eval(fs.readFileSync(path.join(mock, 'engine.js'), 'utf8'));
w.eval(fs.readFileSync(path.join(mock, 'app.js'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $$ = (s) => [...w.document.querySelectorAll(s)];
const btn = (text, root) => [...(root || w.document).querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(text));
const click = async (el) => { if (!el) throw new Error('missing element'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await sleep(30); };
const text = () => w.document.querySelector('.main').textContent;
(async () => {
  await sleep(100);
  const navs = $$('.nav-item').map((b) => b.querySelector('.nav-label').textContent);
  console.log('nav:', navs.join(' | '));
  for (const cat of ["Men's Open", 'Americano Night']) {
    for (let i = 0; i < navs.length; i++) { const n = navs[i];
      await click($$('.nav-item')[i]);
      const tab = $$('.cat-tab').find((b) => b.textContent === cat); if (tab) await click(tab);
      const t = text(); console.log(`  [${cat}] ${n}: ${t.length} chars`);
    }
  }
  // Flow: Men's Open -> games -> fill pool results -> standings -> resolve ties -> confirm -> fill A flight
  const go = async (n, cat) => { await click($$('.nav-item').find((b) => b.querySelector('.nav-label').textContent === n)); if (cat) await click($$('.cat-tab').find((b) => b.textContent === cat)); };
  await go('Games & results', "Men's Open");
  await click(btn('Fill example results'));
  await go('Standings', "Men's Open");
  console.log('  transition:', w.document.querySelector('.transition').textContent.slice(0, 220));
  for (let i = 0; i < 10 && btn('Keep this order'); i++) await click(btn('Keep this order'));
  await click(btn('Confirm bracket'));
  console.log('  after confirm:', w.document.querySelector('.transition').textContent.slice(0, 200));
  await go('Games & results', "Men's Open");
  for (const b of $$('button').filter((b) => b.textContent.startsWith('Fill example results') && !b.disabled)) await click(b);
  const finals = $$('.game').filter((g) => g.querySelector('.g-side.win')).length;
  console.log('  games with a winner:', finals, 'of', $$('.game').length);
  // result modal on a pool game -> warns reset
  await go('Standings', "Men's Open");
  // Americano
  await go('Games & results', 'Americano Night'); await click(btn('Fill example results'));
  await go('Standings', 'Americano Night');
  for (let i = 0; i < 10 && btn('Keep this order'); i++) await click(btn('Keep this order'));
  await click(btn('Confirm bracket'));
  console.log('  americano:', w.document.querySelector('.transition').textContent.slice(0, 160));
  // open a result modal in queue schedule
  await go('Schedule');
  const enter = btn('Enter result'); console.log('  courts busy:', $$('.court.busy').length);
  if (enter) { await click(enter); console.log('  modal:', w.document.querySelector('.modal-head').textContent); }
  // Format change on a new sport
  await go('Event');
  w.document.getElementById('nt-sport').value = 'VOLLEYBALL';
  w.document.getElementById('nt-sport').dispatchEvent(new w.Event('change', { bubbles: true })); await sleep(30);
  await click(btn('Create event')); await click(btn('Create event', w.document.querySelector('.modal')));
  console.log('  new event:', w.document.querySelector('.t-name').textContent, '/', w.document.querySelector('.t-meta').textContent);
  console.log('ERRORS:', errors.length ? errors.slice(0, 5) : 'none');
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.log('THREW', e.stack, errors.slice(0, 5)); process.exit(1); });
