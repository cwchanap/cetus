-- Game-specific tables for Cetus platform
-- This script only includes tables not covered by Better Auth
-- Better Auth will automatically create: user, session, account, verification tables

-- Games table - stores game definitions
CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default games
INSERT OR IGNORE INTO games (id, name, description) VALUES 
('tetris', 'Tetris Challenge', 'Classic block-stacking puzzle game'),
('quick_draw', 'Quick Draw', 'Fast-paced drawing and guessing game');

-- Game scores table - stores individual game session scores
CREATE TABLE IF NOT EXISTS game_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    score INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
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

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_games_id ON games(id);
CREATE INDEX IF NOT EXISTS idx_game_scores_user_id ON game_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_game_scores_game_id ON game_scores(game_id);
CREATE INDEX IF NOT EXISTS idx_game_scores_created_at ON game_scores(created_at);
CREATE INDEX IF NOT EXISTS idx_game_scores_score ON game_scores(score);
CREATE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_stats(user_id);
