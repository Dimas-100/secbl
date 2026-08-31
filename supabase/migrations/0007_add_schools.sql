-- Kennesaw State and Georgia Tech join the league for the first pilot.
--
-- Names follow the existing rows' convention (official name, common short
-- code). Idempotent so re-running against a database that already has them is
-- harmless -- both `name` and `short_name` carry unique constraints.
insert into public.schools (name, short_name) values
  ('Kennesaw State University', 'KSU'),
  ('Georgia Institute of Technology', 'GT')
on conflict do nothing;
