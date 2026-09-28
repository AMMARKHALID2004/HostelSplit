CREATE TABLE `room_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`is_locked` integer DEFAULT 0 NOT NULL,
	`strikes` integer DEFAULT 0 NOT NULL,
	`penalty_round` integer DEFAULT 0 NOT NULL,
	`avoidance_strikes` integer DEFAULT 0 NOT NULL,
	`fries_owed` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room_settings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_room_member` ON `room_memberships` (`room_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_membership_user` ON `room_memberships` (`user_id`);--> statement-breakpoint
DROP INDEX `uq_penalty_confirmation`;--> statement-breakpoint
ALTER TABLE `penalty_confirmations` ADD `room_id` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_penalty_confirmation` ON `penalty_confirmations` (`room_id`,`culprit_id`,`confirmed_by`,`penalty_round`);--> statement-breakpoint
ALTER TABLE `expenses` ADD `room_id` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE `notifications` ADD `room_id` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_profiles` ADD `room_id` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE `reviews` ADD `room_id` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE `room_settings` ADD `name` text DEFAULT 'Original room' NOT NULL;--> statement-breakpoint
ALTER TABLE `room_settings` ADD `slack_webhook_url` text;--> statement-breakpoint
ALTER TABLE `settlements` ADD `room_id` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
UPDATE room_settings SET name = 'Main room' WHERE id = 'default';
--> statement-breakpoint
INSERT INTO room_memberships (id, room_id, user_id, status, is_locked, strikes, penalty_round, avoidance_strikes, fries_owed, created_at)
SELECT lower(hex(randomblob(16))), 'default', id, membership_status, is_locked, strikes, penalty_round, avoidance_strikes, fries_owed, created_at FROM users;
