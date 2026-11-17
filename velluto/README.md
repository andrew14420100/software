# Velluto — piattaforma streaming indipendente

Piattaforma di streaming video completa e funzionante, con identità grafica e codice originali.
Il catalogo dimostrativo usa esclusivamente gli **open movie della Blender Foundation**
(Creative Commons Attribution); i crediti e la licenza sono mostrati su ogni scheda.

## Funzionalità

| Area | Implementazione |
|---|---|
| Frontend | Next.js 16 (App Router, React 19, Tailwind 4); home con hero a carosello e righe orizzontali, Film, Serie, generi, ricerca, scheda titolo con stagioni/episodi |
| Desktop / tablet / mobile | layout responsivo, menu desktop + barra a schede su mobile, righe con scroll-snap, player con gesti touch (doppio tap ±10 s) |
| Backend / API | route handler Next.js (`src/app/api/**`), logica in `src/server/*.ts` eseguibile anche da Node 22 (CLI/seed) |
| Database | SQLite (better-sqlite3, WAL) con migrazioni versionate: utenti, sessioni, piani, abbonamenti, pagamenti, titoli, stagioni, episodi, media, rendizioni, sottotitoli, preferiti, avanzamento, sessioni di riproduzione, eventi, job |
| Catalogo multimediale | pipeline ffmpeg: HLS fMP4 con ladder H.264 360p→2160p, variante **HEVC Main10 HDR10** (BT.2020, PQ, metadati SMPTE ST 2086 / MaxCLL), sottotitoli WebVTT (tracce incorporate o file .srt), poster, backdrop, storyboard per le anteprime nella barra |
| Player avanzato | hls.js (HLS nativo su Safari): qualità automatica/manuale, velocità, sottotitoli, anteprime su seek bar, salta intro, PiP, schermo intero, scorciatoie (spazio/K, J/L, ←/→, ↑/↓, M, F, C, N, I), statistiche tecniche, ripresa dal punto lasciato |
| 4K e HDR | il server consegna 2160p solo al piano Ultra e l'HDR10 solo se il dispositivo dichiara display HDR (`dynamic-range: high`) e decoder HEVC; altrimenti ladder SDR |
| Autenticazione | password scrypt, sessioni opache lato server (cookie httpOnly, SameSite=Lax, Secure in produzione), rate-limit login/registrazione, controllo Origin sulle richieste che modificano dati, revoca dispositivi, cambio password con logout degli altri dispositivi |
| Abbonamenti | piani Essenziale (720p, 1 schermo), Plus (1080p, 2 schermi), Ultra (4K HDR, 4 schermi); attivazione, cambio piano, annullamento a fine periodo, riattivazione, storico pagamenti; **limite di schermi contemporanei** con heartbeat |
| Pagamenti | interfaccia `PaymentProvider`; il provider incluso è **dimostrativo** (nessun dato di carta, nessun addebito). Un provider reale si collega implementando la stessa interfaccia |
| Protezione dei contenuti | ogni playlist e segmento richiede un token HMAC firmato (utente, media, qualità massima, HDR, scadenza); le rendizioni fuori piano sono invisibili e rifiutate anche se richieste direttamente |
| Preferiti e cronologia | La mia lista, Continua a guardare, cronologia con rimozione singola/totale, barre di avanzamento ovunque |
| Episodi | riproduzione automatica dell'episodio successivo con conto alla rovescia (disattivabile dal profilo), marcatori intro/titoli di coda |
| Pannello admin | KPI (utenti, abbonati, ricavi, riproduzioni, schermi attivi, coda), catalogo (crea/modifica/pubblica/elimina titoli, stagioni, episodi), upload sorgenti in streaming, codifica con avanzamento live, ricodifica, gestione utenti (ruolo, piano) e piani (prezzo, qualità, HDR, schermi) |

## Avvio senza riga di comando (GitHub Codespaces)

1. Su GitHub apri il repository, scegli il branch che contiene `velluto/`.
2. **Code → Codespaces → ⋯ → New with options**, configurazione **"Velluto (streaming demo)"**, macchina 4 core → **Create codespace**.
3. La prima creazione scarica i film e li codifica da sola (circa 20-30 minuti); poi il sito si apre
   automaticamente in una nuova scheda (porta 3000). Le credenziali sono nel file
   `velluto/data/demo-credentials.txt`, visibile nell'elenco file a sinistra.
4. Alle riaperture successive il sito riparte da solo in pochi secondi.

## Avvio

Requisiti: Node ≥ 22.18, ffmpeg con libx264/libx265/zscale (Ubuntu: `apt-get install ffmpeg`).

```bash
npm install
npm run media:fetch      # scarica gli open movie (~2,6 GB) in ~/velluto-cache
npm run seed             # crea DB, account, catalogo e codifica i media (~15 min, estratti di 90-120 s)
npm run build && npm start   # http://localhost:3000
```
Le credenziali generate (admin con piano Ultra, demo con piano Plus) sono in `data/demo-credentials.txt`.
`VELLUTO_CLIP_SECONDS=0 npm run seed` codifica i film interi. Variabili: `VELLUTO_DATA_DIR`,
`VELLUTO_SOURCES`, `VELLUTO_STREAM_SECRET`, `VELLUTO_ADMIN_EMAIL`, `VELLUTO_ADMIN_PASSWORD`, `VELLUTO_WORKER=0`
(disattiva il worker di codifica nel server).

## Verifica

```bash
npm run check            # eslint + typecheck + build
npm run test:e2e         # Playwright: desktop 1440, tablet iPad Mini, smartphone Pixel 7
```
La suite copre catalogo, navigazione desktop/mobile, registrazione, abbonamento, blocco senza piano,
riproduzione HLS reale, limite di qualità per piano, menu qualità/velocità/sottotitoli, scorciatoie,
ripresa, cronologia, salta intro, autoplay dell'episodio successivo, preferiti, 4K/HDR per Ultra e
dispositivo compatibile, token (assenza, manomissione, media diverso, rendizione fuori piano), CSRF,
schermi contemporanei, rate-limit, pannello admin, overflow orizzontale e **regressione visiva pixel per pixel**.

## Note sull'HDR

Le sorgenti demo sono SDR: la variante HDR10 è una mappatura corretta nel contenitore PQ/BT.2020
(bianco SDR a 203 nit, ITU-R BT.2408), non una nuova color correction. Con sorgenti realmente HDR
(PQ o HLG) la pipeline conserva la gamma dinamica originale.

## Licenze dei contenuti

Big Buck Bunny (2008, CC BY 3.0), Elephants Dream (2006, CC BY 2.5), Sintel (2010, CC BY 3.0),
Tears of Steel (2012, CC BY 3.0) — © Blender Foundation, www.blender.org. Le serie "Cronache di
Sintel" e "La Macchina" sono adattamenti a capitoli consentiti dalla licenza, con attribuzione.
