# Tourny – Step 1: Format

Source: Tourny JS bundles (chunks `6800-*`, `2161-*`, the page chunk with `CreateFormatForm`) plus a network capture of the `createFormat` GraphQL mutations taken while the user switched formats on 2026-10-28.
Legend: **[obs]** observed in the code or traffic · **[inf]** inference.

## 1. Building blocks: round types [obs]

A format is an ordered list of **rounds**, linked by **transitions** (`previousRoundNumber → nextRoundNumber`).

| Round type | Enum | Kind | Per-round options (defaults) |
|---|---|---|---|
| Round Robin (pools) | `ROUND_ROBIN_ROUND` | group stage | `gamesRequireWinners: false` (draws allowed) |
| Swiss ladder | `SWISS` | group stage | `gamesRequireWinners: false` |
| Season (groups, leagues) | `SEASON` | group stage | `gamesRequireWinners: false` |
| Single elimination | `SINGLE_ELIMINATION_ROUND` | bracket | `placements: [1]` (which places are played off) |
| Double elimination | `DOUBLE_ELIMINATION_ROUND` | bracket | `trueDoubleEliminationRound: true` (grand-final reset) |
| Custom bracket | `CUSTOM_BRACKET` | bracket | `gameStructureId` (predefined bracket structure) |

## 2. Format templates [obs]

The templates are hard-coded in the frontend. The backend stores only `formatId` plus the generated rounds.

**Tournament** type (shown in this order, with the sport's recommended template moved to the top):

| # | Name | Rounds |
|---|---|---|
| 1 | Round Robin to Single Elimination ⭐ | Pool Play (RR) → Playoffs (SE) |
| 2 | Round Robin to Double Elimination | Pool Play (RR) → Playoffs (DE) |
| 3 | Round Robin | Pool Play (RR) |
| 4 | Single Elimination | Bracket (SE) |
| 5 | Double Elimination | Bracket (DE) |
| 6 | Swiss Ladder | Ladder (Swiss) |
| 7 | Swiss Ladder to Single Elimination | Ladder → Playoffs (SE) |
| 8 | Swiss Ladder to Double Elimination | Ladder → Playoffs (DE) |
| 9 | Round Robin to Power Pools to Single Elimination | Pool Play (RR) → Power Pools (RR) → Playoffs (SE) |
| 10 | Custom Bracket | Bracket (custom) |
| 11 | Round Robin to Custom Bracket | Pool Play (RR) → Playoffs (custom) |
| – | Ontario Provincials 6/8/10/12/13/16 | Baseball only (filtered by `sports`) |

**League** type: Season · Season → SE · Season → DE · Season → Custom Bracket.

⭐ The recommended format is the same for every in-scope sport that Tourny has (Soccer/Football, Volleyball, Tennis, Padel): Round Robin to Single Elimination.

## 3. Sport config relevant to us [obs]

| Our sport | Tourny enum | Game label | Space label | Recommended scheduling |
|---|---|---|---|---|
| Football | `SOCCER` (`FOOTBALL` = American football) | game | field | Regular |
| Futsal | — (not in Tourny) | [inf] game | [inf] court | [inf] Regular |
| Volleyball | `VOLLEYBALL` (+ `BEACH_VOLLEYBALL`) | game | court | Regular |
| Tennis | `TENNIS` | game | court | Regular |
| Padel | `PADEL` | game | court | **Dynamic** |

The labels "match/matches" are used only for Badminton, Cricket, Pickleball and Table Tennis.

## 4. Wizard flow [obs]

Steps (`state.step`): `divisions` → `select` → `standings` → `brackets` → `custom-format` → `review`.

1. **divisions**: shown only if the event has more than one category AND already has a format. The user picks which categories to update. Each category (division) can have its own format.
2. **select**: pick a template. On the first selection, the tournament's default tiebreakers and stats are loaded.
   - First round is RR / Swiss / Season → go to `standings` (round 1).
   - First round is SE / DE / Custom → go to `brackets` (round 1).
   - Custom template → go to `custom-format`.
3. **standings** (round 1, group stage): stats, tiebreakers and points (covered in Step 2: Standings).
   If the format has a playoff bracket → go to `brackets` for round 2.
4. **brackets**: for a playoff round, asks **"How many brackets?" (1–5)** and stores it as `numberOfBrackets`. For a bracket-only format, the user picks stats here. For a custom format, the user picks the bracket structure.
5. **review**: preview plus a "What's next" list: Teams → Generate games → Schedule.

## 5. Flights logic [obs]

If `numberOfBrackets = N > 1`, every playoff bracket round is cloned N times:
- names `A Flight`, `B Flight`, … (one letter per index)
- numbers `round.number + i`
- one transition per flight, all from the same previous round (the pool stage feeds every flight).

Example seen live: RR→SE with 5 brackets ⇒ `Pool Play`, then `A Flight` … `E Flight`.

## 6. Save payload `createFormat` [obs]

```
tournamentId, formatId, divisionIds[]
rounds[]: { name, number, type, roundRobinUpdates | swissUpdates | seasonUpdates
           | singleEliminationUpdates{placements[]} | doubleEliminationUpdates{trueDoubleEliminationRound}
           | customBracketUpdates{gameStructureId} }
transitions[]: { previousRoundNumber, nextRoundNumber }
gamePoints: { win, tie, loss, cancel, forfeitWin, forfeitLoss, setWin, setLoss }   (ints)
rankedTieBreakRules[]: { rank, type, tieBreakRuleId }
standingsColumns[]: { type, ordering }
gameTeamStatIds[]   (plus a special "awarded points" stat when pointsSystem = AwardedPoints)
```
The response returns `isFormatComplete`, `hasFormat`, rounds and games, so the format can be changed later ("You can always come back and change your format later").
