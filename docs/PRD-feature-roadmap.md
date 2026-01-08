# Cetus Gaming Platform - Feature Roadmap PRD

**Version:** 1.0
**Date:** January 2026
**Author:** Product Team
**Status:** Draft

---

## Executive Summary

This document outlines the product roadmap for Cetus, a sci-fi themed single-player gaming platform. With 12 fully implemented games, a comprehensive achievement system, daily challenges, and user progression already in place, this PRD focuses on new features to increase user engagement, retention, and social interaction.

---

## Table of Contents

1. [Current State](#1-current-state)
2. [Strategic Goals](#2-strategic-goals)
3. [Feature Categories](#3-feature-categories)
4. [Phase 1: Quick Wins](#4-phase-1-quick-wins)
5. [Phase 2: Social Foundation](#5-phase-2-social-foundation)
6. [Phase 3: Competitive Features](#6-phase-3-competitive-features)
7. [Phase 4: Advanced Progression](#7-phase-4-advanced-progression)
8. [Phase 5: Platform Expansion](#8-phase-5-platform-expansion)
9. [Technical Considerations](#9-technical-considerations)
10. [Success Metrics](#10-success-metrics)
11. [Appendix](#11-appendix)

---

## 1. Current State

### 1.1 Existing Features

| Category | Features |
|----------|----------|
| **Games** | 12 fully implemented games (Tetris, Bubble Shooter, Memory Matrix, Quick Math, Word Scramble, Reflex, Sudoku, Bejeweled, Path Navigator, Evader, 2048, Snake) |
| **Progression** | XP system, 10 levels, daily challenges, login streaks |
| **Achievements** | 110+ achievements across 4 rarity tiers (Common, Rare, Epic, Legendary) |
| **Social** | Global leaderboards, public user profiles |
| **Authentication** | Email/password, Google OAuth |

### 1.2 Technical Stack

- **Frontend:** Astro 5.x, Tailwind CSS, TypeScript
- **Backend:** Astro SSR, Vercel
- **Database:** LibSQL/Turso with Kysely
- **Auth:** Better Auth
- **Games:** PixiJS (canvas), DOM-based rendering

### 1.3 Current Metrics (Baseline)

To be established:
- Daily Active Users (DAU)
- Session duration
- Games played per session
- Achievement completion rate
- Challenge completion rate
- User retention (D1, D7, D30)

---

## 2. Strategic Goals

### 2.1 Primary Objectives

1. **Increase Retention** - Improve D7 retention by 25% through daily engagement loops
2. **Drive Social Engagement** - Enable user-to-user interaction and competition
3. **Deepen Progression** - Provide long-term goals beyond current level cap
4. **Expand Monetization Readiness** - Build infrastructure for future premium features

### 2.2 Design Principles

- **Low Friction:** Features should enhance, not complicate, the core gaming experience
- **Incremental Value:** Each feature builds on existing systems where possible
- **Mobile-First:** All features must work seamlessly on mobile devices
- **Performance:** No feature should degrade game performance

---

## 3. Feature Categories

### Overview Matrix

| Category | Features | Primary Goal |
|----------|----------|--------------|
| **Engagement Loops** | Daily Login Rewards, Streak Bonuses | Retention |
| **Social** | Friends, Activity Feed, Score Battles | Engagement |
| **Competition** | Tournaments, Skill Ratings, Clubs | Retention + Engagement |
| **Progression** | Battle Pass, Prestige, Cosmetics | Monetization + Retention |
| **Analytics** | Statistics Dashboard, Achievement Rarity | Engagement |
| **Platform** | PWA, Settings, Tutorials | User Experience |

---

## 4. REVISED PHASING & TIMELINE

**Critical Update:** Based on technical analysis (see Section 9), the original phase timeline was overly optimistic. The revised phasing accounts for infrastructure dependencies, security requirements, and realistic development effort.

**Total Timeline: 17-23 weeks (4-6 months)**

---

## 5. Phase 0: Infrastructure Foundation

**Timeline:** 2-3 weeks
**Goal:** Establish critical infrastructure required for all subsequent features
**Priority:** MUST complete before Phase 1

### 5.1 Background Job System

**What:** Serverless job scheduling and queue management system.

**Why:**
- Tournament finalization requires scheduled weekly jobs
- Battle expiry needs delayed job execution
- Daily challenges need automatic reset at midnight UTC
- Vercel Cron has severe limitations (12 jobs max, 1-minute minimum frequency)

**Solution:** Inngest (serverless queue with native Vercel integration, 1M free runs/month)

**Success Criteria:**
- Can schedule weekly, daily, and on-demand jobs
- Automatic retry logic for failed jobs
- Job execution monitoring and alerts

### 5.2 Caching & Rate Limiting

**What:** Redis-based caching layer and request rate limiting.

**Why:**
- Leaderboard queries become expensive at scale
- Tournament standings need fast access during active competitions
- Prevent abuse through score spam and social action flooding
- Protect against DDoS attacks

**Solution:** Upstash Redis (serverless Redis, pay-per-request, native Vercel integration)

**Use Cases:**
- Leaderboard caching (5-minute TTL)
- Achievement statistics (1-hour TTL)
- Tournament standings (30-second TTL)
- Rate limiting per user/IP/endpoint

**Success Criteria:**
- 90% cache hit rate for leaderboards
- Rate limits prevent abuse without impacting legitimate users
- < 50ms cache read latency

### 5.3 Security Infrastructure

**What:** Comprehensive security measures for all API endpoints.

**Why:**
- Users can manipulate client-side game code to submit fraudulent scores
- Social features create abuse vectors (spam, harassment)
- Platform must comply with security best practices

**Components:**
- CSRF protection for state-changing requests
- Server-side score validation (detect impossible scores)
- Input sanitization for user-generated content
- API endpoint security checklist

**Success Criteria:**
- Zero successful cheating attempts in testing
- All user input sanitized before database storage
- Security audit passes with no critical issues

### 5.4 Monitoring & Analytics

**What:** Error tracking, user analytics, and performance monitoring.

**Why:**
- Need visibility into production errors to maintain reliability
- Must measure feature adoption to validate product decisions
- Performance monitoring prevents user experience degradation

**Components:**
- **Error Tracking:** Sentry (capture exceptions, performance issues)
- **User Analytics:** PostHog (feature adoption, retention cohorts, funnels)
- **Performance Monitoring:** Core Web Vitals, API response times
- **Logging:** Structured logging for debugging

**Success Criteria:**
- < 1% error rate in production
- 100% of critical user flows tracked
- P95 API latency < 500ms

### 5.5 Testing Infrastructure

**What:** Automated testing pipeline with code coverage enforcement.

**Why:**
- Prevent regressions as features are added
- Maintain code quality and reliability
- Enable confident deployments

**Components:**
- Unit tests (80% coverage minimum)
- Integration tests (all API endpoints)
- E2E tests (critical user flows)
- CI/CD pipeline (GitHub Actions)

**Success Criteria:**
- 80%+ code coverage maintained
- All tests pass before merge
- E2E tests cover auth, gameplay, and social flows

---

## 6. Phase 1: Quick Wins

**Timeline:** 2-3 weeks
**Dependencies:** Phase 0 complete
**Goal:** Immediate engagement improvements with minimal development effort

---

### 6.1 Daily Login Rewards

**What:** Reward users for consecutive daily logins with escalating XP bonuses.

**Why:**
- Increase daily active users through habit formation
- Improve D7 retention with comeback motivation
- Provide consistent progression for casual players

**User Value:**
- "I want to receive rewards for logging in daily so I feel motivated to return"
- "I want to see my progress toward milestone rewards"
- "I want meaningful rewards that help my progression"

**Key Features:**
- 7-day reward cycle (Day 1: 10 XP → Day 7: 100 XP + badge)
- Milestone bonuses (Day 7, Day 30, Day 100 badges)
- Visual calendar showing claim status
- Notification option for unclaimed rewards

**Success Metrics:**
- 40% of DAU claim rewards daily
- 15% improvement in D7 retention
- 20% increase in DAU

---

### 6.2 Achievement Rarity Statistics

**What:** Display real-time unlock percentages for each achievement based on player data.

**Why:**
- Increase achievement engagement through competitive status display
- Provide bragging rights for rare accomplishments
- Help players prioritize which achievements to pursue

**User Value:**
- "I want to see how rare my achievements are compared to others"
- "I want to prioritize rare achievements for prestige"
- "I want bragging rights for rare accomplishments"

**Key Features:**
- Live unlock percentages on achievement cards
- Rarity tiers (Ultra Rare < 1%, Very Rare 1-5%, Rare 5-15%, Uncommon 15-30%, Common > 30%)
- "Rarest Achievements" showcase section
- Daily statistics updates

**Success Metrics:**
- 10% increase in achievement page visits
- 5% increase in achievement unlocks
- 25% of users view achievement statistics weekly

---

### 6.3 Settings & Preferences

**What:** Centralized control panel for game audio, display, notifications, and account management.

**Why:**
- Reduce support requests by enabling self-service customization
- Improve accessibility with motion and audio controls
- Give users control over communication preferences

**User Value:**
- "I want to control sound effects and music"
- "I want to customize my game controls"
- "I want to manage my notification preferences"

**Key Features:**
- **Sound:** Master volume, SFX, Music controls
- **Display:** Reduced motion toggle, theme preferences
- **Notifications:** Email, push, challenge reminder toggles
- **Account:** Profile edit, password change, account deletion access

**Success Metrics:**
- 30% of users customize at least one setting
- 50% reduction in settings-related support requests
- 25% of users visit settings page

---

## 7. Phase 2: Social Foundation

**Timeline:** 3-4 weeks
**Dependencies:** Phase 1 complete
**Goal:** Enable user-to-user connections and social features
**Note:** Real-time features use polling initially, SSE added in Phase 5

---

### 7.1 Friends & Follow System

**What:** Enable users to follow other players and track their gaming activity.

**Why:**
- Increase engagement through social connections and friendly competition
- Drive profile visits and user retention through friend activity
- Create foundation for social features like leaderboards and challenges

**User Value:**
- "I want to follow my friends to see their scores"
- "I want to compare my stats with friends"
- "I want to discover active players to follow"

**Key Features:**
- Follow/unfollow users from profiles
- Following/followers counts and lists
- User search and discovery
- Friend-filtered leaderboards
- Block user functionality for safety

**Success Metrics:**
- 40% of users follow at least one other user
- 25% increase in profile page visits

---

### 7.2 Activity Feed & Notifications

**What:** Real-time feed showing friend activity and personalized notifications for important events.

**Why:**
- Keep users informed of friend accomplishments to drive competition
- Increase session frequency through timely notifications
- Create social proof and FOMO for inactive users

**User Value:**
- "I want to see when friends beat my high scores"
- "I want to celebrate when friends unlock achievements"
- "I want notifications for important events"

**Key Features:**
- Activity feed showing friend scores, achievements, level-ups, new followers
- In-app notifications for scores beaten, challenges, daily rewards
- Notification bell with unread count
- Per-notification-type preferences
- Mark as read functionality

**Success Metrics:**
- 50% of users check activity feed daily
- 20% increase in session frequency

---

### 7.3 Score Battles (Player vs Player Challenges)

**What:** Allow users to challenge friends to beat their score in a specific game within a time limit.

**Why:**
- Drive competitive gameplay through direct friend challenges
- Increase games played per session through battle participation
- Create memorable social moments and trash-talking opportunities

**User Value:**
- "I want to challenge friends to beat my score"
- "I want to receive and respond to challenges"
- "I want rewards for winning challenges"

**Key Features:**
- Create challenges with game selection, target score, duration (1h-48h)
- Challenge states: Pending, Active, Completed, Expired
- In-challenge leaderboard tracking both players' attempts
- Automatic winner determination at expiry
- XP rewards for winners and participants
- Challenge history tracking

**Success Metrics:**
- 30% of users create at least one challenge
- 60% challenge acceptance rate
- 15% increase in games played per user

---

## 8. Phase 3: Progression Systems (MOVED UP)

**Timeline:** 3-4 weeks
**Dependencies:** Phase 2 complete
**Goal:** Long-term engagement through extended progression
**Rationale:** Progression drives retention more than competition; build before tournaments

### 8.1 Prestige System

**What:** Allow max-level players to reset progress in exchange for permanent XP multipliers and exclusive badges.

**Why:**
- Provide endgame progression for dedicated players
- Increase long-term retention through prestige chase
- Create visible status symbols for commitment

**User Value:**
- "I want continued progression after hitting max level"
- "I want exclusive rewards for my dedication"
- "I want to display my prestige status"

**Key Features:**
- Unlock at Level 10 (current max level)
- Reset level and XP but keep achievements, friends, clubs, cosmetics
- Permanent XP multipliers (1.1x at Prestige 1, scaling to 1.5x+ at higher prestige)
- Exclusive prestige badges (Bronze Star → Diamond Star → Numbered Stars)
- Prestige leaderboard tracking total prestige levels
- Clear confirmation modal explaining trade-offs

**Success Metrics:**
- 20% of max-level users prestige at least once
- Prestiged users have 50% higher D30 retention
- Average prestige level of 2.5 among prestiged users

---

### 8.2 Battle Pass System

**What:** Seasonal 30-day progression track with free and premium reward tiers.

**Why:**
- Create structured long-term goals beyond daily challenges
- Provide monetization-ready infrastructure
- Drive daily engagement through seasonal FOMO

**User Value:**
- "I want long-term goals to work toward"
- "I want exclusive seasonal rewards"
- "I want to feel rewarded for dedicated play"

**Key Features:**
- 30-day seasons with 50 levels (100 XP per level, 5000 XP total)
- Dual reward tracks: Free (basic rewards every level) + Premium (exclusive every 5 levels)
- Rewards include XP boosts, badges, themes, titles, and legendary cosmetics
- Season history showing past rewards
- Catch-up mechanics in final week (XP bonus)
- Premium upgrade option (future monetization)

**Success Metrics:**
- 60% of active users engage with battle pass
- 40% of users reach level 25+ each season
- 5% premium conversion rate (future monetization target)

---

### 8.3 Cosmetic System

**What:** Unlockable visual customizations for games (themes) and profiles (frames, titles, badges).

**Why:**
- Provide non-gameplay rewards for achievement hunters
- Enable self-expression and personalization
- Create aspirational goals tied to rarity tiers

**User Value:**
- "I want to personalize my gaming experience"
- "I want to show off exclusive cosmetics"
- "I want cosmetic goals beyond high scores"

**Key Features:**
- Cosmetic types: Game themes, profile frames, titles, decorative badges
- Rarity tiers: Common, Rare, Epic, Legendary
- Unlock sources: Achievements, battle pass, tournaments, future purchases
- Equip/unequip system in settings
- Preview functionality before equipping
- Collection showcase on profile

**Success Metrics:**
- 70% of users unlock at least one cosmetic
- 50% of users equip a non-default cosmetic
- 30% of users collect cosmetics from multiple sources

---

## 9. Phase 4: Competitive Features (MOVED DOWN)

**Timeline:** 4-6 weeks
**Dependencies:** Phase 3 complete, Inngest background jobs functional
**Goal:** Structured competition to drive engagement
**Rationale:** Tournaments require robust infrastructure and user investment

---

### 9.1 Weekly Tournaments

**What:** Automated weekly competitions per game with tiered rankings and prizes.

**Why:**
- Create structured competitive events to drive regular engagement
- Provide exclusive rewards and recognition for competitive players
- Increase weekend play through weekly tournament cycles

**User Value:**
- "I want to compete in organized tournaments"
- "I want to earn exclusive rewards from tournaments"
- "I want to see my ranking among all participants"

**Key Features:**
- Weekly tournaments for all 12 games (Monday-Sunday UTC)
- Automatic entry on first game play during tournament period
- Tiered rewards (Champion, Elite, Expert, Competitor, Participant)
- Live tournament leaderboards with ranking updates
- Historical tournament results and achievements
- Background job system for tournament creation and finalization (requires Inngest)

**Success Metrics:**
- 50% of active users participate in at least one tournament
- 20% increase in weekly games played

---

### 9.2 Skill Rating System

**What:** ELO-inspired skill rating system per game with visual rank tiers and progression tracking.

**Why:**
- Provide competitive players with measurable skill progression beyond scores
- Create long-term goals through rank tier advancement
- Enable skill-based matchmaking for future competitive features

**User Value:**
- "I want a skill rating that reflects my ability"
- "I want to earn rank badges to display"
- "I want to track my skill progression over time"

**Key Features:**
- Separate rating per game (starting at 1000, floor at 100)
- Percentile-based rating adjustments after each game
- 8 visual rank tiers (Iron → Grandmaster)
- Rating history graphs showing progression
- Rank badges displayed on profiles and leaderboards
- Optional seasonal rating resets

**Success Metrics:**
- Average games per user increases by 30%
- 40% of users reach Gold rank in at least one game

---

### 9.3 Clubs / Guilds

**What:** Team-based groups enabling collaborative competition and social bonding.

**Why:**
- Increase retention through team commitment and social accountability
- Drive gameplay through club competition and collective goals
- Create community identity and belonging

**User Value:**
- "I want to join a club with friends"
- "I want to contribute to club rankings"
- "I want to manage my club members"

**Key Features:**
- Club creation (requires Level 5+, max 50 members)
- Club roles (Leader, Officer, Member)
- Club leaderboards with weekly resets
- Club XP and achievements from member activities
- Privacy settings (open/invite-only)
- Club discovery and search

**Success Metrics:**
- 25% of users join a club
- Club members play 40% more games than non-members

---

## 10. Phase 5: Analytics & Platform Enhancement

**Timeline:** 4-5 weeks
**Dependencies:** Phase 4 complete
**Goal:** Enhanced user experience and platform maturity

### 10.1 Statistics Dashboard

**What:** Comprehensive analytics dashboard showing detailed game statistics, performance trends, and personal records.

**Why:**
- Help players understand their performance and identify improvement areas
- Increase engagement through data-driven insights
- Provide shareable statistics for social features

**User Value:**
- "I want to see my detailed game statistics"
- "I want to track my performance trends over time"
- "I want to compare my stats across different games"

**Key Features:**
- Per-game statistics (games played, win rate, average score, best score)
- Performance graphs and trends over time
- Personal records and milestones
- Comparison with friends and global averages
- Shareable stat cards

**Success Metrics:**
- 40% of users visit statistics dashboard weekly
- Users who view stats play 20% more games

### 10.2 Tutorial & Practice Mode

**What:** Interactive tutorials and practice mode where players can learn games without affecting statistics.

**Why:**
- Improve new user onboarding and D1 retention
- Reduce frustration from learning curve
- Allow experimentation without stat penalties

**User Value:**
- "I want to learn how to play each game"
- "I want to practice without hurting my stats"
- "I want a quick refresher on game mechanics"

**Key Features:**
- Step-by-step tutorial per game with highlighted controls
- Practice mode clearly marked (no score recording, unlimited retries)
- Skip option for experienced players
- Tutorial completion tracking

**Success Metrics:**
- New user D1 retention improves by 15%
- 80% tutorial completion rate
- 30% of users use practice mode

---

### 10.3 Community Challenges

**What:** Server-wide cooperative goals with shared rewards for collective achievement.

**Why:**
- Foster community feeling and collective identity
- Drive engagement through time-limited group goals
- Create inclusive events that benefit all skill levels

**User Value:**
- "I want to contribute to community goals"
- "I want to feel part of a larger community"
- "I want shared rewards for collective achievement"

**Key Features:**
- Weekly community challenges (e.g., "Score 10M total points in Tetris")
- Live progress bar visible to all users
- Tiered rewards based on participation (50%, 100%, 150% of goal)
- Individual contribution tracking
- Challenge history

**Success Metrics:**
- 70% of active users participate in community challenges
- Community challenges reach 100% goal 80% of the time
- 25% increase in weekend active users

---

### 10.4 Real-Time Updates via SSE (OPTIONAL)

**What:** Upgrade from polling to Server-Sent Events for true real-time activity feed and notifications.

**Why:**
- Reduce notification latency from 10-30s (polling) to < 1s
- Improve user experience with instant updates
- Demonstrate platform technical maturity

**Key Features:**
- Server-Sent Events endpoint for live updates
- Automatic fallback to polling for unsupported browsers
- Feature flag for gradual rollout
- Auto-reconnect handling

**Success Criteria:**
- < 1s notification latency
- 95% connection stability
- No increase in user-reported issues

---

## 11. Phase 6: PWA (OPTIONAL/DEFERRED)

**Timeline:** 6-8 weeks
**Dependencies:** Proven mobile user demand
**Goal:** Installable app experience with offline support
**Rationale:** Extremely complex with Astro SSR; defer until analytics justify investment

### 11.1 Progressive Web App

**What:** Make Cetus installable as a Progressive Web App with offline gameplay capabilities.

**Why:**
- Enable app-like experience on mobile devices
- Allow gameplay during poor connectivity
- Send push notifications for engagement

**User Value:**
- "I want to install Cetus like a native app"
- "I want to play games offline"
- "I want push notifications for important events"

**Key Features:**
- App manifest for installation
- Service worker for offline asset caching
- Offline score queue with background sync
- Push notifications for challenges, scores, tournaments
- Install prompts on compatible browsers

**Success Metrics:**
- 15% of users install PWA
- PWA users have 40% higher retention
- 80% of offline scores successfully sync

**Decision Criteria (Required Before Proceeding):**
- Mobile users > 60% of total DAU
- Significant user requests for offline play
- Competitors offering PWA creating competitive pressure
- Budget allocated for 2-month dedicated PWA development

**Alternative:** Focus resources on excellent responsive mobile web experience instead of PWA complexity.

---

## 12. Technical Considerations

### 12.1 Infrastructure Requirements

**What:** Core infrastructure services required to support all roadmap features.

**Why:** Platform features require capabilities beyond basic hosting (scheduled jobs, caching, real-time updates).

#### Background Job System

**Tool:** Inngest (serverless queue and workflow engine)

**Why Chosen:**
- Vercel Cron limited to 12 jobs, 1-minute minimum frequency
- Need for tournament finalization, battle expiry, challenge aggregation
- Built-in retry logic and error handling
- Free tier covers MVP needs (1M runs/month)

**Use Cases:** Weekly tournaments, delayed battle expiry, notification dispatch, season rollover

**Cost:** $0/month (MVP) to $49/month (scale)

#### Caching & Rate Limiting

**Tool:** Upstash Redis (serverless Redis)

**Why Chosen:**
- Leaderboard/tournament queries become expensive at scale
- Need rate limiting to prevent abuse (score spam, social flooding, DDoS)
- Serverless-friendly with pay-per-request pricing
- Native Vercel integration

**Use Cases:** Leaderboard caching (5-min TTL), achievement stats (1-hr TTL), tournament standings (30-sec TTL), rate limiting

**Cost:** $0/month (<10K requests/day) to $10/month (100K requests/day)

#### Real-Time Updates

**Strategy:** Start with polling, upgrade to SSE if justified

**Why:**
- Activity feeds and notifications need live updates
- Polling (10-30s) simple but not truly real-time
- SSE (< 1s latency) better UX but adds complexity
- WebSockets not supported on Vercel serverless

**Approach:**
- **Phase 2:** Polling (simple, works immediately)
- **Phase 5 (Optional):** Server-Sent Events if engagement metrics justify complexity

#### Infrastructure Cost Estimate

| Service | Free Tier | Expected Cost (1K DAU) | Expected Cost (10K DAU) |
|---------|-----------|------------------------|-------------------------|
| Vercel Hosting | 100GB bandwidth | $0 | $20/month (Pro plan) |
| Turso Database | 8GB storage | $0 | $29/month |
| Inngest | 1M runs/month | $0 | $49/month |
| Upstash Redis | 10K requests/day | $0 | $10/month |
| Sentry (see Monitoring) | 5K events/month | $0 | $26/month |
| **Total** | - | **$0** | **$134/month** |

### 12.2 Database & Performance Strategy

**Indexing:** Composite indexes for common query patterns (follows, activities, tournament standings)

**Caching:** Write-through cache invalidation (update DB, then invalidate cache)

**Query Optimization:** Monitor slow queries, use EXPLAIN QUERY PLAN, add covering indexes

### 12.3 Required Background Jobs

| Job | Frequency | Purpose |
|-----|-----------|---------|
| Streak Reset | Daily | Reset inactive user streaks |
| Tournament Finalization | Weekly | Calculate ranks, distribute rewards |
| Battle Expiry | On-demand | Finalize expired battles |
| Season Rollover | Monthly | Create new season, archive old |
| Achievement Stats | Hourly | Recalculate unlock percentages |

### 12.4 Mobile Optimization

**Touch:** 44x44px minimum touch targets, debounced taps, touch-friendly spacing

**Performance:** Lazy loading, code splitting per game, progressive image loading

**Offline (PWA only):** Service worker caching, IndexedDB score queue, background sync

---

## 12.5 Security & Anti-Cheat

**What:** Comprehensive security measures to protect platform and ensure fair gameplay.

**Why:** Prevent score manipulation, abuse, and malicious activity.

### Rate Limiting

**Tool:** Upstash Rate Limit (serverless Redis-based)

**Limits:**
- Score submissions: 30/minute per user
- Social actions: 10/minute per user
- Battle creation: 5/hour per user
- API general: 100/minute per IP

**Why:** Prevent spam, abuse, and DDoS attacks

### Anti-Cheat System

**4-Layer Defense:**

1. **Server-Side Score Validation:** Detect impossible scores (max score limits, score-per-second thresholds, minimum game duration)
2. **Game Integrity Tokens:** Cryptographic signatures prevent tampered score submissions
3. **Statistical Anomaly Detection:** Flag users with impossible win rates or score patterns
4. **Honeypot Checks:** Server validates game state snapshots

**Enforcement:**
- 1st offense: Score rejected + warning
- 2nd offense: 7-day leaderboard ban
- 3rd offense: Account flagged for review
- Confirmed cheating: Permanent ban

### Additional Security

**CSRF Protection:** All POST/PUT/DELETE endpoints validate tokens

**SQL Injection:** Kysely query builder uses parameterized queries (safe by default)

**XSS Prevention:** Sanitize all user-generated content (names, bios, club descriptions)

**Authentication:** Better Auth with 7-day sessions, password requirements, account lockout after 5 failed attempts

---

## 12.6 Monitoring & Analytics

**What:** Error tracking, user analytics, and performance monitoring.

**Why:** Maintain reliability, measure feature adoption, prevent UX degradation.

### Error Tracking

**Tool:** Sentry

**Tracks:** Unhandled exceptions, performance issues, release attribution

**Alerts:** New error types, >5% error rate, P95 latency >1s

**Cost:** $0/month (<5K events) to $26/month (50K events)

### User Analytics

**Tool:** PostHog (recommended for MVP)

**Tracks:** Feature adoption, retention cohorts, user funnels, A/B tests

**Key Events:** game_started, game_ended, achievement_unlocked, social_action, feature_used

**Dashboards:** DAU/MAU, retention cohorts, game popularity, feature adoption

**Cost:** Free (1M events/month)

### Performance Monitoring

**Built-in:** Vercel Analytics (Core Web Vitals, function execution time)

**Additional:** Sentry Performance (custom transaction tracing)

**Benchmarks (P95):**
- Page Load (Home): < 1.5s
- Score Submission API: < 200ms
- Leaderboard API: < 300ms
- Game Initialization: < 500ms

### Feature Flags

**Tool:** PostHog Feature Flags

**Use Cases:** SSE vs polling toggle, battle pass enable/disable, tournament rollout, PWA install prompt

**Why:** Gradual rollouts, A/B testing, kill switches

---

## 12.7 Testing Strategy

**What:** Automated testing pipeline with coverage enforcement.

**Why:** Prevent regressions, maintain quality, enable confident deployments.

### Test Coverage

**Requirements:**
- Unit tests: 80% coverage minimum
- Integration tests: All API endpoints
- E2E tests: Critical user flows

**Tools:** Vitest + jsdom, Testing Library, Playwright

### Test Types

**Unit Tests:** Game logic, services, database queries, utilities

**Integration Tests:** API authentication, validation, score submission, social actions

**E2E Tests (Critical Flows):**
1. Sign up → login → logout
2. Play game → submit score → view leaderboard
3. Daily challenge completion
4. Follow user → view activity feed
5. Create/accept battle
6. Join tournament
7. Claim battle pass reward

### Performance Testing

**Tool:** Artillery or k6

**Load Test:** Simulate 10-50 users/second

**Performance Budgets:**
- JS Bundle (Home): < 200KB
- JS Bundle (Game): < 300KB
- LCP: < 2.5s
- FID: < 100ms

### CI/CD Pipeline

**Platform:** GitHub Actions

**On PR:** Run unit tests, integration tests, E2E tests, type checking, code coverage

**Requirement:** All tests must pass before merge

---

## 12.8 Data Privacy & GDPR

**What:** GDPR-compliant data handling and user privacy controls.

**Why:** Legal requirement (EU), user trust, ethical data practices.

### GDPR Rights

**Right to Access (Article 15):** Users can export all their data (JSON format via `/api/user/export`)

**Right to Erasure (Article 17):** Users can delete account and all personal data
- Leaderboard entries anonymized (keep scores for integrity)
- All personal data deleted
- 30-day grace period before permanent deletion

**Right to Rectification (Article 16):** Users can update profile data

**Right to Data Portability (Article 20):** Machine-readable JSON export

### Privacy Policy Requirements

**Must Disclose:**
- Data collected: Email, username, scores, IP (rate limiting)
- Data usage: Auth, leaderboards, achievements, analytics
- Data sharing: Sentry (errors), PostHog (analytics), no selling
- Data retention: Active accounts indefinite, deleted accounts 30 days
- User rights: Access, deletion, rectification

### Cookie Consent

**Essential Cookies:** Auth session, CSRF token (required)

**Optional Cookies:** PostHog analytics, feature flags (require consent)

**Implementation:** Cookie banner with "Accept All" / "Essential Only" options

### Data Minimization

**Collect:** Only data necessary for functionality

**Don't Collect:** Phone, DOB, full name, address, browsing history

### Security Measures

**Encryption:** HTTPS (TLS 1.3), database encryption at rest (Turso), Bcrypt password hashing

**Access Control:** Users can only access own data (except public profiles)

**Audit Logging:** Log sensitive operations (account deletion, admin actions)

---


## 13. Success Metrics

### 13.1 Key Performance Indicators (KPIs)

| Metric | Baseline | Phase 1 Target | Phase 3 Target | Phase 5 Target |
|--------|----------|----------------|----------------|----------------|
| DAU | TBD | +15% | +35% | +60% |
| D1 Retention | TBD | +8% | +20% | +30% |
| D7 Retention | TBD | +12% | +25% | +40% |
| D30 Retention | TBD | +8% | +20% | +35% |
| Games/User/Day | TBD | +10% | +30% | +50% |
| Session Duration | TBD | +8% | +20% | +30% |
| Features Adopted/User | 0 | 2 avg | 4 avg | 6 avg |

**Measurement:** Baseline before Phase 0, measure 30 days after each phase completion

### 13.2 Phase Success Criteria

**Phase 0:** All infrastructure deployed, documentation complete, zero blockers

**Phase 1:** 40% claim login rewards, 25% visit settings, +15% achievement page visits

**Phase 2:** 30% follow users, 20% participate in battles, 50% check activity feed daily

**Phase 3:** 15% prestige, 50% engage battle pass, 40% unlock cosmetics

**Phase 4:** 40% join tournaments, 20% join clubs, 30% reach Gold rank

**Phase 5:** 25% visit stats monthly, 75% tutorial completion, 60% participate in community challenges

---

## 14. Appendix

### 14.1 Timeline Summary

**Phase 0: Infrastructure** (2-3 weeks) - Background jobs, caching, security, monitoring

**Phase 1: Quick Wins** (2-3 weeks) - Login rewards, achievement stats, settings

**Phase 2: Social** (3-4 weeks) - Friends, activity feed, score battles

**Phase 3: Progression** (3-4 weeks) - Prestige, battle pass, cosmetics

**Phase 4: Competitive** (4-6 weeks) - Tournaments, skill rating, clubs

**Phase 5: Enhancement** (4-5 weeks) - Statistics, tutorials, community challenges

**Phase 6: PWA** (6-8 weeks) - OPTIONAL/DEFERRED

**Total: 17-23 weeks (4-6 months) for Phases 0-5**

### 14.2 Infrastructure Cost Summary

| Scale | Expected Monthly Cost |
|-------|----------------------|
| MVP (< 1K DAU) | $0 |
| Growth (10K DAU) | $134 |

**Services:** Vercel ($20), Turso ($29), Inngest ($49), Upstash Redis ($10), Sentry ($26)

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Jan 2026 | Product Team | Initial draft |
| 2.0 | Jan 2026 | Product Team | Simplified to what/why format |

---

*This is a living document updated based on user feedback and technical feasibility.*

