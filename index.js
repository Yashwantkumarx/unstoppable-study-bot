
const { Client, GatewayIntentBits, Partials, Collection, REST, Routes, SlashCommandBuilder } = require('discord.js');
const cron = require('node-cron');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.commands = new Collection();
const studyData = {};
const dailyData = {};
const weeklyData = {};
const monthlyData = {};

// Slash Commands
const commands = [
  new SlashCommandBuilder().setName('myhours').setDescription('Check your study hours.'),
  new SlashCommandBuilder().setName('addhours')
    .setDescription('Add study hours to a user.')
    .addUserOption(option => option.setName('user').setDescription('User').setRequired(true))
    .addStringOption(option => option.setName('type').setDescription('Camera On or Off').setRequired(true).addChoices(
      { name: 'Camera On', value: 'camOn' }, { name: 'Camera Off', value: 'camOff' }))
    .addIntegerOption(option => option.setName('hours').setDescription('Hours to add').setRequired(true)),
  new SlashCommandBuilder().setName('removehours')
    .setDescription('Remove study hours from a user.')
    .addUserOption(option => option.setName('user').setDescription('User').setRequired(true))
    .addStringOption(option => option.setName('type').setDescription('Camera On or Off').setRequired(true).addChoices(
      { name: 'Camera On', value: 'camOn' }, { name: 'Camera Off', value: 'camOff' }))
    .addIntegerOption(option => option.setName('hours').setDescription('Hours to remove').setRequired(true)),
];

client.once('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
    body: commands.map(cmd => cmd.toJSON())
  });

  console.log(`Bot is online as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.commandName;
  const user = interaction.options.getUser('user') || interaction.user;
  const userId = user.id;
  const name = user.username;

  if (!studyData[userId]) studyData[userId] = { name, camOn: 0, camOff: 0 };
  if (!dailyData[userId]) dailyData[userId] = { name, camOn: 0, camOff: 0 };
  if (!weeklyData[userId]) weeklyData[userId] = { name, camOn: 0, camOff: 0 };
  if (!monthlyData[userId]) monthlyData[userId] = { name, camOn: 0, camOff: 0 };

  const dataSets = [studyData, dailyData, weeklyData, monthlyData];

  try {
    if (command === 'myhours') {
      const record = studyData[userId];
      await interaction.reply(`**${name}'s Study Hours**:
📷✅ Camera On: ${record.camOn} hrs
📷❌ Camera Off: ${record.camOff} hrs`);
    }

    if (command === 'addhours' || command === 'removehours') {
      const type = interaction.options.getString('type');
      const hours = interaction.options.getInteger('hours') * (command === 'removehours' ? -1 : 1);
      dataSets.forEach(dataset => {
        dataset[userId][type] = Math.max(0, (dataset[userId][type] || 0) + hours);
      });
      await interaction.reply(`${command === 'addhours' ? '✅ Added' : '❌ Removed'} ${Math.abs(hours)} hrs to ${name} (${type === 'camOn' ? 'Camera On' : 'Camera Off'})`);
    }
  } catch (err) {
    console.error(err);
    await interaction.reply('Error occurred. Try again later.');
  }
});

function generateLeaderboard(data) {
  const sorted = Object.entries(data).sort((a, b) => {
    const aTotal = a[1].camOn + a[1].camOff;
    const bTotal = b[1].camOn + b[1].camOff;
    return bTotal - aTotal;
  });

  let camOnList = sorted.map(([, v], i) => `**${i + 1}. ${v.name}** — ${v.camOn} hrs 📷✅`).join('\n');
  let camOffList = sorted.map(([, v], i) => `**${i + 1}. ${v.name}** — ${v.camOff} hrs 📷❌`).join('\n');

  return `**Camera On Leaderboard**\n${camOnList || 'No data yet.'}\n\n**Camera Off Leaderboard**\n${camOffList || 'No data yet.'}`;
}

// India time: 12:00 AM (IST = UTC+5:30 => 18:30 UTC)
cron.schedule('30 18 * * *', async () => {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const dailyChannel = await guild.channels.fetch(process.env.DAILY_CHANNEL_ID);
  const weeklyChannel = await guild.channels.fetch(process.env.WEEKLY_CHANNEL_ID);
  const monthlyChannel = await guild.channels.fetch(process.env.MONTHLY_CHANNEL_ID);

  if (dailyChannel) await dailyChannel.send(`**Daily Leaderboard**\n\n${generateLeaderboard(dailyData)}`);
  if (weeklyChannel) await weeklyChannel.send(`**Weekly Leaderboard**\n\n${generateLeaderboard(weeklyData)}`);
  if (monthlyChannel) await monthlyChannel.send(`**Monthly Leaderboard**\n\n${generateLeaderboard(monthlyData)}`);

  for (const key in dailyData) dailyData[key] = { ...dailyData[key], camOn: 0, camOff: 0 };

  const now = new Date();
  if (now.getDay() === 1) { for (const key in weeklyData) weeklyData[key] = { ...weeklyData[key], camOn: 0, camOff: 0 }; }
  if (now.getDate() === 1) { for (const key in monthlyData) monthlyData[key] = { ...monthlyData[key], camOn: 0, camOff: 0 }; }
});

client.login(process.env.TOKEN);
