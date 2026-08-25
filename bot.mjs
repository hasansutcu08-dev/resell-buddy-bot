import {
  Client, GatewayIntentBits, Events, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ChannelType,
} from "discord.js";
import "dotenv/config";

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID || "";
const WHOP_PRO = process.env.WHOP_CHECKOUT_PRO || "https://whop.com/checkout/plan_vAO3R1lqZ11UT";
const WHOP_ELITE = process.env.WHOP_CHECKOUT_ELITE || "https://whop.com/checkout/plan_3aG0H3FQibNZ4";
const WHOP_PRODUCT = process.env.WHOP_PRODUCT_URL || "https://whop.com/resell-buddy";
const C = { brand: 0x5865f2, ok: 0x22c55e, warn: 0xf59e0b, err: 0xef4444 };

if (!token || !clientId) {
  console.error("Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID");
  process.exit(1);
}

const ownerIds = new Set((process.env.OWNER_DISCORD_IDS || "").split(",").map(s => s.trim()).filter(Boolean));
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
function planInfo(plan) {
  if (plan === "owner" || plan === "elite") return { max: 999, label: plan === "owner" ? "Owner (Elite · test)" : "Elite", color: C.warn };
  if (plan === "pro") return { max: 10, label: "Pro", color: C.brand };
  return { max: 3, label: "Free (test)", color: C.ok };
}
const foot = { text: "Resell Buddy · test mode" };

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder().setName("help").setDescription("Commands and quick start"),
  new SlashCommandBuilder().setName("setup").setDescription("Guided setup"),
  new SlashCommandBuilder().setName("ping").setDescription("Check bot is online"),
  new SlashCommandBuilder().setName("link").setDescription("Activate free test account"),
  new SlashCommandBuilder().setName("status").setDescription("Plan, monitors, alerts"),
  new SlashCommandBuilder().setName("claimowner").setDescription("Unlimited test access (no payment)"),
  new SlashCommandBuilder().setName("monitor").setDescription("Manage monitors")
    .addSubcommand(s => s.setName("create").setDescription("Create monitor")
      .addStringOption(o => o.setName("query").setDescription("e.g. nike dunk 42").setRequired(true)))
    .addSubcommand(s => s.setName("list").setDescription("List monitors"))
    .addSubcommand(s => s.setName("pause").setDescription("Pause")
      .addStringOption(o => o.setName("id").setDescription("Monitor ID").setRequired(true)))
    .addSubcommand(s => s.setName("resume").setDescription("Resume")
      .addStringOption(o => o.setName("id").setDescription("Monitor ID").setRequired(true)))
    .addSubcommand(s => s.setName("delete").setDescription("Delete")
      .addStringOption(o => o.setName("id").setDescription("Monitor ID").setRequired(true))),
  new SlashCommandBuilder().setName("alerts").setDescription("Set alert channel")
    .addChannelOption(o => o.setName("channel").setDescription("Text channel")
      .addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName("demoalert").setDescription("Sample deal alert"),
  new SlashCommandBuilder().setName("subscribe").setDescription("Whop plans (optional while testing)"),
].map(c => c.toJSON());

function emb(title, desc, color = C.brand) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc).setFooter(foot);
}

client.on(Events.InteractionCreate, async (i) => {
  if (!i.isChatInputCommand()) return;
  console.log(`[ix] /${i.commandName} ${i.user.id}`);
  try { await i.deferReply({ ephemeral: true }); } catch (e) { console.error(e); return; }

  try {
    const name = i.commandName;

    if (name === "ping") {
      await i.editReply({ embeds: [emb("Online", `Latency **${client.ws.ping}ms** · Resell Buddy is running.`, C.ok)] });
      return;
    }

    if (name === "help") {
      await i.editReply({ embeds: [emb("Resell Buddy", [
        "Discord-first monitoring for resellers.",
        "",
        "**Quick start (free)**",
        "`/setup` or `/link` → `/claimowner` → `/alerts` → `/monitor create`",
        "",
        "**Commands**",
        "`/ping` `/link` `/claimowner` `/status`",
        "`/monitor create|list|pause|resume|delete`",
        "`/alerts` `/demoalert` `/subscribe`",
        "",
        "Live Vinted workers next — this is the product UI + test flow.",
      ].join("\n"))] });
      return;
    }

    if (name === "setup") {
      const u = getUser(i.user.id);
      u.linked = true;
      if (ownerIds.has(i.user.id)) u.plan = "owner";
      const p = planInfo(u.plan);
      await i.editReply({ embeds: [emb("Setup", [
        `Plan: **${p.label}**`,
        "",
        "1. Optional `/claimowner` — unlimited test slots",
        "2. `/alerts channel:#channel`",
        "3. `/monitor create query:nike dunk 42`",
        "4. `/demoalert`",
        "",
        "Customers later: `/subscribe` (Whop).",
      ].join("\n"))] });
      return;
    }

    if (name === "link") {
      const u = getUser(i.user.id);
      u.linked = true;
      if (ownerIds.has(i.user.id)) u.plan = "owner";
      const p = planInfo(u.plan);
      await i.editReply({ embeds: [emb("Account linked", [
        `**${i.user.tag}** · **${p.label}**`,
        `Monitors: ${u.monitors.length}/${p.max === 999 ? "∞" : p.max}`,
        u.plan === "free" ? "\n`/claimowner` for unlimited testing." : "\nFull test access.",
      ].join("\n"), C.ok)] });
      return;
    }

    if (name === "claimowner") {
      ownerIds.add(i.user.id);
      const u = getUser(i.user.id);
      u.linked = true; u.plan = "owner";
      await i.editReply({ embeds: [emb("Owner access", "**Owner (Elite · test)** unlocked.\nUnlimited monitors · no Whop charge.\nCustomers still pay via `/subscribe`.", C.warn)] });
      return;
    }

    if (name === "status") {
      const u = getUser(i.user.id);
      const p = planInfo(u.plan);
      const active = u.monitors.filter(m => !m.paused).length;
      await i.editReply({ embeds: [
        new EmbedBuilder().setColor(p.color).setTitle("Your status").setFooter(foot)
          .addFields(
            { name: "Linked", value: u.linked ? "Yes" : "No — `/link`", inline: true },
            { name: "Plan", value: p.label, inline: true },
            { name: "Monitors", value: `${u.monitors.length}/${p.max === 999 ? "∞" : p.max} (${active} active)`, inline: true },
            { name: "Alerts", value: u.alertChannelId ? `<#${u.alertChannelId}>` : "Not set — `/alerts`" },
          )
      ] });
      return;
    }

    if (name === "monitor") {
      const u = getUser(i.user.id);
      if (!u.linked) {
        await i.editReply({ embeds: [emb("Not linked", "Run `/link` or `/setup` first.", C.err)] });
        return;
      }
      const p = planInfo(u.plan);
      const sub = i.options.getSubcommand();

      if (sub === "create") {
        const query = i.options.getString("query", true).trim();
        if (u.monitors.length >= p.max) {
          await i.editReply({ embeds: [emb("Limit reached", `**${p.label}** max ${p.max}.\nUse /claimowner or /monitor delete.`, C.err)] });
          return;
        }
        const id = "m_" + Math.random().toString(36).slice(2, 8);
        u.monitors.push({ id, query, paused: false });
        await i.editReply({ embeds: [emb("Monitor created", `**ID:** ${id}\n**Query:** ${query}\n**Status:** active\n**Slots:** ${u.monitors.length}/${p.max === 999 ? "∞" : p.max}\n\nTry /demoalert after /alerts.`, C.ok)] });
        return;
      }
      if (sub === "list") {
        if (!u.monitors.length) {
          await i.editReply({ embeds: [emb("No monitors", "/monitor create query:nike dunk 42")] });
          return;
        }
        const lines = u.monitors.map(m => `• ${m.id} — **${m.query}** ${m.paused ? "· paused" : "· active"}`);
        await i.editReply({ embeds: [emb(`Monitors (${u.monitors.length})`, lines.join("\n"))] });
        return;
      }
      const id = i.options.getString("id", true);
      const idx = u.monitors.findIndex(m => m.id === id);
      if (idx < 0) {
        await i.editReply({ embeds: [emb("Not found", `No ${id}. /monitor list`, C.err)] });
        return;
      }
      if (sub === "delete") {
        u.monitors.splice(idx, 1);
        await i.editReply({ embeds: [emb("Deleted", `Removed ${id}.`, C.ok)] });
      } else {
        u.monitors[idx].paused = sub === "pause";
        await i.editReply({ embeds: [emb(sub === "pause" ? "Paused" : "Resumed", `${id} is **${sub === "pause" ? "paused" : "active"}**.`, C.ok)] });
      }
      return;
    }

    if (name === "alerts") {
      const u = getUser(i.user.id);
      if (!u.linked) {
        await i.editReply({ embeds: [emb("Not linked", "Run /link first.", C.err)] });
        return;
      }
      const ch = i.options.getChannel("channel", true);
      u.alertChannelId = ch.id;
      await i.editReply({ embeds: [emb("Alert channel set", `Deals → <#${ch.id}>\nTry /demoalert.`, C.ok)] });
      return;
    }

    if (name === "demoalert") {
      const u = getUser(i.user.id);
      if (!u.alertChannelId) {
        await i.editReply({ embeds: [emb("No channel", "/alerts channel:#channel", C.warn)] });
        return;
      }
      const ch = await client.channels.fetch(u.alertChannelId).catch(() => null);
      if (!ch?.isTextBased?.() || ch.isDMBased?.()) {
        await i.editReply({ embeds: [emb("Can't post", "Need Send Messages + Embed Links.", C.err)] });
        return;
      }
      await ch.send({
        embeds: [
          new EmbedBuilder().setColor(C.ok).setTitle("Demo deal — Nike Dunk Low")
            .setDescription("**€45** · Size **42** · Very good\nNike · Berlin\n\n[Open listing](https://www.vinted.fr) *(demo)*\n\n_Sample alert — not live Vinted yet_")
            .setTimestamp().setFooter({ text: "Resell Buddy" }),
        ],
      });
      await i.editReply({ embeds: [emb("Demo sent", `Posted in <#${u.alertChannelId}>.`, C.ok)] });
      return;
    }

    if (name === "subscribe") {
      await i.editReply({
        embeds: [emb("Plans (Whop)", [
          "Testing? Use **/claimowner** — free.",
          "",
          "**Pro — €14.99/mo** · 10 monitors · DMs + roles",
          "**Elite — €29.99/mo** · unlimited · account actions",
        ].join("\n"))],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel("Pro €14.99").setStyle(ButtonStyle.Link).setURL(WHOP_PRO),
          new ButtonBuilder().setLabel("Elite €29.99").setStyle(ButtonStyle.Link).setURL(WHOP_ELITE),
          new ButtonBuilder().setLabel("Product page").setStyle(ButtonStyle.Link).setURL(WHOP_PRODUCT),
        )],
      });
      return;
    }

    await i.editReply({ content: "Unknown command." });
  } catch (err) {
    console.error("handler", err);
    try { await i.editReply({ content: "Something went wrong." }); } catch {}
  }
});

client.once(Events.ClientReady, async (c) => {
  console.log(`ONLINE as ${c.user.tag} · guilds=${c.guilds.cache.size}`);
  c.user.setActivity("/help · Resell Buddy", { type: 3 });
  try {
    const app = await c.application.fetch();
    if (app.owner?.id) { ownerIds.add(app.owner.id); console.log("owner", app.owner.id); }
  } catch {}
});

client.on(Events.Error, e => console.error("client error", e));

const rest = new REST({ version: "10" }).setToken(token);
await rest.put(Routes.applicationCommands(clientId), { body: commands });
console.log("global commands ok");
if (GUILD_ID) {
  await rest.put(Routes.applicationGuildCommands(clientId, GUILD_ID), { body: commands });
  console.log("guild commands ok", GUILD_ID);
}
await client.login(token);
