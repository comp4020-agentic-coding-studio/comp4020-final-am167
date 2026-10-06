CREATE TABLE `operators` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`handle` text NOT NULL,
	`handle_key` text NOT NULL,
	`salt` text NOT NULL,
	`hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operators_handle_key` ON `operators` (`handle_key`);--> statement-breakpoint
CREATE TABLE `people` (
	`person` text PRIMARY KEY NOT NULL,
	`operator` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `objects` ADD `operator` integer;--> statement-breakpoint
CREATE INDEX `objects_operator` ON `objects` (`operator`);