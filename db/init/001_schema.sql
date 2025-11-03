create table if not exists profiles (
  profile_id uuid primary key,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists scores (
  score_id uuid primary key,
  profile_id uuid not null references profiles(profile_id) on delete cascade,
  session_id uuid not null,
  points integer not null,
  reason text not null,
  ts timestamptz not null default now()
);

create index if not exists idx_scores_profile on scores(profile_id);
create index if not exists idx_scores_ts on scores(ts);
