# WebClone Lab

Ambiente unificato per l'analisi e la ricostruzione **autorizzata** di siti web:
pagine (anche interne, con la sessione dell'utente), grafica, animazioni, interazioni,
funzionalità, struttura, comportamento e ricostruzione indipendente di backend/API/DB,
con verifica automatica (diff pixel per pixel + test funzionali) su desktop, tablet e smartphone.

Comando Claude Code: **`/clone-full-website <url>`** · CLI: **`wcl`**

## Componenti (tutti gratuiti e open source)

| Componente | Versione (fissata) | Licenza | Ruolo |
|---|---|---|---|
| [REA](https://github.com/morluto/rea) `rea-agents` | 6.9.0 | MIT | reverse engineering di bundle JS/source map/Electron/binari (MCP + skill) |
| [Wakaru](https://github.com/pionxzh/wakaru) | 1.14.0 (SHA-256 verificato) | MIT | motore di recupero sorgenti JS usato da REA |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) `@playwright/mcp` | 0.0.85 | Apache-2.0 | browser interattivo per l'agente |
| [Ditto](https://github.com/luigiluft/ditto) | commit `774c8d4` | MIT | sonde: recon, rete, interazioni, motion, inventario animazioni, source map, asset, DNA, mirror, align-diff |
| [ai-website-cloner-template](https://github.com/JCodesMore/ai-website-cloner-template) | commit `5426e0e` | MIT | target di ricostruzione Next.js 16 + React 19 + Tailwind 4 + shadcn, metodologia |
| Playwright / @playwright/test | 1.63.0 | Apache-2.0 | cattura deterministica e test su 3 dispositivi |
| pixelmatch / pngjs | 7.1.0 / 7.0.0 | ISC / MIT | confronto pixel per pixel |

## Analisi preliminare (eseguita)

**Sicurezza.** Codice letto e analizzato (ricerca di `child_process`, `eval`, download
remoti, `curl|sh`, script postinstall, tecniche stealth/anti-bot/CAPTCHA):
- Ditto / web-clone: nessuna esecuzione di comandi, nessuna chiamata a host esterni oltre
  al target; `postinstall` di Ditto stampa solo un messaggio (e non viene eseguito: gli
  script vengono usati direttamente). Il loader originale di Jane conteneva percorsi
  assoluti `/Users/jane/...` (innocui ma non portabili): superato dalla versione di Ditto.
- ai-website-cloner-template: solo dipendenze npm standard (Next, React, shadcn, Tailwind);
  la skill/command sono solo testo.
- playwright-mcp: pacchetto ufficiale Microsoft; usato dal registro npm, non compilato da sorgente.
- REA: installato dal pacchetto npm ufficiale indicato nel README del progetto.
- Nessuno strumento aggira autenticazione, CAPTCHA, paywall, WAF o limiti di frequenza.

**Ridondanze eliminate.**
- `Jane-xiaoer/claude-skill-web-clone` **non viene installato**: Ditto ne include
  (vendored, con licenza MIT preservata) tutti gli script e i riferimenti, verificati
  identici byte per byte; cambia solo il loader di Playwright, migliorato in Ditto.
- Il route-crawl di Ditto è sostituito da `wcl crawl` (supporta la sessione dell'utente e
  la matrice di dispositivi); il visual-diff di Ditto (canvas) è affiancato da `wcl diff`
  (pixelmatch, doppia soglia) come gate ufficiale; `align-diff` di Ditto resta per la diagnosi
  degli offset verticali.
- La skill `/clone-website` del template non viene installata globalmente: la sua
  metodologia è richiamata dal flusso unificato.
- Escluso il percorso 3D Higgsfield di Ditto (servizio a pagamento).

**Incompatibilità risolte.**
- Il template dichiara `node >=24`; l'ambiente ha Node 22.23. Next 16.3.5 richiede solo
  `>=20.9`: build, lint e typecheck verificati su Node 22 (`--engine-strict=false`).
- `@playwright/mcp` 0.0.85 dipende da Playwright 1.66-alpha (revisione browser diversa):
  viene avviato con `--executable-path` sul Chromium preinstallato.
- REA registrato da `npx` puntava alla cache temporanea: sostituito da installazione globale
  persistente; la variabile `REA_WAKARU_COMMAND` viene passata al server MCP.
- Il template carica Geist da Google Fonts e il preflight Tailwind: per la massima fedeltà il
  clone usa i font/CSS reali del sito (asset raccolti da Ditto).

## Pipeline

```
wcl init <url> --authorized "<dichiarazione>" [--storage-state sessione.json]
wcl recon <progetto>                    # crawl + 8 sonde Ditto
wcl capture <progetto> --target original
wcl api <progetto>                      # backend/: openapi.json, schema.sql, db.json, server.mjs
#  ... ricostruzione in <progetto>/app (agente: Playwright MCP + REA) ...
wcl verify <progetto> --start           # build, avvio, cattura clone, diff, test, VERIFY_REPORT.md
```
I progetti vengono creati in `~/webclone-projects/<slug>/`, mai nei repository esistenti.

**Gate di verifica** (per ogni route × desktop 1440 / tablet iPad Mini / smartphone iPhone 13):
- pixel: percettivo ≤ 1 %, rigoroso (qualsiasi pixel) ≤ 0,1 %, stessa altezza di pagina;
- test: stato HTTP, eccezioni runtime, titolo, intestazioni, pulsanti, testi e destinazioni dei
  link (click-through, anche navigazione SPA), campi dei form, effetto dei controlli identico
  all'originale, overflow orizzontale, API ricostruita (GET + CRUD su DB separato).

**Backend ricostruito**: dagli scambi fetch/XHR osservati genera contratto OpenAPI, schema SQL
con seed, DB JSON con CRUD e un server Node senza dipendenze; gli endpoint non osservabili
(es. invio form, mai eseguito sull'originale) si aggiungono in `backend/routes.extra.json`.
Il clone non contatta mai il backend originale.

## Persistenza nelle sessioni cloud

`install.sh` è idempotente; lo script di setup dell'ambiente lo esegue a ogni nuovo container.
Verifica: `wcl doctor` (controlli statici) e `wcl selftest` (pipeline completa sul sito demo
incluso: il clone di riferimento deve passare, bug visivi/funzionali iniettati devono fallire).

## Limiti dichiarati
- Le sonde Ditto girano senza sessione; le pagine autenticate sono coperte da `wcl crawl/capture`
  con lo `storageState` fornito dall'utente.
- Logica server non osservabile dal client (regole di business, permessi, job) va ricostruita
  per inferenza e dichiarata come tale.
- Motori nativi di REA (Ghidra/IDA/JADX/Kuna) non installati: non servono per i siti web.
