-- Stage 5: pages created in the admin, plus page order and parent/child nesting.
-- Additive only. Existing pages keep their URLs.
--
-- Rollback (manual):
--   ALTER TABLE cms_pages DROP COLUMN parent_slug, DROP COLUMN position, DROP COLUMN is_custom;
--   DELETE FROM schema_migrations WHERE name = '006_page_tree.sql';
--   (pages created in the admin would remain as rows; delete them first if you want them gone)

ALTER TABLE cms_pages
  ADD COLUMN parent_slug VARCHAR(100) NULL AFTER title,
  ADD COLUMN position INT NOT NULL DEFAULT 0 AFTER parent_slug,
  ADD COLUMN is_custom TINYINT(1) NOT NULL DEFAULT 0 AFTER position;

UPDATE cms_pages SET position = CASE slug
  WHEN 'home' THEN 0 WHEN 'about' THEN 1 WHEN 'music' THEN 2 WHEN 'film' THEN 3
  WHEN 'music-production' THEN 4 WHEN 'event-management' THEN 5 WHEN 'comedy' THEN 6
  WHEN 'portfolio' THEN 7 WHEN 'contact' THEN 8 ELSE 50 END;
