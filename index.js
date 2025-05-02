const { Client, GatewayIntentBits, Partials, Collection, REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();
const cron = require('node-cron');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.commands = new Collection();

// Slash command to check your own study hours
const myHoursCommand = new SlashCommandBuilder()
  .setName('myhours')
  .setDescription('Check your study hours.');

client.on('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: [myHoursCommand.toJSON()]
    });
    console.log('Slash commands registered.');
  } catch (err) {
    console.error('Error registering slash commands:', err);
  }
  console.log(`${client.user.tag} is online!`);
});

// Interaction logic
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'myhours') {
    const data = await StudyTime.findOne({ userId: interaction.user.id });
    const cameraOnHours = data ? Math.floor(data.cameraOn / 3600) : 0;
    const cameraOffHours = data ? Math.floor(data.cameraOff / 3600) : 0;

    await interaction.reply(`**Tumhare Study Hours**\nCamera ON: ${cameraOnHours} hrs\nCamera OFF: ${cameraOffHours} hrs`);
}
// Function to generate leaderboard text
function generateLeaderboard(title, onList, offList) {
  const formatList = (list, emoji) => list.map((u, i) => `${i === 0 ? '👑' : ''}${i + 1}. ${u}`).join('\n') || 'No data';

  return `**${title}**\n\n__Camera ON Leaderboard:__\n${formatList(onList, 'ON')}\n\n__Camera OFF Leaderboard:__\n${formatList(offList, 'OFF')}`;
}

// Daily at 00:01 IST
cron.schedule('31 18 * * *', async () => {
  const channel = await client.channels.fetch(process.env.DAILY_CHANNEL_ID);
  if (channel) {
    channel.send(generateLeaderboard('Daily Leaderboard', ['UserA - 3hrs', 'UserB - 2hrs'], ['UserC - 4hrs', 'UserD - 1hr']));
  }
});

// Weekly every Monday 00:01 IST
cron.schedule('31 18 * * 1', async () => {
  const channel = await client.channels.fetch(process.env.WEEKLY_CHANNEL_ID);
  if (channel) {
    channel.send(generateLeaderboard('Weekly Leaderboard', ['UserA - 10hrs'], ['UserC - 12hrs']));
  }
});

// Monthly on 1st at 00:01 IST
cron.schedule('31 18 1 * *', async () => {
  const channel = await client.channels.fetch(process.env.MONTHLY_CHANNEL_ID);
  if (channel) {
    channel.send(generateLeaderboard('Monthly Leaderboard', ['UserA - 42hrs'], ['UserC - 39hrs']));
  }
});

client.login(process.env.TOKEN);
