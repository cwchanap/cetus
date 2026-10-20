-- Migration: Add platform column to game_scores
-- Non-web score submissions carry a platform label; rows that omit it are
-- web submissions and stay 'web'-labeled by the column default.
--
-- Note: SQLite doesn't support IF NOT EXISTS for ADD COLUMN, so this fails
-- if the column already exists. The runtime migrator in
-- src/lib/server/db/game-score-context.ts performs the same ALTER
-- idempotently; this file exists for explicitly-applied migration runs.

ALTER TABLE "game_scores" ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'web';
