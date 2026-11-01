-- One row per payment try (NTT DATA / Atom). A booking can have several tries
-- (failed card, cancelled popup, …); the booking is only marked paid on a verified success.
CREATE TABLE payment_attempts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  booking_id CHAR(36) NOT NULL,
  merch_txn_id VARCHAR(60) NOT NULL,
  merch_txn_date VARCHAR(19) NOT NULL,          -- as sent to Atom: yyyy-MM-dd HH:mm:ss (IST)
  amount INT NOT NULL,
  atom_token_id VARCHAR(60) NULL,
  atom_txn_id VARCHAR(60) NULL,
  status ENUM('initiated','paid','failed') NOT NULL DEFAULT 'initiated',
  status_code VARCHAR(20) NULL,
  description VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  completed_at DATETIME(3) NULL,
  UNIQUE KEY payment_attempts_txn_uq (merch_txn_id),
  KEY payment_attempts_booking_idx (booking_id, created_at),
  CONSTRAINT payment_attempts_booking_fk FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
