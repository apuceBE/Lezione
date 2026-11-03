import { readFileSync } from 'fs';
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID, createHash, timingSafeEqual } from 'crypto';

const app = express();
app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const rooms = new Map();
const MAX = 20;
const MAX_REGISTI = 2; // PC e Quest 3 del formatore
const REGIA_CODE = process.env.REGIA_CODE;
if (!REGIA_CODE || REGIA_CODE.length < 12) {
  throw new Error('Imposta REGIA_CODE (almeno 12 caratteri) nelle variabili ambiente del server.');
}
function validRegiaCode(candidate) {
  if (typeof candidate !== 'string') return false;
  const a = createHash('sha256').update(candidate).digest();
  const b = createHash('sha256').update(REGIA_CODE).digest();
  return timingSafeEqual(a, b);
}
function isRegista(room, id) { return room.peers.get(id)?.regista === true; }
function controllerId(room) { return [...room.peers.values()].find(p => p.regista)?.id || null; }


// Lezione 3: numero di slide letto da L03.json
const lesson = JSON.parse(
  readFileSync(
    new URL('./public/lezioni/L03.json', import.meta.url),
    'utf8'
  )
);

const LESSON_SLIDES = lesson.slides.length;

const send = (ws, obj) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
};

function broadcast(room, obj, except) {
  for (const p of room.peers.values()) {
    if (p.ws !== except) send(p.ws, obj);
  }
}

function sanitize(v, n = 32) {
  return String(v ?? '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, n);
}

function state(room) {
  return {
    type: 'state',
    slide: room.slide,
    playing: room.playing,
    startedAt: room.startedAt,
    hostId: controllerId(room),
    peers: [...room.peers.values()].map(
      ({ id, name, x, z, rot }) => ({
        id, name, x, z, rot
      })
    )
  };
}

wss.on('connection', ws => {
  let room = null;
  const id = randomUUID();

  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);

  ws.on('message', raw => {
    let m;

    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }

    if (!m || typeof m.type !== 'string') return;

    if (m.type === 'join' && !room) {
      const code = sanitize(m.code, 12).toUpperCase();
      const name = sanitize(m.name, 28) || 'Docente';

      if (!/^[A-Z0-9]{4,12}$/.test(code)) {
        send(ws, {
          type: 'error',
          message: 'Codice aula: 4-12 lettere o numeri.'
        });
        return;
      }

      room = rooms.get(code);

      if (!room) {
        room = {
          code,
          peers: new Map(),
          hostId: null,
          slide: 0,
          playing: false,
          startedAt: 0
        };
        rooms.set(code, room);
      }

      if (room.peers.size >= MAX) {
        send(ws, {
          type: 'error',
          message: 'Aula piena (20 partecipanti).'
        });
        room = null;
        return;
      }

      const wantsRegia = typeof m.regiaCode === 'string' && m.regiaCode.length > 0;
      if (wantsRegia && !validRegiaCode(m.regiaCode)) {
        send(ws, { type: 'error', message: 'Codice riservato al formatore non valido.' });
        room = null;
        return;
      }
      const activeRegisti = [...room.peers.values()].filter(p => p.regista).length;
      if (wantsRegia && activeRegisti >= MAX_REGISTI) {
        send(ws, { type: 'error', message: 'Sono già collegati i due dispositivi del formatore.' });
        room = null;
        return;
      }
      const isHost = wantsRegia;
      const seat = room.peers.size;

      room.peers.set(id, {
        id,
        ws,
        name,
        regista: isHost,
        x: Math.sin(seat * 2.4) * 2.3,
        z: 1.5 + Math.floor(seat / 6) * 0.6,
        rot: 0
      });

      room.hostId = controllerId(room);

      send(ws, {
        type: 'welcome',
        id,
        code,
        isHost,
        max: MAX
      });

      send(ws, state(room));

      broadcast(room, {
        type: 'joined',
        peer: {
          id,
          name,
          x: room.peers.get(id).x,
          z: room.peers.get(id).z,
          rot: 0
        }
      }, ws);

      return;
    }

    if (!room) return;

    if (m.type === 'pose') {
      const p = room.peers.get(id);
      if (!p) return;

      const x = Number(m.x);
      const z = Number(m.z);
      const rot = Number(m.rot);

      if (![x, z, rot].every(Number.isFinite)) return;

      p.x = Math.max(-5, Math.min(5, x));
      p.z = Math.max(-1, Math.min(5, z));
      p.rot = rot % 360;

      broadcast(room, {
        type: 'pose',
        id,
        x: p.x,
        z: p.z,
        rot: p.rot
      }, ws);
    }

    if (m.type === 'slide' && isRegista(room, id)) {
      room.slide = Math.max(
        0,
        Math.min(
          LESSON_SLIDES - 1,
          Math.floor(Number(m.index) || 0)
        )
      );

      room.playing = false;
      room.startedAt = 0;

      const update = {
        type: 'lesson',
        slide: room.slide,
        playing: false,
        startedAt: 0
      };

      broadcast(room, update);
      send(ws, update);
    }

    if (m.type === 'play' && isRegista(room, id)) {
      room.playing = !!m.playing;
      room.startedAt = room.playing
        ? Date.now() + 1200
        : 0;

      const update = {
        type: 'lesson',
        slide: room.slide,
        playing: room.playing,
        startedAt: room.startedAt
      };

      broadcast(room, update);
      send(ws, update);
    }
  });

  ws.on('close', () => {
    if (!room) return;

    room.peers.delete(id);

    room.hostId = controllerId(room);
    if (!room.hostId) {
      room.playing = false;
      room.startedAt = 0;
    }

    if (!room.peers.size) {
      rooms.delete(room.code);
    } else {
      broadcast(room, {
        type: 'left',
        id,
        hostId: room.hostId
      });
      broadcast(room, state(room));
    }
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }

    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

const port = process.env.PORT || 3000;

server.listen(port, '0.0.0.0', () => {
  console.log(
    `Aula Lezione 3 - ${LESSON_SLIDES} slide - porta ${port}`
  );
});

