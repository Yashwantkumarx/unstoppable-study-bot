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

// ✅ Rooms Tracking
const CAMERA_ON_ROOM_IDS = ['1398715887728722104', '1300572813047894119', '1393209218055536680'];
const CAMERA_OFF_ROOM_IDS = ['1393209353431027722', '1398719654805115102'];

// ✅ Channels
const DAILY_CHANNEL_ID = '1367618478747680870';
const WEEKLY_CHANNEL_ID = '1367618555339870208';
const ANNOUNCEMENT_CHANNEL_ID = '1216562819135307797';

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

client.once('ready', async () => {
  loadData();

  // Restore timestamps for active voice users
  client.guilds.cache.forEach(guild => {
    guild.channels.cache.forEach(channel => {
      if (channel.type === 2) {
        channel.members.forEach(member => {
          if (!joinTimestamps[member.id]) {
            joinTimestamps[member.id] = Date.now();
          }
        });
      }
    });
  });

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  const commands = [
    new SlashCommandBuilder().setName('myhours').setDescription("Check today's study hours.")
      .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(false)),
    new SlashCommandBuilder().setName('leaderboard').setDescription('Show the leaderboard manually (Admin only).')
      .addStringOption(opt => opt.setName('type').setDescription('Leaderboard Type').setRequired(true)
        .addChoices({ name: 'Daily', value: 'daily' }, { name: 'Weekly', value: 'weekly' })),
  ];
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands.map(cmd => cmd.toJSON()) });
  console.log(`✅ Bot is online as ${client.user.tag}`);
});

client.on('voiceStateUpdate', (oldState, newState) => {
  const userId = newState.id;

  if (!oldState.channelId && newState.channelId) {
    // Only track allowed rooms
    if ([...CAMERA_ON_ROOM_IDS, ...CAMERA_OFF_ROOM_IDS].includes(newState.channelId)) {
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

// ✅ Format time
function formatTime(hr) {
  const h = Math.floor(hr);
  const m = Math.round((hr - h) * 60);
  return `${h}h ${m}m`;
}

// ✅ Generate Stylish Table Leaderboard
function generateTable(sorted, type) {
  if (sorted.length === 0) return `No data yet for ${type}.`;

  let table = `\`\`\`\n# | Name              | Hrs\n------------------------------\n`;
  sorted.forEach(([id, h], i) => {
    const total = type === 'camOn' ? h.camOn : h.camOff;
    table += `${String(i + 1).padEnd(2)}| ${String(h.username || `User`).padEnd(17)}| ${formatTime(total)}\n`;
  });
  table += `\`\`\``;
  return table;
}

// ✅ Fetch Username
async function attachUsernames(dataset) {
  const guild = client.guilds.cache.first();
  for (const id of Object.keys(dataset)) {
    try {
      const member = guild.members.cache.get(id) || await guild.members.fetch(id);
      dataset[id].username = member.displayName;
    } catch {
      dataset[id].username = `User`;
    }
  }
}

// ✅ Generate Embed
async function generateLeaderboardEmbed(title, dataset) {
  await attachUsernames(dataset);

  const camOnSorted = Object.entries(dataset).sort(([, a], [, b]) => b.camOn - a.camOn).slice(0, 10);
  const camOffSorted = Object.entries(dataset).sort(([, a], [, b]) => b.camOff - a.camOff).slice(0, 10);

  return new EmbedBuilder()
    .setTitle(`🏆 **${title} Leaderboard**`)
    .setColor(0x00bfff)
    .addFields(
      { name: `📷 **Camera ON Top 10**`, value: generateTable(camOnSorted, 'camOn') },
      { name: `📴 **Camera OFF Top 10**`, value: generateTable(camOffSorted, 'camOff') }
    )
    .setFooter({ text: `Unstoppable | Owner: Yashwant Kumar` });
}

// ✅ Auto Challenge Post
cron.schedule('0 0 * * *', () => {
  const quotes = [
    "Push yourself, because no one else is going to do it for you.",
    "Every minute counts. Make it worth it.",
    "Study now, shine later.",
    "Today’s hustle, tomorrow’s success."
  ];
  const quote = quotes[Math.floor(Math.random() * quotes.length)];
  const ch = client.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID);

  const embed = new EmbedBuilder()
    .setColor(0xffcc00)
    .setTitle("⏰ **12:00 AM Daily Challenge**")
    .setDescription(`>>> **“${quote}”**\nGrind starts now! Let's make it count!`)
    .setTimestamp();

  ch?.send({ content: '@everyone', embeds: [embed] });
}, { timezone: 'Asia/Kolkata' });

// ✅ Auto Daily Leaderboard + Topper of the Day
cron.schedule('59 23 * * *', async () => {
  const ch = client.channels.cache.get(DAILY_CHANNEL_ID);
  const ann = client.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID);

  const embed = await generateLeaderboardEmbed('Daily', data.dailyData);
  ch?.send({ content: '@everyone', embeds: [embed] });

  // ✅ Topper of the Day
  const topOn = Object.entries(data.dailyData).sort(([, a], [, b]) => b.camOn - a.camOn)[0];
  const topOff = Object.entries(data.dailyData).sort(([, a], [, b]) => b.camOff - a.camOff)[0];

  if (topOn || topOff) {
    const topperEmbed = new EmbedBuilder()
      .setColor(0x4caf50)
      .setTitle("🥇 **Topper of the Day**")
      .addFields(
        topOn ? { name: "📷 Camera ON", value: `**${topOn[1].username}** - ${formatTime(topOn[1].camOn)}` } : {},
        topOff ? { name: "📴 Camera OFF", value: `**${topOff[1].username}** - ${formatTime(topOff[1].camOff)}` } : {}
      )
      .setTimestamp();

    ann?.send({ content: '@everyone', embeds: [topperEmbed] });
  }

  data.dailyData = {};
  saveData();
}, { timezone: 'Asia/Kolkata' });

// ✅ Auto Weekly Leaderboard + Topper of the Week
cron.schedule('59 23 * * 0', async () => {
  const ch = client.channels.cache.get(WEEKLY_CHANNEL_ID);
  const ann = client.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID);

  const embed = await generateLeaderboardEmbed('Weekly', data.weeklyData);
  ch?.send({ content: '@everyone', embeds: [embed] });

  // ✅ Topper of the Week
  const topOn = Object.entries(data.weeklyData).sort(([, a], [, b]) => b.camOn - a.camOn)[0];
  const topOff = Object.entries(data.weeklyData).sort(([, a], [, b]) => b.camOff - a.camOff)[0];

  if (topOn || topOff) {
    const topperEmbed = new EmbedBuilder()
      .setColor(0xff9800)
      .setTitle("🏆 **Topper of the Week**")
      .addFields(
        topOn ? { name: "📷 Camera ON", value: `**${topOn[1].username}** - ${formatTime(topOn[1].camOn)}` } : {},
        topOff ? { name: "📴 Camera OFF", value: `**${topOff[1].username}** - ${formatTime(topOff[1].camOff)}` } : {}
      )
      .setTimestamp();

    ann?.send({ content: '@everyone', embeds: [topperEmbed] });
  }

  data.weeklyData = {};
  saveData();
}, { timezone: 'Asia/Kolkata' });

client.login(process.env.TOKEN);
