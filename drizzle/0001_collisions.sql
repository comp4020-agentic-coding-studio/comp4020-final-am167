CREATE TABLE `collisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`a` integer NOT NULL,
	`b` integer NOT NULL,
	`angle` real NOT NULL,
	`radius` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `collisions_at` ON `collisions` (`at`);--> statement-breakpoint
CREATE UNIQUE INDEX `collisions_pair` ON `collisions` (`a`,`b`);--> statement-breakpoint
ALTER TABLE `objects` ADD `direction` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `objects` ADD `source_collision` integer;--> statement-breakpoint
CREATE INDEX `objects_source_collision` ON `objects` (`source_collision`);