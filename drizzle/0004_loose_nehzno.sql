ALTER TABLE `expenses` ADD `split_mode` text DEFAULT 'equal' NOT NULL;--> statement-breakpoint
ALTER TABLE `expenses` ADD `voided_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `expenses` ADD `void_reason` text;