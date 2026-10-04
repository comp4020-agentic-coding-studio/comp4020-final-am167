CREATE TABLE `objects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`owner` text,
	`callsign` text,
	`beacon` text,
	`band` text NOT NULL,
	`launched_at` integer NOT NULL,
	`radius` real NOT NULL,
	`phase` real NOT NULL,
	`period` integer NOT NULL,
	`epoch` integer NOT NULL,
	`fate` text DEFAULT 'live' NOT NULL,
	`fate_at` integer
);
--> statement-breakpoint
CREATE INDEX `objects_fate` ON `objects` (`fate`);--> statement-breakpoint
CREATE INDEX `objects_owner` ON `objects` (`owner`);--> statement-breakpoint
CREATE UNIQUE INDEX `objects_one_live_per_owner` ON `objects` (`owner`) WHERE "objects"."fate" = 'live' AND "objects"."owner" IS NOT NULL;