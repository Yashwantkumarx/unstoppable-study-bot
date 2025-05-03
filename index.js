const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, Collection, PermissionsBitField } = require('discord.js');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const express = require('express');
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

const CAMERA_ON_ROOM_ID = '1300572813047894119';
const DAILY_CHANNEL_ID = '1367618478747680870';
const WEEKLY_CHANNEL_ID = '1367618555339870208';
const MONTHLY_CHANNEL_ID = '1367618620460499037';
const DATA_FILE_PATH = './data.json';

let data = {
  dailyData: {},
  weeklyData: {},
  monthlyData: {},
  studyData: {}
};

function loadData() {
  try {
    const fileData = fs.readFileSync(DATA_FILE_PATH, 'utf8');
    data = JSON.parse(fileData);
  } catch (err) {
    saveData();
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(data, null, 2));
}

const focusTaglines = ["Laser Focus", "Deep Concentration", "Focus Mode", "Zen State", "Study Warrior"];
const silentTaglines = ["Silent Hustle", "Solo Grind", "Peaceful Push", "Underground Effort", "Hidden Focus"];

const commands = [
  new SlashCommandBuilder().setName('myhours').setDescription('Check today\'s study hours.')
    .addUserOption(option => option.setName('user').setDescription('User').setRequired(false)),
  new SlashCommandBuilder().setName('addhours').setDescription('Add hours to a user.')
    .addUserOption(option => option.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(option => option.setName('hours').setDescription('Hours').setRequired(true))
    .addStringOption(option => option.setName('type').setDescription('Camera type').setRequired(true)
      .addChoices({ name: 'Camera On', value: 'camOn' }, { name: 'Camera Off', value: 'camOff' })),
  new SlashCommandBuilder().setName('removehours').setDescription('Remove hours from a user.')
    .addUserOption(option => option.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(option => option.setName('hours').setDescription('Hours').setRequired(true))
    .addStringOption(option => option.setName('type').setDescription('Camera type').setRequired(true)
      .addChoices({ name: 'Camera On', value: 'camOn' }, { name: 'Camera Off', value: 'camOff' })),
  new SlashCommandBuilder().setName('leaderboard').setDescription('View the leaderboard.')
    .addStringOption(option => option.setName('type').setDescription('Type').setRequired(true)
      .addChoices({ name: 'Daily', value: 'daily' }, { name: 'Weekly', value: 'weekly' }, { name: 'Monthly', value: 'monthly' })),
  new SlashCommandBuilder().setName('totalhours').setDescription('View total hours for a user.')
    .addUserOption(option => option.setName('user').setDescription('User').setRequired(true))
];

client.once('ready', async () => {
  loadData();
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands.map(cmd => cmd.toJSON()) });
  console.log(`Bot is online as ${client.user.tag}`);
});

client.on('voiceStateUpdate', (oldState, newState) => {
  const userId = newState.id;
  const now = Date.now();
  if (!data.studyData[userId]) data.studyData[userId] = { camOn: 0, camOff: 0 };

  if (!oldState.channel && newState.channel) {
    const defaultCam = newState.channelId === CAMERA_ON_ROOM_ID ? 'camOn' : 'camOff';
    data.studyData[userId].startTime = now;
    data.studyData[userId].camera = defaultCam;
  }

  if (oldState.channel && !newState.channel && data.studyData[userId]?.startTime) {
    const duration = (now - data.studyData[userId].startTime) / 3600000;
    const camType = data.studyData[userId].camera;
    if (!data.dailyData[userId]) data.dailyData[userId] = { camOn: 0, camOff: 0 };
    if (!data.weeklyData[userId]) data.weeklyData[userId] = { camOn: 0, camOff: 0 };
    if (!data.monthlyData[userId]) data.monthlyData[userId] = { camOn: 0, camOff: 0 };
    data.dailyData[userId][camType] += duration;
    data.weeklyData[userId][camType] += duration;
    data.monthlyData[userId][camType] += duration;
    data.studyData[userId][camType] += duration;
    delete data.studyData[userId].startTime;
    saveData();
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, user, options } = interaction;

  if (commandName === 'myhours') {
    const target = options.getUser('user') || user;
    const hours = data.dailyData[target.id] || { camOn: 0, camOff: 0 };
    const focusTag = focusTaglines[Math.floor(Math.random() * focusTaglines.length)];
    const silentTag = silentTaglines[Math.floor(Math.random() * silentTaglines.length)];
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    return interaction.reply(`**✨ Hey _${target.username}_! Here's your Study Report for ${today}:**\n` +
      `**📷 Camera On:** **${hours.camOn.toFixed(2)} hrs ✅** — _${focusTag}_\n` +
      `**📷 Camera Off:** **${hours.camOff.toFixed(2)} hrs ❌** — _${silentTag}_\n` +
      `**🕒 Total Time:** **${(hours.camOn + hours.camOff).toFixed(2)} hrs**\n` +
      `**⚡ Keep going, Champion! You're unstoppable!**`);
  }

  if (commandName === 'addhours' || commandName === 'removehours') {
    const member = await interaction.guild.members.fetch(user.id);
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: 'You are not allowed to use this command.', ephemeral: true });
    }

    const targetUser = options.getUser('user');
    const hours = options.getInteger('hours');
    const type = options.getString('type');
    if (!data.studyData[targetUser.id]) data.studyData[targetUser.id] = { camOn: 0, camOff: 0 };

    if (commandName === 'addhours') {
      data.studyData[targetUser.id][type] += hours;
      saveData();
      return interaction.reply(`Added ${hours} hrs to ${targetUser.username}'s ${type}.`);
    } else {
      data.studyData[targetUser.id][type] = Math.max(0, data.studyData[targetUser.id][type] - hours);
      saveData();
      return interaction.reply(`Removed ${hours} hrs from ${targetUser.username}'s ${type}.`);
    }
  }

  if (commandName === 'leaderboard') {
    const type = options.getString('type');
    const dataSet = type === 'daily' ? data.dailyData : type === 'weekly' ? data.weeklyData : data.monthlyData;
    const label = type.charAt(0).toUpperCase() + type.slice(1);
    return interaction.reply({ content: generateLeaderboard(label, dataSet) });
  }

  if (commandName === 'totalhours') {
    const targetUser = options.getUser('user');
    const userData = data.studyData[targetUser.id] || { camOn: 0, camOff: 0 };
    const total = userData.camOn + userData.camOff;
    return interaction.reply(`**${targetUser.username}** has a total of **${total.toFixed(2)} hrs**.`);
  }
});

function generateLeaderboard(type, dataset) {
  const sorted = Object.entries(dataset).sort(([, a], [, b]) => (b.camOn + b.camOff) - (a.camOn + a.camOff));
  let header = `@everyone\n**${type} Leaderboard (${new Date().toLocaleDateString('en-US')})**\n\n`;
  sorted.forEach(([id, { camOn, camOff }], i) => {
    const total = camOn + camOff;
    header += `**#${i + 1}** <@${id}> - **${total.toFixed(2)} hrs** (Camera On: ${camOn.toFixed(2)} | Camera Off: ${camOff.toFixed(2)})\n`;
  });
  return header;
}

// Reset & Post Leaderboards
cron.schedule('59 23 * * *', () => {
  const dailyChannel = client.channels.cache.get(DAILY_CHANNEL_ID);
  dailyChannel.send(generateLeaderboard('Daily', data.dailyData));
  data.dailyData = {};
  saveData();
});

cron.schedule('59 23 * * 0', () => {
  const weeklyChannel = client.channels.cache.get(WEEKLY_CHANNEL_ID);
  weeklyChannel.send(generateLeaderboard('Weekly', data.weeklyData));
  data.weeklyData = {};
  saveData();
});

cron.schedule('59 23 30 * *', () => {
  const monthlyChannel = client.channels.cache.get(MONTHLY_CHANNEL_ID);
  monthlyChannel.send(generateLeaderboard('Monthly', data.monthlyData));
  data.monthlyData = {};
  saveData();
});

// Auto-backup
cron.schedule('0 1 * * *', () => {
  const date = new Date().toISOString().split('T')[0];
  fs.copyFileSync(DATA_FILE_PATH, path.join(__dirname, `data-backup-${date}.json`));
});

// Dashboard API
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/leaderboard/:type', (req, res) => {
  const type = req.params.type;
  const dataset = type === 'daily' ? data.dailyData : type === 'weekly' ? data.weeklyData : data.monthlyData;
  if (!dataset) return res.status(400).send('Invalid leaderboard type.');

  const sorted = Object.entries(dataset).sort(([, a], [, b]) => (b.camOn + b.camOff) - (a.camOn + a.camOff))
    .map(([id, { camOn, camOff }], i) => ({
      rank: i + 1,
      userId: id,
      camOn: camOn.toFixed(2),
      camOff: camOff.toFixed(2),
      total: (camOn + camOff).toFixed(2)
    }));

  res.json(sorted);
});

app.listen(PORT, () => console.log(`Dashboard running on http://localhost:${PORT}`));

client.login(process.env.TOKEN);
