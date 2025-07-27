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

// ✅ Room IDs
const CAMERA_ON_ROOM_IDS = ['1398715887728722104', '1300572813047894119', '1393209218055536680'];
const CAMERA_OFF_ROOM_IDS = ['1393209353431027722', '1398719654805115102'];

// ✅ Channel IDs
const DAILY_CHANNEL_ID = '1367618478747680870';
const WEEKLY_CHANNEL_ID = '1367618555339870208';
const LEADERBOARD_REMINDER_CHANNEL_ID = '1216562819135307797';
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
  return `${h}h ${m}m`;
}

function getISTDateLabel(title) {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' });

  if (title === 'Daily') {
    const weekday = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long' }).format(now);
    return `${weekday}, ${formatter.format(now)}`;
  } else if (title === 'Weekly') {
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const weekStart = new Date(nowIST);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const start = formatter.format(weekStart);
    const end = formatter.format(nowIST);
    return `Week: ${start} → ${end}`;
  }
}

// ✅ Leaderboard Embed (Box Table Style)
async function generateLeaderboardEmbed(title, dataset) {
  const camOnSorted = Object.entries(dataset)
    .sort(([, a], [, b]) => b.camOn - a.camOn)
    .slice(0, 10);
  const camOffSorted = Object.entries(dataset)
    .sort(([, a], [, b]) => b.camOff - a.camOff)
    .slice(0, 10);

  const label = getISTDateLabel(title);

  function makeTable(sorted, type) {
    let text = "```";
    text += "\n# | Name              | Hours\n";
    text += "-----------------------------\n";
    sorted.forEach(([id, h], i) => {
      const total = type === 'camOn' ? h.camOn : h.camOff;
      text += `${String(i + 1).padEnd(2)}| ${(client.guilds.cache.first()?.members.cache.get(id)?.displayName || `User ${id}`).slice(0, 15).padEnd(17)}| ${formatTime(total)}\n`;
    });
    return text + "```";
  }

  const embed = new EmbedBuilder()
    .setTitle(`🏆 **${title} Leaderboard** — ${label}`)
    .setColor(0x00bfff)
    .addFields(
      { name: "📷 **Camera On**", value: camOnSorted.length ? makeTable(camOnSorted, 'camOn') : "_No data yet!_", inline: false },
      { name: "📴 **Camera Off**", value: camOffSorted.length ? makeTable(camOffSorted, 'camOff') : "_No data yet!_", inline: false }
    )
    .setFooter({ text: 'Unstoppable | Hustle every day!' });

  return embed;
}

client.once('ready', async () => {
  loadData();

  // Restore timestamps for active voice users
  client.guilds.cache.forEach(guild => {
    guild.channels.cache.forEach(channel => {
      if (channel.type === 2) {
        channel.members.forEach(member => {
          if (!joinTimestamps[member.id]) joinTimestamps[member.id] = Date.now();
        });
      }
    });
  });

  // ✅ Instant Slash Command Registration (Guild-based)
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  const commands = [
    new SlashCommandBuilder().setName('myhours').setDescription("Check today's study hours.")
      .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(false)),
    new SlashCommandBuilder().setName('addhours').setDescription('Add hours for a user.')
      .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption(opt => opt.setName('hours').setDescription('Hours').setRequired(true))
      .addStringOption(opt => opt.setName('type').setDescription('Camera Type').setRequired(true)
        .addChoices({ name: 'Camera On', value: 'camOn' }, { name: 'Camera Off', value: 'camOff' })),
    new SlashCommandBuilder().setName('removehours').setDescription('Remove hours for a user.')
      .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption(opt => opt.setName('hours').setDescription('Hours').setRequired(true))
      .addStringOption(opt => opt.setName('type').setDescription('Camera Type').setRequired(true)
        .addChoices({ name: 'Camera On', value: 'camOn' }, { name: 'Camera Off', value: 'camOff' })),
    new SlashCommandBuilder().setName('leaderboard').setDescription('Show the leaderboard manually (Admin only).')
      .addStringOption(opt => opt.setName('type').setDescription('Leaderboard Type').setRequired(true)
        .addChoices({ name: 'Daily', value: 'daily' }, { name: 'Weekly', value: 'weekly' }))
  ];

  try {
    const guildId = process.env.GUILD_ID;
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId), { body: commands.map(cmd => cmd.toJSON()) });
    console.log(`✅ Slash commands registered instantly for guild: ${guildId}`);
  } catch (err) {
    console.error("❌ Error registering commands:", err);
  }

  console.log(`Bot is online as ${client.user.tag}`);
});

// ✅ Voice State Tracking
client.on('voiceStateUpdate', (oldState, newState) => {
  const userId = newState.id;

  if (!oldState.channelId && newState.channelId) {
    if (![...CAMERA_ON_ROOM_IDS, ...CAMERA_OFF_ROOM_IDS].includes(newState.channelId)) return;
    joinTimestamps[userId] = Date.now();
  }

  if (oldState.channelId && !newState.channelId) {
    if (![...CAMERA_ON_ROOM_IDS, ...CAMERA_OFF_ROOM_IDS].includes(oldState.channelId)) return;
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

// ✅ Auto Save Every Minute
cron.schedule('* * * * *', () => {
  const now = Date.now();
  for (const userId in joinTimestamps) {
    const member = client.guilds.cache.first()?.members.cache.get(userId);
    if (!member?.voice.channelId) continue;
    if (![...CAMERA_ON_ROOM_IDS, ...CAMERA_OFF_ROOM_IDS].includes(member.voice.channelId)) continue;

    const camType = CAMERA_ON_ROOM_IDS.includes(member.voice.channelId) ? 'camOn' : 'camOff';
    for (const dataset of [data.studyData, data.dailyData, data.weeklyData]) {
      if (!dataset[userId]) dataset[userId] = { camOn: 0, camOff: 0 };
      dataset[userId][camType] += 1 / 60;
    }

    joinTimestamps[userId] = now;
  }
  saveData();
});

// ✅ Auto Daily Challenge Post
const motivationalQuotes = [
  "Push yourself, because no one else is going to do it for you.",
  "Every minute counts. Make it worth it.",
  "Study now, shine later.",
  "Today’s hustle, tomorrow’s success.",
  "Discipline is the bridge between goals and achievement."
];

cron.schedule('0 0 * * *', () => {
  const quote = motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];
  const channel = client.channels.cache.get(LEADERBOARD_REMINDER_CHANNEL_ID);

  const embed = new EmbedBuilder()
    .setColor(0xffcc00)
    .setTitle("⏰ 12:00 AM Daily Challenge")
    .setDescription(`>>> **“${quote}”**\n\n__Do you have what it takes to be on today's leaderboard?__`)
    .setThumbnail('https://cdn-icons-png.flaticon.com/512/1055/1055646.png')
    .setFooter({ text: 'Unstoppable | Leaderboard resets daily at midnight IST' })
    .setTimestamp();

  channel?.send({ content: '@everyone', embeds: [embed] });
}, { timezone: 'Asia/Kolkata' });

// ✅ Auto Daily Leaderboard
cron.schedule('59 23 * * *', () => {
  const ch = client.channels.cache.get(DAILY_CHANNEL_ID);
  (async () => {
    const embed = await generateLeaderboardEmbed('Daily', data.dailyData);
    ch?.send({ content: '@everyone', embeds: [embed] });
    data.dailyData = {};
    saveData();
  })();
}, { timezone: 'Asia/Kolkata' });

// ✅ Auto Weekly Leaderboard
cron.schedule('59 23 * * 0', () => {
  const ch = client.channels.cache.get(WEEKLY_CHANNEL_ID);
  (async () => {
    const embed = await generateLeaderboardEmbed('Weekly', data.weeklyData);
    ch?.send({ content: '@everyone', embeds: [embed] });
    data.weeklyData = {};
    saveData();
  })();
}, { timezone: 'Asia/Kolkata' });

client.login(process.env.TOKEN);
