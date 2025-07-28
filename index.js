const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, Collection, PermissionsBitField, EmbedBuilder } = require('discord.js');
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

const CAMERA_ON_ROOM_IDS = ['1398715887728722104', '1300572813047894119', '1393209218055536680'];
const CAMERA_OFF_ROOM_IDS = ['1393209353431027722', '1398719654805115102'];

const DAILY_CHANNEL_ID = process.env.DAILY_CHANNEL_ID;
const WEEKLY_CHANNEL_ID = process.env.WEEKLY_CHANNEL_ID;
const LEADERBOARD_REMINDER_CHANNEL_ID = process.env.LEADERBOARD_REMINDER_CHANNEL_ID;
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

const focusTaglines = ["Focus Mode", "Laser Focus", "Unbreakable Flow", "Mindful Minutes", "Concentration King"];
const silentTaglines = ["Silent Hustle", "Quiet Grind", "Alone But Focused", "Peaceful Push", "Hidden Effort"];

client.once('ready', async () => {
  loadData();

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  const commands = [
    new SlashCommandBuilder().setName('myhours').setDescription("Check today's study hours.")
      .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(false)),
    new SlashCommandBuilder().setName('leaderboard').setDescription('Show leaderboard.')
      .addStringOption(opt => opt.setName('type').setDescription('Leaderboard Type').setRequired(true)
        .addChoices({ name: 'Daily', value: 'daily' }, { name: 'Weekly', value: 'weekly' })),
  ];

  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands.map(cmd => cmd.toJSON()) }
  );

  console.log(`✅ Bot is online as ${client.user.tag}`);
});

// Track Voice State
client.on('voiceStateUpdate', (oldState, newState) => {
  const userId = newState.id;

  if (!oldState.channelId && newState.channelId) {
    if (CAMERA_ON_ROOM_IDS.includes(newState.channelId) || CAMERA_OFF_ROOM_IDS.includes(newState.channelId)) {
      joinTimestamps[userId] = Date.now();
    }
  }

  if (oldState.channelId && !newState.channelId) {
    const startTime = joinTimestamps[userId];
    if (!startTime) return;

    const durationHrs = (Date.now() - startTime) / 3600000;
    const camType = CAMERA_ON_ROOM_IDS.includes(oldState.channelId) ? 'camOn' : 'camOff';

    for (const dataset of [data.studyData, data.dailyData, data.weeklyData]) {
      if (!dataset[userId]) dataset[userId] = { camOn: 0, camOff: 0 };
      dataset[userId][camType] += durationHrs;
    }

    saveData();
    delete joinTimestamps[userId];
  }
});

function formatTime(hr) {
  const h = Math.floor(hr);
  const m = Math.round((hr - h) * 60);
  return `${h}h ${m}m`;
}

function getISTDateLabel(title) {
  const now = new Date();
  if (title === 'Daily') {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(now);
  } else {
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const weekStart = new Date(nowIST);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
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
}

async function generateLeaderboardEmbed(title, dataset) {
  const label = getISTDateLabel(title);

  const camOnSorted = Object.entries(dataset)
    .sort(([, a], [, b]) => b.camOn - a.camOn)
    .slice(0, 10);
  const camOffSorted = Object.entries(dataset)
    .sort(([, a], [, b]) => b.camOff - a.camOff)
    .slice(0, 10);

  const embed = new EmbedBuilder()
    .setTitle(`🏆 __${title} Leaderboard__ — ${label}`)
    .setColor(0x00bfff)
    .setFooter({ text: 'Top 10 Students Hustling!' });

  let camOnText = `\`\`\`\n#  USER             HOURS\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  for (let i = 0; i < camOnSorted.length; i++) {
    const [id, h] = camOnSorted[i];
    const member = await client.users.fetch(id).catch(() => null);
    camOnText += `${i + 1}. ${(member?.username || 'Unknown').padEnd(15)} ${formatTime(h.camOn)}\n`;
  }
  camOnText += `\`\`\``;

  let camOffText = `\`\`\`\n#  USER             HOURS\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  for (let i = 0; i < camOffSorted.length; i++) {
    const [id, h] = camOffSorted[i];
    const member = await client.users.fetch(id).catch(() => null);
    camOffText += `${i + 1}. ${(member?.username || 'Unknown').padEnd(15)} ${formatTime(h.camOff)}\n`;
  }
  camOffText += `\`\`\``;

  embed.addFields(
    { name: "📷 Camera On", value: camOnText || "No data yet!" },
    { name: "❌ Camera Off", value: camOffText || "No data yet!" }
  );

  return embed;
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  await interaction.deferReply(); // ✅ Fix added

  const { commandName, user, options } = interaction;
  loadData();

  if (commandName === 'myhours') {
    const target = options.getUser('user') || user;
    const hours = data.dailyData[target.id] || { camOn: 0, camOff: 0 };
    const focusTag = focusTaglines[Math.floor(Math.random() * focusTaglines.length)];
    const silentTag = silentTaglines[Math.floor(Math.random() * silentTaglines.length)];
    const today = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${target.username}'s Study Report — ${today}`)
      .addFields(
        { name: '✅ Camera On', value: `**${formatTime(hours.camOn)}**\n_${focusTag}_`, inline: true },
        { name: '❌ Camera Off', value: `**${formatTime(hours.camOff)}**\n_${silentTag}_`, inline: true },
        { name: '__⏳ Total__', value: `**${formatTime(hours.camOn + hours.camOff)}**`, inline: false }
      )
      .setColor(0x4e9af1)
      .setFooter({ text: 'Keep grinding! You’re unstoppable!' });

    return interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'leaderboard') {
    const type = options.getString('type');
    const dataset = type === 'daily' ? data.dailyData : data.weeklyData;
    const embed = await generateLeaderboardEmbed(type === 'daily' ? 'Daily' : 'Weekly', dataset);
    return interaction.editReply({ embeds: [embed] });
  }
});

// Auto Tracking every minute
cron.schedule('* * * * *', () => {
  const now = Date.now();
  for (const userId in joinTimestamps) {
    const startTime = joinTimestamps[userId];
    const durationMin = (now - startTime) / 60000;
    const member = client.guilds.cache.first()?.members.cache.get(userId);
    if (!member?.voice.channelId) continue;

    if (CAMERA_ON_ROOM_IDS.includes(member.voice.channelId) || CAMERA_OFF_ROOM_IDS.includes(member.voice.channelId)) {
      const camType = CAMERA_ON_ROOM_IDS.includes(member.voice.channelId) ? 'camOn' : 'camOff';
      for (const dataset of [data.studyData, data.dailyData, data.weeklyData]) {
        if (!dataset[userId]) dataset[userId] = { camOn: 0, camOff: 0 };
        dataset[userId][camType] += 1 / 60;
      }
      joinTimestamps[userId] = now;
    }
  }
  saveData();
});

// Daily Challenge 12:00 AM
cron.schedule('0 0 * * *', () => {
  const quote = [
    "Push yourself, because no one else is going to do it for you.",
    "Every minute counts. Make it worth it.",
    "Study now, shine later."
  ][Math.floor(Math.random() * 3)];

  const embed = new EmbedBuilder()
    .setColor(0xffcc00)
    .setTitle("⏰ 12:00 AM Daily Challenge")
    .setDescription(`>>> **“${quote}”**\n\nStart your grind now!`)
    .setFooter({ text: 'Leaderboard resets daily at midnight IST' });

  client.channels.cache.get(LEADERBOARD_REMINDER_CHANNEL_ID)?.send({ content: '@everyone', embeds: [embed] });
}, { timezone: 'Asia/Kolkata' });

// Daily Leaderboard 11:59 PM
cron.schedule('59 23 * * *', async () => {
  const embed = await generateLeaderboardEmbed('Daily', data.dailyData);
  client.channels.cache.get(DAILY_CHANNEL_ID)?.send({ content: '@everyone', embeds: [embed] });
  data.dailyData = {};
  saveData();
}, { timezone: 'Asia/Kolkata' });

// Weekly Leaderboard Sunday 11:59 PM
cron.schedule('59 23 * * 0', async () => {
  const embed = await generateLeaderboardEmbed('Weekly', data.weeklyData);
  client.channels.cache.get(WEEKLY_CHANNEL_ID)?.send({ content: '@everyone', embeds: [embed] });
  data.weeklyData = {};
  saveData();
}, { timezone: 'Asia/Kolkata' });

client.login(process.env.TOKEN);
