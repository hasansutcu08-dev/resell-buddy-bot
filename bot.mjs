/**
 * Resell Buddy Discord bot — simple, guided, button-friendly
 */
import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} from "discord.js";
import "dotenv/config";

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID || "";
const WHOP_PRO = process.env.WHOP_CHECKOUT_PRO || "https://whop.com/checkout/plan_vAO3R1lqZ11UT";
const WHOP_ELITE = process.env.WHOP_CHECKOUT_ELITE || "https://whop.com/checkout/plan_3aG0H3FQibNZ4";
const WHOP_PRODUCT = process.env.WHOP_PRODUCT_URL || "https://whop.com/resell-buddy";

const COL = { brand: 0x5865f2, ok: 0x22c55e, warn: 0xf59e0b, err: 0xef4444, muted: 0x94a3b8 };

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
    const o = ownerIds.has(id);
    u = { linked: o, plan: o ? "owner" : "free", monitors: [], alertChannelId: null };
    users.set(id, u);
  }
  return u;
}

function ensureLinked(u, userId) {
  if (!u.linked) {
    u.linked = true;
    if (ownerIds.has(userId)) u.plan = "owner";
  }
  return u;
}

function planInfo(plan) {
  if (plan === "owner" || plan === "elite")
    return { max: 999, label: plan === "owner" ? "Owner (test)" : "Elite", color: COL.warn };
  if (plan === "pro") return { max: 10, label: "Pro", color: COL.brand };
  return { max: 3, label: "Free", color: COL.ok };
}

function embed(title, body, color = COL.brand) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(body)
    .setFooter({ text: "Resell Buddy" });
}

function homeButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("rb:unlock").setLabel("Unlock free access").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("rb:owner").setLabel("Unlimited test").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("rb:help").setLabel("How it works").setStyle(ButtonStyle.Secondary)
  );
}

function subButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("Pro €14.99").setStyle(ButtonStyle.Link).setURL(WHOP_PRO),
    new ButtonBuilder().setLabel("Elite €29.99").setStyle(ButtonStyle.Link).setURL(WHOP_ELITE),
    new ButtonBuilder().setLabel("All plans").setStyle(ButtonStyle.Link).setURL(WHOP_PRODUCT)
  );
}

function nextSteps(u) {
  const lines = [];
  if (!u.linked) lines.push("→ Click **Unlock free access** or run `/start`");
  else if (!u.alertChannelId) lines.push("→ `/alerts` pick a channel for deals");
  else if (!u.monitors.length) lines.push("→ `/monitor query:nike dunk 42`");
  else lines.push("→ `/demoalert` to preview a deal · `/status` anytime");
  return lines.join("\n");
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder().setName("start").setDescription("Start here — set up Resell Buddy in a few taps"),
  new SlashCommandBuilder().setName("help").setDescription("Simple guide to every command"),
  new SlashCommandBuilder().setName("status").setDescription("Your plan and monitors at a glance"),
  new SlashCommandBuilder()
    .setName("monitor")
    .setDescription("Add a search to watch")
    .addStringOption((o) =>
      o.setName("query").setDescription("What to watch, e.g. nike dunk 42").setRequired(false)
    )
    .addStringOption((o) =>
      o.setName("action").setDescription("list, pause, resume, or delete")
        .addChoices(
          { name: "List my monitors", value: "list" },
          { name: "Pause one", value: "pause" },
          { name: "Resume one", value: "resume" },
          { name: "Delete one", value: "delete" }
        )
        .setRequired(false)
    )
    .addStringOption((o) =>
      o.setName("id").setDescription("Monitor ID (for pause / resume / delete)").setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("alerts")
    .setDescription("Where should deals be posted?")
    .addChannelOption((o) =>
      o.setName("channel").setDescription("Pick a text channel")
        .addChannelTypes(ChannelType.GuildText).setRequired(true)
    ),
  new SlashCommandBuilder().setName("demoalert").setDescription("Send a sample deal to your alert channel"),
  new SlashCommandBuilder().setName("ping").setDescription("Is the bot online?"),
  new SlashCommandBuilder().setName("subscribe").setDescription("Real paid plans (optional — testing is free)"),
  new SlashCommandBuilder().setName("link").setDescription("Same as Unlock free access"),
  new SlashCommandBuilder().setName("claimowner").setDescription("Same as Unlimited test"),
  new SlashCommandBuilder().setName("setup").setDescription("Same as /start"),
].map((c) => c.toJSON());

async function replyStart(i) {
  const u = getUser(i.user.id);
  const p = planInfo(u.plan);
  const embedMsg = embed(
    "Welcome to Resell Buddy",
    [
      "Watch listings and get deals in Discord.",
      "",
      `**Your plan:** ${p.label}`,
      `**Monitors:** ${u.monitors.length}${p.max === 999 ? "" : ` / ${p.max}`}`,
      `**Alerts:** ${u.alertChannelId ? `<#${u.alertChannelId}>` : "not set"}`,
      "",
      "**Do this once:**",
      "1. **Unlock free access** (button below)",
      "2. `/alerts` → choose a channel",
      "3. `/monitor query:nike dunk 42`",
      "4. `/demoalert` — see a sample deal",
      "",
      "No card needed for testing.",
    ].join("\n"),
    COL.brand
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("rb:status").setLabel("My status").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setLabel("Subscribe").setStyle(ButtonStyle.Link).setURL(WHOP_PRODUCT)
  );
  await i.editReply({ embeds: [embedMsg], components: [homeButtons(), row2] });
}

client.on(Events.InteractionCreate, async (i) => {
  if (i.isButton()) {
    if (!i.customId.startsWith("rb:")) return;
    try { await i.deferReply({ ephemeral: true }); } catch { return; }
    const u = getUser(i.user.id);
    try {
      if (i.customId === "rb:unlock" || i.customId === "rb:link") {
        ensureLinked(u, i.user.id);
        const p = planInfo(u.plan);
        await i.editReply({ embeds: [embed("You're in", `Plan: **${p.label}**\n\n**Next:** `/alerts` and pick the channel for deals.\nThen `/monitor query:your keywords`.`, COL.ok)] });
        return;
      }
      if (i.customId === "rb:owner") {
        ownerIds.add(i.user.id);
        u.linked = true;
        u.plan = "owner";
        await i.editReply({ embeds: [embed("Unlimited test mode", "As many monitors as you want.\nNo charge while testing.\n\n**Next:** `/alerts` then `/monitor query:…`, COL.warn)] });
        return;
      }
      if (i.customId === "rb:help") {
        await i.editReply({ embeds: [embed("How it works", "**1. Unlock** free account\n**2.** `/alerts` choose channel\n**3.** `/monitor query:nike dunk 42`\n**4.** `/demoalert` sample ping\n\nLater, live scanning posts real deals.\nCustomers pay via `/subscribe`. You test free.")] });
        return;
      }
      if (i.customId === "rb:status") {
        const p = planInfo(u.plan);
        await i.editReply({ embeds: [embed("Your status", `**Plan:** ${p.label}\n**Linked:** ${u.linked ? "Yes" : "No"}\n**Monitors:** ${u.monitors.length}${p.max === 999 ? "" : ` / ${p.max}`}\n**Alert channel:** ${u.alertChannelId ? `<#${u.alertChannelId}>` : "not set"}\n\n${nextSteps(u)}`, p.color)] });
        return;
      }
    } catch (e) {
      console.error(e);
      try { await i.editReply({ content: "Something went wrong. Try `/start`." }); } catch {}
    }
    return;
  }

  if (!i.isChatInputCommand()) return;
  console.log(`[ix] /${i.commandName} ${i.user.id}`);
  try { await i.deferReply({ ephemeral: true }); } catch (e) { console.error("defer", e); return; }

  try {
    const name = i.commandName;
    const u = getUser(i.user.id);

    if (name === "start" || name === "setup") { await replyStart(i); return; }

    if (name === "ping") {
      await i.editReply({ embeds: [embed("Online", `Responding in **${client.ws.ping}ms**. You're good.`, COL.ok)] });
      return;
    }

    if (name === "help") {
      await i.editReply({
        embeds: [embed("Commands", [`/start` — home screen (use this first)\n`/alerts` — where deals go\n`/monitor query:…` — watch keywords\n`/monitor action:List` — see watches\n`/demoalert` — sample deal\n`/status` — progress\n`/subscribe` — paid plans\n`/ping` — health\n\n${nextSteps(u)}`].join(""))],
        components: [homeButtons()],
      });
      return;
    }

    if (name === "link") {
      ensureLinked(u, i.user.id);
      await i.editReply({ embeds: [embed("Unlocked", `You're on **${planInfo(u.plan).label}**.\n\nNext: `/alerts``, COL.ok)] });
      return;
    }

    if (name === "claimowner") {
      ownerIds.add(i.user.id);
      u.linked = true;
      u.plan = "owner";
      await i.editReply({ embeds: [embed("Unlimited test", "No limits for testing. Next: `/alerts` then `/monitor`.", COL.warn)] });
      return;
    }

    if (name === "status") {
      const p = planInfo(u.plan);
      const active = u.monitors.filter((m) => !m.paused).length;
      await i.editReply({
        embeds: [embed("Status", `**Plan:** ${p.label}\n**Monitors:** ${u.monitors.length}${p.max === 999 ? "" : ` / ${p.max}`} (${active} active)\n**Alerts:** ${u.alertChannelId ? `<#${u.alertChannelId}>` : "not set"}\n\n${nextSteps(u)}`, p.color)],
        components: [homeButtons()],
      });
      return;
    }

    if (name === "alerts") {
      ensureLinked(u, i.user.id);
      const ch = i.options.getChannel("channel", true);
      u.alertChannelId = ch.id;
      await i.editReply({ embeds: [embed("Alert channel saved", `Deals will post in <#${ch.id}>.\n\n**Next:** `/monitor query:nike dunk 42`\nThen try `/demoalert`.` , COL.ok)] });
      return;
    }

    if (name === "monitor") {
      ensureLinked(u, i.user.id);
      const p = planInfo(u.plan);
      const query = i.options.getString("query");
      const action = i.options.getString("action");
      const id = i.options.getString("id");

      if (query && !action) {
        if (u.monitors.length >= p.max) {
          await i.editReply({
            embeds: [embed("Limit reached", `**${p.label}** allows ${p.max} monitors.\nClick **Unlimited test** on `/start` or delete one.`, COL.err)],
            components: [homeButtons()],
          });
          return;
        }
        const mid = "m_" + Math.random().toString(36).slice(2, 8);
        u.monitors.push({ id: mid, query: query.trim(), paused: false });
        await i.editReply({ embeds: [embed("Watching", `**${query.trim()}**\nID: \`${mid}\`\nSlots: ${u.monitors.length}${p.max === 999 ? "" : ` / ${p.max}`}\n\n${u.alertChannelId ? `Alerts → <#${u.alertChannelId}> · try \`/demoalert\`` : "Set a channel first: `/alerts`"}`, COL.ok)] });
        return;
      }

      const act = action || "list";
      if (act === "list") {
        if (!u.monitors.length) {
          await i.editReply({ embeds: [embed("No monitors yet", "Add one:\n`/monitor query:nike dunk 42`", COL.muted)] });
          return;
        }
        const lines = u.monitors.map((m) => `• \`${m.id}\` **${m.query}**${m.paused ? " *(paused)*" : ""}`);
        await i.editReply({ embeds: [embed(`Your monitors (${u.monitors.length})`, lines.join("\n") + "\n\nPause: `/monitor action:Pause id:m_xxxxx`")] });
        return;
      }
      if (!id) {
        await i.editReply({ embeds: [embed("Need an ID", "Run `/monitor action:List` copy an ID, then pause/resume/delete.", COL.warn)] });
        return;
      }
      const idx = u.monitors.findIndex((m) => m.id === id);
      if (idx < 0) {
        await i.editReply({ embeds: [embed("Not found", `No monitor \`${id}\`.` , COL.err)] });
        return;
      }
      if (act === "delete") {
        u.monitors.splice(idx, 1);
        await i.editReply({ embeds: [embed("Removed", `Deleted \`${id}\`.` , COL.ok)] });
        return;
      }
      u.monitors[idx].paused = act === "pause";
      await i.editReply({ embeds: [embed(act === "pause" ? "Paused" : "Resumed", `\`${id}\` is **${act === "pause" ? "paused" : "active"}**.`, COL.ok)] });
      return;
    }

    if (name === "demoalert") {
      ensureLinked(u, i.user.id);
      if (!u.alertChannelId) {
        await i.editReply({ embeds: [embed("Pick a channel first", "Run `/alerts` and choose where deals should go.", COL.warn)] });
        return;
      }
      const ch = await client.channels.fetch(u.alertChannelId).catch(() => null);
      if (!ch?.isTextBased?.() || ch.isDMBased?.()) {
        await i.editReply({ embeds: [embed("Can't post there", "Give **Resell Buddy** in that channel:\n• View Channel\n• Send Messages\n• Embed Links", COL.err)] });
        return;
      }
      await ch.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COL.ok)
            .setTitle("🔥 New deal — Nike Dunk Low")
            .setDescription("**€45** · Size **42** · Very good\nNike · Berlin\n\n[Open on Vinted](https://www.vinted.fr)\n\n_Sample alert from Resell Buddy_")
            .setTimestamp()
            .setFooter({ text: "Resell Buddy" }),
        ],
      });
      await i.editReply({ embeds: [embed("Sent", `Sample deal posted in <#${u.alertChannelId}>.`, COL.ok)] });
      return;
    }

    if (name === "subscribe") {
      await i.editReply({
        embeds: [embed("Paid plans", "Test free with **Unlimited test** on `/start`.\n\n**Pro — €14.99/mo** · 10 monitors\n**Elite — €29.99/mo** · unlimited + extras\n\nFor customers when you launch.")],
        components: [subButtons()],
      });
      return;
    }

    await i.editReply({ content: "Try `/start`." });
  } catch (err) {
    console.error("handler", err);
    try { await i.editReply({ content: "Something went wrong — try `/start` again." }); } catch {}
  }
});

client.once(Events.ClientReady, async (c) => {
  console.log(`ONLINE as ${c.user.tag} · guilds=${c.guilds.cache.size}`);
  c.user.setActivity("/start · Resell Buddy", { type: 3 });
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
console.log("global commands ok");
if (GUILD_ID) {
  await rest.put(Routes.applicationGuildCommands(clientId, GUILD_ID), { body: commands });
  console.log("guild commands ok", GUILD_ID);
}
await client.login(token);
