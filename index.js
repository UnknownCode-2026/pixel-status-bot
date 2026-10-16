require('dotenv').config();
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const si = require('systeminformation');
const dgram = require('node:dgram');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const HOST = process.env.SAMP_IP || '127.0.0.1';
const PORT = Number(process.env.SAMP_PORT || 7777);
const ONLINE_NICK = 'เซิร์ฟเวอร์ออนไลน์🟢';
const OFFLINE_NICK = 'เซิร์ฟเวอร์ออฟไลน์🔴';
let lastServerOnline = null;
let lastCpuUsage = 0;

async function readCPU() {
  try {
    const cpu = await si.currentLoad();
    lastCpuUsage = Math.round(cpu.currentLoad);
  } catch (err) {
    console.error('CPU:', err.message);
  }
  return lastCpuUsage;
}

async function updateNickname(online) {
  // Only change nicknames when the server status changes (or at startup).
  if (lastServerOnline === online) return;
  lastServerOnline = online;
  const nickname = online ? ONLINE_NICK : OFFLINE_NICK;
  for (const guild of client.guilds.cache.values()) {
    try {
      const me = await guild.members.fetchMe();
      if (me.nickname !== nickname) {
        await me.setNickname(nickname, 'SA-MP server status changed');
      }
      console.log(`[${guild.name}] Nickname: ${nickname}`);
    } catch (err) {
      console.error(`[${guild.name}] Cannot change nickname:`, err.message);
    }
  }
}


function queryPlayers() {
  return new Promise((resolve, reject) => {
    const parts = HOST.split('.').map(Number);
    if (parts.length !== 4 || parts.some(x => !Number.isInteger(x) || x < 0 || x > 255) || PORT < 1 || PORT > 65535) {
      return reject(new Error('Invalid SA-MP IPv4 or port'));
    }
    const socket = dgram.createSocket('udp4');
    const packet = Buffer.from([83, 65, 77, 80, ...parts, PORT & 255, PORT >> 8, 105]);
    let settled = false;
    const finish = (err, players) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      err ? reject(err) : resolve(players);
    };
    const timer = setTimeout(() => finish(new Error('SA-MP query timeout')), 3000);
    socket.on('error', err => finish(err));
    socket.on('message', msg => {
      if (msg.length < 15 || !msg.subarray(0, 11).equals(packet)) return;
      finish(null, msg.readUInt16LE(11));
    });
    socket.send(packet, PORT, HOST, err => { if (err) finish(err); });
  });
}

async function updatePlayers() {
  try {
    const players = await queryPlayers();
    const cpuUsage = await readCPU();
    client.user.setPresence({
      status: 'online',
      activities: [{ name: `Players: ${players} | Cpu: ${cpuUsage}%`, type: ActivityType.Playing }]
    });
    console.log('SA-MP players:', players);
    await updateNickname(true);
  } catch (err) {
    console.error('SA-MP:', err.message);
    await updateNickname(false);
    client.user.setPresence({
      status: 'idle',
      activities: [{ name: 'เซิร์ฟเวอร์ออฟไลน์', type: ActivityType.Playing }]
    });
  }
}

client.once('clientReady', () => {
  console.log('Bot online:', client.user.tag);
  updatePlayers();
  setInterval(updatePlayers, 15000);
});

if (!process.env.TOKEN) throw new Error('Missing TOKEN in local .env');
client.login(process.env.TOKEN);
