-- Feature 6: read-only floor plan for participants on the event page. Agreed with
-- Huxley on 23 Oct 2026 (Vivienne to review). Until now only the event's team could
-- read floor_plans. Anyone who can see the event (published, or on its team) can now
-- read its floor plan layout. Editing stays organiser-only ("Organisers edit floor plans").
create policy "Floor plans follow event visibility" on public.floor_plans
  for select to anon, authenticated
  using (public.can_view_event(event_id));
