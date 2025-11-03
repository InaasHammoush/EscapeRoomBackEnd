import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function ensureDb() {
  // defensive: falls init/SQL mal nicht lief
  await pool.query(`
    create table if not exists profiles(
      profile_id uuid primary key,
      display_name text not null,
      created_at timestamptz not null default now()
    );
    create table if not exists scores(
      score_id uuid primary key,
      profile_id uuid not null references profiles(profile_id) on delete cascade,
      session_id uuid not null,
      points integer not null,
      reason text not null,
      ts timestamptz not null default now()
    );
    create index if not exists idx_scores_profile on scores(profile_id);
    create index if not exists idx_scores_ts on scores(ts);
  `);
}

export async function upsertProfile({ profile_id, display_name }) {
  await pool.query(
    `insert into profiles(profile_id, display_name)
     values ($1,$2)
     on conflict (profile_id) do update set display_name = excluded.display_name`,
    [profile_id, display_name]
  );
}

export async function insertScore({ score_id, profile_id, session_id, points, reason, ts=new Date() }) {
  await pool.query(
    `insert into scores(score_id, profile_id, session_id, points, reason, ts)
     values ($1,$2,$3,$4,$5,$6)`,
    [score_id, profile_id, session_id, points, reason, ts]
  );
}

export async function topLeaderboard({ limit = 10, since = null } = {}) {
  const where = since ? 'where ts >= $1' : '';
  const params = since ? [since, limit] : [limit];
  const sql = `
    select p.display_name, s.profile_id, sum(s.points) as total_points
    from scores s
    join profiles p on p.profile_id = s.profile_id
    ${where}
    group by p.display_name, s.profile_id
    order by total_points desc
    limit $${since ? 2 : 1}`;
  const res = await pool.query(sql, params);
  return res.rows;
}
