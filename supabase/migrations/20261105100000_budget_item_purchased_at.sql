-- Budget sheet: when an expense was actually bought (optional). Not yet deployed to Bookerz;
-- coordinate with Timothy/Denzel first. The client falls back gracefully while the column is missing.
alter table public.budget_items
  add column if not exists purchased_at timestamptz;
