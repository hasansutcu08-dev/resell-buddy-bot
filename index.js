import {
  Client, GatewayIntentBits, Events, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ChannelType,
} from "discord.js";
import "dotenv/config";

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID || "";

if (!token || !clientId) {
  console.error("Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID");
  process.exit(1);
}

const ownerIds = new Set(
  (process.env.OWNER_DISCORD_IDS || "").split(",").map((s) => s.trim()).filter(Boolean)
);
const users = new Map();

function getUser(id) {
  let u = users.get(id);
  if (!u) {
    const isOwner = ownerIds.has(id);
    u = { linked: isOwner, plan: isOwner ? "owner" : "free", monitors: [], alertChannelId: null };
    users.set(id, u);
  }
  return u;
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder().setName("help").setDescription("How to use Resell Buddy"),
  new SlashCommandBuilder().setName("ping").setDescription("Check bot is alive"),
  new SlashCommandBuilder().setName("link").setDescription("Link account (free test)"),
  new SlashCommandBuilder().setName("status").setDescription("Show plan and monitors"),
  new SlashCommandBuilder().setName("claimowner").setDescription("Unlimited test access (no payment)"),
  new SlashCommandBuilder()
    .setName("monitor")
    .setDescription("Manage monitors")
    .addSubcommand((s) =>
      s
        .setName("create")
        .setDescription("Create a test monitor")
        .addStringOption((o) => o.setName("query").setDescription("keywords e.g. nike dunk 42").setRequired(true))
    )
    .addSubcommand((s) => s.setName("list").setDescription("List monitors"))
    .addSubcommand((s) =>
      s
        .setName("delete")
        .setDescription("Delete a monitor")
        .addStringOption((o) => o.setName("id").setDescription("Monitor ID").setRequired(true))
    ),
  new SlashCommandBuilder()
    .setName("alerts")
    .setDescription("Set alert channel")
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("Channel for deal alerts")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),
  new SlashCommandBuilder().setName("demoalert").setDescription("Send a sample deal alert"),
  new SlashCommandBuilder().setName("subscribe").setDescription("Whop checkout links (optional)"),
].map((c) => c.toJSON());

client.on(Events.InteractionCreate, async (i) => {
  if (!i.isChatInputCommand()) return;
  console.log(`[ix] /${i.commandName} from ${i.user.id}`);
  try {
    await i.deferReply({ ephemeral: true });
  } catch (e) {
    console.error("defer failed", e);
    return;
  }

  try {
    const name = i.commandName;

    if (name === "ping") {
      await i.editReply({ content: `Pong · ${client.ws.ping}ms · online` });
      return;
    }

    if (name === "help") {
      await i.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Resell Buddy")
            .setColor(0x5865f2)
            .setDescription(
              [
                "**Test mode — no payment required**",
                "",
                "`/ping` — bot alive?",
                "`/link` — activate free account",
                "`/claimowner` — unlimited test access",
                "`/alerts channel:#channel` — where deals go",
                "`/monitor create query:nike dunk 42`",
                "`/monitor list`",
                "`/demoalert` — sample deal",
                "`/status`",
                "`/subscribe` — real Whop links (customers later)",
              ].join("\n")
            ),
        ],
      });
      return;
    }

    if (name === "link") {
      const u = getUser(i.user.id);
      u.linked = true;
      if (ownerIds.has(i.user.id)) u.plan = "owner";
      await i.editReply({
        content: `Linked as **${u.plan}**. Monitors: ${u.monitors.length}. ${
          u.plan === "free" ? "Run `/claimowner` for unlimited." : "Full test access."
        }`,
      });
      return;
    }

    if (name === "claimowner") {
      ownerIds.add(i.user.id);
      const u = getUser(i.user.id);
      u.linked = true;
      u.plan = "owner";
      await i.editReply({ content: "**Owner (Elite)** unlocked for testing — no payment." });
      return;
    }

    if (name === "status") {
      const u = getUser(i.user.id);
      await i.editReply({
        content: [
          `**Plan:** ${u.plan}`,
          `**Linked:** ${u.linked}`,
          `**Monitors:** ${u.monitors.length}`,
          `**Alerts:** ${u.alertChannelId ? `<#${u.alertChannelId}>` : "not set"}`,
        ].join("\n"),
      });
      return;
    }

    if (name === "monitor") {
      const u = getUser(i.user.id);
      if (!u.linked) {
        await i.editReply({ content: "Run `/link` first." });
        return;
      }
      const sub = i.options.getSubcommand();
      if (sub === "create") {
        const query = i.options.getString("query", true).trim();
        const limit = u.plan === "owner" ? 999 : 3;
        if (u.monitors.length >= limit) {
          await i.editReply({ content: `Limit ${limit}. Use /claimowner or delete one.` });
          return;
        }
        const id = "m_" + Math.random().toString(36).slice(2, 8);
        u.monitors.push({ id, query });
        await i.editReply({ content: `Created ${id} → **${query}**` });
      } else if (sub === "list") {
        await i.editReply({
          content: u.monitors.length
            ? u.monitors.map((m) => `• ${m.id} ${m.query}`).join("\n")
            : "No monitors. /monitor create query:…",
        });
      } else if (sub === "delete") {
        const id = i.options.getString("id", true);
        u.monitors = u.monitors.filter((m) => m.id !== id);
        await i.editReply({ content: `Deleted ${id}` });
      }
      return;
    }

    if (name === "alerts") {
      const u = getUser(i.user.id);
      if (!u.linked) {
        await i.editReply({ content: "Run `/link` first." });
        return;
      }
      u.alertChannelId = i.options.getChannel("channel", true).id;
      await i.editReply({ content: `Alerts → <#${u.alertChannelId}>. Try /demoalert.` });
      return;
    }

    if (name === "demoalert") {
      const u = getUser(i.user.id);
      if (!u.alertChannelId) {
        await i.editReply({ content: "Set a channel first: /alerts channel:#…" });
        return;
      }
      const ch = await client.channels.fetch(u.alertChannelId).catch(() => null);
      if (!ch?.isTextBased?.() || ch.isDMBased?.()) {
        await i.editReply({ content: "Can't post there (check bot permissions)." });
        return;
      }
      await ch.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("Demo deal — Nike Dunk Low")
            .setDescription("**€45** · Size 42 · Berlin\n*(test alert — not live Vinted yet)*")
            .setColor(0x22c55e)
            .setTimestamp(),
        ],
      });
      await i.editReply({ content: `Sent to <#${u.alertChannelId}>` });
      return;
    }

    if (name === "subscribe") {
      await i.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Whop (optional)")
            .setDescription("Not needed for testing. Use /claimowner.\n\nFor real customers later:")
            .setColor(0x5865f2),
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel("Pro €14.99")
              .setStyle(ButtonStyle.Link)
              .setURL("https://whop.com/checkout/plan_vAO3R1lqZ11UT"),
            new ButtonBuilder()
              .setLabel("Elite €29.99")
              .setStyle(ButtonStyle.Link)
              .setURL("https://whop.com/checkout/plan_3aG0H3FQibNZ4")
          ),
        ],
      });
      return;
    }

    await i.editReply({ content: "Unknown command" });
  } catch (err) {
    console.error("handler", err);
    try {
      await i.editReply({ content: "Something went wrong." });
    } catch {}
  }
});

client.once(Events.ClientReady, async (c) => {
  console.log(`ONLINE as ${c.user.tag} · guilds=${c.guilds.cache.size}`);
  c.user.setActivity("deals · /help", { type: 3 });
  try {
    const app = await c.application.fetch();
    if (app.owner?.id) {
      ownerIds.add(app.owner.id);
      console.log("owner", app.owner.id);
    }
  } catch {}
});

client.on(Events.Error, (e) => console.error("client error", e));

const rest = new REST({ version: "10" }).setToken(token);
await rest.put(Routes.applicationCommands(clientId), { body: commands });
console.log("global commands registered");
if (GUILD_ID) {
  await rest.put(Routes.applicationGuildCommands(clientId, GUILD_ID), { body: commands });
  console.log("guild commands registered", GUILD_ID);
}

await client.login(token);
