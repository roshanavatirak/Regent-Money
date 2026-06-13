-- ===================================================
-- REGENT MONEY - FULL SUPABASE DATABASE SCHEMA (MULTI-SCHEMA)
-- Organizes all tables into logical domains: core, finance, wealth, analytics
-- Run this in your Supabase SQL Editor to initialize.
-- ===================================================

-- 1. CREATE NAMESPACES (SCHEMAS)
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS finance;
CREATE SCHEMA IF NOT EXISTS wealth;
CREATE SCHEMA IF NOT EXISTS analytics;

-- 2. DROP EXISTING TABLES IF THEY EXIST (To start fresh)
DROP TABLE IF EXISTS core.users CASCADE;
DROP TABLE IF EXISTS core.bank_profiles CASCADE;

DROP TABLE IF EXISTS finance.transactions CASCADE;
DROP TABLE IF EXISTS finance.income_records CASCADE;
DROP TABLE IF EXISTS finance.salary_model CASCADE;
DROP TABLE IF EXISTS finance.budget_declarations CASCADE;
DROP TABLE IF EXISTS finance.subscription_tracking CASCADE;
DROP TABLE IF EXISTS finance.salary_history CASCADE;

DROP TABLE IF EXISTS wealth.assets CASCADE;
DROP TABLE IF EXISTS wealth.liabilities CASCADE;
DROP TABLE IF EXISTS wealth.net_worth_snapshots CASCADE;
DROP TABLE IF EXISTS wealth.savings_goals CASCADE;
DROP TABLE IF EXISTS wealth.goal_contributions CASCADE;
DROP TABLE IF EXISTS wealth.scenario_simulations CASCADE;

DROP TABLE IF EXISTS analytics.pattern_detections CASCADE;
DROP TABLE IF EXISTS analytics.user_corrections CASCADE;
DROP TABLE IF EXISTS analytics.mood_entries CASCADE;
DROP TABLE IF EXISTS analytics.regret_scores CASCADE;
DROP TABLE IF EXISTS analytics.tax_tracking CASCADE;

-- 3. CREATE TABLES IN SPECIFIC SCHEMAS

-- ===================================================
-- SCHEMA: core
-- ===================================================

-- users
CREATE TABLE core.users (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  email TEXT,
  phone TEXT,
  password_hash TEXT,
  name TEXT,
  auth_provider TEXT,
  avatar_url TEXT,
  created_at BIGINT,
  updated_at BIGINT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE core.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own profiles" ON core.users 
  FOR ALL USING (auth.uid() = user_id);

-- bank_profiles
CREATE TABLE core.bank_profiles (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  bank_name TEXT,
  account_number_suffix TEXT,
  current_balance NUMERIC,
  last_sync_timestamp BIGINT,
  updated_at BIGINT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE core.bank_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own bank profiles" ON core.bank_profiles 
  FOR ALL USING (auth.uid() = user_id);


-- ===================================================
-- SCHEMA: finance
-- ===================================================

-- transactions
CREATE TABLE finance.transactions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  amount NUMERIC,
  category TEXT,
  merchant TEXT,
  timestamp BIGINT,
  bank_profile_id TEXT,
  sms_id TEXT,
  is_anomaly BOOLEAN,
  regret_score_id TEXT,
  status TEXT,
  updated_at BIGINT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE finance.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own transactions" ON finance.transactions 
  FOR ALL USING (auth.uid() = user_id);

-- income_records
CREATE TABLE finance.income_records (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  amount NUMERIC,
  source TEXT,
  timestamp BIGINT,
  bank_profile_id TEXT,
  updated_at BIGINT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE finance.income_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own income records" ON finance.income_records 
  FOR ALL USING (auth.uid() = user_id);

-- salary_model
CREATE TABLE finance.salary_model (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  expected_amount NUMERIC,
  expected_date BIGINT,
  employer_name TEXT,
  confidence_score NUMERIC,
  updated_at BIGINT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE finance.salary_model ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own salary model" ON finance.salary_model 
  FOR ALL USING (auth.uid() = user_id);

-- budget_declarations
CREATE TABLE finance.budget_declarations (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  category TEXT,
  limit_amount NUMERIC,
  period TEXT,
  spent_amount NUMERIC,
  updated_at BIGINT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE finance.budget_declarations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own budgets" ON finance.budget_declarations 
  FOR ALL USING (auth.uid() = user_id);

-- subscription_tracking
CREATE TABLE finance.subscription_tracking (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  name TEXT,
  amount NUMERIC,
  billing_cycle TEXT,
  next_billing_date BIGINT,
  status TEXT,
  last_transaction_id TEXT,
  updated_at BIGINT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE finance.subscription_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own subscription tracking" ON finance.subscription_tracking 
  FOR ALL USING (auth.uid() = user_id);

-- salary_history
CREATE TABLE finance.salary_history (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  transaction_id TEXT,
  amount NUMERIC,
  timestamp BIGINT,
  updated_at BIGINT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE finance.salary_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own salary history" ON finance.salary_history 
  FOR ALL USING (auth.uid() = user_id);


-- ===================================================
-- SCHEMA: wealth
-- ===================================================

-- assets
CREATE TABLE wealth.assets (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  name TEXT,
  type TEXT,
  value NUMERIC,
  last_updated BIGINT,
  metadata TEXT,
  updated_at BIGINT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE wealth.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own assets" ON wealth.assets 
  FOR ALL USING (auth.uid() = user_id);

-- liabilities
CREATE TABLE wealth.liabilities (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  name TEXT,
  type TEXT,
  total_amount NUMERIC,
  outstanding_amount NUMERIC,
  due_date BIGINT,
  last_updated BIGINT,
  updated_at BIGINT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE wealth.liabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own liabilities" ON wealth.liabilities 
  FOR ALL USING (auth.uid() = user_id);

-- net_worth_snapshots
CREATE TABLE wealth.net_worth_snapshots (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  timestamp BIGINT,
  total_assets NUMERIC,
  total_liabilities NUMERIC,
  net_worth NUMERIC,
  updated_at BIGINT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE wealth.net_worth_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own net worth snapshots" ON wealth.net_worth_snapshots 
  FOR ALL USING (auth.uid() = user_id);

-- savings_goals
CREATE TABLE wealth.savings_goals (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  name TEXT,
  target_amount NUMERIC,
  current_amount NUMERIC,
  target_date BIGINT,
  status TEXT,
  updated_at BIGINT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE wealth.savings_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own savings goals" ON wealth.savings_goals 
  FOR ALL USING (auth.uid() = user_id);

-- goal_contributions
CREATE TABLE wealth.goal_contributions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  goal_id TEXT,
  transaction_id TEXT,
  amount NUMERIC,
  timestamp BIGINT,
  updated_at BIGINT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE wealth.goal_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own contributions" ON wealth.goal_contributions 
  FOR ALL USING (auth.uid() = user_id);

-- scenario_simulations
CREATE TABLE wealth.scenario_simulations (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  name TEXT,
  description TEXT,
  parameters_json TEXT,
  timestamp BIGINT,
  updated_at BIGINT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE wealth.scenario_simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own simulations" ON wealth.scenario_simulations 
  FOR ALL USING (auth.uid() = user_id);


-- ===================================================
-- SCHEMA: analytics
-- ===================================================

-- pattern_detections
CREATE TABLE analytics.pattern_detections (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  pattern_type TEXT,
  description TEXT,
  evidence_json TEXT,
  confidence NUMERIC,
  timestamp BIGINT,
  is_dismissed BOOLEAN DEFAULT FALSE,
  updated_at BIGINT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE analytics.pattern_detections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own pattern detections" ON analytics.pattern_detections 
  FOR ALL USING (auth.uid() = user_id);

-- user_corrections
CREATE TABLE analytics.user_corrections (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  raw_merchant TEXT,
  corrected_merchant TEXT,
  corrected_category TEXT,
  timestamp BIGINT,
  updated_at BIGINT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE analytics.user_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own user corrections" ON analytics.user_corrections 
  FOR ALL USING (auth.uid() = user_id);

-- mood_entries
CREATE TABLE analytics.mood_entries (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  timestamp BIGINT,
  mood_score NUMERIC,
  notes TEXT,
  updated_at BIGINT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE analytics.mood_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own mood entries" ON analytics.mood_entries 
  FOR ALL USING (auth.uid() = user_id);

-- regret_scores
CREATE TABLE analytics.regret_scores (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  transaction_id TEXT,
  regret_score NUMERIC,
  reason TEXT,
  timestamp BIGINT,
  updated_at BIGINT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE analytics.regret_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own regret scores" ON analytics.regret_scores 
  FOR ALL USING (auth.uid() = user_id);

-- tax_tracking
CREATE TABLE analytics.tax_tracking (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  financial_year TEXT,
  category_80c NUMERIC,
  category_80d NUMERIC,
  hra_claimed NUMERIC,
  other_deductions NUMERIC,
  updated_at BIGINT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE
);
ALTER TABLE analytics.tax_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own tax tracking" ON analytics.tax_tracking 
  FOR ALL USING (auth.uid() = user_id);

-- 4. GRANT SCHEMA ACCESS PERMISSIONS TO API ROLES (REQUIRED FOR API SYNC)
GRANT USAGE ON SCHEMA core TO anon, authenticated;
GRANT USAGE ON SCHEMA finance TO anon, authenticated;
GRANT USAGE ON SCHEMA wealth TO anon, authenticated;
GRANT USAGE ON SCHEMA analytics TO anon, authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA core TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA finance TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA wealth TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA analytics TO anon, authenticated;

GRANT ALL ON ALL SEQUENCES IN SCHEMA core TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA finance TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA wealth TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA analytics TO anon, authenticated;
