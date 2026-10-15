const test = require('node:test');
const assert = require('node:assert');
const { parseScore, decideWinner, computeStandings } = require('../ranking');

test('parseScore: 일반/타이브레이크/콜론 표기', () => {
  assert.deepStrictEqual(parseScore('6-4, 3-6, 7-6(5)'), [[6, 4], [3, 6], [7, 6]]);
  assert.deepStrictEqual(parseScore('6:3'), [[6, 3]]);
  assert.deepStrictEqual(parseScore('6-6'), [[6, 6]]);
  assert.throws(() => parseScore('abc'));
  assert.throws(() => parseScore(''));
});

test('decideWinner: 세트 우선, 동수면 게임', () => {
  assert.strictEqual(decideWinner([[6, 4], [3, 6], [7, 5]]).winner, 'A');
  assert.strictEqual(decideWinner([[4, 6], [6, 0]]).winner, 'A');
  assert.strictEqual(decideWinner([[6, 3]]).winner, 'A');
  assert.strictEqual(decideWinner([[3, 6]]).winner, 'B');
});

test('computeStandings: 단식/복식 집계와 순위', () => {
  const members = [{ id: 'a', name: '김' }, { id: 'b', name: '이' }, { id: 'c', name: '박' }, { id: 'd', name: '최' }];
  const matches = [
    { date: '2026-10-01', teamA: ['a'], teamB: ['b'], sets: [[6, 2], [6, 3]] },
    { date: '2026-10-02', teamA: ['a', 'c'], teamB: ['b', 'd'], sets: [[6, 4]] },
    { date: '2026-10-03', teamA: ['d'], teamB: ['c'], sets: [[6, 1]] },
  ];
  const s = computeStandings(members, matches, { winPoints: 3, lossPoints: 1 });
  const byId = Object.fromEntries(s.map((x) => [x.id, x]));
  assert.strictEqual(byId.a.wins, 2);
  assert.strictEqual(byId.a.points, 6);
  assert.strictEqual(byId.a.rank, 1);
  assert.strictEqual(byId.b.losses, 2);
  assert.strictEqual(byId.b.rank, 4);
  assert.strictEqual(byId.a.gamesWon, 18);
  assert.strictEqual(byId.a.gamesLost, 9);
  assert.deepStrictEqual(byId.c.recent, ['W', 'L']);
});

test('computeStandings: 완전 동률은 같은 순위', () => {
  const members = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
  const s = computeStandings(members, []);
  assert.deepStrictEqual(s.map((x) => x.rank), [1, 1, 1]);
});

const { listMonths, filterMatches, memberDetail } = require('../ranking');
const sample = [
  { date: '2026-09-20', teamA: ['a'], teamB: ['b'], sets: [[6, 2]] },
  { date: '2026-10-01', teamA: ['a'], teamB: ['b'], sets: [[3, 6], [4, 6]] },
  { date: '2026-10-05', teamA: ['a', 'c'], teamB: ['b', 'd'], sets: [[6, 4]] },
  { date: '2026-10-07', teamA: ['d'], teamB: ['a'], sets: [[2, 6]] },
];

test('listMonths / filterMatches: 월별·유형별 필터', () => {
  assert.deepStrictEqual(listMonths(sample), ['2026-10', '2026-09']);
  assert.strictEqual(filterMatches(sample, { month: '2026-10' }).length, 3);
  assert.strictEqual(filterMatches(sample, { type: 'double' }).length, 1);
  assert.strictEqual(filterMatches(sample, { month: '2026-10', type: 'single' }).length, 2);
});

test('memberDetail: 상대 전적·파트너·월별·연승', () => {
  const d = memberDetail('a', sample);
  assert.deepStrictEqual([d.total.wins, d.total.losses], [3, 1]);
  assert.deepStrictEqual([d.singles.wins, d.singles.losses], [2, 1]);
  assert.deepStrictEqual([d.doubles.wins, d.doubles.losses], [1, 0]);
  const vsB = d.opponents.find((o) => o.id === 'b');
  assert.deepStrictEqual([vsB.total.wins, vsB.total.losses, vsB.singles.played, vsB.doubles.played], [2, 1, 2, 1]);
  const vsD = d.opponents.find((o) => o.id === 'd');
  assert.deepStrictEqual([vsD.total.wins, vsD.total.losses], [2, 0]);
  assert.deepStrictEqual(d.partners.map((p) => [p.id, p.wins, p.losses]), [['c', 1, 0]]);
  assert.deepStrictEqual(d.months.map((m) => [m.month, m.wins, m.losses]), [['2026-10', 2, 1], ['2026-09', 1, 0]]);
  assert.deepStrictEqual(d.streak, { type: 'W', count: 2 });
  assert.strictEqual(d.bestWinStreak, 2);
  assert.strictEqual(memberDetail('zz', sample).streak, null);
});

test('무승부: 세트·게임이 모두 같으면 무승부, 승점 반영', () => {
  assert.strictEqual(decideWinner([[5, 5]]).winner, 'D');
  assert.strictEqual(decideWinner([[6, 4], [4, 6]]).winner, 'D');
  assert.strictEqual(decideWinner([[6, 4], [3, 6]]).winner, 'B'); // 세트 1-1, 게임 9-10 → 게임 많은 B 승
  assert.strictEqual(decideWinner([[6, 6], [6, 3]]).winner, 'A'); // 동점 세트는 세트 수에 넣지 않음

  const members = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
  const matches = [
    { date: '2026-10-01', teamA: ['a'], teamB: ['b'], sets: [[5, 5]] },
    { date: '2026-10-02', teamA: ['a'], teamB: ['c'], sets: [[6, 2]] },
  ];
  const s = computeStandings(members, matches, { winPoints: 2, drawPoints: 1, lossPoints: 0 });
  const by = Object.fromEntries(s.map((x) => [x.id, x]));
  assert.deepStrictEqual([by.a.wins, by.a.draws, by.a.losses, by.a.points], [1, 1, 0, 3]);
  assert.deepStrictEqual([by.b.draws, by.b.points], [1, 1]);
  assert.deepStrictEqual([by.c.losses, by.c.points], [1, 0]);
  assert.deepStrictEqual(by.a.recent, ['D', 'W']);
  assert.deepStrictEqual(s.map((x) => x.id), ['a', 'b', 'c']);

  const d = memberDetail('a', matches);
  assert.deepStrictEqual([d.total.wins, d.total.draws, d.total.losses], [1, 1, 0]);
  assert.strictEqual(d.opponents.find((o) => o.id === 'b').total.draws, 1);
});

test('동률 처리: 승점·승률·게임 득실차가 같으면 게임 득점 많은 쪽이 위', () => {
  const members = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }];
  const matches = [
    { date: '2026-10-01', teamA: ['a'], teamB: ['c'], sets: [[6, 4]] }, // a: +2, 6득
    { date: '2026-10-01', teamA: ['b'], teamB: ['d'], sets: [[7, 5]] }, // b: +2, 7득
  ];
  const s = computeStandings(members, matches, { winPoints: 2, drawPoints: 1, lossPoints: 0 });
  assert.deepStrictEqual(s.slice(0, 2).map((x) => [x.id, x.rank, x.gamesWon]), [['b', 1, 7], ['a', 2, 6]]);
});

const { computeElo, makeDoublesDraw } = require('../ranking');

test('computeElo: 같은 점수에서 이기면 +16, 강팀을 이기면 더 많이', () => {
  const members = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id }));
  const r1 = computeElo(members, [{ date: '1', teamA: ['a', 'b'], teamB: ['c', 'd'], sets: [[6, 1]] }]);
  assert.strictEqual(Math.round(r1.get('a')), 1516);
  assert.strictEqual(Math.round(r1.get('c')), 1484);
  const r2 = computeElo(members, [
    { date: '1', teamA: ['a', 'b'], teamB: ['c', 'd'], sets: [[6, 1]] },
    { date: '2', teamA: ['c', 'd'], teamB: ['a', 'b'], sets: [[6, 2]] },
  ]);
  assert.ok(r2.get('c') - 1484 > 16); // 더 강한 팀을 이겨서 16보다 많이 받음
});

// 실제 클럽 규칙: 상기(S)는 문배(M) 또는 기웅(G)과만 짝. 대항전: S·G vs M·J
const S = 'S', G = 'G', M = 'M', J = 'J';
const rules = { partnerOf: { S: [M, G] }, rivalry: { teamA: [S, G], teamB: [M, J] } };
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('대진표: 네 명이면 상기 파트너는 항상 문배 또는 기웅', () => {
  for (let t = 0; t < 30; t++) {
    const d = makeDoublesDraw({ players: [S, G, M, J], rounds: 6, rules, mode: 'mix', random: Math.random });
    for (const round of d.rounds) for (const m of round) {
      const team = m.teamA.includes(S) ? m.teamA : m.teamB;
      assert.ok([M, G].includes(team.find((x) => x !== S)));
    }
  }
});

test('대진표: rivalry 모드면 네 명일 때 팀 대항전만, mix 모드면 대항전과 상기·문배 조가 번갈아', () => {
  const r = makeDoublesDraw({ players: [S, G, M, J], rounds: 4, rules, mode: 'rivalry' });
  assert.ok(r.rounds.flat().every((m) => m.rivalry));
  const x = makeDoublesDraw({ players: [S, G, M, J], rounds: 4, rules, mode: 'mix' });
  const kinds = x.rounds.flat().map((m) => m.rivalry);
  assert.deepStrictEqual(kinds.filter(Boolean).length, 2);
  assert.ok(x.rounds.flat().some((m) => !m.rivalry && (m.teamA.join() + m.teamB.join()).includes(S) &&
    [m.teamA, m.teamB].some((t) => t.includes(S) && t.includes(M))));
});

test('대진표: 7명 참석 1코트 — 경기 수가 고르게, 규칙 지킴, 같은 사람 중복 없음', () => {
  const ps = [S, G, M, J, 'w', 'h', 'n'];
  const d = require('../ranking').makeBestDraw({ players: ps, rounds: 7, courts: 1, rules, mode: 'mix' }, 100);
  assert.strictEqual(d.rounds.length, 7);
  const counts = ps.map((p) => d.games.get(p));
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, counts.join());
  for (const round of d.rounds) for (const m of round) {
    assert.strictEqual(new Set(m.teamA.concat(m.teamB)).size, 4);
    const four = m.teamA.concat(m.teamB);
    if (four.includes(S) && (four.includes(M) || four.includes(G))) {
      const team = m.teamA.includes(S) ? m.teamA : m.teamB;
      assert.ok([M, G].includes(team.find((x) => x !== S)));
    }
  }
});

test('대진표: 8명 2코트 — 한 라운드에 같은 사람이 두 코트에 안 들어감', () => {
  const ps = [S, G, M, J, 'w', 'h', 'n', 'k'];
  const d = makeDoublesDraw({ players: ps, rounds: 3, courts: 2, rules, mode: 'mix' });
  for (const round of d.rounds) {
    assert.strictEqual(round.length, 2);
    assert.strictEqual(new Set(round.flatMap((m) => m.teamA.concat(m.teamB))).size, 8);
  }
});

test('대진표: 4명 미만이면 만들지 않음', () => {
  assert.strictEqual(makeDoublesDraw({ players: [S, G, M], rounds: 3, rules }).error, 'need4');
});

const { makeBestDraw } = require('../ranking');
const H = 'H'; // 김성훈
const rules2 = { partnerOf: { S: [M, G] }, rivalry: { teamA: [S, G], teamB: [M, J] }, preferPairs: [[H, M]] };
const teamOf = (m, p) => (m.teamA.includes(p) ? m.teamA : m.teamB.includes(p) ? m.teamB : null);
const paired = (m, x, y) => { const t = teamOf(m, x); return !!t && t.includes(y); };

test('최종 대진: 4명이면 대항전과 대회 준비조가 모두 들어감', () => {
  for (let t = 0; t < 10; t++) {
    const d = makeBestDraw({ players: [S, G, M, J], rounds: 4, rules: rules2, mode: 'mix' }, 100);
    const ms = d.rounds.flat();
    assert.ok(ms.some((m) => m.rivalry));
    assert.ok(ms.some((m) => paired(m, S, M)));
  }
});

test('최종 대진: 김성훈·김문배가 모두 오면 같은 조 경기가 반드시 있고, 김상기 규칙도 지킴', () => {
  for (const ps of [[S, G, M, J, H], [S, G, M, J, H, 'w', 'n'], [M, H, 'w', 'n', 'k'], [S, M, H, 'w', 'n']]) {
    for (let t = 0; t < 10; t++) {
      const d = makeBestDraw({ players: ps, rounds: ps.length <= 5 ? 5 : 6, courts: 1, rules: rules2, mode: 'mix' }, 150);
      const ms = d.rounds.flat();
      assert.ok(ms.some((m) => paired(m, H, M)), 'H·M 같은 조 없음: ' + ps.join());
      for (const m of ms) {
        const four = m.teamA.concat(m.teamB);
        if (four.includes(S) && (four.includes(M) || four.includes(G))) assert.ok(paired(m, S, M) || paired(m, S, G));
      }
      const c = [...d.games.values()];
      // 김상기가 있고 최기웅이 없는 5명이면 김문배가 매 경기 나와야 해서(쉬면 김상기 짝이 없음) 차이 2까지는 불가피
      const forced = ps.length === 5 && ps.includes(S) && !ps.includes(G);
      assert.ok(Math.max(...c) - Math.min(...c) <= (forced ? 2 : 1), ps.join() + ' ' + c.join());
    }
  }
});

test('최종 대진: 5명(네 명 + 김성훈)이면 대항전·준비조·성훈문배조 모두 포함', () => {
  for (let t = 0; t < 10; t++) {
    const ms = makeBestDraw({ players: [S, G, M, J, H], rounds: 5, courts: 1, rules: rules2, mode: 'mix' }, 200).rounds.flat();
    assert.ok(ms.some((m) => m.rivalry), 'rivalry');
    assert.ok(ms.some((m) => paired(m, S, M)), 'prac');
    assert.ok(ms.some((m) => paired(m, H, M)), 'HM');
  }
});

test('규칙 충돌: 상기·문배·성훈 + 1명뿐이면 상기 규칙이 우선(상기·문배 고정)', () => {
  const d = makeBestDraw({ players: [S, M, H, 'w'], rounds: 3, rules: rules2, mode: 'mix' }, 50);
  for (const m of d.rounds.flat()) assert.ok(paired(m, S, M));
});

const W = 'W'; // 김왕태
const rules3 = { partnerOf: { S: [M, G] }, rivalry: { teamA: [S, G], teamB: [M, J] }, preferPairs: [[H, M], [W, G]] };

test('같은 조 두 쌍(성훈·문배, 왕태·기웅): 해당 인원이 오면 각각 한 팀 경기가 있고 김상기 규칙 유지', () => {
  const cases = [
    [S, G, M, J, W],           // 네 명 + 왕태
    [S, G, M, J, H, W],        // 네 명 + 성훈 + 왕태
    [S, G, M, J, H, W, 'n'],   // 7명
    [G, W, M, H, 'n'],         // 김상기 없음
    [S, G, W, 'n', 'k'],       // 문배 없음: 상기는 기웅과만 짝, 왕태·기웅 조는 상기가 쉬는 경기에서
  ];
  for (const ps of cases) {
    for (let t = 0; t < 8; t++) {
      const rounds = ps.length <= 5 ? 5 : 6;
      const ms = makeBestDraw({ players: ps, rounds, courts: 1, rules: rules3, mode: 'mix' }, 300).rounds.flat();
      for (const [x, y] of rules3.preferPairs) if (ps.includes(x) && ps.includes(y)) assert.ok(ms.some((m) => paired(m, x, y)), `${x}${y} 없음: ${ps.join()}`);
      for (const m of ms) {
        const four = m.teamA.concat(m.teamB);
        if (four.includes(S)) assert.ok(paired(m, S, M) || paired(m, S, G), `상기 규칙: ${ps.join()}`);
      }
      if (ps.includes(S) && ps.includes(G) && ps.includes(M) && ps.includes(J)) {
        assert.ok(ms.some((m) => m.rivalry), '대항전');
        assert.ok(ms.some((m) => paired(m, S, M)), '준비조');
      }
    }
  }
});

test('computeEloDetail: 마지막 변화량과 반영 경기 수', () => {
  const { computeEloDetail } = require('../ranking');
  const members = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id }));
  const d = computeEloDetail(members, [
    { date: '1', teamA: ['a', 'b'], teamB: ['c', 'd'], sets: [[6, 1]] },
    { date: '2', teamA: ['a'], teamB: ['c'], sets: [[2, 6]] },
  ]);
  assert.strictEqual(Math.round(d.lastDelta.get('a')), -Math.round(d.lastDelta.get('c')));
  assert.ok(d.lastDelta.get('a') < 0);
  assert.strictEqual(Math.round(d.lastDelta.get('b')), 16);
  assert.deepStrictEqual([d.games.get('a'), d.games.get('b'), d.games.get('d')], [2, 1, 1]);
  assert.strictEqual(d.ratings.get('a') + d.ratings.get('b') + d.ratings.get('c') + d.ratings.get('d'), 6000); // 주고받기라 합계 유지
});

test('rankHistory: 날짜별 누적 순위·레이팅, 경기 전이면 null', () => {
  const { rankHistory } = require('../ranking');
  const members = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id }));
  const matches = [
    { date: '2026-10-01', teamA: ['a'], teamB: ['b'], sets: [[6, 1]] },
    { date: '2026-10-08', teamA: ['b'], teamB: ['c'], sets: [[6, 2]] },
    { date: '2026-10-08', teamA: ['b'], teamB: ['a'], sets: [[6, 3]] },
  ];
  const h = rankHistory(members, matches, { winPoints: 2, drawPoints: 1, lossPoints: 0 });
  assert.deepStrictEqual(h.dates, ['2026-10-01', '2026-10-08']);
  assert.deepStrictEqual(h.byId.get('a').map((x) => x.rank), [1, 2]);
  assert.deepStrictEqual(h.byId.get('b').map((x) => x.rank), [2, 1]);
  assert.deepStrictEqual(h.byId.get('c').map((x) => x.rank), [null, 3]);
  assert.deepStrictEqual(h.byId.get('d').map((x) => x.rank), [null, null]);
  assert.strictEqual(h.byId.get('a')[0].rating, 1516);
  assert.deepStrictEqual([h.byId.get('b')[1].wins, h.byId.get('b')[1].losses], [2, 1]);
});
