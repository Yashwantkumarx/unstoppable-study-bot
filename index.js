const cron = require('node-cron');
const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

let studyData = {}; // { userId: { camOn: 0, camOff: 0 } }

const focusTaglines = ["Stay focused!", "You got this!", "Keep grinding!"];
const silentTaglines = ["Stay silent, stay strong!", "Discipline wins!", "Eyes on the prize!"];

function leaderboardMessage(type, limit = 10) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN');
  const monthStr = now.toLocaleString('default', { month: 'long' });

  let title = `**${type} Leaderboard**`;
  if (type === 'Daily') title += `\n📅 ${dateStr}`;
  if (type === 'Weekly') title += `\n📅 Week Ending: ${dateStr}`;
  if (type === 'Monthly') title += `\n📅 Month: ${monthStr}`;

  const sorted = Object.entries(studyData).sort(([, a], [, b]) =>
    (b.camOn + b.camOff) - (a.camOn + a.camOff)
  ).slice(0, limit);

  return title + '\n\n' + sorted.map(([id, d], i) => {
    const crown = i === 0 ? '👑 ' : '';
    const focusTag = focusTaglines[Math.floor(Math.random() * focusTaglines.length)];
    const silentTag = silentTaglines[Math.floor(Math.random() * silentTaglines.length)];
    return `${crown}<@${id}>\n📷 Camera On: **${d.camOn.toFixed(1)} hrs ✅** — _${focusTag}_\n📷 Camera Off: **${d.camOff.toFixed(1)} hrs ❌** — _${silentTag}_`;
  }).join('\n\n');
}

// Daily Reset
cron.schedule('59 23 * * *', () => {
  for (let userId in studyData) {
    studyData[userId] = { camOn: 0, camOff: 0 };
  }
  console.log("✅ Daily data reset.");
});

// Weekly Reset (Sunday night)
cron.schedule('59 23 * * 0', () => {
  for (let userId in studyData) {
    studyData[userId] = { camOn: 0, camOff: 0 };
  }
  console.log("✅ Weekly data reset.");
});

// Monthly Reset (Last day of month)
cron.schedule('59 23 28-31 * *', () => {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (now.getDate() === last) {
    for (let userId in studyData) {
      studyData[userId] = { camOn: 0, camOff: 0 };
    }
    console.log("✅ Monthly data reset.");
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'myhours') {
    const userId = interaction.user.id;
    const userStats = studyData[userId] || { camOn: 0, camOff: 0 };
    const dateStr = new Date().toLocaleDateString('en-IN');

    await interaction.reply(
      `📅 **Date: ${dateStr}**\n\n✨ Hey _${interaction.user.username}_! Here's your Study Report:\n\n` +
      `📷 Camera On: **${userStats.camOn.toFixed(1)} hrs ✅**\n` +
      `📷 Camera Off: **${userStats.camOff.toFixed(1)} hrs ❌**`
    );
  }
});

client.on('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}!`);

  const channelId = '123456789012345678';
  const ch = client.channels.cache.get(channelId);

  // Auto Post Leaderboards
  cron.schedule('0 0 * * *', () => {
    if (ch) ch.send(`@everyone\n${leaderboardMessage('Daily')}`);
  });

  cron.schedule('0 0 * * 0', () => {
    if (ch) ch.send(`@everyone\n${leaderboardMessage('Weekly')}`);
  });

  cron.schedule('0 0 1 * *', () => {
    if (ch) ch.send(`@everyone\n${leaderboardMessage('Monthly')}`);
  });
});

client.login('MTM2NzU5NDI4ODg0NTk0Njg4Mg.GlsYac.NYcH2TA5GqV6dXwWdW34nVo-Xgu7GgFhpgy-gE');
