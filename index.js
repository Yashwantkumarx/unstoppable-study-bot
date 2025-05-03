const { Client, GatewayIntentBits, Collection, SlashCommandBuilder, REST, Routes, Events, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const cron = require('node-cron');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const dailyChannelId = process.env.DAILY_CHANNEL_ID;
const weeklyChannelId = process.env.WEEKLY_CHANNEL_ID;
const monthlyChannelId = process.env.MONTHLY_CHANNEL_ID;

const focusTaglines = [
  "Focus Mode", "Silent Hustle", "No Excuses", "Discipline = Freedom",
  "Eyes on the Prize", "Stay Consistent", "You vs You", "Grinding in Silence"
];

let studyData = {};
const dataFile = './studyData.json';

function loadData() {
  if (fs.existsSync(dataFile)) {
    studyData = JSON.parse(fs.readFileSync(dataFile));
  }
}

function saveData() {
  fs.writeFileSync(dataFile, JSON.stringify(studyData, null, 2));
}

loadData();

// Define slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('myhours')
    .setDescription('Check your today’s study hours')
    .addUserOption(opt => 
      opt.setName('user').setDescription('User to check').setRequired(false)),
  new SlashCommandBuilder()
    .setName('addhours')
    .setDescription('Add study hours for a user')
    .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(opt => opt.setName('hours').setDescription('Hours').setRequired(true))
    .addStringOption(opt => 
      opt.setName('mode').setDescription('Camera mode').setRequired(true)
        .addChoices({ name: 'Camera On', value: 'cameraOn' }, { name: 'Camera Off', value: 'cameraOff' })),
  new SlashCommandBuilder()
    .setName('removehours')
    .setDescription('Remove study hours for a user')
    .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(opt => opt.setName('hours').setDescription('Hours').setRequired(true))
    .addStringOption(opt => 
      opt.setName('mode').setDescription('Camera mode').setRequired(true)
        .addChoices({ name: 'Camera On', value: 'cameraOn' }, { name: 'Camera Off', value: 'cameraOff' })),
  new SlashCommandBuilder()
    .setName('setcamera')
    .setDescription('Override your camera mode')
    .addStringOption(opt => 
      opt.setName('status').setDescription('Camera status').setRequired(true)
        .addChoices({ name: 'On', value: 'cameraOn' }, { name: 'Off', value: 'cameraOff' }))
].map(cmd => cmd.toJSON());

client.once(Events.ClientReady, async () => {
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  console.log(`Bot is online as ${client.user.tag}`);
});

// Voice room automatic tracking
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const user = newState.member || oldState.member;
  if (!user) return;
  const userId = user.id;
  const now = Date.now();
  const CAMERA_ON_ROOM_ID = '1300572813047894119';
  const defaultMode = newState.channelId === CAMERA_ON_ROOM_ID ? 'cameraOn' : 'cameraOff';

  // initialize user record
  if (!studyData[userId]) {
    studyData[userId] = { daily: {}, weekly: {}, monthly: {}, cameraMode: defaultMode };
  }
  const record = studyData[userId];

  // override cameraMode if setcamera used
  const mode = record.cameraMode || defaultMode;

  // track join
  if (!oldState.channel && newState.channel) {
    record._start = now;
    record._mode = mode;
  }

  // track leave
  if (oldState.channel && !newState.channel && record._start) {
    const hours = (now - record._start) / 3600000;
    const dateKey = new Date().toISOString().split('T')[0];
    const nowDate = new Date();
    const weekStart = new Date(nowDate);
    weekStart.setDate(nowDate.getDate() - nowDate.getDay());
    const weekKey = `${weekStart.toISOString().split('T')[0]} to ${new Date(weekStart).setDate(weekStart.getDate()+6)}`;
    const monthKey = nowDate.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

    [ ['daily', dateKey], ['weekly', weekKey], ['monthly', monthKey] ].forEach(([bucket, key]) => {
      record[bucket][key] = record[bucket][key] || { cameraOn: 0, cameraOff: 0 };
      record[bucket][key][record._mode] += hours;
    });

    delete record._start;
    delete record._mode;
    saveData();
  }
});

// Handle slash commands
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const userId = interaction.user.id;
  const username = interaction.user.username;
  const nowDate = new Date();
  const dateKey = nowDate.toISOString().split('T')[0];
  const weekStart = new Date(nowDate); weekStart.setDate(nowDate.getDate()-nowDate.getDay());
  const weekKey = `${weekStart.toISOString().split('T')[0]} to ${new Date(weekStart).setDate(weekStart.getDate()+6)}`;
  const monthKey = nowDate.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  if (!studyData[userId]) {
    studyData[userId] = { daily: {}, weekly: {}, monthly: {}, cameraMode: 'cameraOff' };
  }
  const record = studyData[userId];

  if (interaction.commandName === 'setcamera') {
    record.cameraMode = interaction.options.getString('status');
    saveData();
    return interaction.reply(`Camera mode set to **${record.cameraMode === 'cameraOn' ? 'On ✅' : 'Off ❌'}**`);
  }

  if (interaction.commandName === 'myhours') {
    const target = interaction.options.getUser('user') || interaction.user;
    const tid = target.id;
    const targRec = studyData[tid] || { daily: {} };
    const data = targRec.daily[dateKey] || { cameraOn: 0, cameraOff: 0 };
    const total = data.cameraOn + data.cameraOff;
    const tag = focusTaglines[Math.floor(Math.random()*focusTaglines.length)];

    const embed = new EmbedBuilder()
      .setTitle(`✨ ${target.username}'s Study Report`)
      .setDescription(`Date: **${dateKey}**`)
      .addFields(
        { name: '📷 Camera On', value: `**${data.cameraOn.toFixed(2)} hrs ✅** — _${tag}_`, inline: true },
        { name: '📷 Camera Off', value: `**${data.cameraOff.toFixed(2)} hrs ❌**`, inline: true },
        { name: '🕒 Total', value: `**${total.toFixed(2)} hrs**` }
      );
    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === 'addhours' || interaction.commandName === 'removehours') {
    const mode = interaction.options.getString('mode');
    const hours = interaction.options.getInteger('hours');
    const delta = interaction.commandName === 'addhours' ? hours : -hours;
    [ ['daily', dateKey], ['weekly', weekKey], ['monthly', monthKey] ].forEach(([bucket, key]) => {
      const rec = studyData[userId][bucket];
      rec[key] = rec[key] || { cameraOn: 0, cameraOff: 0 };
      rec[key][mode] = Math.max(0, rec[key][mode] + delta);
    });
    saveData();
    return interaction.reply(\`\${delta>0?'✅ Added':'❌ Removed'} \${Math.abs(delta)} hrs to \${mode==='cameraOn'?'Camera On':'Camera Off'}\`);
  }
});

// Leaderboard posting
function postLeaderboard(type, bucket, key, channelId, limit) {
  const entries = Object.entries(studyData).map(([id, rec]) => {
    const d = rec[bucket][key] || { cameraOn:0, cameraOff:0 };
    return { id, total: d.cameraOn + d.cameraOff, on: d.cameraOn, off: d.cameraOff };
  }).sort((a,b)=>b.total - a.total).slice(0, limit);

  let title = '';
  if (type==='daily') title = \`Daily Leaderboard (\${key})\`;
  if (type==='weekly') title = \`Weekly Leaderboard (\${key})\`;
  if (type==='monthly') title = \`Monthly Leaderboard (\${key})\`;

  const desc = entries.map((u,i)=>\`**\${i+1}.** <@\${u.id}> — \${u.total.toFixed(1)} hrs (📷 \${u.on.toFixed(1)} | ❌ \${u.off.toFixed(1)})\`).join('\n');

  const embed = new EmbedBuilder().setTitle(title).setDescription(desc||'No data').setColor(0x00FF00);
  const ch = client.channels.cache.get(channelId);
  if (ch) ch.send({ content: '@everyone', embeds:[embed] });
}

// Cron jobs
cron.schedule('0 0 * * *', ()=> {
  const key = new Date().toISOString().split('T')[0];
  postLeaderboard('daily','daily',key,dailyChannelId,10);
  Object.values(studyData).forEach(r=>r.daily={});
  saveData();
});
cron.schedule('0 0 * * 0', ()=> {
  const now = new Date();
  const ws = new Date(now); ws.setDate(now.getDate()-now.getDay());
  const we = new Date(ws); we.setDate(ws.getDate()+6);
  const key = \`\${ws.toISOString().split('T')[0]} to \${we.toISOString().split('T')[0]}\`;
  postLeaderboard('weekly','weekly',key,weeklyChannelId,15);
  Object.values(studyData).forEach(r=>r.weekly={});
  saveData();
});
cron.schedule('0 0 1 * *', ()=> {
  const now = new Date();
  const key = \`\${now.toLocaleString('en-IN',{month:'long'})} \${now.getFullYear()}\`;
  postLeaderboard('monthly','monthly',key,monthlyChannelId,20);
  Object.values(studyData).forEach(r=>r.monthly={});
  saveData();
});

client.login(token);
