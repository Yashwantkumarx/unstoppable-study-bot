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

const CAMERA_ON_ROOM_IDS = ['1300572813047894119', '1228945365764669531', '1228946332111077447', '1298580693668069476', '1309111502757953557'];
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
    new SlashCommandBuilder().setName('leaderboard').setDescription('Show the leaderboard manually (Admin only).')
      .addStringOption(opt => opt.setName('type').setDescription('Leaderboard Type').setRequired(true)
        .addChoices({ name: 'Daily', value: 'daily' }, { name: 'Weekly', value: 'weekly' }, { name: 'Monthly', value: 'monthly' })),
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

    for (const dataset of [data.studyData, data.dailyData, data.weeklyData, data.monthlyData]) {
      if (!dataset[userId]) dataset[userId] = { camOn: 0, camOff: 0 };
      dataset[userId][camType] += durationHrs;
    }

    saveData();
    delete joinTimestamps[userId];
  }
});

function formatTime(hr) {
  const h = Math.floor(hr);
  const m = Math.round((hr - h) * 60);
  return `${h} hrs ${m} mins`;
}

function getISTDateLabel(title) {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const formattedDate = formatter.format(now);

  if (title === 'Daily') {
    const weekday = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
    }).format(now);
    return `${weekday}, ${formattedDate}`;
  } else if (title === 'Weekly') {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday as start
    const start = formatter.format(weekStart);
    return `Week: ${start} → ${formattedDate}`;
  } else {
    const month = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      month: 'long',
      year: 'numeric',
    }).format(now);
    return `Month: ${month}`;
  }
}

function generateLeaderboardEmbed(title, dataset) {
  const sorted = Object.entries(dataset)
    .sort(([, a], [, b]) => (b.camOn + b.camOff) - (a.camOn + a.camOff))
    .slice(0, 10);

  const label = getISTDateLabel(title);

  const embed = new EmbedBuilder()
    .setTitle(`📋 ${title} Leaderboard — ${label}`)
    .setDescription(`**Server: Unstoppable | Owner: Yashwant Kumar**`)
    .setColor(0x00bfff)
    .setFooter({ text: 'Top 10 Students Hustling!' });

  if (sorted.length === 0) {
    embed.addFields({ name: "No data available", value: "Start studying to appear on the leaderboard!" });
  } else {
    sorted.forEach(([id, h], i) => {
      embed.addFields({
        name: `#${i + 1} — <@${id}>`,
        value: `
          🟢 **Camera On:** ${formatTime(h.camOn)}  
          🔴 **Camera Off:** ${formatTime(h.camOff)}  
          **Total:** ${formatTime(h.camOn + h.camOff)}
        `
      });
    });
  }

  return embed;
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

    const today = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

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

    for (const dataset of [data.studyData, data.dailyData, data.weeklyData, data.monthlyData]) {
      if (!dataset[targetUser.id]) dataset[targetUser.id] = { camOn: 0, camOff: 0 };
    }

    if (isAdd) {
      for (const dataset of [data.studyData, data.dailyData, data.weeklyData, data.monthlyData]) {
        dataset[targetUser.id][type] += hoursValue;
      }
    } else {
      for (const dataset of [data.studyData, data.dailyData, data.weeklyData, data.monthlyData]) {
        dataset[targetUser.id][type] = Math.max(0, dataset[targetUser.id][type] - hoursValue);
      }
    }

    saveData();
    return interaction.reply(`Successfully ${isAdd ? 'added' : 'removed'} ${hoursValue} hrs to ${targetUser.username}'s ${type === 'camOn' ? 'Camera On' : 'Camera Off'} hours.\n**Server: Unstoppable | Owner: Yashwant Kumar**`);
  }

  if (commandName === 'leaderboard') {
    if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.reply({ content: 'Only admins can use this command.', ephemeral: true });
    }

    const type = options.getString('type');
    let dataset, title;

    if (type === 'daily') {
      dataset = data.dailyData;
      title = 'Daily';
    } else if (type === 'weekly') {
      dataset = data.weeklyData;
      title = 'Weekly';
    } else {
      dataset = data.monthlyData;
      title = 'Monthly';
    }

    const dateRange = getISTDateLabel(title);
    const embed = generateLeaderboardEmbed(title, dataset, dateRange);
    return interaction.reply({ embeds: [embed] });
  }
});

// Track active voice users every minute
cron.schedule('* * * * *', () => {
  const now = Date.now();

  for (const userId in joinTimestamps) {
    const startTime = joinTimestamps[userId];
    const durationMs = now - startTime;
    const durationMin = durationMs / 60000;

    if (durationMin >= 1) {
      const member = client.guilds.cache.first()?.members.cache.get(userId);
      if (!member?.voice.channelId) continue;

      const camType = CAMERA_ON_ROOM_IDS.includes(member.voice.channelId) ? 'camOn' : 'camOff';

      for (const dataset of [data.studyData, data.dailyData, data.weeklyData, data.monthlyData]) {
        if (!dataset[userId]) dataset[userId] = { camOn: 0, camOff: 0 };
        dataset[userId][camType] += 1 / 60;
      }

      joinTimestamps[userId] = now;
    }
  }

  saveData();
});

// Auto leaderboard + reset

cron.schedule('0 0 * * *', () => {
  const ch = client.channels.cache.get(DAILY_CHANNEL_ID);
  const dailyDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const formattedDate = new Date(dailyDate).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  ch?.send({ embeds: [generateLeaderboardEmbed('Daily', data.dailyData, formattedDate)] });
  data.dailyData = {};
  saveData();
});

cron.schedule('0 0 * * 0', () => {
  const ch = client.channels.cache.get(WEEKLY_CHANNEL_ID);
  const weeklyDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const startOfWeek = new Date(new Date(weeklyDate).setDate(new Date(weeklyDate).getDate() - new Date(weeklyDate).getDay())); // Start of the week (Sunday)
  const formattedWeekRange = `${startOfWeek.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} - ${new Date(weeklyDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`;

  ch?.send({ embeds: [generateLeaderboardEmbed('Weekly', data.weeklyData, formattedWeekRange)] });
  data.weeklyData = {};
  saveData();
});

cron.schedule('0 0 1 * *', () => {
  const ch = client.channels.cache.get(MONTHLY_CHANNEL_ID);
  const monthlyDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const formattedMonthRange = `${new Date(monthlyDate).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}`;

  ch?.send({ embeds: [generateLeaderboardEmbed('Monthly', data.monthlyData, formattedMonthRange)] });
  data.monthlyData = {};
  saveData();
});

client.login(process.env.TOKEN);
