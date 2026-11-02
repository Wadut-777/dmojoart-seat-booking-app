-- 003_cms.sql — CMS foundation for the DMOJO ART site redevelopment.
-- Purely additive: no existing table loses a column or row. The only change to an existing table is
-- widening the user_roles.role ENUM (existing values and rows are untouched).
--
-- Rollback (manual, only if nothing has been written to these tables yet):
--   DROP TABLE audit_logs, enquiries, media, cms_items, cms_pages, site_settings;
--   ALTER TABLE user_roles MODIFY role ENUM('admin','editor','booking_manager','executive') NOT NULL;
--   (the ALTER fails if any user already has the event_manager role — remove those rows first)
--   DELETE FROM schema_migrations WHERE name = '003_cms.sql';

ALTER TABLE user_roles
  MODIFY role ENUM('admin','editor','booking_manager','executive','event_manager') NOT NULL;

-- Site-wide settings (brand, navigation, footer, social links, contact info, theme, analytics id).
-- One row per setting key; setting_value is JSON text. Never store secrets here: it is readable by visitors.
CREATE TABLE site_settings (
  setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
  setting_value LONGTEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Page-level SEO. The page body lives in page_blocks under page = CONCAT('cms:', slug).
CREATE TABLE cms_pages (
  slug VARCHAR(100) NOT NULL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  meta_title VARCHAR(200) NULL,
  meta_description VARCHAR(500) NULL,
  og_image VARCHAR(500) NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Generic content modules: artists, movies, music_releases, services, portfolio, gallery_photos,
-- gallery_videos, testimonials, sponsors, team. `data` is JSON text shaped by src/lib/cms-schema.ts.
CREATE TABLE cms_items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  collection VARCHAR(50) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  data LONGTEXT NOT NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY cms_items_collection_idx (collection, is_published, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Media library records for files stored under STORAGE_DIR.
CREATE TABLE media (
  id CHAR(36) NOT NULL PRIMARY KEY,
  path VARCHAR(500) NOT NULL,
  folder VARCHAR(100) NOT NULL DEFAULT 'general',
  kind ENUM('image','video') NOT NULL DEFAULT 'image',
  original_name VARCHAR(255) NULL,
  alt_text VARCHAR(300) NULL,
  mime VARCHAR(100) NULL,
  size_bytes INT NULL,
  width INT NULL,
  height INT NULL,
  mobile_path VARCHAR(500) NULL,
  uploaded_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY media_path_uq (path),
  KEY media_folder_idx (folder, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contact / enquiry / newsletter submissions from the public forms.
CREATE TABLE enquiries (
  id CHAR(36) NOT NULL PRIMARY KEY,
  kind VARCHAR(40) NOT NULL,
  name VARCHAR(120) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(30) NULL,
  message TEXT NULL,
  extra LONGTEXT NULL,
  status ENUM('new','in_progress','done','spam') NOT NULL DEFAULT 'new',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY enquiries_status_idx (status, created_at),
  KEY enquiries_kind_idx (kind, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Who changed what in the admin. user_id is not a foreign key so history survives user deletion.
CREATE TABLE audit_logs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NULL,
  user_email VARCHAR(255) NULL,
  action VARCHAR(60) NOT NULL,
  entity VARCHAR(60) NOT NULL,
  entity_id VARCHAR(100) NULL,
  detail TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY audit_logs_created_idx (created_at),
  KEY audit_logs_entity_idx (entity, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
