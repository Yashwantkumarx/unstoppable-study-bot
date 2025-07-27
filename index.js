const { 
  Client, GatewayIntentBits, Partials, REST, Routes, 
  SlashCommandBuilder, Collection, PermissionsBitField, EmbedBuilder 
} = require('discord.js');
const cron = require('node-cron');
const fs = require('fs');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.commands = new Collection();

// ✅ Camera ON & Camera OFF Rooms
const CAMERA_ON_ROOM_IDS = [
  '1398715887728722104',
  '1300572813047894119',
  '1393209218055536680'
];
const CAMERA_OFF_ROOM_IDS = [
  '1393209353431027722',
  '1398719654805115102'
];

// ✅ Channels
const DAILY_CHANNEL_ID = '1367618478747680870';
const WEEKLY_CHANNEL_ID = '1367618555339870208';
const LEADERBOARD_REMINDER_CHANNEL_ID = '1367722181412257913';

const DATA_FILE = './data.json';

let data = { dailyData: {}, weeklyData: {}, studyData: {} };
const joinTimestamps = {};

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    data = JSON.parse(raw);
  } catch {
    saveData();
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function formatTime(hr) {
  const h = Math.floor(hr);
  const m = Math.round((hr - h) * 60);
  return `${h} hrs ${m} mins`;
}

function getISTDateLabel(title) {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const formattedDate = formatter.format(now);

  if (title === 'Daily') {
    const weekday = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long'
    }).format(now);
    return `${weekday}, ${formattedDate}`;
  } else if (title === 'Weekly') {
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const weekStart = new Date(nowIST);
    const day = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() - day);

    const start = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(weekStart);

    const end = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(nowIST);

    return `Week: ${start} → ${end}`;
  }
  return formattedDate;
}

// ✅ Box Table Format Helper
async function formatBoxTable(arr, type, guild) {
  if (arr.length === 0) return "_No data yet!_";

  const rankEmojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  let text = "```\n┌─────────┬──────────────────────┬────────────┐\n";
  text += "│ Rank    │ Name                 │ Hours      │\n";
  text += "├─────────┼──────────────────────┼────────────┤\n";

  for (let i = 0; i < arr.length; i++) {
    const [id, h] = arr[i];
    let username;
    try {
      const member = guild.members.cache.get(id) || await guild.members.fetch(id);
      username = member.displayName;
    } catch {
      try {
        const user = await client.users.fetch(id);
        username = user.username;
      } catch {
        username = `User (${id})`;
      }
    }
    const hours = formatTime(type === 'camOn' ? h.camOn : h.camOff);
    const rank = `${i + 1}. ${rankEmojis[i] || ''}`;
    const namePadded = username.length > 18 ? username.slice(0, 17) + "…" : username.padEnd(20, " ");
    text += `│ ${rank.padEnd(7, " ")} │ ${namePadded} │ ${hours.padEnd(10, " ")} │\n`;
  }

  text += "└─────────┴──────────────────────┴────────────┘\n```";
  return text;
}

// ✅ Leaderboard Embed Generator
async function generateLeaderboardEmbed(title, dataset, guild) {
  const camOnSorted = Object.entries(dataset)
    .sort(([, a], [, b]) => b.camOn - a.camOn)
    .slice(0, 10);

  const camOffSorted = Object.entries(dataset)
    .sort(([, a], [, b]) => b.camOff - a.camOff)
    .slice(0, 10);

  const label = getISTDateLabel(title);

  const embed = new EmbedBuilder()
    .setColor(title === 'Daily' ? 0x3498db : 0x2ecc71)
    .setTitle(title === 'Daily'
      ? `🏆 __**DAILY STUDY LEADERBOARD**__`
      : `🏆 __**WEEKLY STUDY LEADERBOARD**__`)
    .setThumbnail('https://cdn-icons-png.flaticon.com/512/3135/3135715.png')
    .setDescription(`📅 **${label}**\n✨ *"Discipline makes you unstoppable!"*`)
    .setFooter({ text: `Unstoppable | ${title} Top Hustlers` });

  embed.addFields(
    {
      name: "🎥 __**TOP 10 — CAMERA ON**__",
      value: await formatBoxTable(camOnSorted, 'camOn', guild),
      inline: false
    },
    {
      name: "🚫🎥 __**TOP 10 — CAMERA OFF**__",
      value: await formatBoxTable(camOffSorted, 'camOff', guild),
      inline: false
    }
  );
  return embed;
}

// ✅ Voice State Update
client.on('voiceStateUpdate', (oldState, newState) => {
  const userId = newState.id;

  // ✅ Track only specified rooms
  if (!oldState.channelId && newState.channelId) {
    if (
      CAMERA_ON_ROOM_IDS.includes(newState.channelId) ||
      CAMERA_OFF_ROOM_IDS.includes(newState.channelId)
    ) {
      joinTimestamps[userId] = Date.now();
    }
  }

  if (oldState.channelId && !newState.channelId) {
    const startTime = joinTimestamps[userId];
    if (!startTime) return;

    const durationMs = Date.now() - startTime;
    const durationHrs = durationMs / 3600000;

    const camType = CAMERA_ON_ROOM_IDS.includes(oldState.channelId)
      ? 'camOn'
      : CAMERA_OFF_ROOM_IDS.includes(oldState.channelId)
      ? 'camOff'
      : null;

    if (!camType) return;

    for (const dataset of [data.studyData, data.dailyData, data.weeklyData]) {
      if (!dataset[userId]) dataset[userId] = { camOn: 0, camOff: 0 };
      dataset[userId][camType] += durationHrs;
    }

    saveData();
    delete joinTimestamps[userId];
  }
});

// ✅ Cron job every minute (real-time increment)
cron.schedule('* * * * *', () => {
  const now = Date.now();
  for (const userId in joinTimestamps) {
    const startTime = joinTimestamps[userId];
    const durationMin = (now - startTime) / 60000;
    if (durationMin >= 1) {
      const member = client.guilds.cache.first()?.members.cache.get(userId);
      if (!member?.voice.channelId) continue;

      const camType = CAMERA_ON_ROOM_IDS.includes(member.voice.channelId)
        ? 'camOn'
        : CAMERA_OFF_ROOM_IDS.includes(member.voice.channelId)
        ? 'camOff'
        : null;

      if (!camType) continue;

      for (const dataset of [data.studyData, data.dailyData, data.weeklyData]) {
        if (!dataset[userId]) dataset[userId] = { camOn: 0, camOff: 0 };
        dataset[userId][camType] += 1 / 60;
      }

      joinTimestamps[userId] = now;
    }
  }
  saveData();
});

// ✅ Daily Auto Leaderboard
cron.schedule('59 23 * * *', async () => {
  const guild = client.guilds.cache.first();
  const ch = client.channels.cache.get(DAILY_CHANNEL_ID);
  const embed = await generateLeaderboardEmbed('Daily', data.dailyData, guild);
  ch?.send({ content: '@everyone', embeds: [embed] });
  data.dailyData = {};
  saveData();
}, { timezone: 'Asia/Kolkata' });

// ✅ Weekly Auto Leaderboard (Every Sunday)
cron.schedule('59 23 * * 0', async () => {
  const guild = client.guilds.cache.first();
  const ch = client.channels.cache.get(WEEKLY_CHANNEL_ID);
  const embed = await generateLeaderboardEmbed('Weekly', data.weeklyData, guild);
  ch?.send({ content: '@everyone', embeds: [embed] });
  data.weeklyData = {};
  saveData();
}, { timezone: 'Asia/Kolkata' });

client.once('ready', () => {
  loadData();
  console.log(`✅ Bot is online as ${client.user.tag}`);
});

client.login(process.env.TOKEN);
