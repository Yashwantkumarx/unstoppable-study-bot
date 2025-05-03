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

const CAMERA_ON_ROOM_IDS = [
  '1300572813047894119',
  '1228945365764669531',
  '1228946332111077447',
  '1298580693668069476',
  '1309111502757953557'
];

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

client.once('ready', async () => {
  loadData();
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
  ];
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
    const durationHrs = durationMs / 3600000;
    const camType = CAMERA_ON_ROOM_IDS.includes(oldState.channelId) ? 'camOn' : 'camOff';

    if (!data.studyData[userId]) data.studyData[userId] = { camOn: 0, camOff: 0 };
    if (!data.dailyData[userId]) data.dailyData[userId] = { camOn: 0, camOff: 0 };
    if (!data.weeklyData[userId]) data.weeklyData[userId] = { camOn: 0, camOff: 0 };
    if (!data.monthlyData[userId]) data.monthlyData[userId] = { camOn: 0, camOff: 0 };

    data.studyData[userId][camType] += durationHrs;
    data.dailyData[userId][camType] += durationHrs;
    data.weeklyData[userId][camType] += durationHrs;
    data.monthlyData[userId][camType] += durationHrs;

    saveData();
    delete joinTimestamps[userId];
  }
});

function formatTime(hr) {
  const h = Math.floor(hr);
  const m = Math.round((hr - h) * 60);
  return `${h} hrs ${m} mins`;
}

function generateLeaderboard(title, dataset) {
  const sorted = Object.entries(dataset).sort(([, a], [, b]) => (b.camOn + b.camOff) - (a.camOn + a.camOff));
  if (sorted.length === 0) return `No data available for ${title} leaderboard.\n**Server: Unstoppable | Owner: Yashwant Kumar**`;

  const now = new Date();
  const label = title === 'Daily'
    ? now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : title === 'Weekly'
    ? `Week of ${now.toLocaleDateString('en-IN')}`
    : now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  let msg = `@everyone\n__**${title} Leaderboard (${label})**__\n**Server: Unstoppable | Owner: Yashwant Kumar**\n`;
  sorted.forEach(([id, h], i) => {
    msg += `\n**#${i + 1}** <@${id}> — **${formatTime(h.camOn + h.camOff)}**\n✅ ${formatTime(h.camOn)} | ❌ ${formatTime(h.camOff)}`;
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
    const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${target.username}'s Study Report`)
      .setDescription(`Date: **${today}**\n**Server: Unstoppable | Owner: Yashwant Kumar**`)
      .addFields(
        { name: '✅ Camera On', value: `**${formatTime(hours.camOn)}**\n_${focusTag}_`, inline: true },
        { name: '❌ Camera Off', value: `**${formatTime(hours.camOff)}**\n_${silentTag}_`, inline: true },
        { name: '⏳ Total', value: `**${formatTime(hours.camOn + hours.camOff)}**`, inline: false }
      )
      .setColor(0x4e9af1)
      .setThumbnail('https://cdn-icons-png.flaticon.com/512/3176/3176366.png')
      .setFooter({ text: 'Keep grinding! You’re unstoppable!' });

    return interaction.reply({ embeds: [embed] });
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
    return interaction.reply(`Successfully ${isAdd ? 'added' : 'removed'} ${hoursValue} hrs to ${targetUser.username}'s ${type === 'camOn' ? 'Camera On' : 'Camera Off'} study hours.\n**Server: Unstoppable | Owner: Yashwant Kumar**`);
  }
});

cron.schedule('0 0 * * *', () => {
  const ch = client.channels.cache.get(DAILY_CHANNEL_ID);
  ch?.send(generateLeaderboard('Daily', data.dailyData));
  data.dailyData = {};
  saveData();
});

cron.schedule('0 0 * * 0', () => {
  const ch = client.channels.cache.get(WEEKLY_CHANNEL_ID);
  ch?.send(generateLeaderboard('Weekly', data.weeklyData));
  data.weeklyData = {};
  saveData();
});

cron.schedule('0 0 28-31 * *', () => {
  const today = new Date();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  if (today.getDate() === lastDay) {
    const ch = client.channels.cache.get(MONTHLY_CHANNEL_ID);
    ch?.send(generateLeaderboard('Monthly', data.monthlyData));
    data.monthlyData = {};
    saveData();
  }
});

cron.schedule('0 3 * * *', () => {
  const backupFile = `./backups/data-backup-${new Date().toISOString().split('T')[0]}.json`;
  fs.copyFile(DATA_FILE, backupFile, err => {
    if (err) console.error("Backup failed:", err);
    else console.log("Backup created at:", backupFile);
  });
});

client.login(process.env.TOKEN);
