CREATE TABLE `project_tasks` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `projectId` INTEGER NOT NULL,
  `title` VARCHAR(180) NOT NULL,
  `description` TEXT NOT NULL,
  `pic` VARCHAR(160) NOT NULL,
  `deadline` DATE NULL,
  `done` BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (`id`),
  INDEX `project_tasks_projectId_id_idx` (`projectId`, `id`),
  CONSTRAINT `project_tasks_projectId_fkey` FOREIGN KEY (`projectId`)
    REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
