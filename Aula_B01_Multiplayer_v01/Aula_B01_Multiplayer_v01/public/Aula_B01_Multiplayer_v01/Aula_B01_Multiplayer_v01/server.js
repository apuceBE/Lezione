import express from 'express';
import http from 'http';
import {WebSocketServer, WebSocket} from 'ws';
import {randomUUID} from 'crypto';
const app=express();app.use(express.static('public'));
const server=http.createServer(app);const wss=new WebSocketServer({server,path:'/ws'});
const rooms=new Map();const MAX=20;
const send=(ws,obj)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj))};
function broadcast(room,obj,except){for(const p of room.peers.values())if(p.ws!==except)send(p.ws,obj)}
function sanitize(v,n=32){return String(v??'').replace(/[<>]/g,'').trim().slice(0,n)}
function state(room){return {type:'state',slide:room.slide,playing:room.playing,startedAt:room.startedAt,hostId:room.hostId,peers:[...room.peers.values()].map(({id,name,x,z,rot})=>({id,name,x,z,rot}))}}
wss.on('connection',ws=>{let room=null,id=randomUUID();ws.isAlive=true;ws.on('pong',()=>ws.isAlive=true);
ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return};if(!m||typeof m.type!=='string')return;
if(m.type==='join'&&!room){const code=sanitize(m.code,12).toUpperCase();const name=sanitize(m.name,28)||'Docente';if(!/^[A-Z0-9]{4,12}$/.test(code)){send(ws,{type:'error',message:'Codice aula: 4-12 lettere o numeri.'});return}room=rooms.get(code);if(!room){room={code,peers:new Map(),hostId:null,slide:0,playing:false,startedAt:0};rooms.set(code,room)}if(room.peers.size>=MAX){send(ws,{type:'error',message:'Aula piena (20 partecipanti).'});room=null;return}const isHost=!room.hostId;const seat=room.peers.size;room.peers.set(id,{id,ws,name,x:Math.sin(seat*2.4)*2.3,z:1.5+Math.floor(seat/6)*0.6,rot:0});if(isHost)room.hostId=id;send(ws,{type:'welcome',id,code,isHost,max:MAX});send(ws,state(room));broadcast(room,{type:'joined',peer:{id,name,x:room.peers.get(id).x,z:room.peers.get(id).z,rot:0}},ws);return}
if(!room)return;
if(m.type==='pose'){const p=room.peers.get(id);if(!p)return;const x=Number(m.x),z=Number(m.z),rot=Number(m.rot);if(![x,z,rot].every(Number.isFinite))return;p.x=Math.max(-5,Math.min(5,x));p.z=Math.max(-1,Math.min(5,z));p.rot=rot%360;broadcast(room,{type:'pose',id,x:p.x,z:p.z,rot:p.rot},ws)}
if(m.type==='slide'&&id===room.hostId){room.slide=Math.max(0,Math.min(25,Math.floor(Number(m.index)||0)));room.playing=false;broadcast(room,{type:'lesson',slide:room.slide,playing:false,startedAt:0});send(ws,{type:'lesson',slide:room.slide,playing:false,startedAt:0})}
if(m.type==='play'&&id===room.hostId){room.playing=!!m.playing;room.startedAt=room.playing?Date.now()+1200:0;broadcast(room,{type:'lesson',slide:room.slide,playing:room.playing,startedAt:room.startedAt});send(ws,{type:'lesson',slide:room.slide,playing:room.playing,startedAt:room.startedAt})}
});ws.on('close',()=>{if(!room)return;room.peers.delete(id);if(room.hostId===id){room.hostId=room.peers.keys().next().value||null;room.playing=false}if(!room.peers.size)rooms.delete(room.code);else{broadcast(room,{type:'left',id,hostId:room.hostId});broadcast(room,state(room))}})});
setInterval(()=>{for(const ws of wss.clients){if(!ws.isAlive){ws.terminate();continue}ws.isAlive=false;ws.ping()}},30000);
const port=process.env.PORT||3000;server.listen(port,'0.0.0.0',()=>console.log(`Aula B01 su porta ${port}`));
