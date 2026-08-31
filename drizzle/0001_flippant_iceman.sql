CREATE TABLE `systems` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `systems_name_unique` ON `systems` (`name`);--> statement-breakpoint
ALTER TABLE `tickets` ADD `system_id` integer REFERENCES systems(id);--> statement-breakpoint
ALTER TABLE `tickets` ADD `completed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tickets` ADD `completed_at` integer;