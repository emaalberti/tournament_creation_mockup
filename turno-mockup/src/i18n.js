/* Italian display layer. engine.js stays untouched: we only relabel its exported maps
   and translate the strings it generates (ordinals, round names, placeholders, messages) at render time. */
(function () {
  'use strict';
  Object.assign(TE.PHASE_TYPES.GROUPS, { label: 'Gironi', desc: 'Le squadre giocano contro quelle del proprio girone. Classifiche: per girone, tra gironi, generale.' });
  Object.assign(TE.PHASE_TYPES.KNOCKOUT, { label: 'Eliminazione diretta', desc: 'Fuori dopo una sconfitta, o dopo due con tabellone perdenti. Classifica: piazzamenti finali.' });
  Object.assign(TE.PHASE_TYPES.AMERICANO, { label: 'Americana', desc: 'I giocatori cambiano compagno a ogni turno. Rimandata.' });
  Object.assign(TE.DISTRIBUTIONS, { SNAKE: 'A serpentina (teste di serie)', SEQUENTIAL: 'In ordine di testa di serie', MANUAL: 'Manuale', AVOID_REMATCH: 'Evita le rivincite' });
  Object.assign(TE.STATUS_LABEL, { DRAFT: 'Da configurare', READY: 'In attesa', IN_PROGRESS: 'In corso', COMPLETE: 'Da confermare', CONFIRMED: 'Confermata' });
  const sp = { FOOTBALL: ['Calcio', ['campo', 'campi'], ['gol', 'gol']], FUTSAL: ['Calcio a 5', ['campo', 'campi'], ['gol', 'gol']], VOLLEYBALL: ['Pallavolo', ['campo', 'campi'], ['punto', 'punti']], TENNIS: ['Tennis', ['campo', 'campi'], ['game', 'game']], PADEL: ['Padel', ['campo', 'campi'], ['game', 'game']] };
  Object.entries(sp).forEach(([k, [label, space, unit]]) => Object.assign(TE.SPORTS[k], { label, space, unit }));
  const rules = {
    POINTS: ['Punti', 'PT'], WINS: ['Vittorie', 'V'], MATCHUPS: ['Esiti', '2×V + N'], SCORE_DIFF: ['Differenza punteggio', 'Fatti − subiti'], SCORE_FOR: ['Più fatti', 'Fatti'],
    SCORE_AGAINST_LEAST: ['Meno subiti', 'Subiti (minimo)'], SCORE_RATIO: ['Quoziente punteggio', 'Fatti ÷ subiti'], SET_DIFF: ['Differenza set', 'Set vinti − persi'], SET_RATIO: ['Quoziente set', 'Set vinti ÷ persi'],
    SETS_FOR: ['Più set vinti', 'Set vinti'], SETS_AGAINST_LEAST: ['Meno set persi', 'Set persi (minimo)'],
  };
  Object.entries(rules).forEach(([k, [name, eq]]) => Object.assign(TE.RULES[k], { name, eq }));
  Object.assign(TE.COLUMNS, { GP: 'Giocate', W: 'Vinte', T: 'Pareggiate', L: 'Perse', C: 'Annullate', F: 'Forfait', PF: 'Fatti', PA: 'Subiti', PD: 'Differenza', SF: 'Set vinti', SA: 'Set persi', SD: 'Differenza set', PTS: 'Punti' });
  // short Italian column headers (keys stay the engine's)
  window.COL_SHORT = { GP: 'G', W: 'V', T: 'N', L: 'P', C: 'A', F: 'F', PF: 'GF', PA: 'GS', PD: 'DG', SF: 'SV', SA: 'SP', SD: 'DS', PTS: 'PT' };

  const roundOf = (n) => ({ 4: 'Semifinali', 8: 'Quarti', 16: 'Ottavi', 32: 'Sedicesimi', 64: 'Trentaduesimi', 128: 'Sessantaquattresimi' }[n] || `Turno a ${n}`);
  const O = '(\\d+)(?:st|nd|rd|th)';
  const re = (s, f) => new RegExp(s.replace(/#O/g, O), f || 'g');
  const MSG = [
    [re('^(.+) takes teams from (.+), which comes after it\\. Phases can only take from earlier phases\\.$'), '$1 prende squadre da $2, che viene dopo. Una fase può prendere solo da fasi precedenti.'],
    [re('^(.+) ranks (players|teams) but (.+) needs (players|teams)\\.$'), (m, a, k, b, k2) => `${a} classifica ${k === 'players' ? 'giocatori' : 'squadre'} ma ${b} richiede ${k2 === 'players' ? 'giocatori' : 'squadre'}.`],
    [re('^(.+) has no ranking “(.+)”\\.$'), '$1 non ha la classifica “$2”.'],
    [re('^A selector from (.+) has no positions\\.$'), 'Una selezione da $1 non ha posizioni.'],
    [re('^A selector points to a phase that no longer exists\\.$'), 'Una selezione punta a una fase che non esiste più.'],
    [re('^(.+): “(.+)” has only (\\d+) places; extra positions are ignored\\.$'), '$1: “$2” ha solo $3 posti; le posizioni in più sono ignorate.'],
    [re('^“(.+)” is used twice \\((.+) and (.+)\\)\\.$'), '“$1” è usato due volte ($2 e $3).'],
    [re('^Mixing “Overall” with group places of (.+) can select the same team twice\\.$'), 'Mescolare la classifica generale con i posti nei gironi di $1 può selezionare due volte la stessa squadra.'],
    [re('^“#O of a group” and “best #O-placed” from (.+) can select the same team twice\\.$'), '“$1° del girone” e “migliori $2°” di $3 possono selezionare due volte la stessa squadra.'],
    [re('^#O-placed teams of (.+) are taken both by group and as “best #O-placed” in different phases\\.$'), 'Le $1° classificate di $2 sono prese sia per girone sia come “migliori $3°” in fasi diverse.'],
    [re('^(.+) is split by “Overall” and by group places in different phases; the same team could be taken twice\\.$'), '$1 è divisa per classifica generale e per posti nei gironi in fasi diverse: la stessa squadra potrebbe essere presa due volte.'],
    [re('^(\\d+) of (\\d+) (players|teams) in (.+) do not continue to another phase\\.$'), (m, a, b, k, p) => `${a} ${k === 'players' ? 'giocatori' : 'squadre'} su ${b} di ${p} non proseguono in un’altra fase.`],
    [re('^Choose which side forfeits\\.$'), 'Scegli chi dà forfait.'],
    [re('^Enter both scores\\.$'), 'Inserisci entrambi i punteggi.'],
    [re('^Scores add up to (\\d+), not (\\d+)\\.$'), 'I punteggi sommano $1, non $2.'],
    [re('^Enter at least one set\\.$'), 'Inserisci almeno un set.'],
    [re('^A set cannot end level\\.$'), 'Un set non può finire in parità.'],
    [re('^Unusual set score (.+)\\.$'), 'Punteggio del set insolito: $1.'],
    [re('^Sets are level; this sport needs a winner\\.$'), 'Set in parità: serve un vincitore.'],
    [re('^Best of (\\d+): the winner usually takes (\\d+) sets\\.$'), 'Al meglio dei $1: di solito chi vince ne prende $2.'],
    [re('^Knockout games need a winner\\.$'), 'Le partite a eliminazione diretta richiedono un vincitore.'],
    [re('^This sport does not allow draws\\.$'), 'Questo sport non prevede il pareggio.'],
    [re('^This phase has not started: earlier phases must be confirmed first\\.$'), 'La fase non è iniziata: prima vanno confermate le fasi precedenti.'],
    [re('^Every game in this phase needs a result first\\. Cancel or forfeit games that will not be played\\.$'), 'Tutte le partite della fase devono avere un risultato. Annulla o assegna a forfait quelle che non si giocano.'],
    [re('^Order the tied teams first\\.$'), 'Prima ordina le squadre a pari merito.'],
    [re('^This game cannot be played yet\\.$'), 'Questa partita non si può ancora giocare.'],
  ];
  const TR = [
    [/Grand Final \(reset\)/g, 'Finalissima (bella)'], [/Grand Final/g, 'Finalissima'],
    [/Upper Final/g, 'Finale vincenti'], [/Upper Round (\d+)/g, 'Vincenti · turno $1'],
    [/Lower Final/g, 'Finale perdenti'], [/Lower Round (\d+)/g, 'Perdenti · turno $1'],
    [re('#O Place Semis'), '$1° posto · semifinali'], [re('#O Place Round of (\\d+)'), (m, a, b) => `${a}° posto · ${roundOf(+b).toLowerCase()}`], [re('#O Place'), '$1° posto'],
    [/Semi Finals/g, 'Semifinali'], [/Quarter Finals/g, 'Quarti'], [/Round of (\d+)/g, (m, n) => roundOf(+n)],
    [/Final placings/g, 'Piazzamenti finali'], [/Players by points won/g, 'Giocatori per punti'], [/Overall \(per-game averages\)/g, 'Generale'], [/Each group/g, 'Ogni girone'],
    [/\bFinal\b/g, 'Finale'], [/Winner of (\d+)/g, 'Vincente #$1'], [/Loser of (\d+)/g, 'Perdente #$1'],
    [/\bConsolation\b/g, 'Consolazione'], [/\bTBD\b/g, 'Da definire'], [/\bRound (\d+)\b/g, 'Turno $1'], [/ · place (\d+)/g, ' · posto $1'],
    [re('Tied for #O'), 'Pari merito al $1° posto'], [re('Best #O-placed'), 'Migliori $1°'], [re('#O best #O'), '$1° tra le $2°'],
    [/\bGroup ([A-Z])\b/g, 'Girone $1'], [re('#O\\b'), '$1°'],
  ];
  function T(s) {
    if (s == null) return '';
    let out = String(s);
    for (const [r, v] of MSG) { r.lastIndex = 0; if (r.test(out)) { r.lastIndex = 0; out = out.replace(r, v); break; } }
    for (const [r, v] of TR) out = out.replace(r, v);
    return out;
  }
  window.T = T;
  window.ordIt = (n) => `${n}°`;
})();
