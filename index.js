const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, Collection, EmbedBuilder } = require('discord.js');
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

const focusTaglines = ["Focus Mode", "Laser Focus", "Unbreakable Flow", "Mindful Minutes", "Concentration King"];
const silentTaglines = ["Silent Hustle", "Quiet Grind", "Alone But Focused", "Peaceful Push", "Hidden Effort"];
client.once('ready', async () => {
  loadData();
  client.guilds.cache.forEach(guild => {
    guild.channels.cache.forEach(channel => {
      if (channel.type === 2 && (CAMERA_ON_ROOM_IDS.includes(channel.id) || CAMERA_OFF_ROOM_IDS.includes(channel.id))) {
        channel.members.forEach(member => {
          if (!joinTimestamps[member.id]) {
            joinTimestamps[member.id] = Date.now();
            console.log(`Tracking restored for ${member.user.username} in ${channel.name}`);
          }
        });
      }
    });
  });

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  const commands = [
    new SlashCommandBuilder().setName('myhours').setDescription("Check today's study hours.")
      .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(false)),
    new SlashCommandBuilder().setName('leaderboard').setDescription('Show leaderboard.')
      .addStringOption(opt => opt.setName('type').setDescription('Leaderboard Type').setRequired(true)
        .addChoices({ name: 'Daily', value: 'daily' }, { name: 'Weekly', value: 'weekly' })),
    new SlashCommandBuilder().setName('rank').setDescription("Show your leaderboard rank.")
      .addStringOption(opt => opt.setName('type').setDescription('Leaderboard Type').setRequired(true)
        .addChoices(
          { name: 'Daily', value: 'daily' },
          { name: 'Weekly', value: 'weekly' },
          { name: 'Total', value: 'total' }
        )),
  ];

  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands.map(cmd => cmd.toJSON()) }
  );

  console.log(`✅ Bot is online as ${client.user.tag}`);
});
client.on('voiceStateUpdate', (oldState, newState) => {
  const userId = newState.id;
  const isStudyChannel = id => CAMERA_ON_ROOM_IDS.includes(id) || CAMERA_OFF_ROOM_IDS.includes(id);

  const leftStudyChannel = isStudyChannel(oldState.channelId);
  const joinedStudyChannel = isStudyChannel(newState.channelId);

  if (!oldState.channelId && joinedStudyChannel) {
    joinTimestamps[userId] = Date.now();
  } else if (leftStudyChannel && !newState.channelId) {
    const startTime = joinTimestamps[userId];
    if (!startTime) return;

    const durationHrs = (Date.now() - startTime) / 3600000;
    const camType = CAMERA_ON_ROOM_IDS.includes(oldState.channelId) ? 'camOn' : 'camOff';

    for (const dataset of [data.studyData, data.dailyData, data.weeklyData]) {
      if (!dataset[userId]) dataset[userId] = { camOn: 0, camOff: 0 };
      dataset[userId][camType] += durationHrs;
    }

    delete joinTimestamps[userId];
    saveData();
  } else if (leftStudyChannel && joinedStudyChannel && oldState.channelId !== newState.channelId) {
    const startTime = joinTimestamps[userId];
    if (!startTime) return;

    const durationHrs = (Date.now() - startTime) / 3600000;
    const oldCamType = CAMERA_ON_ROOM_IDS.includes(oldState.channelId) ? 'camOn' : 'camOff';

    for (const dataset of [data.studyData, data.dailyData, data.weeklyData]) {
      if (!dataset[userId]) dataset[userId] = { camOn: 0, camOff: 0 };
      dataset[userId][oldCamType] += durationHrs;
    }

    joinTimestamps[userId] = Date.now();
    saveData();
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
    return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  } else {
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const weekStart = new Date(nowIST);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const start = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }).format(weekStart);
    const end = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }).format(nowIST);
    return `Week: ${start} → ${end}`;
  }
}

async function generateLeaderboardEmbed(title, dataset) {
  const label = getISTDateLabel(title);
  const camOnSorted = Object.entries(dataset).sort(([, a], [, b]) => b.camOn - a.camOn).slice(0, 10);
  const camOffSorted = Object.entries(dataset).sort(([, a], [, b]) => b.camOff - a.camOff).slice(0, 10);

  const embed = new EmbedBuilder()
    .setTitle(`🏆 __${title} Leaderboard__ — ${label}`)
    .setDescription(`**━━━━━━━━ SERVER INFO ━━━━━━━━**\n**Server:** __Unstoppable__\n**Owner:** __Yashwant Kumar__\n━━━━━━━━━━━━━━━━━━━━━━`)
    .setColor(0x00bfff)
    .setFooter({ text: 'Top 10 Students Hustling!' });

  async function makeTable(sorted, type) {
    let text = `\`\`\`\n#  USER             HOURS\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    for (let i = 0; i < sorted.length; i++) {
      const [id, h] = sorted[i];
      const user = client.users.cache.get(id) || await client.users.fetch(id).catch(() => null);
      const username = user?.username || "Unknown";
      text += `${String(i + 1).padEnd(2)} ${username.padEnd(15)} ${formatTime(h[type])}\n`;
    }
    text += `\`\`\``;
    return text;
  }

  embed.addFields(
    { name: "📷 Camera On", value: camOnSorted.length ? await makeTable(camOnSorted, 'camOn') : "No data yet!" },
    { name: "❌ Camera Off", value: camOffSorted.length ? await makeTable(camOffSorted, 'camOff') : "No data yet!" }
  );

  return { embed, camOnTopper: camOnSorted[0], camOffTopper: camOffSorted[0] };
}
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  await interaction.deferReply();

  const { commandName, user, options } = interaction;
  loadData();

  if (commandName === 'myhours') {
    const target = options.getUser('user') || user;
    const hours = data.dailyData[target.id] || { camOn: 0, camOff: 0 };
    const focusTag = focusTaglines[Math.floor(Math.random() * focusTaglines.length)];
    const silentTag = silentTaglines[Math.floor(Math.random() * silentTaglines.length)];
    const today = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const embed = new EmbedBuilder()
      .setTitle(`📊 __${target.username}'s Study Report__ — ${today}`)
      .setDescription(`**━━━━━━━━ SERVER INFO ━━━━━━━━**\n**Server:** __Unstoppable__\n**Owner:** __Yashwant Kumar__\n━━━━━━━━━━━━━━━━━━━━━━`)
      .addFields(
        { name: '✅ Camera On', value: `\`\`\`\n${formatTime(hours.camOn)}\n━━━━━━━━━━\n${focusTag}\`\`\``, inline: true },
        { name: '❌ Camera Off', value: `\`\`\`\n${formatTime(hours.camOff)}\n━━━━━━━━━━\n${silentTag}\`\`\``, inline: true },
        { name: '__⏳ Total__', value: `\`\`\`\n${formatTime(hours.camOn + hours.camOff)}\n━━━━━━━━━━\`\`\``, inline: false }
      )
      .setColor(0x4e9af1)
      .setFooter({ text: 'Keep grinding! You’re unstoppable!' });

    return interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'leaderboard') {
    const type = options.getString('type');
    const dataset = type === 'daily' ? data.dailyData : data.weeklyData;
    const { embed } = await generateLeaderboardEmbed(type === 'daily' ? 'Daily' : 'Weekly', dataset);
    return interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'rank') {
    const type = options.getString('type');
    const target = user;
    const dataset =
      type === 'daily' ? data.dailyData :
      type === 'weekly' ? data.weeklyData :
      data.studyData;

    const entries = Object.entries(dataset);
    const sorted = entries.sort(([, a], [, b]) => (b.camOn + b.camOff) - (a.camOn + a.camOff));
    const rankIndex = sorted.findIndex(([id]) => id === target.id);
    const userData = dataset[target.id] || { camOn: 0, camOff: 0 };

    const totalTime = userData.camOn + userData.camOff;

    const embed = new EmbedBuilder()
      .setTitle(`📈 ${target.username}'s Rank — ${type.toUpperCase()} Leaderboard`)
      .addFields(
        { name: '🎖 Rank', value: rankIndex !== -1 ? `#${rankIndex + 1}` : 'Unranked', inline: true },
        { name: '✅ Camera On', value: `\`\`\`\n${formatTime(userData.camOn)}\n\`\`\``, inline: true },
        { name: '❌ Camera Off', value: `\`\`\`\n${formatTime(userData.camOff)}\n\`\`\``, inline: true },
        { name: '⏳ Total', value: `\`\`\`\n${formatTime(totalTime)}\n\`\`\``, inline: false }
      )
      .setColor(0xf39c12)
      .setFooter({ text: `Based on ${type} leaderboard.` });

    return interaction.editReply({ embeds: [embed] });
  }
});
// ========== DAILY TOPPER ANNOUNCEMENT ==========

cron.schedule('59 23 * * *', async () => {
  const embed = await generateLeaderboardEmbed('Daily', data.dailyData);
  client.channels.cache.get(DAILY_CHANNEL_ID)?.send({ content: '@everyone', embeds: [embed] });

  const camOnTop = Object.entries(data.dailyData).sort(([, a], [, b]) => b.camOn - a.camOn)[0];
  const camOffTop = Object.entries(data.dailyData).sort(([, a], [, b]) => b.camOff - a.camOff)[0];

  const announcementChannel = client.channels.cache.get('1216562819135307797'); // Announcement room

  if (camOnTop) {
    const user = await client.users.fetch(camOnTop[0]).catch(() => null);
    announcementChannel?.send({
      content: `🎉 Congrats to **${user?.username || "Topper"}** for topping today's 📷 **Camera On** leaderboard! Keep hustling! 💪`,
    });
  }

  if (camOffTop) {
    const user = await client.users.fetch(camOffTop[0]).catch(() => null);
    announcementChannel?.send({
      content: `📢 Shoutout to **${user?.username || "Topper"}** for leading today's ❌ **Camera Off** leaderboard! Silent grinding is real! 🧠`,
    });
  }

  data.dailyData = {};
  saveData();
}, { timezone: 'Asia/Kolkata' });

// ========== WEEKLY TOPPER ANNOUNCEMENT ==========

cron.schedule('59 23 * * 0', async () => {
  const embed = await generateLeaderboardEmbed('Weekly', data.weeklyData);
  client.channels.cache.get(WEEKLY_CHANNEL_ID)?.send({ content: '@everyone', embeds: [embed] });

  const camOnTop = Object.entries(data.weeklyData).sort(([, a], [, b]) => b.camOn - a.camOn)[0];
  const camOffTop = Object.entries(data.weeklyData).sort(([, a], [, b]) => b.camOff - a.camOff)[0];

  const announcementChannel = client.channels.cache.get('1216562819135307797');

  if (camOnTop) {
    const user = await client.users.fetch(camOnTop[0]).catch(() => null);
    announcementChannel?.send({
      content: `🏆 Weekly 📷 **Camera On** topper is **${user?.username || "Topper"}**! Insane focus all week! 🔥`,
    });
  }

  if (camOffTop) {
    const user = await client.users.fetch(camOffTop[0]).catch(() => null);
    announcementChannel?.send({
      content: `🏅 Weekly ❌ **Camera Off** topper is **${user?.username || "Topper"}**! Consistent hustle in silence! 😤`,
    });
  }

  data.weeklyData = {};
  saveData();
}, { timezone: 'Asia/Kolkata' });
// ========== AUTO MOTIVATIONAL MESSAGE EVERY 4 HOURS ==========

const MOTIVATIONAL_QUOTES = [
  "Success doesn’t come from what you do occasionally, it comes from what you do consistently.",
  "Stay focused and never give up on your dreams!",
  "Grind in silence, let your success make the noise.",
  "You are doing great — just keep going!",
  "Discipline is choosing between what you want now and what you want most.",
  "Every study minute you put in today is one step closer to your goals.",
  "Winners are not those who never fail, but those who never quit.",
  "Your future self is watching you. Don’t disappoint them!",
  "Don’t stop until you’re proud.",
  "Work hard in silence, let success be your noise.",
];

cron.schedule('0 */4 * * *', () => {
  const announcementChannel = client.channels.cache.get('1216562819135307797');
  const quote = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];

  if (announcementChannel) {
    announcementChannel.send({
      content: `💡 **Motivation Boost!**\n>>> *${quote}*`,
    });
  }
}, { timezone: 'Asia/Kolkata' });
// ========== CRASH SAFETY ==========

process.on('unhandledRejection', err => {
  console.error('❌ Unhandled Promise Rejection:', err);
});

process.on('uncaughtException', err => {
  console.error('🔥 Uncaught Exception:', err);
});

// ========== BOT LOGIN ==========

client.login(process.env.TOKEN).then(() => {
  console.log("✅ Bot has been successfully logged in.");
}).catch(err => {
  console.error("❌ Failed to log in:", err);
});
