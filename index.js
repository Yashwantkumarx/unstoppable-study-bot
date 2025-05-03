const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, Collection } = require('discord.js');
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

// Constants
const CAMERA_ON_ROOM_ID = '1300572813047894119';
const DAILY_CHANNEL_ID = '1367618478747680870';
const WEEKLY_CHANNEL_ID = '1367618555339870208';
const MONTHLY_CHANNEL_ID = '1367618620460499037';

// Data file path
const DATA_FILE_PATH = './data.json';

// Data structures
let data = {
  dailyData: {},
  weeklyData: {},
  monthlyData: {},
  studyData: {}
};

// Load data from file
function loadData() {
  try {
    const fileData = fs.readFileSync(DATA_FILE_PATH, 'utf8');
    data = JSON.parse(fileData);
  } catch (err) {
    console.log('No data file found, initializing new data structure.');
    saveData();
  }
}

// Save data to file
function saveData() {
  fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(data, null, 2));
}

// Taglines
const focusTaglines = ["Laser Focus", "Deep Concentration", "Focus Mode", "Zen State", "Study Warrior"];
const silentTaglines = ["Silent Hustle", "Solo Grind", "Peaceful Push", "Underground Effort", "Hidden Focus"];

// Slash commands
const commands = [
  new SlashCommandBuilder().setName('myhours').setDescription('Check study hours.').addUserOption(option => option.setName('user').setDescription('User').setRequired(false)),
  new SlashCommandBuilder().setName('addhours').setDescription('Add hours to a user.')
    .addUserOption(option => option.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(option => option.setName('hours').setDescription('Hours').setRequired(true))
    .addStringOption(option => option.setName('type').setDescription('Camera type').setRequired(true).addChoices({ name: 'Camera On', value: 'camOn' }, { name: 'Camera Off', value: 'camOff' })),
  new SlashCommandBuilder().setName('removehours').setDescription('Remove hours from a user.')
    .addUserOption(option => option.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(option => option.setName('hours').setDescription('Hours').setRequired(true))
    .addStringOption(option => option.setName('type').setDescription('Camera type').setRequired(true).addChoices({ name: 'Camera On', value: 'camOn' }, { name: 'Camera Off', value: 'camOff' })),
  new SlashCommandBuilder().setName('setcamera').setDescription('Set your camera status.')
    .addStringOption(option => option.setName('status').setDescription('Camera status').setRequired(true).addChoices({ name: 'on', value: 'camOn' }, { name: 'off', value: 'camOff' })),
  new SlashCommandBuilder().setName('leaderboard').setDescription('View the leaderboard')
    .addStringOption(option => option.setName('type').setDescription('Leaderboard type').setRequired(true).addChoices({ name: 'Daily', value: 'daily' }, { name: 'Weekly', value: 'weekly' }, { name: 'Monthly', value: 'monthly' })),
  new SlashCommandBuilder().setName('totalhours').setDescription('View total hours for a user.')
    .addUserOption(option => option.setName('user').setDescription('User').setRequired(true))
];

// Register commands
client.once('ready', async () => {
  loadData();
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
    body: commands.map(cmd => cmd.toJSON())
  });
  console.log(`Bot is online as ${client.user.tag}`);
});

// Voice tracking
client.on('voiceStateUpdate', (oldState, newState) => {
  const userId = oldState.id;
  const now = Date.now();

  if (!data.studyData[userId]) data.studyData[userId] = { camOn: 0, camOff: 0 };

  if (!oldState.channel && newState.channel) {
    const defaultCam = newState.channelId === CAMERA_ON_ROOM_ID ? 'camOn' : 'camOff';
    data.studyData[userId].startTime = now;
    data.studyData[userId].camera = defaultCam;
  }

  if (oldState.channel && !newState.channel && data.studyData[userId]?.startTime) {
    const duration = (now - data.studyData[userId].startTime) / (1000 * 60 * 60);
    const camType = data.studyData[userId].camera;

    if (!data.dailyData[userId]) data.dailyData[userId] = { camOn: 0, camOff: 0 };
    data.dailyData[userId][camType] += duration;
    data.studyData[userId][camType] += duration;

    delete data.studyData[userId].startTime;

    saveData();
  }
});

// Commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user, options } = interaction;

  if (commandName === 'setcamera') {
    const status = options.getString('status');
    if (!data.studyData[user.id]) data.studyData[user.id] = { camOn: 0, camOff: 0 };
    data.studyData[user.id].camera = status;
    saveData();
    return interaction.reply(`Camera status set to: ${status === 'camOn' ? 'ON ✅' : 'OFF ❌'}`);
  }

  if (commandName === 'myhours') {
    const targetUser = options.getUser('user') || user;
    const dataUser = data.dailyData[targetUser.id] || { camOn: 0, camOff: 0 };
    const total = dataUser.camOn + dataUser.camOff;

    const currentDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const focusTag = focusTaglines[Math.floor(Math.random() * focusTaglines.length)];
    const silentTag = silentTaglines[Math.floor(Math.random() * silentTaglines.length)];

    return interaction.reply(
      `**✨ Hey _${targetUser.username}_! Here's your Study Report for ${currentDate}:**\n` +
      `**📷 Camera On:** **${dataUser.camOn.toFixed(2)} hrs ✅** — _${focusTag}_\n` +
      `**📷 Camera Off:** **${dataUser.camOff.toFixed(2)} hrs ❌** — _${silentTag}_\n` +
      `**🕒 Total Time:** **${total.toFixed(2)} hrs**\n` +
      `**⚡ Keep going, Champion! You're unstoppable!**`
    );
  }

  if (commandName === 'addhours') {
    const targetUser = options.getUser('user');
    const hours = options.getInteger('hours');
    const type = options.getString('type');
    if (!data.studyData[targetUser.id]) data.studyData[targetUser.id] = { camOn: 0, camOff: 0 };
    data.studyData[targetUser.id][type] += hours;
    saveData();
    return interaction.reply(`Added ${hours} hrs to ${targetUser.username}'s ${type === 'camOn' ? 'Camera On' : 'Camera Off'} time.`);
  }

  if (commandName === 'removehours') {
    const targetUser = options.getUser('user');
    const hours = options.getInteger('hours');
    const type = options.getString('type');
    if (!data.studyData[targetUser.id]) data.studyData[targetUser.id] = { camOn: 0, camOff: 0 };
    data.studyData[targetUser.id][type] = Math.max(0, data.studyData[targetUser.id][type] - hours);
    saveData();
    return interaction.reply(`Removed ${hours} hrs from ${targetUser.username}'s ${type === 'camOn' ? 'Camera On' : 'Camera Off'} time.`);
  }

  if (commandName === 'leaderboard') {
    const type = options.getString('type');
    const leaderboardData = type === 'daily' ? data.dailyData : type === 'weekly' ? data.weeklyData : data.monthlyData;
    const message = leaderboardMessage(type.charAt(0).toUpperCase() + type.slice(1), leaderboardData);
    return interaction.reply(message);
  }

  if (commandName === 'totalhours') {
    const targetUser = options.getUser('user');
    const total = (data.studyData[targetUser.id]?.camOn || 0) + (data.studyData[targetUser.id]?.camOff || 0);
    return interaction.reply(`**${targetUser.username}** has a total of **${total.toFixed(2)} hours** across Camera On and Camera Off.`);
  }
});

// Leaderboard message builder
function leaderboardMessage(dataType, data) {
  const sorted = Object.entries(data).sort(([, a], [, b]) =>
    (b.camOn + b.camOff) - (a.camOn + a.camOff)
  ).slice(0, 10);

  const currentDate = new Date();
  const weekStartDate = new Date(currentDate);
  weekStartDate.setDate(currentDate.getDate() - currentDate.getDay());
  const weekEndDate = new Date(currentDate);
  weekEndDate.setDate(weekStartDate.getDate() + 6);

  const header =
    dataType === 'Daily' ? `**Daily Leaderboard: ${currentDate.toDateString()}**` :
    dataType === 'Weekly' ? `**Weekly Leaderboard: ${weekStartDate.toDateString()} - ${weekEndDate.toDateString()}**` :
    `**Monthly Leaderboard: ${currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}**`;

  let message = `${header}\n`;

  sorted.forEach(([userId, { camOn, camOff }], index) => {
    const total = camOn + camOff;
    message += `**#${index + 1}** <@${userId}> - **${total.toFixed(2)} hrs** (Camera On: ${camOn.toFixed(2)} hrs | Camera Off: ${camOff.toFixed(2)} hrs)\n`;
  });

  return `@everyone\n${message}`;
}

// Post and reset daily leaderboard
cron.schedule('0 0 * * *', () => {
  const dailyChannel = client.channels.cache.get(DAILY_CHANNEL_ID);
  const weeklyChannel = client.channels.cache.get(WEEKLY_CHANNEL_ID);
  const monthlyChannel = client.channels.cache.get(MONTHLY_CHANNEL_ID);

  // Post leaderboards
  dailyChannel?.send(leaderboardMessage('Daily', data.dailyData));
  weeklyChannel?.send(leaderboardMessage('Weekly', data.weeklyData));
  monthlyChannel?.send(leaderboardMessage('Monthly', data.monthlyData));

  // Update weekly & monthly data
  for (const userId in data.dailyData) {
    const { camOn, camOff } = data.dailyData[userId];

    if (!data.weeklyData[userId]) data.weeklyData[userId] = { camOn: 0, camOff: 0 };
    data.weeklyData[userId].camOn += camOn;
    data.weeklyData[userId].camOff += camOff;

    if (!data.monthlyData[userId]) data.monthlyData[userId] = { camOn: 0, camOff: 0 };
    data.monthlyData[userId].camOn += camOn;
    data.monthlyData[userId].camOff += camOff;
  }

  // Reset daily data
  data.dailyData = {};
  saveData();
}, null, true, 'America/New_York');

// Reset weekly
cron.schedule('0 0 * * 1', () => {
  data.weeklyData = {};
  saveData();
}, null, true, 'America/New_York');

// Reset monthly
cron.schedule('0 0 1 * *', () => {
  data.monthlyData = {};
  saveData();
}, null, true, 'America/New_York');

// Login
client.login(process.env.TOKEN);
