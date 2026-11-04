-- 005_watcher_theme.sql — switches the site colours from the first gold default to the new blue/orange theme,
-- but ONLY if nobody has customised the colours (the stored value must still be the exact old default).
-- Rollback (restores the old default, again only if the colours are still the new default):
--   UPDATE site_settings SET setting_value = '{"accent":"#e5b84b","accentSoft":"#f3d98a","background":"#0b0b0d","surface":"#16161a"}'
--   WHERE setting_key = 'theme' AND setting_value = '{"accent":"#92b0f4","accentSoft":"#a9c2f9","highlight":"#f26b3a","background":"#14161b","surface":"#1e2128"}';
--   DELETE FROM schema_migrations WHERE name = '005_watcher_theme.sql';
UPDATE site_settings SET setting_value = '{"accent":"#92b0f4","accentSoft":"#a9c2f9","highlight":"#f26b3a","background":"#14161b","surface":"#1e2128"}'
WHERE setting_key = 'theme' AND setting_value = '{"accent":"#e5b84b","accentSoft":"#f3d98a","background":"#0b0b0d","surface":"#16161a"}';
