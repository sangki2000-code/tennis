-- 법무연수원 테니스 클럽: 순위·전적 조회 쿼리
-- 모두 읽기 전용입니다. execute_sql 로 project_id lgbqzijdeubpverbspqq 에 보냅니다.
-- 달러 기호 문자는 쓰지 마세요 (연결 도구가 멈춥니다).

-- ============================================================
-- [1] 순위 쿼리 — 앱과 같은 계산 (승점 → 승률 → 게임 득실차 → 게임 득점)
--   기간/종류 거르기: 아래 "m as (... where ...)" 줄에 조건을 더합니다.
--     이번 달만      : and played_on >= date_trunc('month', (now() at time zone 'Asia/Seoul'))::date
--     특정 달(10월)  : and to_char(played_on, 'YYYY-MM') = '2026-10'
--     복식만         : and cardinality(team_a) = 2
--     단식만         : and cardinality(team_a) = 1
--   기간을 거를 때는 그 기간에 경기가 없는 멤버를 빼려면 마지막 select 에 where played > 0 을 더합니다.
-- ============================================================
with cfg as (select win_points w, draw_points d, loss_points l from public.league_settings where id = 1),
m as (
  select id, played_on, team_a, team_b,
    (select coalesce(sum((e->>'a')::int),0) from jsonb_array_elements(sets) e) ga,
    (select coalesce(sum((e->>'b')::int),0) from jsonb_array_elements(sets) e) gb,
    (select count(*) from jsonb_array_elements(sets) e where (e->>'a')::int > (e->>'b')::int) sa,
    (select count(*) from jsonb_array_elements(sets) e where (e->>'b')::int > (e->>'a')::int) sb
  from public.matches where deleted_at is null
),
r as (
  select id, played_on, team_a, team_b, ga, gb,
    case when sa <> sb then (case when sa > sb then 'A' else 'B' end)
         when ga <> gb then (case when ga > gb then 'A' else 'B' end) else 'D' end winner
  from m
),
p as (
  select unnest(team_a) pid, case winner when 'A' then 'W' when 'D' then 'D' else 'L' end res, ga gw, gb gl from r
  union all
  select unnest(team_b), case winner when 'B' then 'W' when 'D' then 'D' else 'L' end, gb, ga from r
),
s as (
  select mb.name,
    count(p.pid) played,
    count(*) filter (where res = 'W') wins,
    count(*) filter (where res = 'D') draws,
    count(*) filter (where res = 'L') losses,
    coalesce(sum(gw),0) gw, coalesce(sum(gl),0) gl,
    (count(*) filter (where res = 'W')) * (select w from cfg)
      + (count(*) filter (where res = 'D')) * (select d from cfg)
      + (count(*) filter (where res = 'L')) * (select l from cfg) points
  from public.members mb left join p on p.pid = mb.id
  where mb.deleted_at is null group by mb.id, mb.name
)
select rank() over (order by points desc, (case when played > 0 then wins::numeric / played else 0 end) desc, gw - gl desc, gw desc) as rank,
  name, played, wins, draws, losses,
  case when played > 0 then round(100.0 * wins / played) end as win_pct,
  gw || '-' || gl as games, gw - gl as diff, points
from s order by rank, name;

-- ============================================================
-- [2] 한 선수의 경기별 기록 (전적·최근 흐름·상대·파트너 계산용)
--   '<이름>' 을 바꿔 넣습니다. 결과(res)는 W/D/L.
--   상대 전적: opponents 별로 res 를 세면 됩니다 (복식은 상대 두 명 각각에 반영).
--   파트너 성적: partner 별로 res 를 세면 됩니다.
-- ============================================================
with me as (select id from public.members where name = '<이름>' and deleted_at is null),
m as (
  select x.*, 
    (select coalesce(sum((e->>'a')::int),0) from jsonb_array_elements(sets) e) ga,
    (select coalesce(sum((e->>'b')::int),0) from jsonb_array_elements(sets) e) gb,
    (select count(*) from jsonb_array_elements(sets) e where (e->>'a')::int > (e->>'b')::int) sa,
    (select count(*) from jsonb_array_elements(sets) e where (e->>'b')::int > (e->>'a')::int) sb
  from public.matches x where x.deleted_at is null
    and ((select id from me) = any(x.team_a) or (select id from me) = any(x.team_b))
),
r as (
  select m.*, (select id from me) = any(team_a) as on_a,
    case when sa <> sb then (case when sa > sb then 'A' else 'B' end)
         when ga <> gb then (case when ga > gb then 'A' else 'B' end) else 'D' end winner
  from m
)
select played_on,
  case when cardinality(team_a) = 2 then '복식' else '단식' end as kind,
  case when winner = 'D' then 'D' when (winner = 'A') = on_a then 'W' else 'L' end as res,
  (select string_agg(name, '·') from public.members where id = any(case when on_a then team_a else team_b end) and id <> (select id from me)) as partner,
  (select string_agg(name, '·') from public.members where id = any(case when on_a then team_b else team_a end)) as opponents,
  case when on_a then ga else gb end as games_won,
  case when on_a then gb else ga end as games_lost,
  sets
from r order by played_on desc, created_at desc;

-- ============================================================
-- [3] 두 선수의 맞대결 (서로 반대편에서 만난 경기만)
-- ============================================================
with a as (select id from public.members where name = '<선수1>' and deleted_at is null),
     b as (select id from public.members where name = '<선수2>' and deleted_at is null)
select played_on, sets,
  (select string_agg(name, '·') from public.members where id = any(team_a)) team_a,
  (select string_agg(name, '·') from public.members where id = any(team_b)) team_b
from public.matches
where deleted_at is null
  and (((select id from a) = any(team_a) and (select id from b) = any(team_b))
    or ((select id from a) = any(team_b) and (select id from b) = any(team_a)))
order by played_on desc;
