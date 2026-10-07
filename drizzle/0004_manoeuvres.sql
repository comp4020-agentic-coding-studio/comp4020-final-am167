CREATE TABLE `manoeuvres` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`object` integer NOT NULL,
	`kind` text NOT NULL,
	`at` integer NOT NULL,
	`from_radius` real NOT NULL,
	`to_radius` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `manoeuvres_object` ON `manoeuvres` (`object`);--> statement-breakpoint
ALTER TABLE `objects` ADD `rate` real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `objects` ADD `until` integer;--> statement-breakpoint
ALTER TABLE `objects` ADD `deorbited_at` integer;--> statement-breakpoint
ALTER TABLE `objects` ADD `boosts` integer DEFAULT 0 NOT NULL;