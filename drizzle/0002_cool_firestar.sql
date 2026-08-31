ALTER TABLE `tickets` ADD `reporter` text;--> statement-breakpoint
ALTER TABLE `tickets` ADD `status` text DEFAULT 'pending' NOT NULL;