AULA IMMERSIVA MULTIPLAYER B01 – PROTOTIPO v0.1

Questa versione include:
- fino a 20 connessioni contemporanee per stanza (limite applicativo, non prestazioni garantite)
- ingresso con nome e codice aula, primo partecipante = regista
- avatar semplificati e posizioni condivise
- lavagna sincronizzata e tre brevi spiegazioni B01
- voce italiana locale con speechSynthesis (supporto Quest da verificare)
- struttura predisposta per un futuro ruolo di formatore reale

NON INCLUDE ANCORA: voce tra partecipanti, avatar realistici, audio preregistrato sincronizzato, autenticazione del regista, moderazione, sincronizzazione accurata della voce, persistenza delle stanze.

TEST LOCALE SU PC:
1. Installare Node.js 18 o successivo.
2. Aprire un terminale nella cartella del progetto.
3. Eseguire: npm install
4. Eseguire: npm start
5. Aprire http://localhost:3000 in due schede del browser; usare lo stesso codice aula e nomi diversi.

PUBBLICAZIONE PER META QUEST 3:
Il precedente sito statico Netlify NON basta per questo prototipo, che richiede un server Node.js con WebSocket.
Pubblicare l'intera cartella su un hosting Node.js che supporti WebSocket e HTTPS (ad es. Render o Railway), comando di avvio npm start, porta fornita da PORT. Aprire il link HTTPS ottenuto nel browser del Quest 3.
Per provare la presenza simultanea, aprire il link su due dispositivi con lo stesso codice aula. Solo dopo effettuare test progressivi fino a 20.

SICUREZZA: è un prototipo dimostrativo, NON adatto a classi reali con dati personali senza ulteriori controlli (accesso, privacy, moderazione, protezione codici e server).
