# turno-tournament-engine

The tournament logic for [turno-sport](https://turno-sport.com/), designed by reverse-engineering Tourny (tourny.ca) and rebuilt as a standalone engine plus a working mockup.

Sports: **Football, Futsal, Volleyball, Tennis, Padel**.
Formats: Round Robin, Single Elimination, Double Elimination, RR → SE, RR → DE, Americano, Americano → SE.

- **Repository:** https://github.com/emaalberti/tournament_creation_mockup (personal account for now; move it to the company organization with Settings → Transfer ownership)
- **Live mockup:** https://claude.ai/artifact/6gBNiJyCoX3waWHxGzaHwh (private; share it from the page's Share menu)
- **Spec:** [docs/SPEC.md](docs/SPEC.md), the source of truth for every rule and decision
- **Composable phases (proposal):** [docs/PHASE-DESIGN.md](docs/PHASE-DESIGN.md), phases as black boxes linked by connectors, replacing fixed formats (in Italian)
- **Porting guide:** [docs/PORTING.md](docs/PORTING.md), how to move this into turno-sport
- **Research notes:** [docs/tourny-analysis/](docs/tourny-analysis/), what Tourny does, step by step

## Layout

| Path | What it is |
|---|---|
| `mockup/engine.js` | **The engine.** Pure logic, no DOM or framework. This is the part to port. |
| `mockup/app.js` | Throwaway mockup UI (React + htm from CDN). Not meant for production. |
| `mockup/index.html` | Page shell and neutral styling for the mockup. |
| `tests/engine-*.test.js` | 63 engine checks: pools, round robin, slots, wildcards, ties, brackets, byes, DE, sets, forfeits, Americano, scheduling, court queue. |
| `tests/ui.test.js` | Clicks through every mockup screen in jsdom and runs a full event flow. |
| `docs/SPEC.md` | Consolidated spec, including the decisions log (§10). |
| `docs/tourny-analysis/` | Notes 01–05: Format, Standings, Categories & Teams, Rounds (incl. advancing teams deep dive), Guide. |

## Run it

```bash
npm test                 # engine tests (Node 18+, no install needed)
npm install && npm run test:ui
npm run serve            # then open http://localhost:8080
```

The mockup stores its state in the browser's localStorage. "Reset example" restores the padel example tournament.

## Engine API at a glance

`engine.js` exposes `TE` (browser global, or `module.exports` in Node). The main entry points:

- **Setup:** `newState(sport, name)`, `newCategory`, `applyFormat(state, cat, templateId, flights)`
- **Pools:** `snakePools(teamIds, n)`, `generatePoolGames(state, cat, round)`
- **Standings:** `poolStandings`, `overallStandings` (per-game averages), `crossRanking`, `americanoStandings`
- **Advancing teams:** `generateSlots(cat, poolRound, method, wildcards, counts)`, `setAdvancement`, `moveSlot`, `relevantTies`, `confirmAdvancement`, `unconfirm`
- **Brackets:** `buildBracket` (SE with byes, placements and consolations; DE with reset), `resolve`, `sourceLabel`, `isPlayable`
- **Results:** `validateResult`, `recordResult` (with reset rules), `clearResult`
- **Americano:** `generateAmericano`
- **Scheduling:** `generateFixedSchedule`, `buildQueue`, `fillCourts`

State is plain JSON. The shape is documented in SPEC §2.
