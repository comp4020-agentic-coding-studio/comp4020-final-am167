CREATE TABLE `listens` (
	`object` integer NOT NULL,
	`listener` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`object`, `listener`)
);
--> statement-breakpoint
CREATE INDEX `listens_listener` ON `listens` (`listener`);--> statement-breakpoint
CREATE TABLE `transmissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`object` integer NOT NULL,
	`station` text NOT NULL,
	`at` integer NOT NULL,
	`listeners` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `transmissions_at` ON `transmissions` (`at`);--> statement-breakpoint
CREATE INDEX `transmissions_object` ON `transmissions` (`object`);