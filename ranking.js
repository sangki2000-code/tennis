// 순수 계산 로직 (브라우저와 Node 양쪽에서 사용)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Ranking = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_SETTINGS = { winPoints: 3, drawPoints: 1, lossPoints: 1 };

  // "6-4, 3-6, 7-6(5)" -> [[6,4],[3,6],[7,6]]
  function parseScore(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('스코어를 입력하세요.');
    const sets = text.split(/[,\s]+/).filter(Boolean).map((part) => {
      const m = part.replace(/\(\d+\)/g, '').match(/^(\d{1,2})[-:](\d{1,2})$/);
      if (!m) throw new Error(`스코어 형식이 잘못되었습니다: "${part}" (예: 6-4, 3-6, 7-5)`);
      const a = Number(m[1]);
      const b = Number(m[2]);
      return [a, b];
    });
    return sets;
  }

  // 세트를 더 많이 딴 쪽이 승리. 세트 수가 같으면 게임 수로 판정.
  // 세트 수와 게임 수가 모두 같으면 무승부(winner 'D'). 동점 세트(예: 5-5)는 어느 쪽 세트로도 세지 않습니다.
  function decideWinner(sets) {
    if (!sets || !sets.length) throw new Error('스코어를 입력하세요.');
    let setsA = 0, setsB = 0, gamesA = 0, gamesB = 0;
    for (const [a, b] of sets) {
      if (a > b) setsA++; else if (b > a) setsB++;
      gamesA += a; gamesB += b;
    }
    if (setsA !== setsB) return { winner: setsA > setsB ? 'A' : 'B', setsA, setsB, gamesA, gamesB };
    if (gamesA !== gamesB) return { winner: gamesA > gamesB ? 'A' : 'B', setsA, setsB, gamesA, gamesB };
    return { winner: 'D', setsA, setsB, gamesA, gamesB };
  }

  // 한쪽 기준 결과: 'W' 승, 'D' 무, 'L' 패
  function resultFor(r, side) {
    return r.winner === 'D' ? 'D' : r.winner === side ? 'W' : 'L';
  }

  function formatScore(sets) {
    return sets.map(([a, b]) => `${a}-${b}`).join(', ');
  }

  function emptyStats(member) {
    return {
      id: member.id, name: member.name,
      played: 0, wins: 0, draws: 0, losses: 0,
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
        { ids: match.teamA, res: resultFor(r, 'A'), sw: r.setsA, sl: r.setsB, gw: r.gamesA, gl: r.gamesB },
        { ids: match.teamB, res: resultFor(r, 'B'), sw: r.setsB, sl: r.setsA, gw: r.gamesB, gl: r.gamesA },
      ];
      for (const side of sides) {
        for (const id of side.ids) {
          const s = table.get(id);
          if (!s) continue; // 삭제된 멤버
          s.played++;
          if (side.res === 'W') { s.wins++; s.points += cfg.winPoints; }
          else if (side.res === 'D') { s.draws++; s.points += cfg.drawPoints; }
          else { s.losses++; s.points += cfg.lossPoints; }
          s.setsWon += side.sw; s.setsLost += side.sl;
          s.gamesWon += side.gw; s.gamesLost += side.gl;
          s.recent.push(side.res);
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

  // 'YYYY-MM' 목록 (최신순)
  function listMonths(matches) {
    return [...new Set(matches.map((m) => (m.date || '').slice(0, 7)).filter(Boolean))].sort().reverse();
  }

  // filter: { month: 'YYYY-MM' | '', type: 'single' | 'double' | '' }
  function filterMatches(matches, filter) {
    const f = filter || {};
    return matches.filter((m) =>
      (!f.month || (m.date || '').startsWith(f.month)) &&
      (!f.type || (f.type === 'double') === (m.teamA.length > 1)));
  }

  function newRecord() { return { played: 0, wins: 0, draws: 0, losses: 0, gamesWon: 0, gamesLost: 0 }; }
  function addResult(rec, res, gw, gl) {
    rec.played++;
    if (res === 'W') rec.wins++; else if (res === 'D') rec.draws++; else rec.losses++;
    rec.gamesWon += gw; rec.gamesLost += gl;
  }

  // 한 멤버의 상세 기록: 단식/복식 성적, 상대 전적, 파트너 기록, 월별 성적, 연승/연패
  function memberDetail(memberId, matches) {
    const ordered = [...matches].sort((x, y) => (x.date || '').localeCompare(y.date || '') || (x.createdAt || 0) - (y.createdAt || 0));
    const total = newRecord(), singles = newRecord(), doubles = newRecord();
    const opponents = new Map(), partners = new Map(), months = new Map();
    const history = [];
    for (const m of ordered) {
      const side = m.teamA.includes(memberId) ? 'A' : m.teamB.includes(memberId) ? 'B' : null;
      if (!side) continue;
      const r = decideWinner(m.sets);
      const res = resultFor(r, side);
      const gw = side === 'A' ? r.gamesA : r.gamesB, gl = side === 'A' ? r.gamesB : r.gamesA;
      const mine = side === 'A' ? m.teamA : m.teamB, theirs = side === 'A' ? m.teamB : m.teamA;
      const isDouble = m.teamA.length > 1;
      addResult(total, res, gw, gl);
      addResult(isDouble ? doubles : singles, res, gw, gl);
      for (const id of theirs) {
        if (!opponents.has(id)) opponents.set(id, { id, total: newRecord(), singles: newRecord(), doubles: newRecord() });
        const o = opponents.get(id);
        addResult(o.total, res, gw, gl);
        addResult(isDouble ? o.doubles : o.singles, res, gw, gl);
      }
      for (const id of mine) {
        if (id === memberId) continue;
        if (!partners.has(id)) partners.set(id, Object.assign({ id }, newRecord()));
        addResult(partners.get(id), res, gw, gl);
      }
      const mk = (m.date || '').slice(0, 7);
      if (!months.has(mk)) months.set(mk, Object.assign({ month: mk }, newRecord()));
      addResult(months.get(mk), res, gw, gl);
      history.push(res);
    }
    let streak = null;
    if (history.length) {
      const last = history[history.length - 1];
      let n = 0;
      for (let i = history.length - 1; i >= 0 && history[i] === last; i--) n++;
      streak = { type: last, count: n };
    }
    let best = 0, cur = 0;
    for (const h of history) { cur = h === 'W' ? cur + 1 : 0; best = Math.max(best, cur); }
    const byPlayed = (a, b) => (b.total ? b.total.played - a.total.played : b.played - a.played);
    return {
      total, singles, doubles, streak, bestWinStreak: best,
      opponents: [...opponents.values()].sort(byPlayed),
      partners: [...partners.values()].sort(byPlayed),
      months: [...months.values()].sort((a, b) => b.month.localeCompare(a.month)),
    };
  }

  return { DEFAULT_SETTINGS, parseScore, decideWinner, formatScore, computeStandings, listMonths, filterMatches, memberDetail };
});
