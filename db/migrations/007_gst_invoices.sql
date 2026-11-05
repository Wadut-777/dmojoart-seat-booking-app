-- Stage 6: GST + service charge breakup on bookings, tax invoices, manual payment reconciliation.
-- Additive only. Existing bookings keep their total_price; price_breakup stays NULL for them.
--
-- Rollback (manual):
--   DROP TABLE invoices, invoice_counter;
--   ALTER TABLE bookings DROP COLUMN price_breakup;
--   DELETE FROM schema_migrations WHERE name = '007_gst_invoices.sql';

-- JSON snapshot of how total_price was built (ticket value, GST, service charge, round-off).
-- total_price remains the amount actually charged and sent to the payment gateway.
ALTER TABLE bookings ADD COLUMN price_breakup LONGTEXT NULL AFTER total_price;

-- One invoice per paid booking, numbered per financial year (INV/2026-27/000001).
CREATE TABLE invoice_counter (
  fy VARCHAR(9) NOT NULL PRIMARY KEY,
  n INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE invoices (
  id CHAR(36) NOT NULL PRIMARY KEY,
  booking_id CHAR(36) NOT NULL,
  invoice_no VARCHAR(40) NOT NULL,
  fy VARCHAR(9) NOT NULL,
  issued_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  seller_snapshot LONGTEXT NOT NULL,   -- seller name/GSTIN/address as they were when the invoice was issued
  UNIQUE KEY invoices_booking_uq (booking_id),
  UNIQUE KEY invoices_no_uq (invoice_no),
  CONSTRAINT invoices_booking_fk FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
