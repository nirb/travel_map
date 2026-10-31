-- Wishlist destinations: cities we want to visit, shown with a star icon.
ALTER TABLE cities ADD COLUMN wishlist INTEGER NOT NULL DEFAULT 0;
