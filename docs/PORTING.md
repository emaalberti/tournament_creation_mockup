# Porting the engine into turno-sport

Status: plan only. It is not started; it needs access to the turno-sport codebase.

## Approach

1. **Move the engine, not the mockup.** `mockup/engine.js` has no UI or framework dependencies. Convert it to the turno-sport language and conventions (e.g. TypeScript), keep the tests, and call it from existing code. `app.js` stays behind.
2. **Run standings and advancement where official results live** (normally the server), so every screen shows the same ranking.
3. **Small, reversible database migrations**, one feature at a time.
4. **Ship feature by feature**, each reviewed on staging before production.

## Step 0: discovery (in the turno-sport repo)

- Stack: frontend, backend, database/ORM, hosting, test setup.
- Current data model for tournament, category, team/player, round, pool, game and result.
- How advancement from pools to playoffs works today, and why cross-pool ranking was not possible.
- Map the SPEC §2 entities onto the existing tables and list the gaps.

## Step 1: cross-pool rankings (first feature)

Engine pieces: `generateSlots`, `crossRanking`, `relevantTies`, `confirmAdvancement`, `orderGroups`, `rankIds` with `{ average: true }`.

Likely data additions (final shape depends on the existing schema):

| Data | Fields |
|---|---|
| Advancement settings (per pool round) | method `POOL / OVERALL / CROSS`, wildcards, teams per flight |
| Advancement slot | next round, position, type, pool, rank, placement, label |
| Tie order (per pool round) | tie key (e.g. `cross:2:1`), ordered team ids |
| Resolved slot | slot → team, set when the round is confirmed |

Screens: the advancing-teams editor (method, wildcards, counts, slot list with move up/down and move to another flight), and the "Confirm bracket" step (ties to order, preview, confirm, undo).

Rules to keep (SPEC §6.2, §7):
- Cross-pool and overall comparisons use per-game averages (decision #7).
- Pool rankings with an uneven cut and no wildcards are blocked (decision #6).
- Confirmation needs every game in the round to have a result. Editing a result afterwards un-confirms the round and clears the playoff results.

## Later features (suggested order)

1. Tiebreakers with Overall / Head-to-head scope, and per-sport defaults
2. Flights (multiple playoff brackets)
3. Byes, placement games (3rd/5th/7th) and consolation games
4. Double elimination with bracket reset
5. Reset rules and confirmation prompts
6. Americano and Americano → SE (requires players on teams)
7. Scheduling: fixed time blocks with minimum rest; court queue
