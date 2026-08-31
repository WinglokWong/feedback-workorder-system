CREATE TABLE `attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer NOT NULL,
	`storage_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_storage_key_unique` ON `attachments` (`storage_key`);--> statement-breakpoint
CREATE INDEX `idx_attachments_ticket_id` ON `attachments` (`ticket_id`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`scheduled_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`author_email` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tickets_scheduled_at` ON `tickets` (`scheduled_at`);