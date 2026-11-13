-- The List: shared challenges
-- Each person's bucket list stays on their phone. Only challenges, their goals, photo proofs,
-- votes, the feed and reactions live here, visible to the people who share a challenge.

create extension if not exists pgcrypto;

-- ---------- Tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  color text not null default '#c8a96a',
  created_at timestamptz not null default now()
);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 60),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  created_by uuid not null default auth.uid() references public.profiles on delete cascade,
  invite_code text not null unique default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  created_at timestamptz not null default now()
);

create table if not exists public.challenge_members (
  challenge_id uuid not null references public.challenges on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create table if not exists public.challenge_items (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 80),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  created_by uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.challenge_completions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges on delete cascade,
  item_id uuid not null references public.challenge_items on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  proof_url text not null,
  hash text,
  taken_at timestamptz,
  flag text,
  status text not null default 'counted' check (status in ('counted', 'disputed', 'rejected')),
  completed_at timestamptz not null default now(),
  unique (item_id, user_id)
);
-- The same photo can't prove two goals
create unique index if not exists challenge_completions_hash on public.challenge_completions (hash) where hash is not null;

create table if not exists public.completion_votes (
  completion_id uuid not null references public.challenge_completions on delete cascade,
  voter_id uuid not null default auth.uid() references public.profiles on delete cascade,
  verdict text not null check (verdict in ('legit', 'dispute')),
  primary key (completion_id, voter_id)
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null default auth.uid() references public.profiles on delete cascade,
  kind text not null check (kind in ('entry_completed', 'challenge_item')),
  title text not null,
  photo text,
  place text,
  type text,
  caption text,
  entry_id text,
  challenge_id uuid references public.challenges on delete cascade,
  completion_id uuid references public.challenge_completions on delete cascade,
  points int,
  created_at timestamptz not null default now()
);
-- One post per entry (NULL entry ids, i.e. challenge posts, don't clash)
drop index if exists public.activities_entry;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'activities_actor_entry_key') then
    alter table public.activities add constraint activities_actor_entry_key unique (actor_id, entry_id);
  end if;
end $$;

create table if not exists public.reactions (
  activity_id uuid not null references public.activities on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  emoji text not null check (char_length(emoji) <= 16),
  created_at timestamptz not null default now(),
  primary key (activity_id, user_id, emoji)
);

-- ---------- Helpers (bypass RLS on purpose, so policies don't recurse) ----------
create or replace function public.is_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from challenge_members where challenge_id = cid and user_id = auth.uid());
$$;

create or replace function public.shares_challenge(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select other = auth.uid() or exists (
    select 1 from challenge_members a join challenge_members b on a.challenge_id = b.challenge_id
    where a.user_id = auth.uid() and b.user_id = other);
$$;

create or replace function public.created_challenge(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from challenges where id = cid and created_by = auth.uid());
$$;

-- ---------- Row level security ----------
alter table public.profiles enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;
alter table public.challenge_items enable row level security;
alter table public.challenge_completions enable row level security;
alter table public.completion_votes enable row level security;
alter table public.activities enable row level security;
alter table public.reactions enable row level security;

drop policy if exists "see people you share a challenge with" on public.profiles;
create policy "see people you share a challenge with" on public.profiles for select to authenticated using (shares_challenge(id));
drop policy if exists "create your profile" on public.profiles;
create policy "create your profile" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "edit your profile" on public.profiles;
create policy "edit your profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "members see the challenge" on public.challenges;
create policy "members see the challenge" on public.challenges for select to authenticated using (is_member(id) or created_by = auth.uid());
drop policy if exists "create challenges" on public.challenges;
create policy "create challenges" on public.challenges for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "creator edits" on public.challenges;
create policy "creator edits" on public.challenges for update to authenticated using (created_by = auth.uid());
drop policy if exists "creator deletes" on public.challenges;
create policy "creator deletes" on public.challenges for delete to authenticated using (created_by = auth.uid());

drop policy if exists "members see members" on public.challenge_members;
create policy "members see members" on public.challenge_members for select to authenticated using (is_member(challenge_id));
-- The creator adds themselves, and people they already share a challenge with. Everyone else joins by link.
drop policy if exists "creator adds members" on public.challenge_members;
create policy "creator adds members" on public.challenge_members for insert to authenticated
  with check (created_challenge(challenge_id) and (user_id = auth.uid() or shares_challenge(user_id)));
drop policy if exists "leave a challenge" on public.challenge_members;
create policy "leave a challenge" on public.challenge_members for delete to authenticated using (user_id = auth.uid());

drop policy if exists "members see goals" on public.challenge_items;
create policy "members see goals" on public.challenge_items for select to authenticated using (is_member(challenge_id));
drop policy if exists "members add goals" on public.challenge_items;
create policy "members add goals" on public.challenge_items for insert to authenticated with check (is_member(challenge_id) and created_by = auth.uid());

drop policy if exists "members see completions" on public.challenge_completions;
create policy "members see completions" on public.challenge_completions for select to authenticated using (is_member(challenge_id));
drop policy if exists "complete while running" on public.challenge_completions;
create policy "complete while running" on public.challenge_completions for insert to authenticated with check (
  user_id = auth.uid() and is_member(challenge_id)
  and exists (select 1 from challenges c where c.id = challenge_id and now() between c.starts_at and c.ends_at)
  and exists (select 1 from challenge_items i where i.id = item_id and i.challenge_id = challenge_completions.challenge_id));

drop policy if exists "members see votes" on public.completion_votes;
create policy "members see votes" on public.completion_votes for select to authenticated
  using (exists (select 1 from challenge_completions c where c.id = completion_id and is_member(c.challenge_id)));
drop policy if exists "vote on others" on public.completion_votes;
create policy "vote on others" on public.completion_votes for insert to authenticated with check (
  voter_id = auth.uid() and exists (select 1 from challenge_completions c where c.id = completion_id and is_member(c.challenge_id) and c.user_id <> auth.uid()));
drop policy if exists "change your vote" on public.completion_votes;
create policy "change your vote" on public.completion_votes for update to authenticated using (voter_id = auth.uid()) with check (voter_id = auth.uid());

drop policy if exists "see friends' activity" on public.activities;
create policy "see friends' activity" on public.activities for select to authenticated using (shares_challenge(actor_id));
drop policy if exists "post your activity" on public.activities;
create policy "post your activity" on public.activities for insert to authenticated with check (actor_id = auth.uid());
drop policy if exists "edit your activity" on public.activities;
create policy "edit your activity" on public.activities for update to authenticated using (actor_id = auth.uid()) with check (actor_id = auth.uid());
drop policy if exists "remove your activity" on public.activities;
create policy "remove your activity" on public.activities for delete to authenticated using (actor_id = auth.uid());

drop policy if exists "see reactions" on public.reactions;
create policy "see reactions" on public.reactions for select to authenticated
  using (exists (select 1 from activities a where a.id = activity_id and shares_challenge(a.actor_id)));
drop policy if exists "react" on public.reactions;
create policy "react" on public.reactions for insert to authenticated with check (
  user_id = auth.uid() and exists (select 1 from activities a where a.id = activity_id and shares_challenge(a.actor_id)));
drop policy if exists "unreact" on public.reactions;
create policy "unreact" on public.reactions for delete to authenticated using (user_id = auth.uid());

-- ---------- Votes decide a completion's status ----------
create or replace function public.recount_completion() returns trigger
language plpgsql security definer set search_path = public as $$
declare cid uuid := coalesce(new.completion_id, old.completion_id); others int; disputes int;
begin
  select count(*) - 1 into others from challenge_members m join challenge_completions c on c.challenge_id = m.challenge_id where c.id = cid;
  select count(*) into disputes from completion_votes where completion_id = cid and verdict = 'dispute';
  update challenge_completions set status = case when disputes > others / 2.0 then 'rejected' when disputes > 0 then 'disputed' else 'counted' end where id = cid;
  return null;
end $$;
drop trigger if exists recount_completion on public.completion_votes;
create trigger recount_completion after insert or update or delete on public.completion_votes for each row execute function public.recount_completion();

-- ---------- Invite links ----------
-- Preview a challenge from its link (works before joining)
create or replace function public.get_invite(code text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', c.id, 'title', c.title, 'starts_at', c.starts_at, 'ends_at', c.ends_at,
    'creator', p.name, 'members', (select count(*) from challenge_members m where m.challenge_id = c.id),
    'goals', (select count(*) from challenge_items i where i.challenge_id = c.id),
    'joined', exists (select 1 from challenge_members m where m.challenge_id = c.id and m.user_id = auth.uid()))
  from challenges c join profiles p on p.id = c.created_by where c.invite_code = lower(trim(code));
$$;
-- Join from a link; returns the challenge id
create or replace function public.join_challenge(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Create your profile first'; end if;
  select id into cid from challenges where invite_code = lower(trim(code)) and ends_at > now();
  if cid is null then raise exception 'This invite link is not valid or the challenge has ended'; end if;
  insert into challenge_members (challenge_id, user_id) values (cid, auth.uid()) on conflict do nothing;
  return cid;
end $$;
revoke all on function public.get_invite(text) from public;
revoke all on function public.join_challenge(text) from public;
grant execute on function public.get_invite(text) to anon, authenticated;
grant execute on function public.join_challenge(text) to authenticated;

-- ---------- Proof and post photos ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
drop policy if exists "upload into your own folder" on storage.objects;
create policy "upload into your own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Live updates ----------
do $$ declare t text; begin
  foreach t in array array['profiles','challenges','challenge_members','challenge_items','challenge_completions','completion_votes','activities','reactions'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- v2: goal titles shared with friends ("Me too", "friends with the same goal"), stamp posts ----------
alter table public.profiles add column if not exists share_list boolean not null default true;

create table if not exists public.wishes (
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  entry_id text not null,
  title text not null check (char_length(trim(title)) between 1 and 120),
  type text,
  place text,
  source_activity uuid references public.activities on delete set null, -- set when added with "Me too"
  created_at timestamptz not null default now(),
  primary key (user_id, entry_id)
);
alter table public.wishes enable row level security;
drop policy if exists "see friends' goal titles" on public.wishes;
create policy "see friends' goal titles" on public.wishes for select to authenticated using (
  user_id = auth.uid() or (shares_challenge(user_id) and exists (select 1 from profiles p where p.id = user_id and p.share_list)));
drop policy if exists "add your goals" on public.wishes;
create policy "add your goals" on public.wishes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "edit your goals" on public.wishes;
create policy "edit your goals" on public.wishes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "remove your goals" on public.wishes;
create policy "remove your goals" on public.wishes for delete to authenticated using (user_id = auth.uid());

alter table public.activities drop constraint if exists activities_kind_check;
alter table public.activities add constraint activities_kind_check check (kind in ('entry_completed', 'challenge_item', 'stamp'));

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wishes') then
    alter publication supabase_realtime add table public.wishes;
  end if;
end $$;
