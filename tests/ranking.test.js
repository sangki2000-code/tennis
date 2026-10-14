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
