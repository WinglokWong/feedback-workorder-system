ALTER TABLE `tickets` ADD `ticket_number` text;--> statement-breakpoint
UPDATE `tickets` SET `ticket_number` = printf('%06d', 100000 + `id`) WHERE `ticket_number` IS NULL AND `id` BETWEEN 1 AND 899999;--> statement-breakpoint
CREATE UNIQUE INDEX `tickets_ticket_number_unique` ON `tickets` (`ticket_number`);
