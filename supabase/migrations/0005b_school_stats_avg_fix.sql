-- Fix avg_rating fan-out: aggregate members and match results separately so a
-- player's rating counts once regardless of how many matches they've played.
create or replace view public.school_stats with (security_invoker = on) as
select
  s.id,
  s.name,
  s.short_name,
  coalesce(ps.member_count, 0) as member_count,
  coalesce(ps.avg_rating, 0) as avg_rating,
  coalesce(ms.wins, 0) as wins,
  coalesce(ms.losses, 0) as losses
from public.schools s
left join (
  select school_id, count(*) as member_count, round(avg(rating))::int as avg_rating
  from public.profiles
  where status = 'approved'
  group by school_id
) ps on ps.school_id = s.id
left join (
  select p.school_id,
    count(*) filter (where m.winner_id = p.id) as wins,
    count(*) filter (where m.winner_id <> p.id) as losses
  from public.profiles p
  join public.matches m
    on m.status = 'confirmed'
    and (m.reporter_id = p.id or m.opponent_id = p.id)
  where p.status = 'approved'
  group by p.school_id
) ms on ms.school_id = s.id
order by avg_rating desc;
