
// index.js – Study Tracker Bot (Full Features)

const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  EmbedBuilder, 
  Events 
} = require('discord.js');
const fs = require('fs');
const cron = require('node-cron');
require('dotenv').config();

// ── CONFIG ─────────────────────────────────────────────────────────────────────
const TOKEN              = process.env.TOKEN;
const CLIENT_ID          = process.env.CLIENT_ID;
const GUILD_ID           = process.env.GUILD_ID;
const DAILY_CHANNEL_ID   = process.env.DAILY_CHANNEL_ID;
const WEEKLY_CHANNEL_ID  = process.env.WEEKLY_CHANNEL_ID;
const MONTHLY_CHANNEL_ID = process.env.MONTHLY_CHANNEL_ID;
const SUPERVISED_ROOM_ID = '1300572813047894119';  // camera‑on room

const DATA_FILE = './studyData.json';
// ── END CONFIG ─────────────────────────────────────────────────────────────────

// Create or load data file
let studyData = {};
function loadData() {
  try { studyData = JSON.parse(fs.readFileSync(DATA_FILE)); }
  catch { studyData = {}; fs.writeFileSync(DATA_FILE, '{}'); }
}
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(studyData, null, 2));
}

// Period keys
function getDateKey() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}
function getWeekKey() {
  const d = new Date();
  const start = new Date(d.setDate(d.getDate() - d.getDay()));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]}`;
}
function getMonthKey() {
  const now = new Date();
  return now.toLocaleString('default', { month: 'long', year: 'numeric' }); // e.g. "May 2025"
}

// Ensure a user entry exists
function ensureUser(id) {
  if (!studyData[id]) {
    studyData[id] = {
      daily: {}, weekly: {}, monthly: {},
      cameraMode: null, sessionStart: null, sessionCam: null
    };
  }
}

// Start/end sessions
function startSession(id, cam) {
  studyData[id].sessionStart = Date.now();
  studyData[id].sessionCam   = cam;
  saveData();
}
function endSession(id) {
  const u = studyData[id];
  if (!u || !u.sessionStart) return;
  const mins = (Date.now() - u.sessionStart) / 60000;
  [[u.daily, getDateKey()], [u.weekly, getWeekKey()], [u.monthly, getMonthKey()]]
    .forEach(([bucket, key]) => {
      bucket[key] = bucket[key] || { on: 0, off: 0 };
      bucket[key][u.sessionCam] += mins;
    });
  u.sessionStart = u.sessionCam = null;
  saveData();
}

// Override camera mode
function setCameraMode(id, mode) {
  ensureUser(id);
  studyData[id].cameraMode = mode;
  saveData();
}

// Motivational taglines
const taglines = [
  'Focus Mode', 'Silent Hustle', 'Distraction-Free Zone',
  'Laser Focused', 'Grind Time', 'No Excuses', 'Locked In'
];

// Slash command definitions
const commands = [
  new SlashCommandBuilder()
    .setName('myhours')
    .setDescription("Show your today's study hours")
    .addUserOption(o => o.setName('user').setDescription('Check someone else')),
  new SlashCommandBuilder()
    .setName('addhours')
    .setDescription('Add study minutes')
    .addIntegerOption(o => o.setName('minutes').setDescription('Minutes').setRequired(true))
    .addStringOption(o => o.setName('camera').setDescription('Mode').setRequired(true)
      .addChoices({ name: 'Camera On', value: 'on' }, { name: 'Camera Off', value: 'off' })),
  new SlashCommandBuilder()
    .setName('removehours')
    .setDescription('Remove study minutes')
    .addIntegerOption(o => o.setName('minutes').setDescription('Minutes').setRequired(true))
    .addStringOption(o => o.setName('camera').setDescription('Mode').setRequired(true)
      .addChoices({ name: 'Camera On', value: 'on' }, { name: 'Camera Off', value: 'off' })),
  new SlashCommandBuilder()
    .setName('setcamera')
    .setDescription('Override your camera mode')
    .addStringOption(o => o.setName('mode').setDescription('Mode').setRequired(true)
      .addChoices({ name: 'On', value: 'on' }, { name: 'Off', value: 'off' }))
].map(c => c.toJSON());

// Register slash commands
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log('Slash commands registered');
})();

// Initialize client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.once(Events.ClientReady, () => {
  loadData();
  console.log(`Logged in as ${client.user.tag}`);
});

// Voice state updates for auto-tracking
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;
  const id = member.user.id;
  ensureUser(id);

  if (oldState.channelId && !newState.channelId) endSession(id);
  if (!oldState.channelId && newState.channelId) {
    const mode = studyData[id].cameraMode || (newState.channelId === SUPERVISED_ROOM_ID ? 'on' : 'off');
    startSession(id, mode);
  }
});

// Handle interactions
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = interaction.commandName;
  const uid = interaction.user.id;
  const today = getDateKey(), week = getWeekKey(), mon = getMonthKey();
  ensureUser(uid);

  if (cmd === 'setcamera') {
    setCameraMode(uid, interaction.options.getString('mode'));
    return interaction.reply(`Camera mode set to **${studyData[uid].cameraMode.toUpperCase()}**`);
  }
  if (cmd === 'myhours') {
    const tgt = interaction.options.getUser('user') || interaction.user;
    ensureUser(tgt.id);
    const rec = studyData[tgt.id].daily[today] || { on: 0, off: 0 };
    const tot = Math.round(rec.on + rec.off);
    const tag = taglines[Math.floor(Math.random() * taglines.length)];
    const embed = new EmbedBuilder()
      .setTitle(`✨ ${tgt.username}'s Study Report`)
      .setDescription(`**Date:** ${today}`)
      .addFields(
        { name: '📷 On', value: `${Math.round(rec.on)} min ✅`, inline: true },
        { name: '📷 Off', value: `${Math.round(rec.off)} min ❌`, inline: true },
        { name: '🕒 Total', value: `**${tot} min**`, inline: false },
        { name: '🔥 Tagline', value: tag, inline: false }
      );
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
  if (cmd === 'addhours' || cmd === 'removehours') {
    const m = interaction.options.getInteger('minutes');
    const c = interaction.options.getString('camera');
    const d = cmd === 'addhours' ? +m : -m;
    [['daily', today], ['weekly', week], ['monthly', mon]].forEach(([p, k]) => {
      studyData[uid][p][k] = studyData[uid][p][k] || { on: 0, off: 0 };
      studyData[uid][p][k][c] = Math.max(0, studyData[uid][p][k][c] + d);
    });
    saveData();
    return interaction.reply(`${d > 0 ? '✅ Added' : '❌ Removed'} ${Math.abs(d)} min to Camera ${c.toUpperCase()}`);
  }
});

// Leaderboard posting
function postLB(period, chId, title) {
  loadData();
  const key = period === 'daily' ? getDateKey() : period === 'weekly' ? getWeekKey() : getMonthKey();  
  const arr = Object.entries(studyData).map(([id,u]) => {
    const r = u[period][key] || { on:0, off:0 };
    return { id, on: r.on, off: r.off, total: r.on + r.off };
  }).sort((a,b)=>b.total - a.total).slice(0,10);

  const lines = arr.map((u,i) => {
    const crown = i === 0 ? '👑 ' : '';
    return `${crown}**#${i+1}** <@${u.id}> — On: ${Math.round(u.on)} min | Off: ${Math.round(u.off)} min | Total: ${Math.round(u.total)} min`;
  }).join('\n') || '*No data yet*';

  const embed = new EmbedBuilder().setTitle(`${title} (${key})`).setDescription(lines).setColor('Gold');
  client.channels.cache.get(chId)?.send({ content: '@everyone', embeds: [embed] });
}

// Schedule leaderboard posts & resets
cron.schedule('30 18 * * *', () => { postLB('daily', DAILY_CHANNEL_ID,   'Daily Leaderboard'); loadData(); Object.values(studyData).forEach(u=>u.daily={}   ); saveData(); });
cron.schedule('30 18 * * 0', () => { postLB('weekly', WEEKLY_CHANNEL_ID, 'Weekly Leaderboard'); loadData(); Object.values(studyData).forEach(u=>u.weekly={}  ); saveData(); });
cron.schedule('30 18 28-31 * *', () => {
  const d = new Date(), last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
  if (d.getDate() === last) { postLB('monthly', MONTHLY_CHANNEL_ID, 'Monthly Leaderboard'); loadData(); Object.values(studyData).forEach(u=>u.monthly={}); saveData(); }
});

client.login(TOKEN);
