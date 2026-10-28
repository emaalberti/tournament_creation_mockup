# Tourny – Setup guide (tourny.ca/guides): additional rules

Pages read on 2026-10-28: getting-started/rounds, formats/round-robin, formats/round-robin-with-playoffs, formats/single-elimination, formats/double-elimination, results/submit, results/transitions, scheduling/generated, scheduling/dynamic-assignment, scheduling/venues.
Only what the platform notes (01–04) did NOT already cover is listed here.

## Lifecycle rules
- Setup order: Create event → Format → Teams → Rounds → Schedule → Publish. You pay only to publish.
- **Results can be submitted only after publishing.**
- Changing the **format** clears all existing games.
- Updating a round may clear the games of later rounds.
- **Placeholder teams** can be used to build pools and schedules, then renamed later. The games keep the new name.

## Results
- Each team gets a score, plus any tracked stats (e.g. kills, digs, aces for volleyball). Edit with "Edit result".
- **Cancel game** → no points for either team. **Forfeit game** → a loss for the forfeiting team and a win for the other (the points from `gamePoints.forfeitWin/forfeitLoss`).
- Team managers and players can be allowed to submit, with optional approval (`scoreSubmissionPermission`, `scoreApprovalRequirement` on the tournament).
- Each saved result updates the schedule, standings and brackets immediately. In elimination brackets, winners and losers move automatically.

## Transition between rounds
- Only possible when **every game in the round has a result** (unplayed games must be cancelled or forfeited).
- From the Standings tab: "Ready to start the playoffs?" → **Confirm bracket** (or **Confirm pools** before power pools). Ties must be resolved first (see 04-rounds §B+).
- Each category advances on its own.
- Editing an earlier result after confirmation → standings and advancement are recalculated → **the following rounds are reset**.

## Brackets
- Any team count is supported. For a non-power-of-two count, early rounds (pre-quarterfinals) are added. **Seeding on** = top seeds spread out so they meet late.
- Double elimination: upper/lower bracket, every team plays at least 2 games, automatic advancement.

## Venues
- Venue = {name, address, N spaces}. Spaces can be renamed ("Main Court").
- Removing a venue or space → its games become **unscheduled** (they aren't deleted).

## Scheduling: two modes
**1. Assigned courts & times ("Regular", generated)**
- Per round: a **game length**.
- **Time slots**: blocks (e.g. Fri 10:00–17:00), each with a selected set of spaces.
- A space can be **restricted** (gear icon) to specific categories, rounds or pools (e.g. Pool A → Court 1).
- "Generate schedule" fits every game into the slots. If some don't fit → "incomplete schedule" (lengthen the slots, add spaces or shorten the games, then regenerate).
- Then drag and drop in the calendar, or edit times in the list. Regenerate at any time.
- Not documented: rest time between games, ordering logic, double-booking checks → our design decisions.

**2. Next available court ("Dynamic", recommended by Tourny for padel)**
- No fixed times. The organiser **orders the games in a queue**. The first N fill the N selected courts.
- When a result is submitted → the game moves to "recent", and the next game in the queue takes the free court.
- Toggle **automatic scheduling** off → courts stay open, and games are dragged onto courts manually.
- Courts can be reassigned and the queue reordered at any time. For round robins, reorder so a team's games are spread out.
- Not documented: a rest-time rule. We should add a "don't assign a team that just finished" rule.
