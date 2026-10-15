-- 실제 적용된 함수 (2026-10-14). 쓰기는 모두 클럽 PIN을 확인하는 club_* 함수로만 가능합니다.
-- 참고: Supabase 연결 도구 문제로 함수 본문은 $$ 대신 작은따옴표로 감쌌습니다.
-- PIN이 틀리면 예외 대신 {"error":"bad_pin"}을 돌려줍니다. 예외를 던지면 실패 기록까지 롤백되어 시도 제한이 동작하지 않기 때문입니다.
-- 삭제는 deleted_at을 채우는 방식(숨김 처리)입니다.

alter table public.matches add column if not exists deleted_at timestamptz;
alter table public.members add column if not exists deleted_at timestamptz;

create or replace function private.pin_error(p_pin text) returns text
language plpgsql security definer set search_path = '' as '
declare v_hash text; v_fails int;
begin
  select count(*) into v_fails from private.pin_failures where at > now() - interval ''10 minutes'';
  if v_fails >= 10 then return ''too_many_attempts''; end if;
  select pin_hash into v_hash from private.club_secret where id = 1;
  if v_hash is null or p_pin is null or extensions.crypt(p_pin, v_hash) <> v_hash then
    insert into private.pin_failures default values;
    return ''bad_pin'';
  end if;
  return null;
end ';

create or replace function public.club_check_pin(p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as '
declare v_err text := private.pin_error(p_pin);
begin
  if v_err is not null then return jsonb_build_object(''error'', v_err); end if;
  return jsonb_build_object(''ok'', true);
end ';

create or replace function public.club_add_match(p_pin text, p_played_on date, p_team_a uuid[], p_team_b uuid[], p_sets jsonb, p_entered_by uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as '
declare v_err text := private.pin_error(p_pin); v_id uuid; v_all uuid[]; s jsonb; v_a int; v_b int;
begin
  if v_err is not null then return jsonb_build_object(''error'', v_err); end if;
  if p_played_on is null or p_played_on > current_date + 1 then raise exception ''bad_date''; end if;
  if cardinality(p_team_a) not in (1, 2) or cardinality(p_team_a) <> cardinality(p_team_b) then raise exception ''bad_teams''; end if;
  v_all := p_team_a || p_team_b;
  if (select count(distinct x) from unnest(v_all) x) <> cardinality(v_all) then raise exception ''duplicate_player''; end if;
  if (select count(*) from public.members where id = any(v_all) and deleted_at is null) <> cardinality(v_all) then raise exception ''unknown_player''; end if;
  if jsonb_typeof(p_sets) <> ''array'' or jsonb_array_length(p_sets) not between 1 and 5 then raise exception ''bad_score''; end if;
  for s in select * from jsonb_array_elements(p_sets) loop
    v_a := (s->>''a'')::int; v_b := (s->>''b'')::int;
    if v_a is null or v_b is null or v_a < 0 or v_b < 0 or v_a > 99 or v_b > 99 or v_a = v_b then raise exception ''bad_score''; end if;
  end loop;
  insert into public.matches (played_on, team_a, team_b, sets, entered_by)
  values (p_played_on, p_team_a, p_team_b,
          (select jsonb_agg(jsonb_build_object(''a'', (e->>''a'')::int, ''b'', (e->>''b'')::int)) from jsonb_array_elements(p_sets) e),
          p_entered_by)
  returning id into v_id;
  return jsonb_build_object(''ok'', true, ''id'', v_id);
end ';

create or replace function public.club_remove_match(p_pin text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as '
declare v_err text := private.pin_error(p_pin);
begin
  if v_err is not null then return jsonb_build_object(''error'', v_err); end if;
  update public.matches set deleted_at = now() where id = p_id and deleted_at is null;
  return jsonb_build_object(''ok'', true);
end ';

create or replace function public.club_add_member(p_pin text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as '
declare v_err text := private.pin_error(p_pin); v_id uuid; v_name text := btrim(p_name);
begin
  if v_err is not null then return jsonb_build_object(''error'', v_err); end if;
  if v_name is null or char_length(v_name) not between 1 and 20 then raise exception ''bad_name''; end if;
  if exists (select 1 from public.members where name = v_name and deleted_at is null) then raise exception ''duplicate_member''; end if;
  update public.members set deleted_at = null where name = v_name returning id into v_id;
  if v_id is null then insert into public.members (name) values (v_name) returning id into v_id; end if;
  return jsonb_build_object(''ok'', true, ''id'', v_id);
end ';

create or replace function public.club_remove_member(p_pin text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as '
declare v_err text := private.pin_error(p_pin);
begin
  if v_err is not null then return jsonb_build_object(''error'', v_err); end if;
  if exists (select 1 from public.matches where deleted_at is null and (p_id = any(team_a) or p_id = any(team_b))) then raise exception ''member_has_matches''; end if;
  update public.members set deleted_at = now() where id = p_id;
  return jsonb_build_object(''ok'', true);
end ';

create or replace function public.club_set_points(p_pin text, p_win int, p_loss int) returns jsonb
language plpgsql security definer set search_path = '' as '
declare v_err text := private.pin_error(p_pin);
begin
  if v_err is not null then return jsonb_build_object(''error'', v_err); end if;
  if p_win is null or p_loss is null or p_win < p_loss or p_loss < 0 or p_win > 10 then raise exception ''bad_points''; end if;
  update public.league_settings set win_points = p_win, loss_points = p_loss where id = 1;
  return jsonb_build_object(''ok'', true);
end ';

create or replace function public.club_change_pin(p_pin text, p_new_pin text) returns jsonb
language plpgsql security definer set search_path = '' as '
declare v_err text := private.pin_error(p_pin);
begin
  if v_err is not null then return jsonb_build_object(''error'', v_err); end if;
  if p_new_pin is null or length(p_new_pin) not between 4 and 8 or p_new_pin ~ ''[^0-9]'' then raise exception ''bad_new_pin''; end if;
  update private.club_secret set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt(''bf'')) where id = 1;
  return jsonb_build_object(''ok'', true);
end ';

alter publication supabase_realtime add table public.members, public.matches, public.league_settings;

-- 경기 결과 수정 (2026-10-14 추가)
alter table public.matches add column if not exists updated_at timestamptz;

create or replace function public.club_update_match(p_pin text, p_id uuid, p_played_on date, p_team_a uuid[], p_team_b uuid[], p_sets jsonb, p_entered_by uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as '
declare v_err text := private.pin_error(p_pin); v_all uuid[]; s jsonb; v_a int; v_b int; v_n int;
begin
  if v_err is not null then return jsonb_build_object(''error'', v_err); end if;
  if not exists (select 1 from public.matches where id = p_id and deleted_at is null) then raise exception ''match_not_found''; end if;
  if p_played_on is null or p_played_on > current_date + 1 then raise exception ''bad_date''; end if;
  if cardinality(p_team_a) not in (1, 2) or cardinality(p_team_a) <> cardinality(p_team_b) then raise exception ''bad_teams''; end if;
  v_all := p_team_a || p_team_b;
  if (select count(distinct x) from unnest(v_all) x) <> cardinality(v_all) then raise exception ''duplicate_player''; end if;
  if (select count(*) from public.members where id = any(v_all) and deleted_at is null) <> cardinality(v_all) then raise exception ''unknown_player''; end if;
  if jsonb_typeof(p_sets) <> ''array'' or jsonb_array_length(p_sets) not between 1 and 5 then raise exception ''bad_score''; end if;
  for s in select * from jsonb_array_elements(p_sets) loop
    v_a := (s->>''a'')::int; v_b := (s->>''b'')::int;
    if v_a is null or v_b is null or v_a < 0 or v_b < 0 or v_a > 99 or v_b > 99 or v_a = v_b then raise exception ''bad_score''; end if;
  end loop;
  update public.matches
     set played_on = p_played_on, team_a = p_team_a, team_b = p_team_b,
         sets = (select jsonb_agg(jsonb_build_object(''a'', (e->>''a'')::int, ''b'', (e->>''b'')::int)) from jsonb_array_elements(p_sets) e),
         entered_by = coalesce(p_entered_by, entered_by), updated_at = now()
   where id = p_id and deleted_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception ''match_not_found''; end if;
  return jsonb_build_object(''ok'', true, ''id'', p_id);
end ';

-- 무승부 지원 (2026-10-14 추가): 동점 세트(예: 5-5) 허용, 무승부 승점 설정
alter table public.league_settings add column if not exists draw_points int not null default 1 check (draw_points between 0 and 10);

create or replace function private.check_match(p_played_on date, p_team_a uuid[], p_team_b uuid[], p_sets jsonb) returns void
language plpgsql security definer set search_path = '' as '
declare v_all uuid[]; s jsonb; v_a int; v_b int;
begin
  if p_played_on is null or p_played_on > current_date + 1 then raise exception ''bad_date''; end if;
  if cardinality(p_team_a) not in (1, 2) or cardinality(p_team_a) <> cardinality(p_team_b) then raise exception ''bad_teams''; end if;
  v_all := p_team_a || p_team_b;
  if (select count(distinct x) from unnest(v_all) x) <> cardinality(v_all) then raise exception ''duplicate_player''; end if;
  if (select count(*) from public.members where id = any(v_all) and deleted_at is null) <> cardinality(v_all) then raise exception ''unknown_player''; end if;
  if jsonb_typeof(p_sets) <> ''array'' or jsonb_array_length(p_sets) not between 1 and 5 then raise exception ''bad_score''; end if;
  for s in select * from jsonb_array_elements(p_sets) loop
    v_a := (s->>''a'')::int; v_b := (s->>''b'')::int;
    if v_a is null or v_b is null or v_a < 0 or v_b < 0 or v_a > 99 or v_b > 99 then raise exception ''bad_score''; end if;
  end loop;
end ';
-- club_add_match / club_update_match 는 위 검사를 private.check_match 호출로 바꿨습니다(동점 세트 허용).
-- club_set_points(p_pin, p_win, p_draw, p_loss): 승리 >= 무승부 >= 패배 를 검사합니다.

-- 멤버 이름 수정 (2026-10-14 추가)
create or replace function public.club_rename_member(p_pin text, p_id uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as '
declare v_err text := private.pin_error(p_pin); v_name text := btrim(p_name); v_n int;
begin
  if v_err is not null then return jsonb_build_object(''error'', v_err); end if;
  if v_name is null or char_length(v_name) not between 1 and 20 then raise exception ''bad_name''; end if;
  if exists (select 1 from public.members where name = v_name and id <> p_id) then raise exception ''duplicate_member''; end if;
  update public.members set name = v_name where id = p_id and deleted_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception ''member_not_found''; end if;
  return jsonb_build_object(''ok'', true);
end ';

-- 마스터 권한 (2026-10-14 추가)
-- private.club_secret.master_hash: 마스터 PIN 해시
-- private.pin_error: 클럽 PIN 또는 마스터 PIN 통과 (결과 입력·멤버 추가)
-- private.master_error: 마스터 PIN만 통과, 실패 시 bad_master
-- 마스터 전용: club_update_match, club_remove_match, club_rename_member, club_remove_member,
--             club_set_points(4인자), club_change_pin, club_change_master_pin, club_check_master
-- (예전 3인자 club_set_points 는 항상 bad_master 를 돌려줌)

-- 게시판·댓글 (2026-10-15 추가)
-- 테이블: public.posts(id, author_id, title, body, pinned, created_at, updated_at, deleted_at)
--         public.comments(id, target_type 'match'|'post', target_id, author_id, body, created_at, deleted_at)
-- 둘 다 누구나 읽기만 가능(RLS), 실시간 갱신 대상.
-- private.check_author(p_author): 멤버인지 확인 (bad_author)
-- club_add_post(p_pin, p_author, p_title, p_body)            : 클럽 PIN 또는 마스터
-- club_add_comment(p_pin, p_target_type, p_target_id, p_author, p_body) : 클럽 PIN 또는 마스터, 대상 존재 확인
-- club_remove_post / club_pin_post / club_remove_comment      : 마스터 전용

-- 참석 체크 (2026-10-15 추가)
-- public.events(id, starts_on, start_time, place, note, created_by, created_at, deleted_at)
-- public.attendance(event_id, member_id, status 'yes'|'no'|'maybe', updated_at)  기본키 (event_id, member_id)
-- club_add_event(p_pin, p_date, p_time, p_place, p_note, p_by)   : 클럽 PIN 또는 마스터
-- club_set_attendance(p_pin, p_event, p_member, p_status)        : 클럽 PIN 또는 마스터 (있으면 바꾸고 없으면 추가)
-- club_remove_event(p_pin, p_id)                                 : 마스터 전용 (숨김 처리)

-- 주말 운동 멤버 (2026-10-15 추가)
-- public.members.weekend boolean default true. 박정기만 false.
-- 주말 운동 멤버가 아니면 참석 체크·대진표 목록에서 빠짐(순위·기록은 그대로). 일정별로 '게스트'로 추가 가능.
-- club_set_weekend(p_pin, p_id, p_on) : 마스터 전용
