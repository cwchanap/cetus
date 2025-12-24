-- Game-specific tables for Cetus platform
-- This script only includes tables not covered by Better Auth
-- Better Auth will automatically create: user, session, account, verification tables

-- Note: Game definitions moved to code (src/lib/games.ts) 
-- Only game-related user data is stored in database

-- Game scores table - stores individual game session scores
CREATE TABLE IF NOT EXISTS game_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    score INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    -- game_id references game definitions in code
);

-- User statistics table - aggregated user gaming data
CREATE TABLE IF NOT EXISTS user_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE NOT NULL,
    total_games_played INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    favorite_game TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

-- User achievements table - tracks which achievements users have earned
-- Achievement definitions are stored in code, not in database
CREATE TABLE IF NOT EXISTS user_achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    achievement_id TEXT NOT NULL, -- References achievement ID from code definitions
    earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    UNIQUE(user_id, achievement_id) -- Prevent duplicate achievements
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_game_scores_user_id ON game_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_game_scores_game_id ON game_scores(game_id);
CREATE INDEX IF NOT EXISTS idx_game_scores_created_at ON game_scores(created_at);
CREATE INDEX IF NOT EXISTS idx_game_scores_score ON game_scores(score);
CREATE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement_id ON user_achievements(achievement_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_earned_at ON user_achievements(earned_at);

-- Daily challenge progress table (unique per user/day/challenge)
CREATE TABLE IF NOT EXISTS daily_challenge_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    challenge_date TEXT NOT NULL, -- YYYY-MM-DD (UTC)
    challenge_id TEXT NOT NULL, -- References challenge definition in code
    current_value INTEGER NOT NULL DEFAULT 0,
    target_value INTEGER NOT NULL,
    completed_at DATETIME,
    xp_awarded INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    UNIQUE(user_id, challenge_date, challenge_id)
);

CREATE INDEX IF NOT EXISTS idx_challenge_progress_user_date
    ON daily_challenge_progress(user_id, challenge_date);
