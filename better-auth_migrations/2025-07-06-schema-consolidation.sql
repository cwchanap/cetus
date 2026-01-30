-- Migration: Add user_stats columns and user profile fields
-- This migration consolidates all runtime schema changes into a proper migration

-- Add displayName and username columns to user table
-- Note: SQLite doesn't support IF NOT EXISTS for ADD COLUMN, so this will fail if column exists
-- Run only on new databases or manually check before running

PRAGMA foreign_keys = ON;

-- User profile columns (requires manual check in production)
-- ALTER TABLE "user" ADD COLUMN displayName TEXT;
-- ALTER TABLE "user" ADD COLUMN username TEXT;
-- CREATE UNIQUE INDEX IF NOT EXISTS user_username_unique ON "user" (username);

-- Create user_stats table if it doesn't exist
CREATE TABLE IF NOT EXISTS "user_stats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL UNIQUE REFERENCES "user" ("id") ON DELETE CASCADE,
    "total_games_played" INTEGER NOT NULL DEFAULT 0,
    "total_score" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATE NOT NULL,
    "updated_at" DATE NOT NULL,
    -- Streak tracking
    "streak_days" INTEGER NOT NULL DEFAULT 0,
    "last_played_date" TEXT,
    -- Challenge system
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "challenge_streak" INTEGER NOT NULL DEFAULT 0,
    "last_challenge_date" TEXT,
    -- Login rewards
    "login_streak" INTEGER NOT NULL DEFAULT 0,
    "last_login_reward_date" TEXT,
    "total_login_cycles" INTEGER NOT NULL DEFAULT 0,
    -- Preferences
    "email_notifications" INTEGER NOT NULL DEFAULT 1,
    "push_notifications" INTEGER NOT NULL DEFAULT 0,
    "challenge_reminders" INTEGER NOT NULL DEFAULT 1
);

-- Create game_scores table if it doesn't exist
CREATE TABLE IF NOT EXISTS "game_scores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "game_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "created_at" DATE NOT NULL
);

-- Create user_achievements table if it doesn't exist
CREATE TABLE IF NOT EXISTS "user_achievements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "achievement_id" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "unlocked_at" DATE,
    "created_at" DATE NOT NULL,
    "updated_at" DATE NOT NULL,
    UNIQUE("user_id", "achievement_id")
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "idx_game_scores_user_id" ON "game_scores" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_game_scores_game_id" ON "game_scores" ("game_id");
CREATE INDEX IF NOT EXISTS "idx_user_achievements_user_id" ON "user_achievements" ("user_id");
