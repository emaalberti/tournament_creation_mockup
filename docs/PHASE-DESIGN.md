# Design: fasi componibili (black box)

Versione 0.2 · 2026-10-28 · Stato: **implementato nel mockup** (`mockup/engine.js`, testato in `tests/engine.test.js`). Le scelte fatte durante l'implementazione sono nel §14.
Sostituisce i formati fissi della [SPEC](SPEC.md) §4 con un modello in cui l'organizzatore **compone** il torneo collegando fasi. I template di oggi (RR → SE, ecc.) restano solo come scorciatoie che creano un grafo già pronto.

---

## 1. Obiettivo

- Poter collegare **un numero qualsiasi di fasi**, per esempio gironi → gironi rimescolati → gironi → eliminazione.
- Ogni fase è una **black box**: riceve partecipanti e impostazioni, applica le proprie regole, restituisce delle **classifiche**.
- Per collegare una fase a un'altra basta conoscere il **tipo** della fase di origine, perché è il tipo a dire quali classifiche esistono.

## 2. Decisioni prese

| # | Tema | Decisione |
|---|---|---|
| D1 | Punti dalla fase precedente | Ogni fase ha un flag `inheritPoints` (sì/no) |
| D2 | Classifica di un'eliminazione diretta | **Nessun pari merito strutturale.** Le squadre eliminate nello stesso turno si ordinano con i **tiebreaker della fase**, calcolati sulle partite della fase |
| D3 | Tipo di partecipante | Ogni fase dichiara il tipo che accetta (`TEAM` / `PLAYER`). L'Americano accetta solo giocatori ed è un caso isolato, **fuori dalla v1** |
| D4 | Quando parte una fase | **Sempre e solo** quando le fasi di origine sono finite e confermate. I **placeholder** però esistono da subito (partite e calendario si preparano in anticipo) |
| D5 | Numeri che non tornano | Si riempie con dei **BYE** |

---

## 3. Concetti

| Concetto | Definizione |
|---|---|
| **Categoria** | Contiene un grafo di fasi (ogni categoria ha il suo) |
| **Fase** | Una black box di un certo tipo (§5) con impostazioni, partecipanti e partite |
| **Connettore** | L'arco del grafo: decide **chi** entra nella fase di destinazione (selettori) e **in che ordine** (seed) |
| **Partecipante** | Una squadra (o un giocatore, solo per l'Americano). Dentro una fase può essere reale o un **placeholder** |
| **Placeholder** | Un posto non ancora assegnato, es. "2° Girone A (Fase 1)". Diventa una squadra reale quando la fase di origine viene confermata |
| **Classifica** | L'output di una fase: righe ordinate di partecipanti, con uno stato (§6) |
| **BYE** | Posto vuoto: chi lo incontra passa il turno (eliminazione) o semplicemente non gioca quella partita (gironi) |

Il grafo è **orientato e senza cicli**. Una fase può avere più connettori in ingresso (es. prende sia dalla Fase 1 che dalla Fase 2) e più in uscita (es. alimenta un Gold e un Silver).

---

## 4. Interfaccia della fase

Ogni tipo di fase implementa la stessa interfaccia. Il resto del sistema non conosce i dettagli interni.

```ts
interface PhaseType<Config> {
  type: 'GROUPS' | 'KNOCKOUT' | 'AMERICANO'   // 3 macro-categorie (§5)
  participantKind: 'TEAM' | 'PLAYER'                                  // D3

  defaultConfig(sport): Config
  validateConfig(config, entrantCount): Issue[]

  // Quanti posti ha la fase con queste impostazioni (es. tabellone da 8)
  capacity(config, entrantCount): number

  // Da lista ordinata di partecipanti (reali o placeholder) a struttura:
  // gironi, primo turno del tabellone, ecc. Mette i BYE dove servono (D5)
  distribute(entrants: Entrant[], config): Structure

  // Partite con riferimenti a partecipanti, placeholder o "vincente/perdente di #N"
  generateGames(structure, config): Game[]

  // Catalogo delle classifiche che questo tipo espone (§6)
  rankingCatalog(structure): RankingDescriptor[]
  ranking(phase, rankingId, ctx): Ranking

  isComplete(phase): boolean        // tutte le partite con risultato, annullate o forfeit
}
```

`Entrant = { slotId, seed, source: Placeholder | ParticipantId }`. Dentro la fase i partecipanti sono sempre `slotId`: la fase non sa (e non le serve sapere) se lo slot contiene già una squadra reale. Questo rende possibile generare partite e calendario prima che la fase parta (D4).

---

## 5. Tipi di fase (v1)

Tre macro-categorie: **Gironi**, **Eliminazione diretta** (singola o doppia, è un'impostazione) e **Americano**.

### 5.1 GROUPS (gironi all'italiana)

| Impostazione | Valori |
|---|---|
| `pools` | Numero di gironi |
| `distribution` | `SNAKE` · `SEQUENTIAL` · `MANUAL` · `AVOID_REMATCH` (§7.3) |
| `games` | `ALL_ONCE` · `ALL_TWICE` (andata e ritorno) · `N_PER_TEAM` |
| `crossovers` | Coppie di gironi che si incrociano |
| `inheritPoints` | Sì/No (D1, §6.4) |
| `tiebreakers` | Lista ordinata `{regola, ambito: OVERALL | H2H}` (default dello sport) |

BYE: un girone con un posto vuoto ha semplicemente meno squadre. Quella squadra "fantasma" non genera partite.

**Classifiche esposte:**
| Id | Contenuto |
|---|---|
| `pool:<A>` | Classifica di un girone |
| `overall` | Tutte le squadre, confrontate su **medie per partita** |
| `cross:<k>` | Le k-esime di ogni girone, confrontate tra loro su medie per partita |

### 5.2 KNOCKOUT (eliminazione diretta)

| Impostazione | Valori |
|---|---|
| `eliminations` | `1` = eliminazione singola · `2` = doppia (tabellone vincenti + perdenti) |
| `seeding` | `STANDARD` (1–N, 2–N-1…) · `MANUAL` (scambio al primo turno) |
| `placements` | Solo con 1 eliminazione: posizioni giocate davvero, `[1]`, `[1,3]`, `[1,3,5,7]`… |
| `consolations` | Solo con 1 eliminazione: partite extra libere (vincente/perdente di #N) |
| `bracketReset` | Solo con 2 eliminazioni: se vince la squadra del tabellone perdenti, si gioca la bella |
| `tiebreakers` | Per ordinare gli eliminati nello stesso turno (D2) |

BYE: il tabellone si porta alla potenza di 2 successiva e i BYE vanno ai seed più alti.

**Classifica esposta: `final`**, una sola, completa e senza pari merito:
1. Si parte dalle posizioni **decise sul campo**: 1° e 2° dalla finale, più tutte le posizioni giocate in `placements`.
2. Le altre squadre si raggruppano per **turno di eliminazione** (eliminate prima = più in basso).
3. Dentro ogni gruppo si ordina con i **tiebreaker della fase** (D2), calcolati sulle partite della fase. Per un'eliminazione i tiebreaker utili sono soprattutto differenza punti/set e punti fatti.
4. Se restano pari: seed d'ingresso; se ancora pari, ordine dato dall'organizzatore alla conferma (§8).

### 5.3 KNOCKOUT con 2 eliminazioni

Non è un tipo a sé: è KNOCKOUT con `eliminations = 2`.
**Classifica `final`:** 1° e 2° dalla finale; poi le squadre per **turno di eliminazione nel tabellone perdenti**, ordinate con i tiebreaker della fase come in 5.2.

### 5.4 Fuori dalla v1

- **SWISS**: espone `overall`. Si aggiunge senza toccare il resto.
- **AMERICANO**: `participantKind = PLAYER`, espone `overall` di giocatori. Per collegarlo a una fase a squadre serve un connettore con trasformazione "coppie" (1°+N°, 2°+N-1°…), già sperimentato nel mockup.

---

## 6. Classifiche

### 6.1 Contratto

```ts
interface Ranking {
  id: string                 // 'pool:A', 'overall', 'cross:2', 'final'
  label: string              // 'Girone A', 'Classifica generale', '2e classificate', 'Classifica finale'
  status: 'PROVISIONAL' | 'COMPLETE' | 'CONFIRMED'
  rows: { position: number, slotId: string, tiedWith?: string[] }[]
}
```

- **PROVISIONAL**: la fase non è finita; posizioni indicative.
- **COMPLETE**: fase finita, ma possono esserci pareggi non risolti (`tiedWith`).
- **CONFIRMED**: l'organizzatore ha risolto i pareggi e confermato. **Solo** una classifica confermata può riempire i placeholder a valle.

### 6.2 Calcolo

Uguale per tutti i tipi: statistiche per partecipante (G, V, N, P, fatti, subiti, set…), poi i tiebreaker in ordine. L'ambito H2H si ricalcola ogni volta sul sottogruppo ancora a pari (mini-classifica). È l'algoritmo già presente nell'engine (`rankIds`).

### 6.3 Medie per partita

Le classifiche che confrontano squadre di gironi diversi (`overall`, `cross:<k>`) usano le **medie per partita**, così gironi di dimensioni diverse sono confrontabili (decisione #7 della SPEC).

### 6.4 Punti ereditati (D1)

Con `inheritPoints = true`, le statistiche di partenza di ogni squadra nella fase sono quelle che aveva **nella classifica da cui è stata selezionata**. Poi si sommano le partite della nuova fase.
- Se quella fase di origine aveva a sua volta ereditato, i valori sono già cumulati: con una catena di gironi i punti si trascinano fino in fondo.
- Le medie per partita usano partite totali (ereditate + nuove).
- L'H2H considera solo le partite della fase corrente.

---

## 7. Connettore

### 7.1 Selettori

```ts
interface Selector {
  fromPhase: PhaseId
  ranking: string          // id dal catalogo del tipo della fase di origine: 'pool:*', 'overall', 'cross:2', 'final'
  positions: number[]      // es. [1,2]; con 'pool:*' vale per ogni girone
}
interface Connector {
  to: PhaseId
  selectors: Selector[]    // in ordine: l'ordine decide il seed d'ingresso
  seeding: 'SELECTOR_ORDER' | 'BY_SOURCE_POSITION'
}
```

Esempi di selettori:
- `pool:*` posizioni `[1,2]` → "1° e 2° di ogni girone"
- `cross:3` posizioni `[1]` → "migliore delle terze"
- `final` posizioni `[5..8]` → "dal 5° all'8° dell'eliminazione"

Un connettore può pescare da **più fasi** (es. i 4 eliminati del Gold e i primi 4 del Silver insieme in un nuovo girone).

### 7.2 Seed d'ingresso

- `SELECTOR_ORDER`: seed = ordine in cui i posti compaiono nella lista dei selettori.
- `BY_SOURCE_POSITION`: prima tutti i primi, poi tutti i secondi… (con `pool:*`, ordinati tra loro con la classifica `cross`). È il default per gironi → eliminazione.

### 7.3 Distribuzione e placeholder (D4)

Il connettore produce subito la lista ordinata dei **placeholder** ("1° Girone A"…), e la fase di destinazione li distribuisce **subito**. Così partite e calendario esistono prima che la fase parta.

| Distribuzione | Si calcola sui placeholder? |
|---|---|
| `SNAKE`, `SEQUENTIAL`, `STANDARD` (tabellone), `MANUAL` | **Sì.** Le partite mostrano "1° Girone A – 2° Girone B" |
| `AVOID_REMATCH`, sorteggio casuale | **No**, servono le squadre reali. Si generano gironi e partite con posti neutri ("Girone A – posto 1") e si fa la distribuzione vera **alla conferma** della fase di origine. Il calendario resta valido perché cambiano solo i nomi nei posti |

### 7.4 BYE (D5)

Se i posti selezionati sono meno della capacità della fase, i posti restanti diventano BYE. Vanno sempre ai seed più bassi, così i BYE avvantaggiano i seed più alti.

### 7.5 Controlli del builder

Errori bloccanti:
- un ciclo nel grafo
- la stessa posizione presa da due connettori (una squadra in due posti)
- un selettore verso una classifica che non esiste per quel tipo di fase (es. `cross:2` da un'eliminazione)
- un tipo di partecipante che non combacia (D3)

Avvisi (non bloccanti):
- posizioni di una fase di origine non prese da nessun connettore. Quelle squadre finiscono lì il torneo: va bene, ma l'organizzatore deve saperlo
- molti BYE rispetto alla capacità

---

## 8. Ciclo di vita di una fase

```
DRAFT ──(connettori + impostazioni validi)──▶ READY (placeholder, partite, calendario)
READY ──(tutte le fasi di origine CONFIRMED)──▶ IN_PROGRESS (placeholder → squadre reali)
IN_PROGRESS ──(tutte le partite chiuse)──▶ COMPLETE
COMPLETE ──(pareggi risolti + conferma)──▶ CONFIRMED
```

**Conferma** (uguale per ogni tipo di fase):
1. Si calcolano le classifiche del catalogo.
2. Si mostrano solo i pareggi **rilevanti**, cioè quelli che cambiano chi va in quale posto a valle.
3. L'organizzatore li ordina a mano.
4. Anteprima delle fasi a valle con i nomi reali.
5. Conferma: i placeholder diventano squadre; le distribuzioni dinamiche (§7.3) vengono calcolate; le fasi a valle passano a IN_PROGRESS.

## 9. Invalidazione a cascata

| Evento | Effetto |
|---|---|
| Modifico un risultato in una fase CONFIRMED | La fase torna COMPLETE; **tutte** le fasi a valle (ricorsivamente) tornano READY: risultati cancellati, posti di nuovo placeholder |
| Modifico impostazioni o distribuzione di una fase | Le sue partite si rigenerano; le fasi a valle tornano READY |
| Modifico un connettore | La fase di destinazione e tutto ciò che sta a valle tornano READY |
| Aggiungo o tolgo squadre nella categoria | Le fasi senza fasi di origine si rigenerano; il resto a cascata |

Ogni azione con effetti a valle chiede conferma e **dice quante partite verranno azzerate**.

---

## 10. Modello dati (indicativo)

| Tabella | Campi principali |
|---|---|
| `phase` | id, category_id, type, name, order, config (JSON), status, inherit_points |
| `phase_slot` | id, phase_id, seed, placeholder_label, participant_id (null finché non confermato) |
| `phase_structure` | phase_id, group/round, slot_id, posizione (gironi o tabellone) |
| `connector` | id, to_phase_id, seeding |
| `connector_selector` | connector_id, order, from_phase_id, ranking_id, positions |
| `tie_order` | phase_id, tie_key, ordered_slot_ids |
| `phase_ranking_snapshot` | phase_id, ranking_id, rows (JSON), confermata il |
| `game` | come oggi, con home/away che puntano a `phase_slot` o a "vincente/perdente di #N" |

Lo snapshot salvato alla conferma rende la catena stabile: le fasi a valle leggono lo snapshot, non ricalcolano la fase di origine.

## 11. Dall'engine attuale

| Oggi (`engine.js`) | Nel nuovo modello |
|---|---|
| `TEMPLATES` + `applyFormat` | Template = grafi pronti; `applyFormat` crea fasi + connettori |
| `round.type` RR/SE/DE/AM | Registro dei 3 tipi di fase con l'interfaccia del §4 (SE e DE = KNOCKOUT con 1 o 2 eliminazioni) |
| `fromRoundId` (solo dal round 1) | Connettori da qualsiasi fase, anche più di una |
| Slot `POOL / OVERALL / CROSS` | Selettori `{fromPhase, ranking, positions}` |
| `poolStandings`, `overallStandings`, `crossRanking` | `ranking('pool:A' / 'overall' / 'cross:k')` della fase GROUPS |
| Nessuna classifica per SE/DE | Nuova classifica `final` per KNOCKOUT (§5.2, §5.3) |
| `confirmAdvancement`, `relevantTies`, `unconfirm` | Conferma generica per fase + invalidazione nel grafo |
| `buildSE`, `buildDE`, `snakePools`, `rankIds`, medie | **Riutilizzati** così come sono |

Piano di refactor:
1. Interfaccia e registro dei tipi; GROUPS e KNOCKOUT riusando le funzioni esistenti.
2. Classifica `final` per KNOCKOUT (1 e 2 eliminazioni).
3. Connettori, selettori e placeholder; conferma e invalidazione generiche.
4. `inheritPoints`, distribuzioni dinamiche (`AVOID_REMATCH`), BYE.
5. I template di oggi ricreati come grafi; tutti i test attuali devono continuare a passare.
6. Format builder nel mockup: lista di fasi, tipo, impostazioni, connettori con selettori, anteprima del grafo.

## 12. Esempi

**A. Gironi a ripetizione + finale**
```
Fase 1  GROUPS 4 gironi, ALL_ONCE
   └─ [overall, 1..16] ──▶ Fase 2  GROUPS 4 gironi, AVOID_REMATCH, inheritPoints = sì
          └─ [overall, 1..16] ──▶ Fase 3  GROUPS 2 gironi, SNAKE, inheritPoints = sì
                 └─ [pool:*, 1..2] ──▶ Fase 4  KNOCKOUT placements [1,3]
```

**B. Gold e Silver (i flight di oggi)**
```
Fase 1 GROUPS 3 gironi
   ├─ [pool:*, 1] + [cross:2, 1] ──▶ Gold   KNOCKOUT
   └─ [cross:2, 2..3] + [pool:*, 3] ──▶ Silver KNOCKOUT
```

**C. Chi esce subito non va a casa**
```
Fase 1 KNOCKOUT 16 squadre
   └─ [final, 9..16] ──▶ Consolation GROUPS 2 gironi, ALL_ONCE
```
(gli eliminati al primo turno sono 9°–16° della classifica `final`, ordinati coi tiebreaker della fase, D2)

## 13. Aperto

- Builder: per il primo rilascio bastano lista + form (così è il mockup), oppure serve un editor grafico del grafo?
- Tiebreaker e punti per singola fase: oggi valgono per tutta la categoria (§14).

## 14. Scelte fatte nell'implementazione (mockup v2)

| Tema | Scelta |
|---|---|
| `AVOID_REMATCH` | Le rivincite si **minimizzano** (scambi tra gironi finché il numero scende); se ne restano, la fase mostra quante. Non disponibile per le fasi senza fasi di origine (nessuno si è ancora incontrato). Es.: 8 squadre in 2 gironi → minimo 4 rivincite. |
| Calendario a orari fissi | Una fase è messa dopo la fine di **tutte** le sue fasi di origine + il riposo minimo |
| Punti, tiebreaker, colonne | A livello di **categoria**, uguali per tutte le sue fasi |
| Classifica `final` (D2) | Posizioni giocate (finale, finaline) → turno di eliminazione → tiebreaker della fase → seed. Non servono pareggi da ordinare a mano |
| Seed con "per posizione" | Le squadre dello stesso piazzamento in gironi diversi (es. tutte le prime) si ordinano con la classifica `cross:k` della fase di origine |
| Americano → squadre | Connettore con `transform: 'PAIRS'`: coppie 1°+N°, 2°+N-1°… create alla conferma |
| Spostamento manuale nei gironi | La distribuzione passa a `MANUAL` e resta finché non si cambia il numero di gironi |
| Tipi di fase | Tre: GROUPS, KNOCKOUT (`eliminations` 1 o 2), AMERICANO. Gli stati salvati con il vecchio tipo `DOUBLE_KNOCKOUT` vengono convertiti all'apertura |
| Scheda di una fase | Tre passaggi: **1 · Chi entra** (lista squadre, oppure posti dalle fasi precedenti: scelta la fase e il tipo di classifica — *Pool*, *Cross-pool* o *Overall* — si vede **la lista completa dei posti** (es. Cross-pool: 1st of 1sts, 2nd of 1sts … 1st of 4ths; Overall: 1st … last) e si spuntano quelli che entrano; i posti già presi da altre fasi sono segnalati; flag punti portati) · **2 · Come si distribuiscono** (gironi: numero, distribuzione, partite, ordine dei seed; eliminazione: 1 o 2 sconfitte) · **3 · Classifiche che calcola** (fisse per tipo, solo mostrate) |
| Pagina Format | Niente esempio precaricato e niente preset: si parte da un evento vuoto. In cima uno **schema dei 3 tipi di fase**: Input → cosa fa → Output (le classifiche che restituisce) |
| Nuova fase | Prende di default tutti dalla fase precedente, in ordine di classifica (overall o finale); si cambia nel passaggio 1 |
| Errori del builder | Ciclo/ordine sbagliato; posto usato due volte; classifica inesistente per quel tipo; tipo di partecipante diverso; "Overall" mescolato con posizioni di girone della stessa fase; "k-esimo del girone" insieme a "migliore k-esimo" (anche in fasi diverse) |
| Avvisi del builder | Posizioni oltre la dimensione di una classifica (ignorate); squadre di una fase che non proseguono |
