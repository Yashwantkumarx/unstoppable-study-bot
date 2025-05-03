
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

const dailyFocusTags = ["Daily Hustler", "Fresh Grind", "New Day, New Wins", "Consistent Start", "Every Hour Counts"];
const dailySilentTags = ["Silent Sprint", "Quick Push", "Focused Burst", "Micro Mission", "Low-Key Legend"];
const weeklyFocusTags = ["Weekly Warrior", "Midweek Machine", "Steady Stride", "Consistency King", "Pace Setter"];
const weeklySilentTags = ["Silent Climber", "Grinding Ghost", "Steady Storm", "Focused Flare", "Quiet Power"];
const monthlyFocusTags = ["Monthly Master", "Legend of the Month", "Endurance Elite", "Final Boss", "Peak Performer"];
const monthlySilentTags = ["Calm Crusher", "Shadow Grinder", "Unseen Achiever", "Silent Champion", "Hustle Hero"];

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
    const focusTag = dailyFocusTags[Math.floor(Math.random() * dailyFocusTags.length)];
    const silentTag = dailySilentTags[Math.floor(Math.random() * dailySilentTags.length)];
    const today = new Date().toLocaleDateString('en-IN');

    return interaction.reply(
      `**📅 ${today} — Study Report for _${targetUser.username}_**
**📷 Camera On:** **${data.camOn.toFixed(2)} hrs ✅** — _${focusTag}_
**📷 Camera Off:** **${data.camOff.toFixed(2)} hrs ❌** — _${silentTag}_

**🕒 Total Time:** **${total.toFixed(2)} hrs**
**⚡ Keep going, Champion! You're unstoppable!**`
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

function leaderboardMessage(type, focusTags, silentTags) {
  const sorted = Object.entries(studyData).sort(([, a], [, b]) =>
    (b.camOn + b.camOff) - (a.camOn + a.camOff)
  ).slice(0, 10);
  const today = new Date().toLocaleDateString('en-IN');

  return `@everyone
**${type} Leaderboard — ${today}**

` + sorted.map(([id, d], i) => {
    const crown = i === 0 ? '👑 ' : '';
    const focusTag = focusTags[Math.floor(Math.random() * focusTags.length)];
    const silentTag = silentTags[Math.floor(Math.random() * silentTags.length)];
    return `${crown}<@${id}>
📷 Camera On: **${d.camOn.toFixed(1)} hrs ✅** — _${focusTag}_
📷 Camera Off: **${d.camOff.toFixed(1)} hrs ❌** — _${silentTag}_
🕒 Total: **${(d.camOn + d.camOff).toFixed(1)} hrs**`;
  }).join('

');
}

cron.schedule('30 18 * * *', () => {
  const ch = client.channels.cache.get(process.env.DAILY_CHANNEL_ID);
  if (ch) ch.send(leaderboardMessage('Daily', dailyFocusTags, dailySilentTags));
});

cron.schedule('30 18 * * 0', () => {
  const ch = client.channels.cache.get(process.env.WEEKLY_CHANNEL_ID);
  if (ch) ch.send(leaderboardMessage('Weekly', weeklyFocusTags, weeklySilentTags));
});

cron.schedule('30 18 28-31 * *', () => {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (now.getDate() === last) {
    const ch = client.channels.cache.get(process.env.MONTHLY_CHANNEL_ID);
    if (ch) ch.send(leaderboardMessage('Monthly', monthlyFocusTags, monthlySilentTags));
  }
});

client.login(process.env.TOKEN);
