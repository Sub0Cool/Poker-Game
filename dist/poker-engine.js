export const RANKS = "23456789TJQKA";
export const SUITS = "cdhs";

export function createDeck(random = Math.random) {
  const deck = [];
  for (const rank of RANKS) for (const suit of SUITS) deck.push(rank + suit);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function straightHigh(values) {
  const unique = [...new Set(values)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);
  for (let i = 0; i <= unique.length - 5; i++) {
    if (unique[i] - unique[i + 4] === 4) return unique[i];
  }
  return 0;
}

export function evaluateFive(cards) {
  const values = cards.map(c => RANKS.indexOf(c[0]) + 2).sort((a, b) => b - a);
  const flush = cards.every(c => c[1] === cards[0][1]);
  const straight = straightHigh(values);
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  if (flush && straight) return { score: [8, straight], name: straight === 14 ? "Royal flush" : "Straight flush" };
  if (groups[0][1] === 4) return { score: [7, groups[0][0], groups[1][0]], name: "Four of a kind" };
  if (groups[0][1] === 3 && groups[1][1] === 2) return { score: [6, groups[0][0], groups[1][0]], name: "Full house" };
  if (flush) return { score: [5, ...values], name: "Flush" };
  if (straight) return { score: [4, straight], name: "Straight" };
  if (groups[0][1] === 3) return { score: [3, groups[0][0], ...groups.slice(1).map(g => g[0]).sort((a,b) => b-a)], name: "Three of a kind" };
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairs = [groups[0][0], groups[1][0]].sort((a,b) => b-a);
    return { score: [2, ...pairs, groups.find(g => g[1] === 1)[0]], name: "Two pair" };
  }
  if (groups[0][1] === 2) return { score: [1, groups[0][0], ...groups.slice(1).map(g => g[0]).sort((a,b) => b-a)], name: "Pair" };
  return { score: [0, ...values], name: "High card" };
}

function combinations(cards, size, start = 0, prefix = [], out = []) {
  if (prefix.length === size) { out.push(prefix); return out; }
  for (let i = start; i <= cards.length - (size - prefix.length); i++) combinations(cards, size, i + 1, [...prefix, cards[i]], out);
  return out;
}

export function compareScores(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const delta = (a[i] || 0) - (b[i] || 0);
    if (delta) return delta;
  }
  return 0;
}

export function evaluateHand(cards) {
  if (cards.length < 5) throw new Error("At least five cards are required");
  let best = null;
  for (const five of combinations(cards, 5)) {
    const result = evaluateFive(five);
    if (!best || compareScores(result.score, best.score) > 0) best = { ...result, cards: five };
  }
  return best;
}

export function settlePots(players, board, awardOrder = players.map(p => p.seat)) {
  const levels = [...new Set(players.map(p => p.totalContribution).filter(Boolean))].sort((a,b) => a-b);
  const payouts = Object.fromEntries(players.map(p => [p.seat, 0]));
  const pots = [];
  let previous = 0;
  for (const level of levels) {
    const contributors = players.filter(p => p.totalContribution >= level);
    const amount = (level - previous) * contributors.length;
    previous = level;
    if (!amount) continue;
    const eligible = contributors.filter(p => !p.folded);
    if (!eligible.length) continue;
    const scored = eligible.map(p => ({ player: p, result: evaluateHand([...p.hand, ...board]) }));
    let best = scored[0].result.score;
    for (const item of scored.slice(1)) if (compareScores(item.result.score, best) > 0) best = item.result.score;
    const winners = scored.filter(item => compareScores(item.result.score, best) === 0);
    const share = Math.floor(amount / winners.length);
    let remainder = amount % winners.length;
    const ordered = [...winners].sort((a,b) => awardOrder.indexOf(a.player.seat) - awardOrder.indexOf(b.player.seat));
    for (const item of ordered) payouts[item.player.seat] += share + (remainder-- > 0 ? 1 : 0);
    pots.push({ amount, winners: winners.map(w => w.player.seat), hand: winners[0].result.name });
  }
  return { payouts, pots };
}

export function chenScore([a, b]) {
  let va = RANKS.indexOf(a[0]) + 2, vb = RANKS.indexOf(b[0]) + 2;
  const high = Math.max(va, vb), low = Math.min(va, vb);
  const base = ({14:10,13:8,12:7,11:6,10:5}[high] ?? high / 2);
  let score = va === vb ? Math.max(5, base * 2) : base;
  if (a[1] === b[1]) score += 2;
  const gap = high - low - 1;
  score -= gap <= 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && high < 12 && va !== vb) score += 1;
  return Math.ceil(score);
}

export function estimateEquity(hole, board, opponents = 1, iterations = 180, random = Math.random) {
  const known = new Set([...hole, ...board]);
  const available = [];
  for (const rank of RANKS) for (const suit of SUITS) if (!known.has(rank + suit)) available.push(rank + suit);
  let equity = 0;
  for (let run = 0; run < iterations; run++) {
    const deck = [...available];
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    let cursor = 0;
    const villainHands = Array.from({length: opponents}, () => [deck[cursor++], deck[cursor++]]);
    const runout = [...board];
    while (runout.length < 5) runout.push(deck[cursor++]);
    const hero = evaluateHand([...hole, ...runout]).score;
    const scores = villainHands.map(h => evaluateHand([...h, ...runout]).score);
    const bestVillain = scores.reduce((best, score) => compareScores(score, best) > 0 ? score : best, scores[0]);
    const cmp = compareScores(hero, bestVillain);
    if (cmp > 0) equity += 1;
    else if (cmp === 0) equity += 1 / (1 + scores.filter(s => compareScores(s, hero) === 0).length);
  }
  return equity / iterations;
}
