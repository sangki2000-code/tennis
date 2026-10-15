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

    // 정렬 기준: 승점 > 승률 > 게임 득실차 > 게임 득점 > 이름
    list.sort((a, b) =>
      b.points - a.points ||
      b.winRate - a.winRate ||
      (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost) ||
      b.gamesWon - a.gamesWon ||
      a.name.localeCompare(b.name, 'ko'));

    // 동률(승점·승률·게임 득실차·게임 득점 모두 같음)이면 같은 순위
    let rank = 0;
    list.forEach((s, i) => {
      const prev = list[i - 1];
      const tied = prev && prev.points === s.points && prev.winRate === s.winRate &&
        prev.gamesWon - prev.gamesLost === s.gamesWon - s.gamesLost &&
        prev.gamesWon === s.gamesWon;
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

  // ---------- 레이팅 (Elo) ----------
  // 모두 1500에서 시작. 복식은 팀 평균으로 예상 승률을 구하고, 같은 팀은 같은 점수를 주고받습니다.
  function computeElo(members, matches, opts) {
    const K = (opts && opts.k) || 32;
    const r = new Map(members.map((m) => [m.id, 1500]));
    const get = (id) => (r.has(id) ? r.get(id) : 1500);
    const ordered = [...matches].sort((x, y) => (x.date || '').localeCompare(y.date || '') || (x.createdAt || 0) - (y.createdAt || 0));
    for (const m of ordered) {
      const res = decideWinner(m.sets);
      const ra = m.teamA.reduce((t, id) => t + get(id), 0) / m.teamA.length;
      const rb = m.teamB.reduce((t, id) => t + get(id), 0) / m.teamB.length;
      const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
      const sa = res.winner === 'A' ? 1 : res.winner === 'B' ? 0 : 0.5;
      const delta = K * (sa - ea);
      m.teamA.forEach((id) => r.set(id, get(id) + delta));
      m.teamB.forEach((id) => r.set(id, get(id) - delta));
    }
    return r;
  }

  // ---------- 복식 대진표 ----------
  // players: 참석자 id 배열 (제외 대상은 미리 빼서 넘김)
  // rules: { partnerOf: { id: [허용 파트너 id...] }, rivalry: { teamA: [id,id], teamB: [id,id] } }
  // mode: 'rivalry' (네 명 모두면 팀 대항전만) | 'mix' (대항전과 지정 파트너 조를 번갈아)
  function makeDoublesDraw(opts) {
    const players = [...new Set(opts.players)];
    const courts = Math.max(1, Math.min(opts.courts || 1, Math.floor(players.length / 4)));
    const rounds = Math.max(1, Math.min(opts.rounds || 4, 20));
    const rules = opts.rules || {};
    const partnerOf = rules.partnerOf || {};
    const rating = opts.ratings || new Map();
    const rnd = opts.random || Math.random;
    const mode = opts.mode || 'mix';
    const rv = rules.rivalry && rules.rivalry.teamA && rules.rivalry.teamB ? rules.rivalry : null;
    const rvAll = rv ? rv.teamA.concat(rv.teamB) : [];
    if (players.length < 4) return { rounds: [], games: new Map(), error: 'need4' };

    const games = new Map(players.map((p) => [p, 0]));
    const lastRound = new Map(players.map((p) => [p, -1]));
    const partnered = new Map();
    const faced = new Map();
    const key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
    const inc = (map, k) => map.set(k, (map.get(k) || 0) + 1);
    const rate = (id) => (rating.has(id) ? rating.get(id) : 1500);
    let rivalryCount = 0, practiceCount = 0;

    // 지정 파트너 규칙: 그 사람이 경기에 있고 허용 파트너 중 누가 같은 경기에 있으면, 반드시 그중 한 명과 짝
    function pairingOk(t1, t2) {
      for (const [p, allowed] of Object.entries(partnerOf)) {
        const team = t1.includes(p) ? t1 : t2.includes(p) ? t2 : null;
        if (!team) continue;
        const four = t1.concat(t2);
        const avail = allowed.filter((a) => four.includes(a));
        if (avail.length && !avail.includes(team.find((x) => x !== p))) return false;
      }
      return true;
    }
    const isRivalry = (t1, t2) => rv && ((rv.teamA.every((x) => t1.includes(x)) && rv.teamB.every((x) => t2.includes(x))) ||
      (rv.teamA.every((x) => t2.includes(x)) && rv.teamB.every((x) => t1.includes(x))));

    function bestPairing(four) {
      const [a, b, c, d] = four;
      const options = [[[a, b], [c, d]], [[a, c], [b, d]], [[a, d], [b, c]]];
      const allRv = rv && rvAll.every((x) => four.includes(x));
      let best = null, bestScore = Infinity;
      for (const [t1, t2] of options) {
        if (!pairingOk(t1, t2)) continue;
        let sc = Math.abs((rate(t1[0]) + rate(t1[1])) / 2 - (rate(t2[0]) + rate(t2[1])) / 2) / 40;
        sc += 3 * ((partnered.get(key(t1[0], t1[1])) || 0) + (partnered.get(key(t2[0], t2[1])) || 0));
        for (const x of t1) for (const y of t2) sc += 0.5 * (faced.get(key(x, y)) || 0);
        if (allRv) {
          const riv = isRivalry(t1, t2);
          if (mode === 'rivalry' && !riv) continue;
          if (mode === 'mix') sc += riv ? (rivalryCount > practiceCount ? 6 : -6) : (rivalryCount > practiceCount ? -6 : 6);
        }
        sc += rnd() * 0.3;
        if (sc < bestScore) { bestScore = sc; best = [t1, t2]; }
      }
      return best ? { teams: best, score: bestScore } : null;
    }

    // 지정 파트너가 필요한 사람이 뽑혔는데 허용 파트너가 없으면, 참석한 허용 파트너를 넣어 줌
    function fixPartners(sel, pool) {
      for (const [p, allowed] of Object.entries(partnerOf)) {
        if (!sel.includes(p)) continue;
        if (allowed.some((a) => sel.includes(a))) continue;
        const cand = allowed.filter((a) => pool.includes(a) && !sel.includes(a)).sort((x, y) => games.get(x) - games.get(y));
        if (!cand.length) continue;
        const protectedIds = new Set(Object.keys(partnerOf).concat([p]));
        const out = sel.filter((x) => !protectedIds.has(x) && !allowed.includes(x)).sort((x, y) => games.get(y) - games.get(x))[0];
        if (out) sel[sel.indexOf(out)] = cand[0];
      }
      return sel;
    }

    function splitIntoGroups(sel) {
      if (sel.length === 4) { const bp = bestPairing(sel); return bp ? [bp] : null; }
      // 8명 → 4+4 나누기: 모든 조합 중 가장 좋은 것
      let best = null, bestScore = Infinity;
      const first = sel[0], rest = sel.slice(1);
      const combos = [];
      for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) for (let k = j + 1; k < rest.length; k++) combos.push([first, rest[i], rest[j], rest[k]]);
      for (const g1 of combos) {
        const g2 = sel.filter((x) => !g1.includes(x));
        const p1 = bestPairing(g1), p2 = bestPairing(g2);
        if (!p1 || !p2) continue;
        if (p1.score + p2.score < bestScore) { bestScore = p1.score + p2.score; best = [p1, p2]; }
      }
      return best;
    }

    const out = [];
    for (let r = 0; r < rounds; r++) {
      const order = players.slice().sort((x, y) => games.get(x) - games.get(y) || lastRound.get(x) - lastRound.get(y) || rnd() - 0.5);
      let sel = fixPartners(order.slice(0, courts * 4), players);
      let groups = splitIntoGroups(sel);
      if (!groups) { // 규칙상 안 되는 조합이면 다음 후보로 한 명씩 바꿔 가며 시도
        for (let i = courts * 4; i < order.length && !groups; i++) {
          for (let j = sel.length - 1; j >= 0 && !groups; j--) {
            const trial = sel.slice(); trial[j] = order[i];
            if (new Set(trial).size !== trial.length) continue;
            const g = splitIntoGroups(trial); if (g) { groups = g; sel = trial; }
          }
        }
      }
      if (!groups) break;
      const matches = groups.map((g) => {
        const [t1, t2] = g.teams;
        t1.concat(t2).forEach((p) => { inc(games, p); lastRound.set(p, r); });
        inc(partnered, key(t1[0], t1[1])); inc(partnered, key(t2[0], t2[1]));
        for (const x of t1) for (const y of t2) inc(faced, key(x, y));
        const riv = isRivalry(t1, t2);
        if (rv && rvAll.every((x) => t1.concat(t2).includes(x))) { if (riv) rivalryCount++; else practiceCount++; }
        return { teamA: t1, teamB: t2, rivalry: !!riv };
      });
      out.push(matches);
    }
    return { rounds: out, games };
  }

  return { DEFAULT_SETTINGS, parseScore, decideWinner, formatScore, computeStandings, listMonths, filterMatches, memberDetail, computeElo, makeDoublesDraw };
});
