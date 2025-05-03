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

// Data structures for daily, weekly, and monthly tracking
const dailyData = {};   // Today's data
const weeklyData = {};  // Current week's data
const monthlyData = {}; // Current month's data
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

// Handle voice state updates
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

    // Update daily data
    if (!dailyData[userId]) dailyData[userId] = { camOn: 0, camOff: 0 };
    dailyData[userId][camType] += duration;

    // Update studyData for total tracking
    studyData[userId][camType] += duration;

    delete userVoiceState[userId];
  }
});

// Handle interactions (commands)
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

  // Get current date in a readable format (e.g., "May 3, 2025")
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long', // Optional: includes day of the week (e.g., "Monday")
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const focusTag = focusTaglines[Math.floor(Math.random() * focusTaglines.length)];
  const silentTag = silentTaglines[Math.floor(Math.random() * silentTaglines.length)];

  return interaction.reply(
    `**✨ Hey _${targetUser.username}_! Here's your Study Report for ${currentDate}:**\n` +
    `**📷 Camera On:** **${data.camOn.toFixed(2)} hrs ✅** — _${focusTag}_\n` +
    `**📷 Camera Off:** **${data.camOff.toFixed(2)} hrs ❌** — _${silentTag}_\n` +
    `**🕒 Total Time:** **${total.toFixed(2)} hrs**\n` +
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

// Leaderboard Functions
function leaderboardMessage(dataType, data) {
  const sorted = Object.entries(data).sort(([, a], [, b]) =>
    (b.camOn + b.camOff) - (a.camOn + a.camOff)
  ).slice(0, 10);

  // Get the current date and calculate the start and end of the current week
  const currentDate = new Date();
  const dayOfWeek = currentDate.getDay();
  
  // Calculate the start of the week (Monday)
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday (0), move back 6 days
  const startOfWeek = new Date(currentDate);
  startOfWeek.setDate(currentDate.getDate() - daysToMonday);
  
  // Calculate the end of the week (Sunday)
  const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek; // If Sunday (0), stay on that day
  const endOfWeek = new Date(currentDate);
  endOfWeek.setDate(currentDate.getDate() + daysToSunday);

  // Format the start and end dates (e.g., "May 1, 2025" to "May 7, 2025")
  const weekStartDate = startOfWeek.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const weekEndDate = endOfWeek.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `**@everyone**\n**${dataType} Leaderboard for the week from ${weekStartDate} to ${weekEndDate}**\n\n` + sorted.map(([id, d], i) => {
    const crown = i === 0 ? '👑 ' : '';
    return `${crown}<@${id}> 📷 Camera On: **${d.camOn.toFixed(1)} hrs ✅** | 📷 Camera Off: **${d.camOff.toFixed(1)} hrs ❌**`;
  }).join('\n\n');
}

// Cron Jobs (India Timezone = UTC+5:30)
cron.schedule('0 0 * * *', () => {
  // Reset daily data at midnight
  for (const userId in dailyData) {
    if (!weeklyData[userId]) weeklyData[userId] = { camOn: 0, camOff: 0 };
    weeklyData[userId].camOn += dailyData[userId].camOn;
    weeklyData[userId].camOff += dailyData[userId].camOff;

    if (!monthlyData[userId]) monthlyData[userId] = { camOn: 0, camOff: 0 };
    monthlyData[userId].camOn += dailyData[userId].camOn;
    monthlyData[userId].camOff += dailyData[userId].camOff;
  }

  // Reset daily data
  for (const userId in dailyData) {
    dailyData[userId] = { camOn: 0, camOff: 0 };
  }
  console.log('✅ Daily data has been reset.');
});

cron.schedule('0 0 * * 0', () => {
  // Reset weekly data every Sunday
  for (const userId in weeklyData) {
    if (!monthlyData[userId]) monthlyData[userId] = { camOn: 0, camOff: 0 };
    monthlyData[userId].camOn += weeklyData[userId].camOn;
    monthlyData[userId].camOff += weeklyData[userId].camOff;
  }
  for (const userId in weeklyData) {
    weeklyData[userId] = { camOn: 0, camOff: 0 };
  }
  console.log('✅ Weekly data has been reset.');
});

cron.schedule('0 0 28-31 * *', () => {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (now.getDate() === last) {
    // Reset monthly data
    for (const userId in monthlyData) {
      monthlyData[userId] = { camOn: 0, camOff: 0 };
    }
    console.log('✅ Monthly data has been reset.');
  }
});

client.login(process.env.TOKEN);
