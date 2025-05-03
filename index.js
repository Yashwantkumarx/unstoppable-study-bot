const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

let users = {};
const USERS_FILE = 'users.json';
const channelId = '123456789012345678';

function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function loadUsers() {
    if (fs.existsSync(USERS_FILE)) {
        users = JSON.parse(fs.readFileSync(USERS_FILE));
    }
}

function getCurrentDate() {
    const now = new Date();
    return now.toLocaleDateString('en-GB'); // DD/MM/YYYY
}

function getCurrentMonthYear() {
    const now = new Date();
    return `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`;
}

function resetHours(type) {
    for (const userId in users) {
        if (type === 'daily') users[userId].dailyHours = 0;
        if (type === 'weekly') users[userId].weeklyHours = 0;
        if (type === 'monthly') users[userId].monthlyHours = 0;
    }
    saveUsers();
}

function createLeaderboardEmbed(type) {
    const sorted = Object.entries(users)
        .sort(([, a], [, b]) => b[`${type}Hours`] - a[`${type}Hours`])
        .slice(0, 10);

    const leaderboard = sorted.map(([id, data], i) =>
        `**${i + 1}. <@${id}>** - ${data[`${type}Hours`].toFixed(2)} hrs`
    ).join('\n');

    const title = type.charAt(0).toUpperCase() + type.slice(1) + ' Leaderboard';
    const dateInfo =
        type === 'monthly' ? getCurrentMonthYear() : getCurrentDate();

    return new EmbedBuilder()
        .setTitle(`${title} (${dateInfo})`)
        .setDescription(leaderboard || 'No data yet.')
        .setColor(0x00AE86);
}

function autoPostLeaderboard(type) {
    const channel = client.channels.cache.get(channelId);
    if (!channel) return;

    const embed = createLeaderboardEmbed(type);
    channel.send({ content: '@everyone', embeds: [embed] });
}

function sendReminder(type) {
    const channel = client.channels.cache.get(channelId);
    if (!channel) return;

    const msg =
        type === 'weekly'
            ? '📢 @everyone Reminder: Weekly leaderboard will reset in 1 hour! Log your hours now.'
            : '📢 @everyone Reminder: Monthly leaderboard will reset in 1 hour! Log your hours now.';

    channel.send(msg);
}

client.once('ready', () => {
    loadUsers();
    console.log(`Logged in as ${client.user.tag}`);

    // Daily reset at midnight
    setInterval(() => {
        const now = new Date();
        if (now.getHours() === 0 && now.getMinutes() === 0) {
            resetHours('daily');
            autoPostLeaderboard('daily');
        }
    }, 60 * 1000);

    // Weekly reminder on Monday at 23:00
    setInterval(() => {
        const now = new Date();
        if (now.getDay() === 0 && now.getHours() === 23 && now.getMinutes() === 0) {
            sendReminder('weekly');
        }
    }, 60 * 1000);

    // Weekly reset on Monday at 00:01
    setInterval(() => {
        const now = new Date();
        if (now.getDay() === 1 && now.getHours() === 0 && now.getMinutes() === 1) {
            resetHours('weekly');
            autoPostLeaderboard('weekly');
        }
    }, 60 * 1000);

    // Monthly reminder on 1st at 23:00 of previous month
    setInterval(() => {
        const now = new Date();
        if (now.getDate() === 0 && now.getHours() === 23 && now.getMinutes() === 0) {
            sendReminder('monthly');
        }
    }, 60 * 1000);

    // Monthly reset on 1st day at 00:02
    setInterval(() => {
        const now = new Date();
        if (now.getDate() === 1 && now.getHours() === 0 && now.getMinutes() === 2) {
            resetHours('monthly');
            autoPostLeaderboard('monthly');
        }
    }, 60 * 1000);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, user } = interaction;

    if (!users[user.id]) {
        users[user.id] = { dailyHours: 0, weeklyHours: 0, monthlyHours: 0 };
    }

    if (commandName === 'myhours') {
        const embed = new EmbedBuilder()
            .setTitle(`Your Study Hours (${getCurrentDate()})`)
            .setDescription(
                `**Daily:** ${users[user.id].dailyHours.toFixed(2)} hrs\n` +
                `**Weekly:** ${users[user.id].weeklyHours.toFixed(2)} hrs\n` +
                `**Monthly:** ${users[user.id].monthlyHours.toFixed(2)} hrs`
            )
            .setColor(0x3498DB);

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'leaderboard') {
        const type = options.getString('type');
        if (!['daily', 'weekly', 'monthly'].includes(type)) {
            return interaction.reply({ content: 'Invalid leaderboard type.', ephemeral: true });
        }
        const embed = createLeaderboardEmbed(type);
        await interaction.reply({ embeds: [embed] });
    }
});

client.login('MTM2NzU5NDI4ODg0NTk0Njg4Mg.GlsYac.NYcH2TA5GqV6dXwWdW34nVo-Xgu7GgFhpgy-gE');
