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

const CAMERA_ON_ROOM_ID = '1300572813047894119'; '1228945365764669531'; '1298580142980862054'; '1228946332111077447'; '1298580693668069476'; '1309111502757953557'; // camera on VC ID
const DAILY_CHANNEL_ID = '1367618478747680870';
const WEEKLY_CHANNEL_ID = '1367618555339870208';
const MONTHLY_CHANNEL_ID = '1367618620460499037';
const DATA_FILE = './data.json';

let data = { dailyData: {}, weeklyData: {}, monthlyData: {}, studyData: {} };
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
  new SlashCommandBuilder().setName('setcamera').setDescription('Set camera type for your study hours.')
    .addStringOption(opt => opt.setName('type').setDescription('Camera Type').setRequired(true)
      .addChoices({ name: 'Camera On', value: 'camOn' }, { name: 'Camera Off', value: 'camOff' }))
];

client.once('ready', async () => {
  loadData();
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands.map(cmd => cmd.toJSON()) });
  console.log(`Bot is online as ${client.user.tag}`);
});

client.on('voiceStateUpdate', (oldState, newState) => {
  const userId = newState.id;

  if (!oldState.channelId && newState.channelId) {
    joinTimestamps[userId] = Date.now();
  }

  if (oldState.channelId && !newState.channelId) {
    const startTime = joinTimestamps[userId];
    if (!startTime) return;
    const durationMs = Date.now() - startTime;
    const durationHrs = durationMs / (1000 * 60 * 60);

    const type = newState.channelId === CAMERA_ON_ROOM_ID ? 'camOn' : 'camOff';

    if (!data.studyData[userId]) data.studyData[userId] = { camOn: 0, camOff: 0 };
    if (!data.dailyData[userId]) data.dailyData[userId] = { camOn: 0, camOff: 0 };
    if (!data.weeklyData[userId]) data.weeklyData[userId] = { camOn: 0, camOff: 0 };
    if (!data.monthlyData[userId]) data.monthlyData[userId] = { camOn: 0, camOff: 0 };

    data.studyData[userId][type] += durationHrs;
    data.dailyData[userId][type] += durationHrs;
    data.weeklyData[userId][type] += durationHrs;
    data.monthlyData[userId][type] += durationHrs;

    saveData();
    delete joinTimestamps[userId];
  }
});

function generateLeaderboard(title, dataset) {
  const sorted = Object.entries(dataset).sort(([, a], [, b]) => (b.camOn + b.camOff) - (a.camOn + a.camOff));
  if (sorted.length === 0) return `No data available for ${title} leaderboard.`;

  const now = new Date();
  let label = "";
  if (title === 'Daily') label = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  else if (title === 'Weekly') label = `Week of ${now.toLocaleDateString('en-US')}`;
  else if (title === 'Monthly') label = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  let msg = `@everyone\n**${title} Leaderboard (${label})**\n\n`;
  sorted.forEach(([id, h], i) => {
    const total = h.camOn + h.camOff;
    msg += `**#${i + 1}** <@${id}> — **${total.toFixed(2)} hrs** (✅ ${h.camOn.toFixed(2)} | ❌ ${h.camOff.toFixed(2)})\n`;
  });
  return msg;
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, user, options, member } = interaction;
  loadData();

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

  if (['addhours', 'removehours'].includes(commandName)) {
    if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });
    }

    const targetUser = options.getUser('user');
    const hoursValue = options.getInteger('hours');
    const type = options.getString('type');
    const isAdd = commandName === 'addhours';

    if (!data.studyData[targetUser.id]) data.studyData[targetUser.id] = { camOn: 0, camOff: 0 };
    if (!data.dailyData[targetUser.id]) data.dailyData[targetUser.id] = { camOn: 0, camOff: 0 };
    if (!data.weeklyData[targetUser.id]) data.weeklyData[targetUser.id] = { camOn: 0, camOff: 0 };
    if (!data.monthlyData[targetUser.id]) data.monthlyData[targetUser.id] = { camOn: 0, camOff: 0 };

    if (isAdd) {
      data.studyData[targetUser.id][type] += hoursValue;
      data.dailyData[targetUser.id][type] += hoursValue;
      data.weeklyData[targetUser.id][type] += hoursValue;
      data.monthlyData[targetUser.id][type] += hoursValue;
    } else {
      data.studyData[targetUser.id][type] = Math.max(0, data.studyData[targetUser.id][type] - hoursValue);
      data.dailyData[targetUser.id][type] = Math.max(0, data.dailyData[targetUser.id][type] - hoursValue);
      data.weeklyData[targetUser.id][type] = Math.max(0, data.weeklyData[targetUser.id][type] - hoursValue);
      data.monthlyData[targetUser.id][type] = Math.max(0, data.monthlyData[targetUser.id][type] - hoursValue);
    }

    saveData();
    return interaction.reply(`Successfully ${isAdd ? 'added' : 'removed'} ${hoursValue} hrs ${isAdd ? 'to' : 'from'} ${targetUser.username}'s ${type} time.`);
  }

  if (commandName === 'setcamera') {
    const cameraType = options.getString('type');
    if (!data.studyData[user.id]) data.studyData[user.id] = { camOn: 0, camOff: 0 };
    data.studyData[user.id].cameraType = cameraType;

    saveData();
    return interaction.reply(`Your camera type has been set to **${cameraType === 'camOn' ? 'Camera On' : 'Camera Off'}**.`);
  }
});

// Daily leaderboard
cron.schedule('59 23 * * *', () => {
  const ch = client.channels.cache.get(DAILY_CHANNEL_ID);
  ch?.send(generateLeaderboard('Daily', data.dailyData));
  data.dailyData = {};
  saveData();
});

// Weekly leaderboard
cron.schedule('59 23 * * 0', () => {
  const ch = client.channels.cache.get(WEEKLY_CHANNEL_ID);
  ch?.send(generateLeaderboard('Weekly', data.weeklyData));
  data.weeklyData = {};
  saveData();
});

// Monthly leaderboard (last day of month)
cron.schedule('59 23 28-31 * *', () => {
  const ch = client.channels.cache.get(MONTHLY_CHANNEL_ID);
  ch?.send(generateLeaderboard('Monthly', data.monthlyData));
  data.monthlyData = {};
  saveData();
});

client.login(process.env.TOKEN);
