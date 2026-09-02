import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import "dotenv/config";

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID || "";
const checkoutUrl =
  process.env.WHOP_CHECKOUT ||
  "https://whop.com/checkout/plan_vAO3R1lqZ11UT/";
const dashboardUrl = (
  process.env.RESELL_BUDDY_URL ||
  "https://resell-buddy-bot-production.up.railway.app"
).replace(/\/$/, "");
const colors = { primary: 0x5865f2, success: 0x22c55e };

if (!token || !clientId) {
  console.error("Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID");
  process.exit(1);
}

function embed(title, description, color = colors.primary) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "Resell Buddy" });
}

function accessButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Subscribe · €22.99/month")
      .setStyle(ButtonStyle.Link)
      .setURL(checkoutUrl),
    new ButtonBuilder()
      .setLabel("Open dashboard")
      .setStyle(ButtonStyle.Link)
      .setURL(`${dashboardUrl}/dashboard`),
    new ButtonBuilder()
      .setLabel("Setup guide")
      .setStyle(ButtonStyle.Link)
      .setURL(`${dashboardUrl}/guide`),
  );
}

const commands = [
  new SlashCommandBuilder().setName("start").setDescription("Start here"),
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Open Resell Buddy setup"),
  new SlashCommandBuilder().setName("help").setDescription("Resell Buddy guide"),
  new SlashCommandBuilder()
    .setName("howto")
    .setDescription("How to use Resell Buddy"),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("View your membership status"),
  new SlashCommandBuilder()
    .setName("subscribe")
    .setDescription("Subscribe for €22.99/month"),
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check whether the bot is online"),
].map((command) => command.toJSON());

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    await interaction.deferReply({ ephemeral: true });
  } catch {
    return;
  }

  try {
    if (interaction.commandName === "ping") {
      await interaction.editReply({
        embeds: [
          embed(
            "Resell Buddy is online",
            `Discord latency: **${client.ws.ping}ms**`,
            colors.success,
          ),
        ],
      });
      return;
    }

    if (interaction.commandName === "status") {
      await interaction.editReply({
        embeds: [
          embed(
            "Membership status",
            "Open the Resell Buddy dashboard to view your current Premium access. An active subscription is required to run monitors, Price Watches, and member commands.",
          ),
        ],
        components: [accessButtons()],
      });
      return;
    }

    if (interaction.commandName === "subscribe") {
      await interaction.editReply({
        embeds: [
          embed(
            "Resell Buddy Premium",
            "**€22.99 per month** plus applicable tax. Premium includes up to 50 active monitors, managed proxy access, Discord and Telegram delivery, and the full dashboard. Cancel anytime through Whop.",
          ),
        ],
        components: [accessButtons()],
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        embed(
          "Welcome to Resell Buddy",
          "Resell Buddy is a paid-only Vinted monitoring service.\n\n1. Sign in to the dashboard with Discord.\n2. Subscribe to Premium through Whop.\n3. Create monitors in the dashboard or with the Resell Buddy monitor commands.\n4. Receive new-listing alerts in your selected channels.",
        ),
      ],
      components: [accessButtons()],
    });
  } catch (error) {
    console.error(error);
    try {
      await interaction.editReply({
        content: "Something went wrong. Try /start again.",
      });
    } catch {}
  }
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`ONLINE as ${readyClient.user.tag}`);
  readyClient.user.setActivity("/start · Premium access", { type: 3 });
});

const rest = new REST({ version: "10" }).setToken(token);
await rest.put(Routes.applicationCommands(clientId), { body: commands });
if (guildId) {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: commands,
  });
}
console.log("commands registered");
await client.login(token);
