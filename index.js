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
const LEADERBOARD_REMINDER_CHANNEL_ID = '1367722181412257913';
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

// Restore joinTimestamps for members already in voice channels
client.guilds.cache.forEach(guild => {
  guild.channels.cache.forEach(channel => {
    if (channel.type === 2) { // Voice channel
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
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
const weekStart = new Date(nowIST);
const day = weekStart.getDay(); // Sunday = 0
weekStart.setDate(weekStart.getDate() - day);

const start = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(weekStart);

const end = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(nowIST);

return `Week: ${start} → ${end}`;
  } else {
    const month = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      month: 'long',
      year: 'numeric',
    }).format(now);
    return `Month: ${month}`;
  }
}

async function generateLeaderboardEmbed(title, dataset) {
  const sorted = Object.entries(dataset)
    .sort(([, a], [, b]) => (b.camOn + b.camOff) - (a.camOn + a.camOff))
    .slice(0, 10);

  const label = getISTDateLabel(title);
  const rankEmojis = ['🥇', '🥈', '🥉', '🔥', '💎', '🌟', '⚡', '🎯', '🚀', '📈'];

  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${title} Leaderboard — ${label}`)
    .setDescription(
      `**━━━━━━━ SERVER INFO ━━━━━━━**\n` +
      `**Server:** __**Unstoppable**__\n` +
      `**Owner:** __**Yashwant Kumar**__\n` +
      `━━━━━━━━━━━━━━━━━━━━━━`
    )
    .setColor(0x00bfff)
    .setFooter({ text: 'Top 10 Students Hustling!' });

  if (sorted.length === 0) {
    embed.addFields({
      name: "No data yet!",
      value: "Start your grind today to appear on the leaderboard!"
    });
  } else {
    for (let i = 0; i < sorted.length; i++) {
      const [id, h] = sorted[i];
      let username;
try {
  const guild = client.guilds.cache.first(); // Ya interaction.guild use kar sakte ho agar available ho
  const member = guild.members.cache.get(id) || await guild.members.fetch(id);
  username = member.displayName;
} catch {
  try {
    const user = await client.users.fetch(id);
    username = user.username;
  } catch {
    username = `User (${id})`;
  }
}
      const total = h.camOn + h.camOff;
      const rankEmoji = rankEmojis[i] || '🏅';

      embed.addFields({
        name: `━━━━━━━━━━━━━━━━━━━━━━\n__**#${i + 1} ${rankEmoji} — ${username}**__\n━━━━━━━━━━━━━━━━━━━━━━`,
        value:
          `**🟢 Camera On:** \`${formatTime(h.camOn)}\`\n` +
          `**❌ Camera Off:** \`${formatTime(h.camOff)}\`\n` +
          `**⏳ Total:** \`${formatTime(total)}\``,
        inline: false
      });
    }
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
      .setTitle(`📊 ${interaction.guild.members.cache.get(target.id)?.displayName || target.username}'s Study Report`)
      .setDescription(
  `Date: **${today}**\n` +
  `**━━━━━━━ SERVER INFO ━━━━━━━**\n` +
  `**Server:** __**Unstoppable**__\n` +
  `**Owner:** __**Yashwant Kumar**__\n` +
  `━━━━━━━━━━━━━━━━━━━━━━`
)
      .addFields(
        { name: '✅ Camera On', value: `**${formatTime(hours.camOn)}**\n_${focusTag}_`, inline: true },
        { name: '❌ Camera Off', value: `**${formatTime(hours.camOff)}**\n_${silentTag}_\n__━━━━━━━━━━━━━━━━━__`, inline: true },
        { name: '__⏳ Total__', value: `**${formatTime(hours.camOn + hours.camOff)}**\n__━━━━━━━━━━━━━━━━━__`, inline: false }
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

  try {
    const embed = await generateLeaderboardEmbed(title, dataset);
    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    console.error('Leaderboard command error:', err);
    await interaction.reply({ content: 'Error while generating leaderboard.', ephemeral: true });
  }
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

const motivationalQuotes = [
  "Push yourself, because no one else is going to do it for you.",
  "Every minute counts. Make it worth it.",
  "Study now, shine later.",
  "Today’s hustle, tomorrow’s success.",
  "Discipline is the bridge between goals and achievement.",
  "It’s not about having time, it’s about making time.",
  "Stay focused. Stay determined. Stay unstoppable."
];

// Daily kickoff message — 00:00 IST (18:30 UTC)
cron.schedule('0 0 * * *', () => {
  const quote = motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];
  const channel = client.channels.cache.get(LEADERBOARD_REMINDER_CHANNEL_ID);

const embed = new EmbedBuilder()
  .setColor(0xffcc00)
  .setTitle("⏰ 12:00 AM Daily Challenge")
  .setDescription(
    `>>> **“${quote}”**\n\n` +
    `__Do you have what it takes to be on today's leaderboard?__\n` +
    `You’ve got **24 hours** to prove your discipline.\n\n` +
    `**Grind starts now. Let’s make it count!**`
  )
  .setThumbnail('https://cdn-icons-png.flaticon.com/512/1055/1055646.png')
  .setFooter({ text: 'Unstoppable | Leaderboard resets daily at midnight IST' })
  .setTimestamp();

  channel?.send({
    content: '@everyone',
    embeds: [embed]
  });
}, {
  timezone: 'Asia/Kolkata'
});

// Auto leaderboard + reset at 11:59 PM IST with @everyone

// Daily at 11:59 PM IST
cron.schedule('59 23 * * *', () => {
  const ch = client.channels.cache.get(DAILY_CHANNEL_ID);
  const dailyDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const formattedDate = new Date(dailyDate).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  (async () => {
  const embed = await generateLeaderboardEmbed('Daily', data.dailyData);
  ch?.send({ content: '@everyone', embeds: [embed] });
  data.dailyData = {};
  saveData();
})();
  data.dailyData = {};
  saveData();
}, {
  timezone: 'Asia/Kolkata'
});

// Weekly at 11:59 PM every Sunday IST
cron.schedule('59 23 * * 0', () => {
  const ch = client.channels.cache.get(WEEKLY_CHANNEL_ID);
  const weeklyDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const startOfWeek = new Date(new Date(weeklyDate).setDate(new Date(weeklyDate).getDate() - new Date(weeklyDate).getDay()));
  const formattedWeekRange = `${startOfWeek.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} - ${new Date(weeklyDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`;

  (async () => {
  const embed = await generateLeaderboardEmbed('Weekly', data.weeklyData);
  ch?.send({ content: '@everyone', embeds: [embed] });
  data.weeklyData = {};
  saveData();
})();
  data.weeklyData = {};
  saveData();
}, {
  timezone: 'Asia/Kolkata'
});

// Monthly at 11:59 PM on the last day of the month IST
cron.schedule('59 23 * * *', () => {
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const date = new Date(now);
  const tomorrow = new Date(date);
  tomorrow.setDate(date.getDate() + 1);

  if (tomorrow.getDate() === 1) {
    const ch = client.channels.cache.get(MONTHLY_CHANNEL_ID);
    const formattedMonth = date.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

    (async () => {
  const embed = await generateLeaderboardEmbed('Monthly', data.monthlyData);
  ch?.send({ content: '@everyone', embeds: [embed] });
  data.monthlyData = {};
  saveData();
})();
    data.monthlyData = {};
    saveData();
  }
}, {
  timezone: 'Asia/Kolkata'
});

client.login(process.env.TOKEN);
