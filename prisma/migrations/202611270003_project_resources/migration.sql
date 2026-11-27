CREATE TABLE `project_assets` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `projectId` INTEGER NOT NULL,
  `name` VARCHAR(180) NOT NULL,
  `kind` VARCHAR(10) NOT NULL,
  `mime` VARCHAR(40) NOT NULL,
  `storageKey` CHAR(48) NOT NULL,
  `size` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `project_assets_storageKey_key` (`storageKey`),
  INDEX `project_assets_projectId_kind_id_idx` (`projectId`, `kind`, `id`),
  CONSTRAINT `project_assets_projectId_fkey` FOREIGN KEY (`projectId`)
    REFERENCES `projects` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `project_transactions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `projectId` INTEGER NOT NULL,
  `kind` VARCHAR(3) NOT NULL,
  `amount` DECIMAL(16,2) NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `date` DATE NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `project_transactions_projectId_date_idx` (`projectId`, `date`),
  CONSTRAINT `project_transactions_projectId_fkey` FOREIGN KEY (`projectId`)
    REFERENCES `projects` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
