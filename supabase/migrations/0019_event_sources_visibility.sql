-- Security follow-up to 0018 (automated review): members never need the
-- sources table — feed URLs and sync error text are admin business. Events
-- carry the source's display name directly so the list and detail pages can
-- show "From PIN" without reading event_sources.
alter table public.events add column if not exists source_name text;

update public.events e
set source_name = s.name
from public.event_sources s
where e.source_id = s.id and e.source_name is null;

drop policy if exists "approved read event sources" on public.event_sources;
create policy "admins read event sources"
  on public.event_sources for select to authenticated
  using (public.is_admin());

-- Keep the denormalized name current if an admin renames a source.
create or replace function public.event_sources_propagate_name()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.name <> old.name then
    update events set source_name = new.name where source_id = new.id;
  end if;
  return new;
end;
$$;
revoke execute on function public.event_sources_propagate_name() from public, anon, authenticated;

drop trigger if exists event_sources_propagate_name on public.event_sources;
create trigger event_sources_propagate_name
after update of name on public.event_sources
for each row execute function public.event_sources_propagate_name();
