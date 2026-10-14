// 순수 계산 로직 (브라우저와 Node 양쪽에서 사용)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Ranking = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_SETTINGS = { winPoints: 3, lossPoints: 1 };

  // "6-4, 3-6, 7-6(5)" -> [[6,4],[3,6],[7,6]]
  function parseScore(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('스코어를 입력하세요.');
    const sets = text.split(/[,\s]+/).filter(Boolean).map((part) => {
      const m = part.replace(/\(\d+\)/g, '').match(/^(\d{1,2})[-:](\d{1,2})$/);
      if (!m) throw new Error(`스코어 형식이 잘못되었습니다: "${part}" (예: 6-4, 3-6, 7-5)`);
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (a === b) throw new Error(`무승부 세트는 입력할 수 없습니다: "${part}"`);
      return [a, b];
    });
    return sets;
  }

  // 세트를 더 많이 딴 쪽이 승리. 세트 수가 같으면 게임 수로 판정.
  function decideWinner(sets) {
    let setsA = 0, setsB = 0, gamesA = 0, gamesB = 0;
    for (const [a, b] of sets) {
      if (a > b) setsA++; else setsB++;
      gamesA += a; gamesB += b;
    }
    if (setsA !== setsB) return { winner: setsA > setsB ? 'A' : 'B', setsA, setsB, gamesA, gamesB };
    if (gamesA !== gamesB) return { winner: gamesA > gamesB ? 'A' : 'B', setsA, setsB, gamesA, gamesB };
    throw new Error('승자를 판정할 수 없습니다. 스코어를 확인하세요.');
  }

  function formatScore(sets) {
    return sets.map(([a, b]) => `${a}-${b}`).join(', ');
  }

  function emptyStats(member) {
    return {
      id: member.id, name: member.name,
      played: 0, wins: 0, losses: 0,
      setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0,
      points: 0, winRate: 0, recent: [],
    };
  }

  // matches: [{ id, date, teamA: [memberId...], teamB: [memberId...], sets: [[a,b]...] }]
  function computeStandings(members, matches, settings) {
    const cfg = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    const table = new Map(members.map((m) => [m.id, emptyStats(m)]));
    const ordered = [...matches].sort((x, y) => (x.date || '').localeCompare(y.date || '') || (x.createdAt || 0) - (y.createdAt || 0));

    for (const match of ordered) {
      const r = decideWinner(match.sets);
      const sides = [
        { ids: match.teamA, won: r.winner === 'A', sw: r.setsA, sl: r.setsB, gw: r.gamesA, gl: r.gamesB },
        { ids: match.teamB, won: r.winner === 'B', sw: r.setsB, sl: r.setsA, gw: r.gamesB, gl: r.gamesA },
      ];
      for (const side of sides) {
        for (const id of side.ids) {
          const s = table.get(id);
          if (!s) continue; // 삭제된 멤버
          s.played++;
          if (side.won) { s.wins++; s.points += cfg.winPoints; } else { s.losses++; s.points += cfg.lossPoints; }
          s.setsWon += side.sw; s.setsLost += side.sl;
          s.gamesWon += side.gw; s.gamesLost += side.gl;
          s.recent.push(side.won ? 'W' : 'L');
        }
      }
    }

    const list = [...table.values()].map((s) => {
      s.winRate = s.played ? s.wins / s.played : 0;
      s.recent = s.recent.slice(-5);
      return s;
    });

    // 정렬 기준: 승점 > 승률 > 게임 득실차 > 세트 득실차 > 이름
    list.sort((a, b) =>
      b.points - a.points ||
      b.winRate - a.winRate ||
      (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost) ||
      (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost) ||
      a.name.localeCompare(b.name, 'ko'));

    // 동률(승점·승률·게임/세트 득실 모두 같음)이면 같은 순위
    let rank = 0;
    list.forEach((s, i) => {
      const prev = list[i - 1];
      const tied = prev && prev.points === s.points && prev.winRate === s.winRate &&
        prev.gamesWon - prev.gamesLost === s.gamesWon - s.gamesLost &&
        prev.setsWon - prev.setsLost === s.setsWon - s.setsLost;
      rank = tied ? rank : i + 1;
      s.rank = rank;
    });
    return list;
  }

  return { DEFAULT_SETTINGS, parseScore, decideWinner, formatScore, computeStandings };
});
