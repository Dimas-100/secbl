-- The "online" presence channel is private: only approved members may join it,
-- read who is there, or announce themselves. Without this any holder of the
-- public anon key could watch who is in the app or claim to be a member.
-- (Realtime Authorization: policies on realtime.messages gate private channels.)

create policy "approved members see who is online"
  on "realtime"."messages"
  for select to authenticated
  using (
    (select realtime.topic()) = 'online'
    and realtime.messages.extension = 'presence'
    and public.is_approved()
  );

create policy "approved members announce they are online"
  on "realtime"."messages"
  for insert to authenticated
  with check (
    (select realtime.topic()) = 'online'
    and realtime.messages.extension = 'presence'
    and public.is_approved()
  );
