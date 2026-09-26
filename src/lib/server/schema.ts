import { integer, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  whatsappJid: text('whatsapp_jid').unique(),
  pinHash: text('pin_hash'),
  isLocked: integer('is_locked').notNull().default(0),
  strikes: integer('strikes').notNull().default(0),
  penaltyRound: integer('penalty_round').notNull().default(0),
  createdAt: integer('created_at').notNull()
});

export const roomSettings = sqliteTable('room_settings', {
  id: text('id').primaryKey(),
  pinHash: text('pin_hash').notNull(),
  sessionSecret: text('session_secret').notNull(),
  createdAt: integer('created_at').notNull()
});

export const paymentProfiles = sqliteTable('payment_profiles', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  method: text('method').notNull(),
  accountTitle: text('account_title'),
  accountNumber: text('account_number'),
  bankName: text('bank_name'),
  qrImageBase64: text('qr_image_base64'),
  isPrimary: integer('is_primary').notNull().default(0)
});

export const expenses = sqliteTable('expenses', {
  id: text('id').primaryKey(),
  amountPaisa: integer('amount_paisa').notNull(),
  category: text('category').notNull(),
  description: text('description'),
  paidBy: text('paid_by').notNull().references(() => users.id),
  createdBy: text('created_by').notNull().references(() => users.id),
  source: text('source').notNull(),
  status: text('status').notNull().default('active'),
  isTargeted: integer('is_targeted').notNull().default(0),
  spamFlagCount: integer('spam_flag_count').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  resolvedAt: integer('resolved_at')
}, (table) => [index('idx_expenses_status').on(table.status)]);

export const expenseSplits = sqliteTable('expense_splits', {
  id: text('id').primaryKey(),
  expenseId: text('expense_id').notNull().references(() => expenses.id),
  userId: text('user_id').notNull().references(() => users.id),
  sharePaisa: integer('share_paisa').notNull(),
  status: text('status').notNull().default('confirmed'),
  respondedAt: integer('responded_at')
}, (table) => [index('idx_expense_splits_user').on(table.userId), index('idx_expense_splits_expense').on(table.expenseId), uniqueIndex('uq_expense_split_user').on(table.expenseId, table.userId)]);

export const spamFlags = sqliteTable('spam_flags', {
  id: text('id').primaryKey(),
  expenseId: text('expense_id').notNull().references(() => expenses.id),
  flaggedBy: text('flagged_by').notNull().references(() => users.id),
  createdAt: integer('created_at').notNull()
}, (table) => [uniqueIndex('uq_spam_flag').on(table.expenseId, table.flaggedBy)]);

export const penaltyConfirmations = sqliteTable('penalty_confirmations', {
  id: text('id').primaryKey(),
  culpritId: text('culprit_id').notNull().references(() => users.id),
  confirmedBy: text('confirmed_by').notNull().references(() => users.id),
  createdAt: integer('created_at').notNull(),
  penaltyRound: integer('penalty_round').notNull()
}, (table) => [uniqueIndex('uq_penalty_confirmation').on(table.culpritId, table.confirmedBy, table.penaltyRound)]);

export const settlements = sqliteTable('settlements', {
  id: text('id').primaryKey(),
  payerId: text('payer_id').notNull().references(() => users.id),
  payeeId: text('payee_id').notNull().references(() => users.id),
  amountPaisa: integer('amount_paisa').notNull(),
  proofImageBase64: text('proof_image_base64'),
  status: text('status').notNull().default('pending_confirmation'),
  createdAt: integer('created_at').notNull(),
  confirmedAt: integer('confirmed_at')
}, (table) => [index('idx_settlements_pair').on(table.payerId, table.payeeId)]);

export const whatsappLinkCodes = sqliteTable('whatsapp_link_codes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  codeHash: text('code_hash').notNull().unique(),
  expiresAt: integer('expires_at').notNull(),
  usedAt: integer('used_at')
});

export const botNotifications = sqliteTable('bot_notifications', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  entityId: text('entity_id'),
  recipientJid: text('recipient_jid'),
  message: text('message').notNull(),
  createdAt: integer('created_at').notNull(),
  sentAt: integer('sent_at')
});
