ALTER TABLE `users` ADD `auth0_id` text(255) NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE UNIQUE INDEX `users_auth0_id_unique` ON `users` (`auth0_id`);
