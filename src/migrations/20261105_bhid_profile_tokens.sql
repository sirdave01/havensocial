ALTER TABLE app_sessions
    ADD COLUMN IF NOT EXISTS bhid_access_token_enc TEXT,
    ADD COLUMN IF NOT EXISTS bhid_access_token_expires_at TIMESTAMPTZ;
