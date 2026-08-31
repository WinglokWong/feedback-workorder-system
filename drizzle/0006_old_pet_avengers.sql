ALTER TABLE `tickets` ADD `created_by_user_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `tickets` ADD `assigned_user_id` integer REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `idx_tickets_assigned_user_id` ON `tickets` (`assigned_user_id`);