# Tourny – Steps 3 & 4: Categories and Teams

Source: a capture of the user creating the categories "Male"/"Female" and adding teams (2026-10-28), plus the `CreateDivisionForm`, `CreateBulkTeamsForm` and `DeleteDivisionDialog` code.
**[obs]** observed · **[inf]** inference.

## Categories (= "divisions" in the backend) [obs]

- A tournament always has **at least one division**. "Categories" is optional because without it there is a single, implicit default division [inf: the first division existed before any category was created].
- Create: a dialog "Create category" with just **Name** → `createDivision({tournamentId, division:{name}})`.
- Edit: rename → `editDivision({division:{id, name}})`. Delete: a confirmation dialog → `deleteDivision`.
- Each division has its own **teams, rounds and games**, and **can have its own format** (see 01-format §4: with more than one category, the Format wizard first asks which categories to update).
- The UI switches category with a selector (the "Male" button) and the URL `?divisionId=…`.

## Teams [obs]

- A team is minimal: `{ id, name, profileUrl }` (+ seed / roster / registration features, out of scope for now).
- **Bulk add**: a textarea "Paste teams or enter one team name per line" → split on newlines, trim, drop empty lines.
  - Validation: at least 1 name; **max 128 teams per category** (existing + new).
  - `createTeams({divisionId, teams:[{name}]})`.
- **If games were already generated** for that category, adding teams shows a confirmation: "Adding teams will reset the games for this category. Are you sure?" → games are regenerated or wiped.
- Delete a team: `deleteTeam` (dialog).
- The setup-progress card shows "N teams participating" (total across categories: 14 = 6 Male + 8 Female in the test).
- Rosters, team registration and invites exist but aren't needed for the mockup.

## Seeding hint (for Rounds) [obs]

The mutations `enablePreTournamentTeamRankings` / `disablePreTournamentTeamRankings` exist per division, so pre-tournament seeding is an opt-in per category. To be checked in Rounds.

## For our mockup [inf]

```
Tournament 1─* Category(name) 1─* Team(name, seed?)
Category 1─1 Format config (template, points, tiebreakers, columns)
```
- Padel/tennis doubles: a "team" = a pair. Tourny just uses a free-text name ("Rossi / Bianchi"). We could add optional player1/player2 fields.
- Reset rule: changing teams after games exist → warn and regenerate that category's games.
