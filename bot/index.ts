import makeWASocket, { DisconnectReason, useMultiFileAuthState, type WAMessage } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { eq, isNull } from 'drizzle-orm';
import { db } from '../src/lib/server/db';
import { botNotifications, expenses, settlements, users } from '../src/lib/server/schema';
import { createExpense } from '../src/lib/server/expense';
import { resolveTargetedExpense } from '../src/lib/server/spam';
import { redeemLinkCode } from '../src/lib/server/whatsapp-link';
import { parseExpenseCommand } from './parser';

const groupJid = process.env.BOT_GROUP_JID;

function extractText(message: WAMessage) {
  return message.message?.conversation ?? message.message?.extendedTextMessage?.text ?? '';
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_state');
  const sock = makeWASocket({ auth: state });
  let timer: NodeJS.Timeout | undefined;
  let flushing = false;

  const send = (jid: string, message: string) => sock.sendMessage(jid, { text: message });
  async function flushNotifications() {
    if (flushing) return;
    flushing = true;
    try {
      const pending = await db.select().from(botNotifications).where(isNull(botNotifications.sentAt)).limit(20);
      for (const item of pending) {
        let stillRelevant = true;
        if (item.kind === 'targeted' && item.entityId) stillRelevant = (await db.select({ status: expenses.status }).from(expenses).where(eq(expenses.id, item.entityId)).limit(1))[0]?.status === 'pending_approval';
        if (item.kind === 'lock' && item.entityId) stillRelevant = (await db.select({ isLocked: users.isLocked }).from(users).where(eq(users.id, item.entityId)).limit(1))[0]?.isLocked === 1;
        if (item.kind === 'settlement' && item.entityId) stillRelevant = (await db.select({ status: settlements.status }).from(settlements).where(eq(settlements.id, item.entityId)).limit(1))[0]?.status === 'pending_confirmation';
        if (!stillRelevant) { await db.update(botNotifications).set({ sentAt: Date.now() }).where(eq(botNotifications.id, item.id)); continue; }
        const destination = item.recipientJid ?? groupJid;
        if (!destination) continue;
        await send(destination, item.message);
        await db.update(botNotifications).set({ sentAt: Date.now() }).where(eq(botNotifications.id, item.id));
      }
    } catch (cause) { console.error('Notification delivery failed:', cause); }
    finally { flushing = false; }
  }

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) qrcode.generate(qr, { small: true });
    if (connection === 'open') {
      console.log('HostelSplit bot connected');
      if (!groupJid) {
        console.log('Set BOT_GROUP_JID to one of these groups, then restart the bot:');
        void sock.groupFetchAllParticipating().then((groups) => {
          for (const [jid, group] of Object.entries(groups)) console.log(`${group.subject}: ${jid}`);
        }).catch(console.error);
      }
      void flushNotifications();
      timer = setInterval(() => void flushNotifications(), 10_000);
    }
    if (connection === 'close') {
      if (timer) clearInterval(timer);
      const status = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
      if (status !== DisconnectReason.loggedOut) setTimeout(() => void startBot(), 3000);
      else console.error('WhatsApp logged out; relink the bot to continue.');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const message of messages) {
      if (!groupJid || !message.message || message.key.fromMe || message.key.remoteJid !== groupJid) continue;
      const text = extractText(message).trim();
      const senderJid = message.key.participant;
      if (!text || !senderJid) continue;
      try {
        const linkMatch = text.match(/^\/link\s+(\d{6})$/i);
        if (linkMatch) {
          const user = await redeemLinkCode(linkMatch[1], senderJid);
          await send(groupJid!, `✅ ${user.name} linked their WhatsApp number.`);
          continue;
        }
        const creator = (await db.select().from(users).where(eq(users.whatsappJid, senderJid)).limit(1))[0];
        if (!creator) {
          if (/^expense\b|^\/(?:accept|reject)\b/i.test(text)) await send(groupJid!, '⚠️ You are not registered. Open Profile in the app and link your WhatsApp number.');
          continue;
        }
        const response = text.match(/^\/(accept|reject)\s+([0-9a-f-]{36})$/i);
        if (response) {
          const status = await resolveTargetedExpense(response[2], creator.id, response[1].toLowerCase() === 'accept');
          await send(groupJid!, `✅ ${creator.name} ${status === 'active' ? 'accepted' : 'rejected'} the charge.`);
          continue;
        }
        const parsed = parseExpenseCommand(text);
        if (!parsed) continue;
        if (creator.isLocked) { await send(groupJid!, `🥤 You're locked until the room confirms your cold drink, ${creator.name}.`); continue; }
        const roommates = await db.select().from(users);
        const findName = (name: string) => roommates.find((u) => u.name.toLowerCase() === name.toLowerCase());
        const payer = findName(parsed.payerName);
        const participants = parsed.participants === 'ALL' ? roommates : parsed.participants.map(findName);
        if (!payer || participants.some((u) => !u)) { await send(groupJid!, '⚠️ Could not match one or more names. Use exact registered names.'); continue; }
        const expense = await createExpense({ amountPaisa: parsed.amountPaisa, category: parsed.category, paidBy: payer.id, createdBy: creator.id, source: 'whatsapp', participants: participants.map((u) => u!.id) });
        await sock.sendMessage(groupJid!, { react: { text: '✅', key: message.key } });
        await send(groupJid!, `${payer.name} paid Rs. ${(parsed.amountPaisa / 100).toFixed(2)} for ${parsed.category}. ${expense.status === 'pending_approval' ? 'Waiting for the target to approve.' : 'Split recorded.'}`);
        await flushNotifications();
      } catch (cause) {
        await send(groupJid!, `⚠️ ${cause instanceof Error ? cause.message : 'Could not process command'}`);
      }
    }
  });
}

void startBot();
