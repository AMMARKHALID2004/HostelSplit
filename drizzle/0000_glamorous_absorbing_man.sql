CREATE TABLE `expense_splits` (
	`id` text PRIMARY KEY NOT NULL,
	`expense_id` text NOT NULL,
	`user_id` text NOT NULL,
	`share_paisa` integer NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`responded_at` integer,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_expense_splits_user` ON `expense_splits` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_expense_splits_expense` ON `expense_splits` (`expense_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_expense_split_user` ON `expense_splits` (`expense_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`amount_paisa` integer NOT NULL,
	`category` text NOT NULL,
	`description` text,
	`paid_by` text NOT NULL,
	`created_by` text NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`is_targeted` integer DEFAULT 0 NOT NULL,
	`spam_flag_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`paid_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_expenses_status` ON `expenses` (`status`);--> statement-breakpoint
CREATE TABLE `payment_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`method` text NOT NULL,
	`account_title` text,
	`account_number` text,
	`bank_name` text,
	`qr_image_base64` text,
	`is_primary` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `penalty_confirmations` (
	`id` text PRIMARY KEY NOT NULL,
	`culprit_id` text NOT NULL,
	`confirmed_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`penalty_round` integer NOT NULL,
	FOREIGN KEY (`culprit_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`confirmed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_penalty_confirmation` ON `penalty_confirmations` (`culprit_id`,`confirmed_by`,`penalty_round`);--> statement-breakpoint
CREATE TABLE `settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`payer_id` text NOT NULL,
	`payee_id` text NOT NULL,
	`amount_paisa` integer NOT NULL,
	`proof_image_base64` text,
	`status` text DEFAULT 'pending_confirmation' NOT NULL,
	`created_at` integer NOT NULL,
	`confirmed_at` integer,
	FOREIGN KEY (`payer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_settlements_pair` ON `settlements` (`payer_id`,`payee_id`);--> statement-breakpoint
CREATE TABLE `spam_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`expense_id` text NOT NULL,
	`flagged_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`flagged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_spam_flag` ON `spam_flags` (`expense_id`,`flagged_by`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`whatsapp_jid` text,
	`pin_hash` text,
	`is_locked` integer DEFAULT 0 NOT NULL,
	`strikes` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_whatsapp_jid_unique` ON `users` (`whatsapp_jid`);