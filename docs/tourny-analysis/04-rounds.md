# Tourny – Step 5: Rounds

Source: a capture of the user setting up "Male" (6 teams): Pool Play → A/B Flight (2026-10-28), plus the PoolsForm / AddTeamsMovingOnForm / bracket form code.
**[obs]** observed · **[inf]** inference · **[srv]** the algorithm runs on Tourny's server; only its inputs and outputs are visible.

The Rounds page lists, per category, every round from the format as a card:
`Pool Play — "Setup pools and games."` → `Advancing teams — "Determine how teams will advance."` → `A Flight — "Setup bracket and games."` → `B Flight …`
"Round Names" renames rounds (`updateRoundNames`, with the option `applyToAllDivisions`).

---

## A. Round robin round

### A1. Setup pools [obs]
- **Number of pools**: a dropdown 1..max (the max depends on the team count [inf: ≤ teams/2]).
- Changing the number → `generateRoundRobinPools({roundId, params:{numberOfPools}})` **[srv]** returns pools with teams distributed. The test had 6 teams / 4 pools → sizes 2/3/2/... = an even spread [inf: snake distribution by seed, or by insertion order when no seeds].
- The user can then drag teams between pools (manual override).
- Pools are named Pool A, Pool B, … (`{name, number, teamIds[]}`).

### A2. Setup games [obs]
- "How would you like to set up your games?" → **Generate** | **Manual Entry**.
- **"How many games will each team play?"** → `Play all teams in pool once` (`playEachTeamOnce`) or **1–30 games** (`gamesPerTeam`).
  - Warning: if a pool has an odd number of teams AND the games per team is odd → "one team will need to play an additional game".
- **"Include crossover pools?"** (toggle): pairs of pools (Pool X ⇄ Pool Y) whose teams play the *other* pool instead of their own. Multiple pairs are allowed.
- Preview → `generateRoundRobinGames({roundId, pools, playEachTeamOnce, gamesPerTeam, poolCrossovers})` **[srv]** → games `{number, homeTeam, awayTeam}`.
- Save → `updateRound({roundRobinUpdates:{pools, playEachTeamOnce, gamesPerTeam, poolCrossovers, gameStructureTemplate:{gameStructure:[{gameNumber, homeTeamId, awayTeamId}]}}})`.
- Game numbers are global and sequential within the category (Pool Play used 1–11, the bracket started at 12).
- A hard-coded special template exists: "8 Week Round Robin" (league, 8 teams).

## B. Advancing teams (transition Pool → Flights) [obs]

- **"How will teams be ranked?"**
  | Value | Label |
  |---|---|
  | `POOL_NUMBER_AND_RANK` | Pool rankings (e.g. "1st of Pool A") |
  | `OVERALL_RANK` | Overall rankings (all teams in one table) |
  | `POOL_RANK_PLACEMENT` | Cross pool rankings (e.g. "1st of 2nds" = best 2nd-placed team across pools) |
- **Use wildcards** (only with Pool rankings): "When all teams with a specific rank within their pool cannot be included, the remaining spots are filled by comparing teams across pools."
- **Teams per flight**: one dropdown per bracket ("A Flight: N teams", "B Flight: M teams"). The sum can't exceed the total, and lowering one rebalances the others.
- `generateTeamsMovingOnForTransitions({previousRoundId, method, wildcardMethod, transitions:[{transitionId, numberOfTeams}]})` **[srv]** → slot list.
- Save → `addTeamsMovingOnToTransition` with each slot:
  `{teamNumber, type, poolNumber, poolRank, overallRank, placementAmongstTiedRanks}`
  → these are **placeholders** ("2nd of 1sts", "1st of 3rds") resolved when the pool standings are final.
- Seen in the test (cross pool): A Flight = 1st of 1sts, 2nd of 1sts, 1st of 2nds, 2nd of 2nds, 1st of 3rds, 2nd of 3rds …

## C. Bracket round (single elimination) [obs]

- **First round matchups**: drag-and-drop the placeholders/teams into game slots (swap). Pre-filled by the server: `generateEliminationFirstRoundGameMatchups` **[srv]**, with standard seeding [inf: 1 v N, 2 v N-1 …, byes to the top seeds].
- **Placements** (`placements: [1, 3, 5 …]`): which finishing places are played for. 1 = final only; 3 = also the 3rd-place game; 5 = also the 5th-place game, etc. The test showed "1st Place, 3rd Place, 5th Place".
- **Consolation games** (custom): extra games defined by dependencies, e.g. home = "Loser of 12", away = "Loser of 13". Each is `{gameNumber, homeGameDependency:{gameNumber, gameResult: WINNER|LOSER}, awayGameDependency}`. They can be added, edited, removed and reordered (game numbers re-sequenced).
- Preview → `generateBracketFromMatchups({round:{id, placements, consolationGames, trueDoubleEliminationRound}, matchups})` **[srv]**.
- Save → `updateRound({singleEliminationUpdates:{gamePlan:[{gameNumber, homeTeamNumber, awayTeamNumber}], placements, consolationGames}})`.
- Bracket shown in the test: Quarter Finals (12, 13) → Semi Finals (14, 15) → finals/placements (16, 17, 18) → Consolations (19); labels "Winner of 12", "Loser of 14", …
- Double elimination adds `trueDoubleEliminationRound` (the bracket-reset final).

## D. What we must implement ourselves (the server-side algorithms) [inf]

| Feature | Standard algorithm |
|---|---|
| Distribute teams into pools | snake/serpentine by seed (1→A, 2→B, …, back again) |
| Round robin schedule | circle (Berger) method; "N games per team" = the first N rounds of the circle, or repeated for N > pool size − 1 |
| Crossovers | games only between pool X and pool Y teams (bipartite pairing) |
| Pool standings | the Step 2 tiebreakers applied per pool |
| Advancement | pool rank, overall rank, or cross-pool (rank the k-th placed teams of every pool together) |
| Bracket seeding | standard seed order (1v8, 4v5, 2v7, 3v6), byes for the top seeds up to the next power of 2 |
| Placement games | losers' brackets for the 3rd/5th/7th places |

Padel/tennis **Americano** (rotating partners, individual scoring) is not in Tourny. It will be our own round type.

---

## B+. Advancing teams: deep dive (second recording + code) [obs unless marked]

### Slot model ("TeamMovingOn")
Every spot in the next round is a slot `{teamNumber, type, poolNumber, poolRank, overallRank, placementAmongstTiedRanks}`:
| type | fields used | label (`getTeamMovingOnLabel`) | resolves to |
|---|---|---|---|
| `POOL_NUMBER_AND_RANK` | poolNumber, poolRank | "2nd Pool A" | the team ranked poolRank in that pool |
| `OVERALL_RANK` | overallRank | "3rd Pool Play" (round name) | the k-th team in a single table of all pool teams |
| `POOL_RANK_PLACEMENT` | poolRank, placementAmongstTiedRanks | "1st of 2nds" | take the poolRank-th team of EVERY pool, sort them by the overall ranking, pick the placement-th |

`teamNumber` = the slot id inside the transition (1..N); the bracket gamePlan refers to it (`homeTeamNumber`/`awayTeamNumber`).

### Generation (server, inputs visible)
`generateTeamsMovingOnForTransitions({previousRoundId, method, wildcardMethod, transitions:[{transitionId, numberOfTeams}]})`
- method = the dropdown value ("Pool rankings" / "Overall rankings" / "Cross pool rankings").
- **wildcardMethod** = `POOL_RANK_PLACEMENT` when the method is Pool rankings AND "Use wildcards" is on, otherwise null.
  → e.g. 3 pools, 4 spots: 1st Pool A, 1st Pool B, 1st Pool C + **"1st of 2nds"** (the best runner-up).
  Without wildcards, the server fills by pool rank only [inf: an uneven cut is filled pool-by-pool].
- Flights are filled top-down: A Flight gets the best slots, B Flight the next ones [inf from the "1st of 1sts… / 3rd of 2nds…" pattern].
- The UI shows "All teams will advance" or "N teams will not advance".

### Manual editing
- Slots are drag-and-drop **between flights and within a flight** (the test ended with A = 3rd of 1sts, 1st of 2nds, 2nd of 2nds; B = 3rd of 2nds, 1st of 1sts, 2nd of 1sts, 4th of 1sts → reordered by hand).
- One flight can mix types (pool-rank slots + cross-pool slots).
- If the next rounds already have games/brackets: confirmation "Update advancing teams? This may clear games in upcoming rounds."

### Resolution: "Confirm brackets" dialog when the pool round is completed
1. Compute the pool standings (the Step 2 tiebreakers) and the overall standings.
2. Detect **unresolved ties** that matter:
   - Overall: same rank shared by more than one team (`getTiedOverallRanks`).
   - Per pool: same rank inside a pool (`getTiedPoolRanks`) → "Tied for 2nd in Pool A".
   - Cross pool: teams with the same pool rank AND the same overall rank, only if a slot uses that exact "k-th of n-ths" (`getTiedPoolRankPlacements`) → "Tied for 1st of 2nds".
3. The organiser **drags to order the tied teams** (manual final tiebreaker), or sees "There are no ties to resolve."
4. Shows a preview of every next-round bracket/pool with the real team names.
5. Confirm → saves `overallRanks [{rank, teamId}]` for the round and places the teams ("Teams have moved into the next round!").
   The overall order used for cross-pool = sorted by pool rank first, then by the tie order / overall ranking.

### Our implementation plan [inf]
```
resolveSlot(slot, poolStandings, overallStandings):
  POOL_NUMBER_AND_RANK → poolStandings[slot.pool][slot.poolRank-1]
  OVERALL_RANK         → overallStandings[slot.overallRank-1]
  POOL_RANK_PLACEMENT  → pools.map(p => p[slot.poolRank-1]).filter(Boolean)
                           .sort(byOverallStanding)[slot.placement-1]
```
Cross-pool comparison must normalise for uneven pool sizes (e.g. averages, or ignore games vs the last team of bigger pools). Tourny shows no such rule [unk], so this is a design decision for us.
