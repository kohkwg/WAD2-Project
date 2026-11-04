-- Go together groups (4 November 2026) get their own event kind. This is its own
-- migration because a new enum value can only be used once the transaction that adds
-- it has committed; 20261104142907_go_together_groups.sql uses it.
alter type public.event_kind add value if not exists 'group';
