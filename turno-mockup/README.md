# Turno · mockup navigabile della sezione Fasi

Mockup HTML che usa la **logica del mockup** (`mockup/engine.js`) con la **UX e la grafica di Turno** definite nel canvas di design (tavole W9/W10 mappa + tabellone fase, W5/W6 tabellone a menu e classifica tra gironi, P2 gironi con drag & drop, W2 nuova fase).

Apri `index.html` nel browser (serve la connessione: React, htm e il font Manrope arrivano da CDN). I dati restano nel `localStorage` del browser; "Ripristina esempio" nella sidebar riporta al torneo di prova (padel, 9 coppie, Gironi → Oro + Argento).

## Struttura

| File | Cosa contiene |
|---|---|
| `index.html` | File unico generato da `build.py` (non modificarlo a mano) |
| `src/engine.js` | Copia di `mockup/engine.js` con una sola estensione (vedi sotto) |
| `src/i18n.js` | Etichette italiane: rinomina le mappe esportate dall'engine e traduce le stringhe che genera (ordinali, turni, messaggi) |
| `src/app.js` | UI React + htm: sidebar Turno, mappa torneo, finestra "Tabellone fase", risultati, classifiche, programma |
| `src/style.css` | Stile Turno |
| `engine-estensione.diff` | Differenza tra `src/engine.js` e `mockup/engine.js` |

Dopo una modifica in `src/`: `python3 build.py`.

## Estensione dell'engine: primo turno a mano (BYE scelti)

Il mockup assegna sempre i BYE alle prime teste di serie. Per poterli scegliere, `buildSE` legge un campo opzionale `phase.config.layout`:

- array lungo una potenza di 2 (≥ numero di entranti, ≤ 128);
- ogni cella è l'indice di un entrante (0-based, ognuno una sola volta) oppure `null` = BYE;
- se manca o non è valido si usa l'ordine standard delle teste di serie, come prima.

Il resto del motore (classifiche, conferme, invalidazione a cascata, piazzamenti) non cambia. `TE.validLayout(layout, n)` è esportata per la UI. La UI impedisce partite del primo turno con due BYE.

## Come la UI usa il modello del mockup

- **Chi entra** in una fase è sempre il suo connettore: la UI scrive un selettore per posizione (`{fromPhase, ranking, positions:[p]}`) con `seeding: SELECTOR_ORDER`, così l'ordine dei posti è esplicito.
- **Gironi successivi**: composizione manuale con `distribution: MANUAL` + `manualPools`; `config.poolSizes` (solo UI) conserva i posti vuoti di ogni girone.
- **Conflitti** (stessa squadra presa due volte, "1° del girone" e "migliori prime" insieme…): prima di salvare la UI prova la modifica su una copia e usa `validateGraph`; se nasce un errore la posizione è disattivata e il motivo è nel tooltip.
- Americana nascosta (rimandata).
