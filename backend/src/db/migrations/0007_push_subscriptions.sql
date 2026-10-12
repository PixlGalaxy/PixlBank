-- Web Push subscriptions: one row per device where a user turned notifications
-- on (an iPhone with PixlBank on its home screen, typically). Dropped when the
-- push service says the subscription is gone, or when they sign out there.
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_sent_at TEXT
);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);
