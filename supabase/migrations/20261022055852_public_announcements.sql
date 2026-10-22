-- Public event pages show only audience='everyone' announcements before login.
-- Keep draft and non-public audiences behind the existing authenticated policies.
grant select (id, event_id, body, audience, is_automatic, created_at)
  on public.announcements to anon;

create policy "Published event announcements are public"
  on public.announcements
  for select to anon, authenticated
  using (
    audience = 'everyone'
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.status = 'published'
    )
  );
