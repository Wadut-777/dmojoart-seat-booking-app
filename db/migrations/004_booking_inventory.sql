-- 004_booking_inventory.sql — speeds up the seat-availability count used by capacity checks and holds.
-- Additive only (one index). Rollback:
--   DROP INDEX bookings_inventory_idx ON bookings;
--   DELETE FROM schema_migrations WHERE name = '004_booking_inventory.sql';
CREATE INDEX bookings_inventory_idx ON bookings (hall_id, seat_category, event_id, payment_status, created_at);
