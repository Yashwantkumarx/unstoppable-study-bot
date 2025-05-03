const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, Collection } = require('discord.js');
const cron = require('node-cron');
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

const studyData = {};
const cameraStatus = {};
const userVoiceState = {};
const CAMERA_ON_ROOM_ID = '1300572813047894119';

const focusTaglines = ["Laser Focus", "Deep Concentration", "Focus Mode", "Zen State", "Study Warrior"];
const silentTaglines = ["Silent Hustle", "Solo Grind", "Peaceful Push", "Underground Effort", "Hidden Focus"];

const commands = [
  new SlashCommandBuilder()
    .setName('myhours')
    .setDescription('Check study hours.')
    .addUserOption(option => option.setName('user').setDescription('User').setRequired(false)),
  new SlashCommandBuilder()
    .setName('addhours')
    .setDescription('Add hours to a user.')
    .addUserOption(option => option.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(option => option.setName('hours').setDescription('Hours').setRequired(true))
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Camera type')
        .setRequired(true)
        .addChoices(
          { name: 'Camera On', value: 'camOn' },
          { name: 'Camera Off', value: 'camOff' }
        )),
  new SlashCommandBuilder()
    .setName('removehours')
    .setDescription('Remove hours from a user.')
    .addUserOption(option => option.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(option => option.setName('hours').setDescription('Hours').setRequired(true))
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Camera type')
        .setRequired(true)
        .addChoices(
          { name: 'Camera On', value: 'camOn' },
          { name: 'Camera Off', value: 'camOff' }
        )),
  new SlashCommandBuilder()
    .setName('setcamera')
    .setDescription('Set your camera status.')
    .addStringOption(option =>
      option.setName('status')
        .setDescription('Camera status')
        .setRequired(true)
        .addChoices({ name: 'on', value: 'camOn' }, { name: 'off', value: 'camOff' }))
];

client.once('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
    body: commands.map(cmd => cmd.toJSON())
  });
  console.log(`Bot is online as ${client.user.tag}`);
});

client.on('voiceStateUpdate', (oldState, newState) => {
  const userId = newState.id;
  const now = Date.now();

  if (!studyData[userId]) {
    studyData[userId] = { camOn: 0, camOff: 0 };
  }

  if (!oldState.channel && newState.channel) {
    const defaultCam = newState.channelId === CAMERA_ON_ROOM_ID ? 'camOn' : 'camOff';
    userVoiceState[userId] = {
      startTime: now,
      camera: cameraStatus[userId] || defaultCam
    };
  }

  if (oldState.channel && !newState.channel && userVoiceState[userId]) {
    const duration = (now - userVoiceState[userId].startTime) / (1000 * 60 * 60);
    const camType = userVoiceState[userId].camera;
    studyData[userId][camType] += duration;
    delete userVoiceState[userId];
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user, options } = interaction;

  if (commandName === 'setcamera') {
    const status = options.getString('status');
    cameraStatus[user.id] = status;
    return interaction.reply(`Camera status set to: ${status === 'camOn' ? 'ON ✅' : 'OFF ❌'}`);
  }

  if (commandName === 'myhours') {
    const targetUser = options.getUser('user') || user;
    const data = studyData[targetUser.id] || { camOn: 0, camOff: 0 };
    const total = data.camOn + data.camOff;
    const focusTag = focusTaglines[Math.floor(Math.random() * focusTaglines.length)];
    const silentTag = silentTaglines[Math.floor(Math.random() * silentTaglines.length)];

    return interaction.reply(
      `**✨ Hey _${targetUser.username}_! Here's your Study Report:**

` +
      `**📷 Camera On:** **${data.camOn.toFixed(2)} hrs ✅** — _${focusTag}_
` +
      `**📷 Camera Off:** **${data.camOff.toFixed(2)} hrs ❌** — _${silentTag}_

` +
      `**🕒 Total Time:** **${total.toFixed(2)} hrs**

` +
      `**⚡ Keep going, Champion! You're unstoppable!**`
    );
  }

  if (commandName === 'addhours') {
    const targetUser = options.getUser('user');
    const hours = options.getInteger('hours');
    const type = options.getString('type');
    if (!studyData[targetUser.id]) studyData[targetUser.id] = { camOn: 0, camOff: 0 };
    studyData[targetUser.id][type] += hours;
    return interaction.reply(`Added ${hours} hrs to ${targetUser.username}'s ${type === 'camOn' ? 'Camera On' : 'Camera Off'} time.`);
  }

  if (commandName === 'removehours') {
    const targetUser = options.getUser('user');
    const hours = options.getInteger('hours');
    const type = options.getString('type');
    if (!studyData[targetUser.id]) studyData[targetUser.id] = { camOn: 0, camOff: 0 };
    studyData[targetUser.id][type] = Math.max(0, studyData[targetUser.id][type] - hours);
    return interaction.reply(`Removed ${hours} hrs from ${targetUser.username}'s ${type === 'camOn' ? 'Camera On' : 'Camera Off'} time.`);
  }
});

function leaderboardMessage(type, limit = 10) {
  const sorted = Object.entries(studyData).sort(([, a], [, b]) =>
    (b.camOn + b.camOff) - (a.camOn + a.camOff)
  ).slice(0, limit);

  return `**${type} Leaderboard**

` + sorted.map(([id, d], i) => {
    const crown = i === 0 ? '👑 ' : '';
    const focusTag = focusTaglines[Math.floor(Math.random() * focusTaglines.length)];
    const silentTag = silentTaglines[Math.floor(Math.random() * silentTaglines.length)];
    return `${crown}<@${id}>
📷 Camera On: **${d.camOn.toFixed(1)} hrs ✅** — _${focusTag}_
📷 Camera Off: **${d.camOff.toFixed(1)} hrs ❌** — _${silentTag}_`;
  }).join('\n\n');
}

// Cron Jobs (India Timezone = UTC+5:30)
cron.schedule('30 18 * * *', () => {
  const ch = client.channels.cache.get(process.env.DAILY_CHANNEL_ID);
  if (ch) ch.send(leaderboardMessage('Daily', 10));
});

cron.schedule('30 18 * * 0', () => {
  const ch = client.channels.cache.get(process.env.WEEKLY_CHANNEL_ID);
  if (ch) ch.send(leaderboardMessage('Weekly', 15));
});

cron.schedule('30 18 28-31 * *', () => {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (now.getDate() === last) {
    const ch = client.channels.cache.get(process.env.MONTHLY_CHANNEL_ID);
    if (ch) ch.send(leaderboardMessage('Monthly', 20));
  }
});

client.login(process.env.TOKEN);

const cron = require('node-cron');
const { Client } = require('discord.js');
const client = new Client();

function resetStudyData() {
  for (const userId in studyData) {
    studyData[userId] = { camOn: 0, camOff: 0 };
  }
}

function leaderboardMessage(type, limit = 10) {
  const sorted = Object.entries(studyData).sort(([, a], [, b]) =>
    (b.camOn + b.camOff) - (a.camOn + a.camOff)
  ).slice(0, limit);

  return sorted.map(([id, d], i) => {
    const crown = i === 0 ? '👑 ' : '';
    return `${crown}<@${id}>
📷 Camera On: **${d.camOn.toFixed(1)} hrs ✅**
📷 Camera Off: **${d.camOff.toFixed(1)} hrs ❌**
🧮 Total: **${(d.camOn + d.camOff).toFixed(1)} hrs**`;
  }).join('\n\n');
}

// Daily reset at 11:59:59 PM IST
cron.schedule('59 29 18 * * *', () => {
  const ch = client.channels.cache.get(process.env.DAILY_CHANNEL_ID);
  const date = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
  if (ch) ch.send(`@everyone 📅 **Daily Leaderboard - ${date}**\n\n` + leaderboardMessage('Daily', 10));
  resetStudyData();
});

// Weekly reset on Sunday 11:59:59 PM IST
cron.schedule('59 29 18 * * 0', () => {
  const ch = client.channels.cache.get(process.env.WEEKLY_CHANNEL_ID);
  const date = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
  if (ch) ch.send(`@everyone 📆 **Weekly Leaderboard - Week Ending ${date}**\n\n` + leaderboardMessage('Weekly', 15));
  resetStudyData();
});

// Monthly reset on last day of month 11:59:59 PM IST
cron.schedule('59 29 18 28-31 * *', () => {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (now.getDate() === last) {
    const ch = client.channels.cache.get(process.env.MONTHLY_CHANNEL_ID);
    const month = now.toLocaleString('default', { month: 'long' });
    if (ch) ch.send(`@everyone 📊 **Monthly Leaderboard - ${month}**\n\n` + leaderboardMessage('Monthly', 20));
    resetStudyData();
  }
});
