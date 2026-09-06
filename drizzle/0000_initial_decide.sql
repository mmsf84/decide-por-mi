CREATE TABLE IF NOT EXISTS `comparisons` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`criteria` text NOT NULL,
	`analysis` text NOT NULL,
	`canvas` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comparisons_created_at` ON `comparisons` (`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `comparison_products` (
	`id` text PRIMARY KEY NOT NULL,
	`comparison_id` text NOT NULL,
	`url` text NOT NULL,
	`name` text NOT NULL,
	`merchant` text NOT NULL,
	`category` text NOT NULL,
	`price` real,
	`currency` text,
	`metadata` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comparison_products_comparison_id` ON `comparison_products` (`comparison_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `comparison_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`comparison_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comparison_messages_comparison_id` ON `comparison_messages` (`comparison_id`);
--> statement-breakpoint
PRAGMA optimize;
