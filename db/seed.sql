-- Starter data (same as the original project). Only applied to an empty database.
INSERT INTO events (id, title, tagline, release_date, synopsis)
VALUES (UUID(), 'PremXL', 'মৰমেৰে সজোৱা — Bigger Than Love', '2026-10-02',
        'A D Mojo Art production. Directed by Tony Deori Basumatary. In cinemas 2 October 2026.');

SET @h_tezpur = UUID(), @h_dhekiajuli = UUID(), @h_nalbari = UUID(),
    @h_tihu = UUID(), @h_dhemaji = UUID(), @h_lakhimpur = UUID();

INSERT INTO halls (id, name, city) VALUES
  (@h_tezpur,     'SVF Cinemas: G Square Mall, Tezpur', 'Tezpur'),
  (@h_dhekiajuli, 'Nakshatra Cinemas: Dhekiajuli',      'Dhekiajuli'),
  (@h_nalbari,    'Bella Luna Cinema',                  'Nalbari'),
  (@h_tihu,       'Gandhi Bhawan',                      'Tihu'),
  (@h_dhemaji,    'Dhemaji Cinema & Café',              'Dhemaji'),
  (@h_lakhimpur,  'Nakshatra Cinema',                   'North Lakhimpur');

INSERT INTO hall_categories (id, hall_id, name, price) VALUES
  (UUID(), @h_tezpur, 'LOUNGER', 220), (UUID(), @h_tezpur, 'GOLD', 100), (UUID(), @h_tezpur, 'PLATINUM', 150),
  (UUID(), @h_tezpur, 'DIAMOND', 200), (UUID(), @h_tezpur, 'RECLINER', 300), (UUID(), @h_tezpur, 'ROYAL RECLINER', 300),
  (UUID(), @h_tezpur, 'D DIAMOND', 230),
  (UUID(), @h_dhekiajuli, 'PLATINUM', 250), (UUID(), @h_dhekiajuli, 'DIAMOND', 200), (UUID(), @h_dhekiajuli, 'GOLD', 170),
  (UUID(), @h_dhekiajuli, 'SILVER', 130), (UUID(), @h_dhekiajuli, 'LOUNGER', 200),
  (UUID(), @h_nalbari, 'PLATINUM', 300), (UUID(), @h_nalbari, 'GOLD', 250), (UUID(), @h_nalbari, 'EXECUTIVE', 150),
  (UUID(), @h_tihu, 'BALCONY', 250), (UUID(), @h_tihu, 'PLATINUM', 200), (UUID(), @h_tihu, 'GOLD', 150),
  (UUID(), @h_dhemaji, 'DIAMOND', 400), (UUID(), @h_dhemaji, 'PLATINUM', 250), (UUID(), @h_dhemaji, 'GOLD', 150),
  (UUID(), @h_lakhimpur, 'PLATINUM 1', 200), (UUID(), @h_lakhimpur, 'PLATINUM 2', 200), (UUID(), @h_lakhimpur, 'GOLD PLUS', 150),
  (UUID(), @h_lakhimpur, 'GOLD', 120), (UUID(), @h_lakhimpur, 'SILVER', 100);
