---
name: tennis-match-results
description: 법무연수원 테니스 클럽 랭킹 앱(Supabase 프로젝트 lgbqzijdeubpverbspqq)에 경기 결과를 대화로 입력·수정·삭제하고, 순위·선수 전적·상대 전적·월별 순위를 알려 주는 스킬. 사용자가 "오늘 복식 김상기·최기웅 vs 김문배·서진호 6-1", "어제 단식 상기가 진호한테 6-4로 이겼어", "결과 입력해줘", "스코어 기록", "지금 순위 알려줘", "이번 달 1위 누구야", "김상기 상대 전적", "방금 입력한 경기 지워줘"처럼 테니스 경기 결과·스코어·순위·전적을 말하거나 물으면, 앱이나 Supabase를 언급하지 않아도 반드시 이 스킬을 사용하세요.
---

# 테니스 경기 결과 입력 · 순위 조회

법무연수원 테니스 클럽 랭킹 앱과 **같은 데이터베이스**에 기록합니다. 여기서 입력하면 앱(https://sangki2000-code.github.io/tennis/)의 순위·경기 기록에 바로 나타납니다.

- 데이터베이스: Supabase 커넥터의 `execute_sql` 도구, `project_id: "lgbqzijdeubpverbspqq"`
- 사용자에게는 항상 **한국어**로, 짧고 쉽게 답합니다 (사용자는 개발자가 아닙니다).
- **이 스킬을 쓰는 사람은 김상기**입니다 (앱을 만든 사람이자 마스터). "나", "내가", "저", "제가"는 **김상기**로 알아듣습니다. 예: "나랑 기웅이 vs 문배·진호 6-3" → 김상기·최기웅 vs 김문배·서진호.
- 날짜 기준은 **한국 시간(Asia/Seoul)** 입니다. "오늘/어제/지난 토요일"은 한국 날짜로 바꿉니다.

## 가장 중요한 규칙: 바꾸기 전에 항상 확인받기

이 데이터는 클럽 멤버 전체가 보는 순위표입니다. 잘못 들어간 기록은 다른 사람 순위를 바꾸고, 사용자는 개발자가 아니라서 직접 되돌리기 어렵습니다. 그래서 **경기 입력·수정·삭제·되살리기, 멤버 추가 등 데이터를 바꾸는 모든 작업은** 아래 순서를 지킵니다.

1. 바꿀 내용을 사람이 읽기 쉬운 말로 보여 주고 "이렇게 저장할까요?" (또는 수정/삭제할까요?) 라고 묻습니다.
2. 사용자가 "네", "응", "저장", "좋아"처럼 **분명히 동의한 뒤에만** SQL을 실행합니다.
3. 사용자가 내용을 고쳐 말하면, 고친 내용으로 **다시 보여 주고 다시 확인**받습니다.
4. 여러 경기를 한꺼번에 말하면 전부 목록으로 보여 주고 한 번에 확인받습니다.

사용자가 처음부터 "확인 없이 바로 저장해"라고 해도 이 확인은 생략하지 않습니다. 확인 한 번은 몇 초면 되지만, 잘못 저장된 기록은 모두의 순위를 흔듭니다. 조회(순위·전적 보기)는 데이터를 바꾸지 않으니 확인 없이 바로 답합니다.

## SQL을 보낼 때 꼭 지킬 것 (연결 도구의 알려진 문제)

1. **`$` 문자를 쓰지 마세요** (`$$`, `$1` 포함). 이 문자가 들어가면 요청이 60초 뒤 시간 초과로 끊깁니다.
2. **`delete`, `drop`, `truncate`, `revoke` 문장을 쓰지 마세요.** 승인 대기로 멈춘 뒤 취소됩니다. 삭제는 `update ... set deleted_at = now()` (숨김 처리)로 합니다. 앱도 같은 방식입니다.
3. 조회할 때는 항상 `deleted_at is null` 인 행만 봅니다.
4. 문자열 값의 작은따옴표는 `''` 로 두 번 써서 넣습니다.

## 데이터 구조 (필요한 것만)

- `public.members(id uuid, name text, deleted_at)` — 멤버. 이름은 고유.
- `public.matches(id, played_on date, team_a uuid[], team_b uuid[], sets jsonb, entered_by uuid, created_at, updated_at, deleted_at)`
  - `sets` 예: `[{"a":6,"b":4}]` — **a = 팀 A 게임 수, b = 팀 B 게임 수**. 여러 세트면 배열에 여러 개.
  - 단식은 팀당 1명, 복식은 팀당 2명. 양 팀 인원은 같아야 합니다.
- `public.league_settings(win_points, draw_points, loss_points)` — 현재 승 2 / 무 1 / 패 0 (바뀔 수 있으니 조회해서 씁니다).
- `private.check_match(played_on, team_a, team_b, sets)` — 앱과 같은 입력 검사 함수 (잘못되면 오류: `bad_date`, `bad_teams`, `duplicate_player`, `unknown_player`, `bad_score`).

## 승패 규칙 (앱과 동일)

- 세트를 더 많이 딴 팀이 승리. 세트 수가 같으면 **게임 합계**가 많은 팀이 승리.
- 세트 수와 게임 합계가 모두 같으면 **무승부** (예: `5-5`, `6-4, 4-6`).
- 순위: 승점 → 승률 → 게임 득실차 → 게임 득점 순.

## 1. 경기 결과 입력

### 1-1. 말에서 정보 뽑기
사용자 말에서 다음을 정리합니다.
- **날짜**: 말이 없으면 오늘(한국 시간).
- **종류**: 한 팀에 2명이면 복식, 1명이면 단식. (이 클럽은 복식이 기본입니다.)
- **팀 A / 팀 B 선수**와 **스코어(팀 A 기준)**.
  - "A vs B 6-4"는 A가 6, B가 4.
  - "B가 6-4로 이겼어", "A가 4-6으로 졌어"처럼 말하면 **팀 A 기준으로 뒤집어서** 저장합니다. 헷갈리면 이긴 팀을 팀 A로 두면 됩니다.
  - "6:4", "6대4", "6-4 6-3"(여러 세트) 모두 받아 줍니다. 타이브레이크 표기 `7-6(5)`의 괄호는 무시합니다.
- **입력한 사람**: 기본은 **김상기**(`entered_by` 에 김상기 id). 다른 사람이 알려 준 결과라고 하면 그 사람으로 넣습니다.

### 1-2. 멤버 이름 맞추기
먼저 멤버 목록을 조회합니다:
```sql
select id, name from public.members where deleted_at is null order by name;
```
- "상기"처럼 성을 빼고 말해도 정확히 하나로 맞으면 그 멤버로 봅니다.
- 맞는 사람이 없거나 둘 이상이면 **추측하지 말고 물어봅니다.** 새 멤버라면 추가할지 물어본 뒤 2번 항목대로 추가합니다.

### 1-3. 저장 전에 확인받기 (생략 불가)
위의 "가장 중요한 규칙"대로, 저장 전에 이렇게 보여 주고 사용자가 동의한 뒤에만 저장합니다.
```
이렇게 저장할까요?
· 10월 15일(수) 복식
· 김상기·최기웅 6-1 김문배·서진호  → 김상기·최기웅 승리
```
이긴 팀을 분명히 적어서, 스코어 방향(누가 6이고 누가 4인지)이 맞는지 사용자가 한눈에 확인할 수 있게 합니다.

### 1-4. 저장
검사 함수와 입력을 **한 번의 `execute_sql` 호출**로 보냅니다. 검사에서 오류가 나면 전체가 취소되어 잘못된 기록이 남지 않습니다.
```sql
select private.check_match('2026-10-15'::date,
  array['<A1 id>','<A2 id>']::uuid[], array['<B1 id>','<B2 id>']::uuid[],
  '[{"a":6,"b":1}]'::jsonb);
insert into public.matches (played_on, team_a, team_b, sets, entered_by)
values ('2026-10-15', array['<A1 id>','<A2 id>']::uuid[], array['<B1 id>','<B2 id>']::uuid[],
        '[{"a":6,"b":1}]'::jsonb, '<김상기 id>')
returning id;
```
- 단식이면 배열에 1명씩.
- 저장 후에는 결과와 **바뀐 순위 상위권**(3번의 순위 쿼리)을 짧게 알려 줍니다.
- 같은 날 같은 선수·같은 스코어가 이미 있으면 중복일 수 있으니 저장 전에 한 번 물어봅니다:
```sql
select id, created_at from public.matches
where deleted_at is null and played_on = '2026-10-15'
  and team_a = array['<A1 id>','<A2 id>']::uuid[] and team_b = array['<B1 id>','<B2 id>']::uuid[];
```

## 2. 수정 · 삭제 · 멤버 추가 (관리자 작업)

앱에서는 마스터만 할 수 있는 작업입니다. 이 스킬을 쓰는 사람은 데이터베이스 소유자(관리자)이지만, 위의 "가장 중요한 규칙"대로 **무엇을 바꾸는지 보여 주고 확인을 받은 뒤에만** 실행합니다. 수정은 "바뀌기 전 → 바뀐 후"를 나란히 보여 줍니다.
```
이렇게 수정할까요?
· 10월 14일 복식 김상기·최기웅 vs 김문배·서진호
· 스코어 6-1 → 6-2
```

- 대상 경기 찾기 (최근 경기 목록):
```sql
select m.id, m.played_on, m.sets,
  (select string_agg(name, '·' order by name) from public.members where id = any(m.team_a)) team_a,
  (select string_agg(name, '·' order by name) from public.members where id = any(m.team_b)) team_b
from public.matches m where m.deleted_at is null
order by m.played_on desc, m.created_at desc limit 10;
```
- 수정: 먼저 `select private.check_match(...)` 로 새 값을 검사한 뒤
  `update public.matches set played_on = ..., team_a = ..., team_b = ..., sets = ..., updated_at = now() where id = '<id>' and deleted_at is null;`
- 삭제(숨김): `update public.matches set deleted_at = now() where id = '<id>' and deleted_at is null;`
  잘못 지운 경기는 `set deleted_at = null` 로 되살릴 수 있다고 알려 줍니다.
- 멤버 추가: `insert into public.members (name) values ('홍길동') on conflict (name) do update set deleted_at = null returning id;`

## 3. 순위 · 전적 질문

순위, 이번 달 순위, 단식/복식만의 순위는 `references/queries.sql` 의 **순위 쿼리**를 씁니다. 앱과 똑같이 계산되도록 검증된 쿼리입니다.
- 기간·종류를 거르려면 그 파일 안내대로 `where` 조건만 바꿉니다.
- 선수 한 명의 전적, 상대 전적, 복식 파트너 성적도 같은 파일에 있습니다.

답할 때는 표 전체를 늘어놓기보다 질문에 맞게 요약합니다. 예: "지금 1위는 서진호(2승 1패, 승점 4)입니다. 2위 박정기, 3위 김상기…"

## 오류가 나면

| 오류 | 사용자에게 할 말 |
|---|---|
| `bad_score` | 스코어를 다시 확인해 달라고 (예: 6-4) |
| `duplicate_player` | 같은 선수가 두 번 들어갔다고 |
| `unknown_player` | 등록되지 않은 멤버가 있다고, 추가할지 묻기 |
| `bad_teams` | 단식은 1:1, 복식은 2:2로 말해 달라고 |
| `bad_date` | 미래 날짜는 넣을 수 없다고 |
| 시간 초과 | SQL에 `$` 나 `delete` 가 들어갔는지 확인하고 고쳐서 다시 보내기 |
