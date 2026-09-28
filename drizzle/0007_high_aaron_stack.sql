CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`room_id` text,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_session_user` ON `sessions` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `avatar_base64` text;--> statement-breakpoint
ALTER TABLE `users` ADD `avatar_updated_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `last_room_id` text;