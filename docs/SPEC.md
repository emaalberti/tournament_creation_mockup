# Tournament Engine – Mockup Spec

Version 0.1 · 2026-10-28 · based on the reverse-engineering of Tourny (notes 01–05 in this folder).

Goal: a working mockup with Tourny-equivalent tournament logic for **Football, Futsal, Volleyball, Tennis and Padel**, to be ported later into our web app (its design is applied at that stage, not now).

Tags: **[T]** = same as Tourny (observed) · **[T~]** = Tourny behaviour that we implement ourselves because Tourny runs it on its server · **[NEW]** = our own addition or decision · **[OPEN]** = still to decide.

---

## 1. Scope

| In | Out (for now) |
|---|---|
| 5 sports, tournament type only | Leagues / Season format |
| 5 formats: RR, SE, DE, RR→SE, RR→DE | Swiss, Power pools, Custom brackets |
| Categories, teams, **players** | Rosters, registration, invites, waivers |
| Standings, tiebreakers, points | Sponsors, home page, payments/publishing fee |
| Pools, advancing teams, flights, brackets | Admin roles, permissions |
| Results, transitions, resets | Notifications |
| Americano (padel/tennis doubles) [NEW] | |
| Scheduling: fixed slots + court queue | |

---

## 2. Domain model

```
Tournament
  id, name, sport, startDate, endDate, status: DRAFT | PUBLISHED
  scoreSubmission: ORGANIZER_ONLY | PARTICIPANTS (+ requiresApproval)
  └─ Category (≥1; an implicit "Default" exists when the user creates none)   [T]
       id, name, order
       ├─ FormatConfig (one per category; categories may differ)              [T]
       │    templateId, points, tiebreakers[], standingsColumns[], stats[]
       ├─ Team[]  (max 128 per category)                                      [T]
       │    id, name, seed?, isPlaceholder
       │    └─ Player[] (0..2; required for doubles / Americano)              [NEW]
       ├─ Player[] (category-level pool, used by Americano)                   [NEW]
       └─ Round[] (ordered)                                                   [T]
            id, number, name, type, status: SETUP | READY | IN_PROGRESS | COMPLETE | CONFIRMED
            type-specific config (§6)
            ├─ Pool[] (RR)          {number, name "Pool A", teamIds[]}
            ├─ Game[]
            └─ Transition → next round(s) {slots[]}                           [T]
Venue {name, address} └─ Space[] {name, restrictions?}                        [T]
```

**Game**
```
id, number (sequential per category across all rounds) [T]
roundId, poolNumber?, bracketPosition?
home: TeamRef | Dependency | Slot   (Dependency = {gameNumber, result: WINNER|LOSER}) [T]
away: same
status: SCHEDULED | IN_PROGRESS | FINAL | CANCELLED | FORFEIT
result: { homeScore, awayScore, sets?: [{home, away}], stats?: {...}, forfeitTeam? }
schedule: { spaceId?, start?, queuePosition? }
```

---

## 3. Sport configuration [T]+[NEW]

| | Football | Futsal [NEW] | Volleyball | Tennis | Padel |
|---|---|---|---|---|---|
| Space label | field | court | court | court | court |
| Ties allowed | yes | yes | no | no | no |
| Sets | no | no | yes | yes | yes |
| Score unit | goals | goals | points | games | games |
| Default sets | – | – | best of 3 (or 5) | best of 3 | best of 3 |
| Default points W/T/L | 3/1/0 | 3/1/0 | 2/–/0 (+ optional setWin/setLoss) | 1/0/0 | 1/0/0 |
| Forfeit score | 3-0 | 3-0 | 3-0 (25-0 ×3) | 6-0 6-0 | 6-0 6-0 |
| Min rest between games (default, editable) | 30 min | 15 min | 15 min | 15 min | 15 min |
| Doubles / players | no | no | no | optional | yes (2 per team) |
| Americano available | no | no | no | yes (doubles) | yes |
| Recommended format | RR→SE | RR→SE | RR→SE | RR→SE | RR→SE |
| Recommended scheduling | Fixed slots | Fixed slots | Fixed slots | Fixed slots | **Court queue** |

`gamesRequireWinners = true` (no draw) for volleyball, tennis and padel. [T has the flag per round, default false]

---

## 4. Format templates [T]

| id | Name | Rounds |
|---|---|---|
| RR | Round Robin | Pool Play (RR) |
| SE | Single Elimination | Bracket (SE) |
| DE | Double Elimination | Bracket (DE) |
| RR_SE ⭐ | Round Robin to Single Elimination | Pool Play (RR) → Playoffs (SE) |
| RR_DE | Round Robin to Double Elimination | Pool Play (RR) → Playoffs (DE) |
| AMERICANO [NEW] | Americano | Americano rounds (§6.5) |
| AMERICANO_SE [NEW] | Americano to Single Elimination | Americano rounds → Playoffs (SE of pairs) |

**Format wizard** [T]
1. (Only if there are several categories and a format already exists) choose the categories to apply it to.
2. Select a template (⭐ recommended pinned on top).
3. If the first round is RR → Standings step (points, tiebreakers, columns, stats).
4. If the format has playoffs → "How many brackets?" **1–5** → flights.
5. Review → save.

**Flights** [T]: with N brackets, the playoff round is cloned N times as `A Flight`, `B Flight`, … (numbers `k, k+1, …`), each with its own transition from the pool round.

Changing the format **deletes all games** of the affected categories (confirm dialog). [T]

---

## 5. Standings

### 5.1 Points system [T]
`POINTS` (from results) | `AWARDED` (entered manually by the organiser) | `NONE` (tiebreakers only).
We store it as an explicit field (Tourny derives it from hidden tiebreaker ids). [NEW]

`points = { win, tie, loss, cancel, forfeitWin, forfeitLoss, setWin, setLoss }` (integers). [T]
Team points = Σ per game: result points + setWin × setsWon + setLoss × setsLost.

### 5.2 Per-team stats computed from games
```
GP, W, T, L, C (cancelled), F (forfeits)
PF, PA, PD = PF − PA            (score units: goals / points / games)
SF, SA, SD = SF − SA, SP        (sets, when the sport has sets)
PTS
```
Cancelled games don't count towards GP. A forfeit counts as W/L and records the **sport default forfeit score** (§3), so it counts towards the score and set differences. [NEW, decided]

### 5.3 Volleyball points [decided]
Simple W/L points, as in Tourny: win/loss points plus optional setWin/setLoss. No FIVB 3/2/1 preset in v1.

### 5.4 Tiebreakers [T]
An ordered list of `{ruleId, scope}`; `scope ∈ OVERALL | HEAD_TO_HEAD`. The same rule may appear once per scope. Drag to reorder.

Rule catalogue (fixed in code, filtered by sport) [NEW, equivalent to Tourny's]:

| ruleId | Formula | Sports |
|---|---|---|
| POINTS | PTS | all |
| WINS | W | all |
| MATCHUPS | 2W + T | all |
| SCORE_DIFF | PF − PA | all |
| SCORE_FOR | PF | all |
| SCORE_AGAINST_LEAST | −PA | all |
| AVG_SCORE_DIFF | (PF − PA)/GP | all |
| SET_DIFF | SF − SA | sets |
| SET_RATIO | SF / SA | sets |
| SETS_FOR | SF | sets |
| SETS_AGAINST_LEAST | −SA | sets |
| AVG_SET_DIFF | (SF − SA)/GP | sets |
| AVG_SETS_FOR | SF/GP | sets |
| SCORE_RATIO | PF / PA | sets (volleyball point ratio) |

Default tiebreakers per sport [NEW]:
- Football/Futsal: POINTS(O) → POINTS(H2H) → SCORE_DIFF(H2H) → SCORE_DIFF(O) → SCORE_FOR(O)
- Volleyball: WINS(O) → POINTS(O) → SET_RATIO(O) → SCORE_RATIO(O) → WINS(H2H)
- Tennis/Padel: WINS(O) → WINS(H2H) → SET_DIFF(O) → SCORE_DIFF(O)

**Ranking algorithm** [T~]
```
rank(teams, games, tiebreakers):
  groups = [teams]
  for tb in tiebreakers:
     for each group with >1 team:
        subset = tb.scope == H2H ? games among group teams only : all games
        split group by tb.value(subset) desc
  remaining groups with >1 team = unresolved tie → shared rank
```
H2H is recomputed on the current tied subset at each step (mini-league). Unresolved ties are resolved manually at the transition (§7).

### 5.5 Standings columns [T]
Choose and order from: GP, W, L, T, C, F, PF, PA, +/−, SW, SL, SD, SP, "SW:SL", PTS. Defaults: GP, W, T, L, +/−, PTS (+ SW:SL for set sports).
Stats needed by a selected tiebreaker are required and can't be removed. [T]

---

## 6. Rounds

### 6.1 Round robin (pools) [T]
**Pools**
- Number of pools: 1..⌊teams/2⌋.
- Auto distribution [T~]: **snake by seed** (no seeds → insertion order). E.g. 4 pools: A1 B2 C3 D4 D5 C6 B7 A8 …
- Teams can be dragged between pools. Names Pool A, B, C…

**Games**
- Mode: `GENERATE` | `MANUAL` (organiser enters the pairs).
- Games per team: `ALL_ONCE` (full round robin, n(n−1)/2 games per pool) or a fixed **1–30**.
- Warning when the pool size is odd AND the games per team is odd: "one team will play an extra game". [T]
- **Crossovers** (optional, several pairs): Pool X ⇄ Pool Y → teams play the other pool instead of their own. [T]
- Preview, then save. Game numbers continue across the category.

**Generation algorithm** [T~]
- Circle (Berger) method per pool. Odd n → add a BYE (no game generated).
- `ALL_ONCE` = all n−1 (or n) rounds.
- Fixed k < n−1: take the first k circle rounds. If n is odd, some teams get k−1 games → add extra games pairing the short teams (the "extra game" warning).
- Fixed k > n−1: repeat the circle with home/away swapped until k is reached.
- Crossover X⇄Y: bipartite circle (team i of X vs team (i + r) mod |Y| of Y for round r).
- Interleave game order across pools (round 1 of every pool, then round 2…), so the court queue spreads teams naturally.

### 6.2 Advancing teams (transition) [T]
Config per transition group (pool round → its next rounds/flights):
- **Method**: `POOL_RANK` ("Pool rankings") | `OVERALL_RANK` ("Overall rankings") | `CROSS_POOL` ("Cross pool rankings").
- **Use wildcards** (POOL_RANK only): spots left after whole pool ranks are taken are filled with CROSS_POOL slots.
- **Teams per flight**: one number per flight. The sum is ≤ the total teams (decreasing → rebalance). Message "All teams advance" or "N teams will not advance".

**Slots** (generated, then editable) [T]
| Slot type | Fields | Label |
|---|---|---|
| POOL_RANK | pool, rank | "2nd Pool A" |
| OVERALL_RANK | rank | "5th overall" |
| CROSS_POOL | rank, placement | "1st of 2nds" |

Generation [T~]:
- POOL_RANK: rank 1 of every pool, then rank 2 of every pool, … filling flights top-down (A gets the best slots).
  When a whole rank level doesn't fit: wildcards on → CROSS_POOL slots for that level ("1st of 3rds", "2nd of 3rds"); off → **validation error** "Not all Nth-placed teams fit. Enable wildcards or change the number of advancing teams." [NEW, decided]
- OVERALL_RANK: 1..N, top-down across flights.
- CROSS_POOL: "1st of 1sts", "2nd of 1sts", …, "1st of 2nds", …
- The organiser can drag slots within a flight and across flights, and mix slot types. [T]

**Cross-pool comparison with uneven pools** [NEW, decided]: compare using **per-game averages**: (PTS/GP, then SD/GP, then PD/GP, then the remaining tiebreakers as averages).

### 6.3 Single elimination [T]
- Bracket size = next power of 2 ≥ N. **Byes** go to the top seeds. Non-powers of 2 create a preliminary round ("pre-quarterfinals").
- First-round matchups are pre-filled with standard seeding: 1vN, then the recursive order (1v8, 4v5, 2v7, 3v6 for 8). Slots are seeded in slot order (A-flight slot 1 = seed 1).
- The organiser can swap the first-round teams (drag and drop).
- **Placements** `[1, 3, 5, 7…]`: places to play off. 3 → a game between the SF losers; 5 → the QF losers' mini-bracket (5th–8th; we play for the 5th only, or the 5th + 7th when 7 is listed).
- **Consolation games**: free games `{home: Dependency, away: Dependency}`, e.g. Loser of 12 vs Loser of 13. Add/edit/delete, auto-renumbered.
- Round names: Final, Semi Finals, Quarter Finals, Round of 16, … (editable, "apply to all categories"). [T]
- Winners and losers move automatically when a result is saved. [T]

### 6.4 Double elimination [T]
- Upper and lower brackets. A team is eliminated after its 2nd loss. Every team plays ≥2 games.
- Standard losers-bracket drop pattern (alternating the drop order between rounds to avoid rematches) [T~].
- Grand final: the upper winner vs the lower winner. `trueDoubleElimination` (default **on**) → if the lower-bracket team wins, a reset game is played.
- Byes as in SE.

### 6.5 Americano [NEW] (padel; tennis doubles)
- Participants are **players** (category-level). v1 requires N to be a **multiple of 4** (validation error otherwise).
- Each round: players are split into games of 2v2. Partners and opponents rotate so that every pair of players partners once (classic schedule tables, or a greedy "minimise repeat partners, then repeat opponents").
- Game = a fixed total of points (e.g. 16/21/24/32, configurable) or a time limit. Each player gets the points their side won.
- Standings **per player**: total points won → games won → point diff → H2H [NEW].
- Mexicano variant: not in v1.
- Rounds: a fixed count (default = N−1 for a full Americano) or "until the time runs out".
- **Playoff after Americano** (v1): the top-k players (k = 4, 8 or 16) form pairs by standing (1+k, 2+(k−1), …) → an SE bracket of pairs, seeded by pair order. The format is `AMERICANO_SE`: Americano rounds → transition (OVERALL_RANK on players) → SE.

---

## 7. Results & transitions

**Result entry** [T]
- Allowed only when the tournament is PUBLISHED.
- Score per team (+ sets for set sports; the game score is derived from sets: sets won).
- Validation [NEW]: set sports → no draw; best-of-N set count. Tennis/padel set scores are **lenient**: any score is accepted, with a warning on unusual sets (e.g. 6-5, 8-6), so short sets and super tie-breaks work.
- Cancel → no points for anyone, not counted in GP. Forfeit → the forfeiting team gets the forfeitLoss points, the other forfeitWin.
- Editable afterwards ("Edit result").
- Optional participant submission + approval queue.

**Transition / confirm round** [T]
1. Preconditions: every game of the round is FINAL, CANCELLED or FORFEIT.
2. Compute the pool and overall standings (§5.4).
3. Detect only the **relevant ties**: those that change which team fills a slot:
   - "Tied for 2nd in Pool A" (POOL_RANK slots)
   - "Tied for 5th" overall (OVERALL_RANK slots)
   - "Tied for 1st of 2nds" (CROSS_POOL slots)
4. The organiser drags the tied teams into order (manual final tiebreaker), or sees "No ties to resolve".
5. Preview of the next round(s) with the real names → **Confirm bracket**.
6. Slots are resolved into teams and the bracket games are filled. Each category advances independently.

```
resolveSlot(slot):
  POOL_RANK    → poolStandings[slot.pool][slot.rank-1]
  OVERALL_RANK → overallStandings[slot.rank-1]
  CROSS_POOL   → pools.map(p => p[slot.rank-1]).filter(Boolean)
                   .sort(byPerGameAverages)[slot.placement-1]
```

**Reset rules** [T]
| Change | Effect (after a confirm dialog) |
|---|---|
| Switch format | all games of the category deleted |
| Add/remove teams when games exist | the category's games reset |
| Edit pools/games of round k | the games of rounds > k cleared |
| Edit advancing slots when the next rounds have games | those games cleared |
| Edit a result in a confirmed round | the following rounds reset (re-confirm needed) |

---

## 8. Venues & scheduling

**Venues** [T]: `{name, address, spaces[]}`. Spaces are renamable. Deleting a space → its games become unscheduled (not deleted).

**Mode A – Fixed slots ("Assigned courts & times")** [T]
- Per round: game length (minutes).
- Time blocks `{start, end, spaceIds[]}`.
- Space restrictions: allowed categories / rounds / pools.
- Generate: place the games in order (round → pool-interleaved order) into the earliest free (space, time) that respects the restrictions, no double-booking and [NEW] **min rest per team** (per-sport default from §3, editable per tournament, 0 = off).
- Unplaced games → "Incomplete schedule: N games don't fit" (suggest longer blocks, more spaces, shorter games).
- Manual drag and drop (calendar) and time editing (list). Regenerate overwrites (confirm).
- Bracket games are scheduled after their dependencies (start ≥ the dependency end + rest).

**Mode B – Court queue ("Next available court")** [T] (default for padel)
- Games have no time. An ordered queue + a set of active courts.
- Each free court takes the first queued game whose teams/players are both available ([NEW]: not currently playing and rested ≥ X minutes) and whose dependencies are resolved.
- When a result is submitted → the game moves to "recent" and the court is freed and auto-filled.
- Toggle **automatic assignment** off → courts stay free and games are dragged onto courts manually.
- Reorder the queue at any time and reassign courts by drag.

---

## 9. Setup checklist (dashboard) [T]
Format → Standings → Categories (optional) → Teams → Rounds → Venues → Schedule → Publish.
Each item shows a summary ("Pool Play · A Flight · B Flight", "14 teams participating", "Male · Female"). A counter "X of N complete".

---

## 10. Decisions log (2026-10-28)
| # | Topic | Decision |
|---|---|---|
| 1 | Volleyball points | Simple W/L (+ optional set points); no FIVB 3/2/1 preset |
| 2 | Forfeit score | Sport default score (3-0 / 25-0 sets / 6-0 6-0), counts towards the differences |
| 3 | Americano v1 | Multiple of 4 players only; no Mexicano; **playoff after Americano included** |
| 4 | Tennis/padel set validation | Lenient, warn only |
| 5 | Min rest | Per-sport default, editable per tournament (0 = off) |
| 6 | Pool rank without wildcards, uneven cut | Blocked: enable wildcards or change the advancing count |
| 7 | Cross-pool comparison, uneven pools | Per-game averages |
| 8 | Format subset | RR, SE, DE, RR→SE, RR→DE (+ Americano, Americano→SE) |
| 9 | Players | Explicit player entities on teams (required for padel/Americano) |
