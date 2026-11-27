ALTER TABLE `project_tasks`
  ADD COLUMN `assigneeId` INTEGER NULL,
  ADD INDEX `project_tasks_assigneeId_idx` (`assigneeId`),
  ADD CONSTRAINT `project_tasks_assigneeId_fkey` FOREIGN KEY (`assigneeId`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
