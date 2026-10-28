# turno-tournament-engine

The tournament logic for [turno-sport](https://turno-sport.com/), designed by reverse-engineering Tourny (tourny.ca) and rebuilt as a standalone engine plus a working mockup.

Sports: **Football, Futsal, Volleyball, Tennis, Padel**.
Formats are **composed from phases** of three kinds: Groups, Knockout (single or double elimination) and Americano, linked by connectors that pick places from earlier rankings. The mockup starts from an empty event: you add phases one by one, and its Format page shows what each phase type takes in, does and gives back.

- **Repository:** https://github.com/emaalberti/tournament_creation_mockup (personal account for now; move it to the company organization with Settings → Transfer ownership)
- **Live mockup:** https://claude.ai/artifact/6gBNiJyCoX3waWHxGzaHwh (share it from the page's Share menu)
- **Phase design:** [docs/PHASE-DESIGN.md](docs/PHASE-DESIGN.md), the phase/connector model the engine implements (in Italian)
- **Spec:** [docs/SPEC.md](docs/SPEC.md), sport rules, standings, results, scheduling and the decisions log (§10). Its fixed formats (§4) are replaced by the phase design.
- **Porting guide:** [docs/PORTING.md](docs/PORTING.md), how to move this into turno-sport
- **Research notes:** [docs/tourny-analysis/](docs/tourny-analysis/), what Tourny does, step by step

## Layout

| Path | What it is |
|---|---|
| `mockup/engine.js` | **The engine.** Pure logic, no DOM or framework. This is the part to port. |
| `mockup/app.js` | Throwaway mockup UI (React + htm from CDN). Not meant for production. |
| `mockup/index.html` | Page shell and styling for the mockup. |
| `tests/engine.test.js` | 56 engine checks: presets as phase graphs, placeholders, cascade invalidation, knockout final placings, reshuffled group stages with carried-over points, consolation from knockout places, BYEs, validation errors, Americano pairs, results, scheduling. |
| `tests/ui.test.js` | Starting from an empty event in jsdom: builds Groups → A/B Flight by ticking places, plays and confirms it, then an Americano → pairs knockout. |
| `docs/` | Design, spec, porting plan and research notes. |

## Run it

```bash
npm test                 # engine tests (Node 18+, no install needed)
npm install && npm run test:ui
npm run serve            # then open http://localhost:8080
```

The mockup stores its state in the browser's localStorage. Event → “Start a new tournament” clears it.

## Engine API at a glance

`engine.js` exposes `TE` (browser global, or `module.exports` in Node).

- **State:** `newState(sport, name)`, `newCategory(name, sport)`. Category = teams/players + `phases` + `connectors` + `games`.
- **Building the format:** `addPhase`, `removePhase`, `updatePhase`, `setConnector(state, cat, toPhaseId, { selectors: [{ fromPhase, ranking, positions }], seeding, transform })`, `validateGraph`. `applyTemplate` builds ready-made graphs (used by the tests; the mockup has no presets).
- **Phase types:** `GROUPS` (rankings `pool:<n>`, `overall`, `cross:<k>`), `KNOCKOUT` with `eliminations` 1 or 2 (`final`), `AMERICANO` (`overall` of players). `rankingCatalog(cat, phase)` lists them.
- **Lifecycle:** `phaseStatus` (DRAFT → READY → IN_PROGRESS → COMPLETE → CONFIRMED), `relevantTies`, `confirmPhase`, `unconfirmPhase`. Changes cascade to every later phase.
- **Rankings:** `ranking(state, cat, phase, rankingId)`, `phaseStats` (with carried-over points)
- **Setup helpers:** `movePoolEntrant`, `moveEntrant` (knockout seeding), `participantsChanged`
- **Results:** `validateResult`, `recordResult`, `clearResult`, `resolve`, `sourceLabel`, `isPlayable`
- **Scheduling:** `generateFixedSchedule`, `buildQueue`, `fillCourts`

State is plain JSON.
