-- 쓰기는 모두 PIN을 확인하는 함수로만 가능합니다. 테이블에는 읽기 정책만 있습니다.
-- 오류 코드(메시지)는 페이지에서 한국어 문구로 바꿔 보여줍니다.

create or replace function private.require_pin(p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_hash text; v_fails int;
begin
  select count(*) into v_fails from private.pin_failures where at > now() - interval '10 minutes';
  if v_fails >= 20 then
    raise exception 'too_many_attempts';
  end if;
  select pin_hash into v_hash from private.club_secret where id = 1;
  if v_hash is null or p_pin is null or extensions.crypt(p_pin, v_hash) <> v_hash then
    insert into private.pin_failures default values;
    delete from private.pin_failures where at < now() - interval '1 day';
    raise exception 'bad_pin';
  end if;
end $$;

create or replace function public.check_pin(p_pin text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_pin(p_pin);
  return true;
end $$;

create or replace function public.add_match(p_pin text, p_played_on date, p_team_a uuid[], p_team_b uuid[], p_sets jsonb, p_entered_by uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_all uuid[]; s jsonb; v_a int; v_b int;
begin
  perform private.require_pin(p_pin);
  if p_played_on is null or p_played_on > current_date + 1 then raise exception 'bad_date'; end if;
  if cardinality(p_team_a) not in (1, 2) or cardinality(p_team_a) <> cardinality(p_team_b) then
    raise exception 'bad_teams';
  end if;
  v_all := p_team_a || p_team_b;
  if (select count(distinct x) from unnest(v_all) x) <> cardinality(v_all) then raise exception 'duplicate_player'; end if;
  if (select count(*) from public.members where id = any(v_all)) <> cardinality(v_all) then raise exception 'unknown_player'; end if;
  if jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) not between 1 and 5 then raise exception 'bad_score'; end if;
  for s in select * from jsonb_array_elements(p_sets) loop
    v_a := (s->>'a')::int; v_b := (s->>'b')::int;
    if v_a is null or v_b is null or v_a < 0 or v_b < 0 or v_a > 99 or v_b > 99 or v_a = v_b then
      raise exception 'bad_score';
    end if;
  end loop;
  insert into public.matches (played_on, team_a, team_b, sets, entered_by)
  values (p_played_on, p_team_a, p_team_b,
          (select jsonb_agg(jsonb_build_object('a', (e->>'a')::int, 'b', (e->>'b')::int)) from jsonb_array_elements(p_sets) e),
          p_entered_by)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_match(p_pin text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_pin(p_pin);
  delete from public.matches where id = p_id;
end $$;

create or replace function public.add_member(p_pin text, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_pin(p_pin);
  if exists (select 1 from public.members where name = btrim(p_name)) then raise exception 'duplicate_member'; end if;
  insert into public.members (name) values (btrim(p_name)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_member(p_pin text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_pin(p_pin);
  if exists (select 1 from public.matches where p_id = any(team_a) or p_id = any(team_b)) then
    raise exception 'member_has_matches';
  end if;
  delete from public.members where id = p_id;
end $$;

create or replace function public.set_points(p_pin text, p_win int, p_loss int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_pin(p_pin);
  if p_win is null or p_loss is null or p_win < p_loss or p_loss < 0 or p_win > 10 then raise exception 'bad_points'; end if;
  update public.league_settings set win_points = p_win, loss_points = p_loss where id = 1;
end $$;

create or replace function public.change_pin(p_pin text, p_new_pin text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_pin(p_pin);
  if p_new_pin is null or length(p_new_pin) not between 4 and 8 or p_new_pin ~ '[^0-9]' then raise exception 'bad_new_pin'; end if;
  update private.club_secret set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf')) where id = 1;
end $$;

revoke execute on function private.require_pin(text) from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.check_pin(text), public.add_match(text, date, uuid[], uuid[], jsonb, uuid),
  public.delete_match(text, uuid), public.add_member(text, text), public.delete_member(text, uuid),
  public.set_points(text, int, int), public.change_pin(text, text) to anon, authenticated;
