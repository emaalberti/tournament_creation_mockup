# Tourny – Step 2: Standings

Source: the Standings page as shown in the padel event "REA trial" (accessibility text), the `UseStandingSettings` / `SelectTiebreakersDialog` / `StandingsColumnsField` code, and the shapes of the save mutation captured on 2026-10-28.
**[obs]** observed · **[inf]** inference · **[unk]** unknown.

The page has three sections: **Points**, **Tiebreakers** and **Statistics/Standings columns**. All of them are saved at the tournament level (and in `createFormat`).

## 1. Points [obs]

"How will teams earn points?" has 3 options:
| Value | Label |
|---|---|
| `points` | Based on game results |
| `awardedPoints` | Manually awarded points |
| `noPoints` | Use tiebreakers only |

`gamePoints` = { win, tie, loss, cancel, forfeitWin, forfeitLoss, setWin, setLoss } (integers).
Defaults when nothing is stored: win 2, tie 1, all others 0. (The event showed "3 points per game win, 2 points tie", so those values were edited.)

**Trick [obs]:** the points system is not stored as its own field. It is derived from the tiebreakers:
- no tiebreakers, OR a tiebreaker with the special rule id `b3bb25f5…` ("Points") → `points`
- a tiebreaker with rule id `02229f5c…` ("Awarded points") → `awardedPoints`
- otherwise → `noPoints`

With `awardedPoints`, a special stat `c5e9544f…` ("Awarded Points", PTS) is forced into the stats. With `points`, the PTS column is "Required".
Tiebreakers based on the `POINTS` stat are hidden unless the system is `points`.

## 2. Tiebreakers [obs]

- The **catalogue** comes from the server (`tournament.tieBreakRuleOptions`): `{id, name, equation, description, params[{statField, statDefinitionId}]}`. It's sport-dependent [inf], and "contact us to request one" means it isn't user-extensible.
- Each chosen tiebreaker = `{ tieBreakRuleId, type, rank }`, where `type` is the **scope**:
  - `TOTAL` → "Overall: consider all games played by a team"
  - `HEAD_TO_HEAD_TOTAL` → "Head to Head: consider games played between tied teams"
  - `HEAD_TO_HEAD_AVERAGE` exists in the enum but isn't offered in the dialog.
- The same rule can be added once per scope. The list is drag-sortable, and the rank is re-numbered 1..n.
- The dialog has two columns (Overall / Head to Head) with toggles. On Confirm, the existing order is kept and new items are appended at the end.

Catalogue seen for **padel** (sets enabled):
| Rule | Equation |
|---|---|
| Set Differential | Sets For − Sets Against |
| Average Set Differential | (Sets For − Sets Against) / Games Played |
| Most Sets For | Sets For |
| Highest Average Sets For | Sets For / Games Played |
| Least Sets Against | Sets Against |
| Total Wins | Wins |
| Total Points | Points |
| Point Differential | Points For − Points Against |
| Matchups | (Wins × 2) + (Ties × 1) |

The order configured on the test event: 1 Set Diff (Overall) · 2 Total Wins (Overall) · 3 Total Points (Overall) · 4 Point Diff (Overall) · 5 Avg Set Diff (H2H) · 6 Most Sets For (H2H) · 7 Highest Avg Sets For (H2H) · 8 Least Sets Against (H2H) · 9 Least Sets Against (Overall) · 10 Highest Avg Sets For (Overall) · 11 Total Wins (H2H) · 12 Matchups (H2H) · 13 Matchups (Overall) · 14 Avg Set Diff (Overall).

[unk] the default tiebreakers per sport (`defaultRankedTieBreakRules` is server-side; only its shape was captured).

## 3. Standings columns [obs]

These are the columns shown in the public standings table. They are drag-sortable (`ordering` 1..n) and picked via "Select columns".

| Enum | Acronym | Name |
|---|---|---|
| GAMES_PLAYED | GP | Games Played |
| GAMES_WON | W | Wins |
| GAMES_LOST | L | Losses |
| GAMES_TIED | T | Ties |
| GAMES_CANCELLED | C | Cancelled |
| GAMES_FORFEITED | F | Forfeits |
| POINTS_FOR | PF | Points For |
| POINTS_AGAINST | PA | Points Against |
| POINTS_DIFFERENCE | + / − | Points Differential |
| SETS_FOR | SW | Sets Won |
| SETS_AGAINST | SL | Sets Lost |
| SETS_DIFFERENCE | SD | Sets Difference |
| SETS_PLAYED | SP | Sets Played |
| SETS | SW : SL | Sets |

Default columns: GP, W, T, L, +/−. The set columns only appear when the tournament has `setsEnabled` (true for padel).
"Points" in these columns is the sport's **score unit** (goals for football, points for volleyball, games for tennis/padel [inf]). The labels come from the server per sport [unk exact values].

## 4. Statistics (`gameTeamStatIds`) [obs]

Per-game team stats entered with the score (server catalogue `gameTeamStatOptions`: name, acronym, againstName, againstSupported). Stats that a chosen tiebreaker depends on are marked "Required" and can't be removed.

## 5. Mapping to our 5 sports [inf]

| Sport | Ties? | Sets? | Typical points | Typical tiebreakers |
|---|---|---|---|---|
| Football / Futsal | yes | no | W3 T1 L0 | Points → H2H points → goal diff → goals for |
| Volleyball | no | yes | W3/W2 by set score, or W2 L1 | Points/wins → set ratio → point ratio → H2H |
| Tennis / Padel | no | yes (+ games) | W1 or W2 | Wins → H2H → set diff → game diff |

Tourny can't express "3 points for a 3-0/3-1 win, 2 for 3-2" in volleyball, except roughly via setWin/setLoss. This is a design decision for us.
