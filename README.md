# turno-tournament-engine

The tournament logic for [turno-sport](https://turno-sport.com/), designed by reverse-engineering Tourny (tourny.ca) and rebuilt as a standalone engine plus a working mockup.

Sports: **Football, Futsal, Volleyball, Tennis, Padel**.
Formats are **composed from phases** of three kinds: Groups, Knockout (single or double elimination) and Americano, linked by connectors that pick places from earlier rankings. The mockup in [turno-mockup/](turno-mockup/) uses the Turno UI (in Italian) and starts from a sample padel tournament.

- **Repository:** https://github.com/emaalberti/tournament_creation_mockup (personal account for now; move it to the company organization with Settings → Transfer ownership)
- **Phase design:** [docs/PHASE-DESIGN.md](docs/PHASE-DESIGN.md), the phase/connector model the engine implements (in Italian)
- **Spec:** [docs/SPEC.md](docs/SPEC.md), sport rules, standings, results, scheduling and the decisions log (§10). Its fixed formats (§4) are replaced by the phase design.
- **Porting guide:** [docs/PORTING.md](docs/PORTING.md), how to move this into turno-sport
- **Research notes:** [docs/tourny-analysis/](docs/tourny-analysis/), what Tourny does, step by step

## Layout

| Path | What it is |
|---|---|
| `turno-mockup/src/engine.js` | **The engine.** Pure logic, no DOM or framework. This is the part to port. |
| `turno-mockup/src/` | Mockup UI (React + htm from CDN): `app.js`, `style.css`, `i18n.js` (Italian labels). Not meant for production. |
| `turno-mockup/index.html` | The mockup as one file, built from `src/` by `build.py`. Do not edit it by hand. |
| `tests/engine.test.js` | 58 engine checks: presets as phase graphs, placeholders, cascade invalidation, knockout final placings, reshuffled group stages with carried-over points, consolation from knockout places, BYEs, validation errors, Americano pairs, results, scheduling. |
| `docs/` | Design, spec, porting plan and research notes. |

## Run it

```bash
npm test                 # engine tests (Node 18+, no install needed)
npm run build            # rebuild turno-mockup/index.html after changing turno-mockup/src/
open turno-mockup/index.html
```

The mockup stores its state in the browser's localStorage. "Ripristina esempio" in the sidebar brings back the sample tournament.

## Engine API at a glance

`engine.js` exposes `TE` (browser global, or `module.exports` in Node).

- **State:** `emptyState()`, `setSport(state, sport)`, `newState(sport, name)`, `newCategory(name, sport)`. Category = teams/players + `phases` + `connectors` + `games`.
- **Building the format:** `addPhase`, `removePhase`, `updatePhase`, `setConnector(state, cat, toPhaseId, { selectors: [{ fromPhase, ranking, positions }], seeding, transform })`, `validateGraph`. `applyTemplate` builds ready-made graphs (used by the tests; the mockup has no presets).
- **Phase types:** `GROUPS` (rankings `pool:<n>`, `overall`, `cross:<k>`), `KNOCKOUT` with `eliminations` 1 or 2 (`final`), `AMERICANO` (`overall` of players). `rankingCatalog(cat, phase)` lists them.
- **Lifecycle:** `phaseStatus` (DRAFT → READY → IN_PROGRESS → COMPLETE → CONFIRMED), `relevantTies`, `confirmPhase`, `unconfirmPhase`. Changes cascade to every later phase.
- **Rankings:** `ranking(state, cat, phase, rankingId)`, `phaseStats` (with carried-over points)
- **Setup helpers:** `movePoolEntrant`, `moveEntrant` (knockout seeding), `participantsChanged`
- **Results:** `validateResult`, `recordResult`, `clearResult`, `resolve`, `sourceLabel`, `isPlayable`
- **Scheduling:** `generateFixedSchedule`, `buildQueue`, `fillCourts`

State is plain JSON.
