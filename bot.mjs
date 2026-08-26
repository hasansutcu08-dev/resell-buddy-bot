import {
  Client, GatewayIntentBits, Events, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ChannelType,
} from "discord.js";
import "dotenv/config";

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID || "";
const WHOP = process.env.WHOP_PRODUCT_URL || "https://whop.com/resell-buddy";
const PRO = process.env.WHOP_CHECKOUT_PRO || "https://whop.com/checkout/plan_vAO3R1lqZ11UT";
const ELITE = process.env.WHOP_CHECKOUT_ELITE || "https://whop.com/checkout/plan_3aG0H3FQibNZ4";
const COL = { b: 0x5865f2, ok: 0x22c55e, w: 0xf59e0b, e: 0xef4444 };

if (!token || !clientId) { console.error("Missing env"); process.exit(1); }

const owners = new Set((process.env.OWNER_DISCORD_IDS || "").split(",").map(s => s.trim()).filter(Boolean));
const users = new Map();

function user(id) {
  let u = users.get(id);
  if (!u) {
    const o = owners.has(id);
    u = { linked: o, plan: o ? "owner" : "free", monitors: [], alert: null };
    users.set(id, u);
  }
  return u;
}
function plan(p) {
  if (p === "owner" || p === "elite") return { max: 999, name: p === "owner" ? "Owner (test)" : "Elite", c: COL.w };
  if (p === "pro") return { max: 10, name: "Pro", c: COL.b };
  return { max: 3, name: "Free", c: COL.ok };
}
function emb(t, d, c = COL.b) {
  return new EmbedBuilder().setColor(c).setTitle(t).setDescription(d).setFooter({ text: "Resell Buddy" });
}
function btns() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("rb:go").setLabel("Unlock free access").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("rb:max").setLabel("Unlimited test").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("rb:how").setLabel("How it works").setStyle(ButtonStyle.Secondary)
  );
}
function next(u) {
  if (!u.linked) return "Next: tap Unlock free access";
  if (!u.alert) return "Next: /alerts — pick a channel";
  if (!u.monitors.length) return "Next: /monitor query:nike dunk 42";
  return "Next: /demoalert or /status";
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder().setName("start").setDescription("Start here"),
  new SlashCommandBuilder().setName("help").setDescription("Simple guide"),
  new SlashCommandBuilder().setName("status").setDescription("Your plan and monitors"),
  new SlashCommandBuilder().setName("monitor").setDescription("Watch keywords")
    .addStringOption(o => o.setName("query").setDescription("e.g. nike dunk 42"))
    .addStringOption(o => o.setName("action").setDescription("list/pause/resume/delete")
      .addChoices(
        { name: "List", value: "list" },
        { name: "Pause", value: "pause" },
        { name: "Resume", value: "resume" },
        { name: "Delete", value: "delete" }))
    .addStringOption(o => o.setName("id").setDescription("Monitor ID")),
  new SlashCommandBuilder().setName("alerts").setDescription("Where deals post")
    .addChannelOption(o => o.setName("channel").setDescription("Channel")
      .addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName("demoalert").setDescription("Sample deal"),
  new SlashCommandBuilder().setName("ping").setDescription("Bot online?"),
  new SlashCommandBuilder().setName("subscribe").setDescription("Paid plans"),
  new SlashCommandBuilder().setName("link").setDescription("Unlock free access"),
  new SlashCommandBuilder().setName("claimowner").setDescription("Unlimited test"),
  new SlashCommandBuilder().setName("setup").setDescription("Same as /start"),
].map(c => c.toJSON());

async function home(i) {
  const u = user(i.user.id);
  const p = plan(u.plan);
  const body = [
    "Get deal alerts in Discord. Testing is free.",
    "",
    "**Plan:** " + p.name,
    "**Monitors:** " + u.monitors.length + (p.max === 999 ? "" : " / " + p.max),
    "**Alerts:** " + (u.alert ? "<#" + u.alert + ">" : "not set"),
    "",
    "**Once:**",
    "1. Tap Unlock free access",
    "2. /alerts — choose channel",
    "3. /monitor query:nike dunk 42",
    "4. /demoalert",
  ].join("\n");
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("rb:stat").setLabel("My status").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setLabel("Subscribe").setStyle(ButtonStyle.Link).setURL(WHOP)
  );
  await i.editReply({ embeds: [emb("Welcome to Resell Buddy", body)], components: [btns(), row2] });
}

client.on(Events.InteractionCreate, async (i) => {
  if (i.isButton() && i.customId.startsWith("rb:")) {
    try { await i.deferReply({ ephemeral: true }); } catch { return; }
    const u = user(i.user.id);
    try {
      if (i.customId === "rb:go") {
        u.linked = true;
        if (owners.has(i.user.id)) u.plan = "owner";
        await i.editReply({ embeds: [emb("You're in", "Plan: **" + plan(u.plan).name + "**\n\nNext: /alerts then /monitor query:...", COL.ok)] });
        return;
      }
      if (i.customId === "rb:max") {
        owners.add(i.user.id);
        u.linked = true; u.plan = "owner";
        await i.editReply({ embeds: [emb("Unlimited test", "No limits. Next: /alerts then /monitor.", COL.w)] });
        return;
      }
      if (i.customId === "rb:how") {
        await i.editReply({ embeds: [emb("How it works", "1. Unlock free access\n2. /alerts — channel\n3. /monitor query:nike dunk 42\n4. /demoalert\n\nLive scanning comes next. /subscribe for paid plans.")] });
        return;
      }
      if (i.customId === "rb:stat") {
        const p = plan(u.plan);
        await i.editReply({ embeds: [emb("Status", "**Plan:** " + p.name + "\n**Monitors:** " + u.monitors.length + "\n**Alerts:** " + (u.alert ? "<#" + u.alert + ">" : "not set") + "\n\n" + next(u), p.c)] });
        return;
      }
    } catch (e) { console.error(e); try { await i.editReply({ content: "Error — try /start" }); } catch {} }
    return;
  }

  if (!i.isChatInputCommand()) return;
  console.log("[ix] /" + i.commandName);
  try { await i.deferReply({ ephemeral: true }); } catch { return; }

  try {
    const n = i.commandName;
    const u = user(i.user.id);

    if (n === "start" || n === "setup") { await home(i); return; }
    if (n === "ping") {
      await i.editReply({ embeds: [emb("Online", "Latency **" + client.ws.ping + "ms**", COL.ok)] });
      return;
    }
    if (n === "help") {
      await i.editReply({
        embeds: [emb("Commands", "/start — home\n/alerts — channel\n/monitor query:...\n/monitor action:List\n/demoalert\n/status\n/subscribe\n/ping\n\n" + next(u))],
        components: [btns()],
      });
      return;
    }
    if (n === "link") {
      u.linked = true;
      if (owners.has(i.user.id)) u.plan = "owner";
      await i.editReply({ embeds: [emb("Unlocked", "Plan **" + plan(u.plan).name + "**. Next: /alerts", COL.ok)] });
      return;
    }
    if (n === "claimowner") {
      owners.add(i.user.id); u.linked = true; u.plan = "owner";
      await i.editReply({ embeds: [emb("Unlimited test", "No limits. Next: /alerts", COL.w)] });
      return;
    }
    if (n === "status") {
      const p = plan(u.plan);
      await i.editReply({
        embeds: [emb("Status", "**Plan:** " + p.name + "\n**Monitors:** " + u.monitors.length + "\n**Alerts:** " + (u.alert ? "<#" + u.alert + ">" : "not set") + "\n\n" + next(u), p.c)],
        components: [btns()],
      });
      return;
    }
    if (n === "alerts") {
      u.linked = true;
      const ch = i.options.getChannel("channel", true);
      u.alert = ch.id;
      await i.editReply({ embeds: [emb("Saved", "Deals go to <#" + ch.id + ">\n\nNext: /monitor query:nike dunk 42", COL.ok)] });
      return;
    }
    if (n === "monitor") {
      u.linked = true;
      const p = plan(u.plan);
      const q = i.options.getString("query");
      const act = i.options.getString("action");
      const id = i.options.getString("id");
      if (q && !act) {
        if (u.monitors.length >= p.max) {
          await i.editReply({ embeds: [emb("Limit reached", "Tap Unlimited test on /start", COL.e)], components: [btns()] });
          return;
        }
        const mid = "m_" + Math.random().toString(36).slice(2, 8);
        u.monitors.push({ id: mid, query: q.trim(), paused: false });
        await i.editReply({ embeds: [emb("Watching", "**" + q.trim() + "**\nID: `" + mid + "`\n\n" + (u.alert ? "Try /demoalert" : "Set /alerts first"), COL.ok)] });
        return;
      }
      const a = act || "list";
      if (a === "list") {
        if (!u.monitors.length) {
          await i.editReply({ embeds: [emb("Empty", "Add one: /monitor query:nike dunk 42")] });
          return;
        }
        const lines = u.monitors.map(m => "• `" + m.id + "` " + m.query + (m.paused ? " (paused)" : ""));
        await i.editReply({ embeds: [emb("Monitors", lines.join("\n"))] });
        return;
      }
      if (!id) {
        await i.editReply({ embeds: [emb("Need ID", "Use /monitor action:List first", COL.w)] });
        return;
      }
      const idx = u.monitors.findIndex(m => m.id === id);
      if (idx < 0) {
        await i.editReply({ embeds: [emb("Not found", "Unknown id", COL.e)] });
        return;
      }
      if (a === "delete") {
        u.monitors.splice(idx, 1);
        await i.editReply({ embeds: [emb("Removed", "Deleted `" + id + "`", COL.ok)] });
        return;
      }
      u.monitors[idx].paused = a === "pause";
      await i.editReply({ embeds: [emb(a === "pause" ? "Paused" : "Resumed", "`" + id + "` updated", COL.ok)] });
      return;
    }
    if (n === "demoalert") {
      if (!u.alert) {
        await i.editReply({ embeds: [emb("No channel", "Run /alerts first", COL.w)] });
        return;
      }
      const ch = await client.channels.fetch(u.alert).catch(() => null);
      if (!ch || !ch.isTextBased || !ch.isTextBased()) {
        await i.editReply({ embeds: [emb("Can't post", "Need Send Messages + Embed Links", COL.e)] });
        return;
      }
      await ch.send({
        embeds: [new EmbedBuilder().setColor(COL.ok).setTitle("New deal — Nike Dunk Low")
          .setDescription("**45 EUR** · Size **42**\nNike · Berlin\n\n[Open](https://www.vinted.fr)\n\n_Sample from Resell Buddy_")
          .setTimestamp()],
      });
      await i.editReply({ embeds: [emb("Sent", "Posted in <#" + u.alert + ">", COL.ok)] });
      return;
    }
    if (n === "subscribe") {
      await i.editReply({
        embeds: [emb("Paid plans", "Test free with Unlimited test on /start.\n\nPro 14.99/mo · Elite 29.99/mo")],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel("Pro").setStyle(ButtonStyle.Link).setURL(PRO),
          new ButtonBuilder().setLabel("Elite").setStyle(ButtonStyle.Link).setURL(ELITE),
          new ButtonBuilder().setLabel("All plans").setStyle(ButtonStyle.Link).setURL(WHOP)
        )],
      });
      return;
    }
    await i.editReply({ content: "Try /start" });
  } catch (err) {
    console.error(err);
    try { await i.editReply({ content: "Error — try /start" }); } catch {}
  }
});

client.once(Events.ClientReady, async (c) => {
  console.log("ONLINE as " + c.user.tag);
  c.user.setActivity("/start · Resell Buddy", { type: 3 });
  try {
    const app = await c.application.fetch();
    if (app.owner && app.owner.id) owners.add(app.owner.id);
  } catch {}
});

const rest = new REST({ version: "10" }).setToken(token);
await rest.put(Routes.applicationCommands(clientId), { body: commands });
if (GUILD_ID) await rest.put(Routes.applicationGuildCommands(clientId, GUILD_ID), { body: commands });
console.log("commands registered");
await client.login(token);
