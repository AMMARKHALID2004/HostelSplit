CREATE TABLE `room_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`pin_hash` text NOT NULL,
	`session_secret` text NOT NULL,
	`created_at` integer NOT NULL
);
