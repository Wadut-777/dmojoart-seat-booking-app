-- Stage 8: show times per cinema hall, and listing a movie/event on selected halls.
-- Additive only. Halls and events without any show rows keep working exactly as before
-- (booking falls back to the hall's free-text "show_time").
--
-- Rollback (manual):
--   ALTER TABLE bookings DROP FOREIGN KEY bookings_show_fk, DROP COLUMN show_id, DROP COLUMN show_label;
--   DROP TABLE hall_shows;
--   DELETE FROM schema_migrations WHERE name = '008_hall_shows.sql';

-- One row = one screening / performance of an event at a hall, on a date, at a time (India time, 24h "HH:MM").
CREATE TABLE hall_shows (
  id CHAR(36) NOT NULL PRIMARY KEY,
  hall_id CHAR(36) NOT NULL,
  event_id CHAR(36) NOT NULL,
  show_date DATE NOT NULL,
  show_time CHAR(5) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY hall_shows_uq (hall_id, event_id, show_date, show_time),
  KEY hall_shows_event_idx (event_id, show_date),
  KEY hall_shows_hall_idx (hall_id, show_date),
  CONSTRAINT hall_shows_hall_fk FOREIGN KEY (hall_id) REFERENCES halls(id) ON DELETE CASCADE,
  CONSTRAINT hall_shows_event_fk FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Which show a booking is for. show_label is a snapshot of the date/time text, so tickets and invoices stay
-- correct even if the show is later removed.
ALTER TABLE bookings
  ADD COLUMN show_id CHAR(36) NULL AFTER hall_id,
  ADD COLUMN show_label VARCHAR(100) NULL AFTER show_id,
  ADD KEY bookings_show_idx (show_id),
  ADD CONSTRAINT bookings_show_fk FOREIGN KEY (show_id) REFERENCES hall_shows(id) ON DELETE SET NULL;
