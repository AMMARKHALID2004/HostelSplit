CREATE TABLE `notification_lock` (
	`id` text PRIMARY KEY NOT NULL,
	`until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`retry_at` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `review_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`user_id` text NOT NULL,
	`verdict` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_review_vote` ON `review_votes` (`review_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`expense_id` text NOT NULL,
	`accused_id` text NOT NULL,
	`opened_by` text NOT NULL,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`accused_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opened_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_review` ON `reviews` (`expense_id`,`accused_id`,`kind`);--> statement-breakpoint
ALTER TABLE `room_settings` ADD `owner_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `username` text;--> statement-breakpoint
ALTER TABLE `users` ADD `membership_status` text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `avoidance_strikes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `fries_owed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
UPDATE room_settings SET owner_id = (SELECT id FROM users ORDER BY created_at, id LIMIT 1) WHERE owner_id IS NULL;
--> statement-breakpoint
WITH numbered AS (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS n FROM users)
UPDATE users SET username = 'member_' || printf('%04d', (SELECT n FROM numbered WHERE numbered.id = users.id)) WHERE username IS NULL;
--> statement-breakpoint
INSERT INTO notification_lock (id, until) VALUES ('slack', 0);
