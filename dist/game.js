import { createDeck, evaluateHand, settlePots, chenScore, estimateEquity } from "./poker-engine.js";

const BB = 2;
const BUY_IN = 100 * BB;
const names = ["You", "Maya", "Theo", "Rina", "Cal", "June"];
const styles = [null,
  { name: "Tight", looseness: -.08, aggression: .48 },
  { name: "Aggressive", looseness: .05, aggression: .78 },
  { name: "Patient", looseness: -.04, aggression: .38 },
  { name: "Loose", looseness: .14, aggression: .55 },
  { name: "Balanced", looseness: 0, aggression: .6 }
];

const state = {
  players: names.map((name, seat) => ({ name, seat, human: seat === 0, style: styles[seat], stack: BUY_IN, hand: [], folded: false, allIn: false, streetBet: 0, totalContribution: 0 })),
  deck: [], board: [], dealer: 5, smallBlind: null, bigBlind: null, street: "preflop", currentBet: 0, minRaise: BB,
  actor: null, pending: new Set(), handOver: true, reveal: false, handNumber: 0, token: 0,
  decisions: [], handDecisions: [], startStack: BUY_IN,
  stats: { decisions: 0, preflop: 0, vpip: 0, limps: 0, calls: 0, raises: 0, folds: 0, postflopPassive: 0, overbets: 0, missedValue: 0 }
};

const $ = selector => document.querySelector(selector);
const els = {
  pot: $("#pot"), board: $("#board"), street: $("#street"), message: $("#action-message"), eyebrow: $("#action-eyebrow"),
  buttons: $("#action-buttons"), betControl: $("#bet-control"), range: $("#bet-range"), input: $("#bet-input"), betValue: $("#bet-value"),
  coach: $("#coach-live"), review: $("#review"), list: $("#decision-list"), result: $("#hand-result"), next: $("#next-hand"),
  tendencies: $("#tendency-list"), decisionCount: $("#decision-count"), hands: $("#hands-played"), sessionResult: $("#session-result"),
  dialog: $("#session-dialog"), report: $("#session-report")
};

function activePlayers() { return state.players.filter(p => !p.folded && (p.stack > 0 || p.totalContribution > 0)); }
function livePlayers() { return state.players.filter(p => !p.folded); }
function potSize() { return state.players.reduce((sum, p) => sum + p.totalContribution, 0); }
function money(amount) { return `$${Number(amount).toLocaleString("en-US")}`; }
function signedMoney(amount) { return `${amount >= 0 ? "+" : "−"}$${Math.abs(amount).toLocaleString("en-US")}`; }
function nextSeat(from, predicate = () => true) {
  for (let step = 1; step <= state.players.length; step++) {
    const seat = (from + step) % state.players.length;
    if (predicate(state.players[seat])) return seat;
  }
  return null;
}
function actionOrderFrom(from) {
  const order = [];
  for (let i = 1; i <= 6; i++) order.push((from + i) % 6);
  return order;
}

function cardHTML(card, hidden = false) {
  if (hidden) return `<span class="card back" aria-label="Hidden card">?</span>`;
  const suits = { c: "♣", d: "♦", h: "♥", s: "♠" };
  const red = card[1] === "d" || card[1] === "h";
  return `<span class="card ${red ? "red" : ""}" aria-label="${card[0]} of ${card[1]}">${card[0]}${suits[card[1]]}</span>`;
}

function positionLabel(seat) {
  if (seat === state.dealer) return "D";
  if (seat === state.smallBlind) return "SB";
  if (seat === state.bigBlind) return "BB";
  return "";
}

function render() {
  for (const p of state.players) {
    const seat = document.querySelector(`[data-seat="${p.seat}"]`);
    seat.className = `seat seat-${p.seat}${state.actor === p.seat && !state.handOver ? " active" : ""}${p.folded ? " folded" : ""}`;
    const show = p.human || state.reveal;
    const cards = p.hand.length ? p.hand.map(c => cardHTML(c, !show)).join("") : "";
    const badge = positionLabel(p.seat);
    const turn = state.actor === p.seat && !state.handOver;
    const betChips = p.streetBet ? `<div class="seat-bet" aria-label="${p.name} has ${money(p.streetBet)} in front"><span class="chip-stack" aria-hidden="true"><i></i><i></i><i></i></span><strong>${money(p.streetBet)}</strong></div>` : "";
    seat.innerHTML = `<div class="cards">${cards}</div><div class="player-box"><div class="player-name">${p.name}${badge ? `<span class="position-badge">${badge}</span>` : ""}${turn ? `<span class="turn-indicator">Action</span>` : ""}</div><div class="stack">${money(p.stack)}${p.allIn ? " · ALL IN" : ""}</div>${p.lastAction ? `<div class="last-action">${p.lastAction}</div>` : ""}${betChips}</div>`;
  }
  els.pot.textContent = money(potSize());
  els.board.innerHTML = state.board.map(c => cardHTML(c)).join("");
  els.street.textContent = state.street[0].toUpperCase() + state.street.slice(1);
  els.hands.textContent = state.handNumber;
  const delta = state.players[0].stack - state.startStack;
  els.sessionResult.textContent = signedMoney(delta);
  updateControls();
}

function updateControls() {
  const humanTurn = !state.handOver && state.actor === 0;
  [...els.buttons.querySelectorAll("button")].forEach(b => b.disabled = !humanTurn);
  if (!humanTurn) {
    els.betControl.classList.add("hidden");
    if (state.handOver) { els.eyebrow.textContent = "HAND COMPLETE"; els.message.textContent = "Review the hand with your coach."; }
    if (!state.handOver && state.actor !== null) { els.eyebrow.textContent = "TABLE ACTION"; els.message.textContent = `${state.players[state.actor].name} is thinking…`; }
    return;
  }
  const p = state.players[0], toCall = Math.max(0, state.currentBet - p.streetBet);
  const fold = els.buttons.querySelector('[data-action="fold"]');
  const checkCall = els.buttons.querySelector('[data-action="checkcall"]');
  const betRaise = els.buttons.querySelector('[data-action="betraise"]');
  fold.disabled = toCall === 0;
  checkCall.textContent = toCall ? `Call ${money(Math.min(toCall, p.stack))}` : "Check";
  const minTo = state.currentBet ? state.currentBet + state.minRaise : BB;
  const maxTo = p.streetBet + p.stack;
  const canRaise = maxTo > state.currentBet;
  betRaise.disabled = !canRaise;
  betRaise.textContent = state.currentBet ? "Raise" : "Bet";
  els.betControl.classList.toggle("hidden", !canRaise);
  const practicalMin = Math.min(minTo, maxTo);
  els.range.min = practicalMin; els.range.max = maxTo; els.range.value = Math.min(Math.max(Number(els.range.value), practicalMin), maxTo);
  els.input.min = practicalMin; els.input.max = maxTo; els.input.value = els.range.value; els.betValue.textContent = money(els.range.value);
  els.eyebrow.textContent = "YOUR ACTION";
  els.message.textContent = toCall ? `${money(toCall)} to call · Pot ${money(potSize())}` : `Check or bet · Pot ${money(potSize())}`;
}

function commit(p, amount) {
  const paid = Math.min(amount, p.stack);
  p.stack -= paid; p.streetBet += paid; p.totalContribution += paid;
  if (p.stack === 0) p.allIn = true;
  return paid;
}

function postBlind(seat, amount) { commit(state.players[seat], amount); }

function startHand() {
  state.token++;
  state.handNumber++;
  state.handOver = false; state.reveal = false; state.board = []; state.street = "preflop"; state.currentBet = BB; state.minRaise = BB; state.handDecisions = [];
  for (const p of state.players) {
    if (p.stack < BB) p.stack = BUY_IN;
    Object.assign(p, { hand: [], folded: false, allIn: false, streetBet: 0, totalContribution: 0, lastAction: "" });
  }
  state.deck = createDeck();
  state.dealer = nextSeat(state.dealer, p => p.stack > 0);
  state.smallBlind = nextSeat(state.dealer, p => p.stack > 0);
  state.bigBlind = nextSeat(state.smallBlind, p => p.stack > 0);
  for (let round = 0; round < 2; round++) for (const p of state.players) p.hand.push(state.deck.pop());
  postBlind(state.smallBlind, 1); postBlind(state.bigBlind, BB);
  state.pending = new Set(state.players.filter(p => !p.allIn).map(p => p.seat));
  state.actor = nextSeat(state.bigBlind, p => state.pending.has(p.seat));
  els.review.classList.add("hidden"); els.coach.classList.remove("hidden");
  els.coach.innerHTML = `<p>Recommendations stay hidden until the hand is over. Focus on position, the price you’re getting, and what worse hands can continue.</p>`;
  render(); runActor();
}

function normalizedStrength(p) {
  if (state.street === "preflop") return Math.max(0, Math.min(1, (chenScore(p.hand) - 2) / 14));
  const opponents = Math.max(1, livePlayers().length - 1);
  return estimateEquity(p.hand, state.board, opponents, 70);
}

function botChoice(p) {
  const toCall = Math.max(0, state.currentBet - p.streetBet);
  const pot = potSize();
  const odds = toCall ? toCall / (pot + toCall) : 0;
  const strength = normalizedStrength(p);
  const adjusted = strength + p.style.looseness + (Math.random() - .5) * .12;
  const maxTo = p.streetBet + p.stack;
  const minTo = state.currentBet ? state.currentBet + state.minRaise : BB;
  if (toCall && adjusted < odds + .08) return { type: "fold" };
  const raiseChance = p.style.aggression * (adjusted > .58 ? .8 : adjusted > .42 ? .22 : .04);
  if (maxTo > state.currentBet && Math.random() < raiseChance) {
    const target = Math.min(maxTo, Math.max(minTo, state.currentBet + Math.round((pot + toCall) * (adjusted > .72 ? .8 : .55))));
    return { type: "raise", target };
  }
  if (toCall) return { type: "call" };
  if (maxTo > 0 && adjusted > .48 && Math.random() < p.style.aggression * .55) return { type: "raise", target: Math.min(maxTo, Math.max(BB, Math.round(pot * .6))) };
  return { type: "check" };
}

function runActor() {
  if (state.handOver || state.actor === null) return;
  const p = state.players[state.actor];
  if (p.human) { render(); return; }
  const token = state.token;
  render();
  window.setTimeout(() => { if (token === state.token && !state.handOver && state.actor === p.seat) applyAction(p.seat, botChoice(p)); }, 420 + Math.random() * 380);
}

function applyAction(seat, action) {
  if (state.handOver || seat !== state.actor) return false;
  const p = state.players[seat];
  const toCall = Math.max(0, state.currentBet - p.streetBet);
  const before = { street: state.street, toCall, pot: potSize(), currentBet: state.currentBet, position: positionName(seat), active: livePlayers().length };
  let aggressive = false, label = "";
  if (action.type === "fold") { if (!toCall) return false; p.folded = true; label = "Fold"; }
  else if (action.type === "check") { if (toCall) return false; label = "Check"; }
  else if (action.type === "call") { if (!toCall) return applyAction(seat, { type: "check" }); const paid = commit(p, toCall); label = `Call ${money(paid)}`; }
  else if (action.type === "raise") {
    const maxTo = p.streetBet + p.stack;
    let target = Math.max(0, Math.min(Math.round(action.target), maxTo));
    if (target <= state.currentBet) return toCall ? applyAction(seat, { type: "call" }) : applyAction(seat, { type: "check" });
    const minTo = state.currentBet ? state.currentBet + state.minRaise : BB;
    if (target < minTo && target < maxTo) target = minTo;
    const oldBet = state.currentBet;
    commit(p, target - p.streetBet);
    const raiseSize = target - oldBet;
    if (raiseSize >= state.minRaise) state.minRaise = raiseSize;
    state.currentBet = target; aggressive = true; label = `${oldBet ? "Raise to" : "Bet"} ${money(target)}`;
  } else return false;

  if (p.human) coachDecision(p, action, before);
  p.lastAction = label;
  state.pending.delete(seat);
  if (aggressive) state.pending = new Set(state.players.filter(q => !q.folded && !q.allIn && q.seat !== seat).map(q => q.seat));
  if (livePlayers().length === 1) { awardUncontested(); return true; }
  if (!state.pending.size) { advanceStreet(); return true; }
  state.actor = nextSeat(seat, q => state.pending.has(q.seat));
  render(); runActor(); return true;
}

function advanceStreet() {
  if (state.street === "river" || state.players.filter(p => !p.folded && !p.allIn).length <= 1) { runoutAndShowdown(); return; }
  const next = { preflop: "flop", flop: "turn", turn: "river" }[state.street];
  state.street = next;
  if (next === "flop") state.board.push(state.deck.pop(), state.deck.pop(), state.deck.pop()); else state.board.push(state.deck.pop());
  for (const p of state.players) { p.streetBet = 0; p.lastAction = ""; }
  state.currentBet = 0; state.minRaise = BB;
  state.pending = new Set(state.players.filter(p => !p.folded && !p.allIn).map(p => p.seat));
  state.actor = nextSeat(state.dealer, p => state.pending.has(p.seat));
  render(); runActor();
}

function runoutAndShowdown() {
  while (state.board.length < 5) state.board.push(state.deck.pop());
  state.reveal = true;
  const order = actionOrderFrom(state.dealer);
  const settled = settlePots(state.players, state.board, order);
  for (const p of state.players) { p.stack += settled.payouts[p.seat] || 0; p.streetBet = 0; }
  const winningSeats = [...new Set(settled.pots.flatMap(p => p.winners))];
  const summary = settled.pots.length === 1
    ? `${winningSeats.map(s => state.players[s].name).join(" & ")} won ${money(settled.pots[0].amount)} with ${settled.pots[0].hand.toLowerCase()}.`
    : `${settled.pots.length} pots were awarded: ${settled.pots.map(p => `${money(p.amount)} to ${p.winners.map(s => state.players[s].name).join(" & ")}`).join("; ")}.`;
  finishHand(summary);
}

function awardUncontested() {
  const winner = livePlayers()[0], pot = potSize();
  winner.stack += pot;
  for (const p of state.players) p.streetBet = 0;
  finishHand(`${winner.name} won ${money(pot)} without a showdown.`);
}

function finishHand(summary) {
  state.handOver = true; state.actor = null; state.pending.clear();
  for (const p of state.players) p.totalContribution = 0;
  els.result.textContent = summary;
  els.coach.classList.add("hidden"); els.review.classList.remove("hidden");
  renderReview(); renderTendencies(); render();
}

function positionName(seat) {
  if (seat === state.dealer) return "button";
  if (seat === state.smallBlind) return "small blind";
  if (seat === state.bigBlind) return "big blind";
  const order = actionOrderFrom(state.bigBlind);
  const index = order.indexOf(seat);
  return index === 0 ? "under the gun" : index === 1 ? "middle position" : "cutoff";
}

function coachDecision(p, action, context) {
  const stats = state.stats; stats.decisions++;
  const strength = state.street === "preflop" ? Math.max(0, Math.min(1, (chenScore(p.hand) - 2) / 14)) : estimateEquity(p.hand, state.board, Math.max(1, context.active - 1), 150);
  const potOdds = context.toCall ? context.toCall / (context.pot + context.toCall) : 0;
  const late = context.position === "button" || context.position === "cutoff";
  const made = state.board.length >= 3 ? evaluateHand([...p.hand, ...state.board]) : null;
  const strong = strength > (state.street === "preflop" ? (late ? .42 : .52) : .58);
  const marginal = strength > Math.max(.25, potOdds - .03);
  let grade = "Reasonable", explanation = "This choice is defensible, though another line could also work.";

  if (state.street === "preflop") {
    stats.preflop++;
    if (action.type !== "fold" && context.toCall > 0) stats.vpip++;
    if (action.type === "call" && context.currentBet === BB) stats.limps++;
  }
  if (action.type === "fold") stats.folds++;
  if (action.type === "call") stats.calls++;
  if (action.type === "raise") stats.raises++;

  if (action.type === "fold") {
    if (strong || strength > potOdds + .16) { grade = "Likely Mistake"; explanation = `Your estimated equity was about ${Math.round(strength*100)}%, comfortably above the ${Math.round(potOdds*100)}% price to continue. Folding gives up too much here.`; }
    else if (marginal && late) { grade = "Questionable"; explanation = "In late position this hand can often continue, especially when the price is modest. Folding is safe but may be too cautious."; }
    else { grade = "Good"; explanation = `Folding protects your stack when the hand's estimated equity (${Math.round(strength*100)}%) does not justify the price.`; }
  } else if (action.type === "call") {
    if (strength + .04 < potOdds) { grade = "Likely Mistake"; explanation = `You needed about ${Math.round(potOdds*100)}% equity to call, while this hand was estimated near ${Math.round(strength*100)}%. The call is likely losing chips over time.`; }
    else if (strong && context.toCall > 0) { grade = "Questionable"; explanation = "Calling keeps weaker hands in, but this hand is strong enough to consider raising for value and building the pot."; stats.postflopPassive++; }
    else { grade = "Reasonable"; explanation = `The call fits the pot odds: about ${Math.round(potOdds*100)}% was required and the hand was estimated around ${Math.round(strength*100)}%.`; }
  } else if (action.type === "check") {
    if (strong && state.street !== "preflop") { grade = "Questionable"; explanation = `With roughly ${Math.round(strength*100)}% estimated equity, betting could earn value from worse hands. Checking is still reasonable for pot control or deception.`; stats.missedValue++; }
    else { grade = "Good"; explanation = "Checking keeps the pot manageable when there is no clear value bet and avoids forcing action with a marginal hand."; }
  } else if (action.type === "raise") {
    const target = Math.min(Number(action.target) || 0, p.streetBet + p.stack);
    const added = Math.max(0, target - context.currentBet);
    if (!strong && strength < .34 && context.toCall) { grade = "Questionable"; explanation = "This raise is a bluff with limited hand strength. It can work, but it needs credible pressure and opponents capable of folding."; }
    else if (strong) { grade = "Good"; explanation = `Aggression makes sense with about ${Math.round(strength*100)}% estimated equity. The sizing pressures draws and gets value from worse hands.`; }
    else { grade = "Reasonable"; explanation = "The aggressive line can win immediately and build the pot when called, but a smaller-pot line was also available."; }
    if (context.pot && added > context.pot * 1.35) { stats.overbets++; if (grade === "Good") grade = "Reasonable"; explanation += " The size is large relative to the pot, so make sure worse hands can still call."; }
  }
  const decision = { street: state.street, action: action.type === "raise" ? `${context.currentBet ? "Raise" : "Bet"} to ${money(action.target)}` : action.type[0].toUpperCase() + action.type.slice(1), grade, explanation };
  state.handDecisions.push(decision); state.decisions.push(decision);
}

function renderReview() {
  els.list.innerHTML = state.handDecisions.length ? state.handDecisions.map(d => {
    const cls = d.grade === "Good" ? "good" : d.grade === "Reasonable" ? "reasonable" : d.grade === "Questionable" ? "questionable" : "mistake";
    return `<article class="decision"><div class="decision-top"><strong>${d.street[0].toUpperCase()+d.street.slice(1)} · ${d.action}</strong><span class="grade ${cls}">${d.grade}</span></div><p>${d.explanation}</p></article>`;
  }).join("") : `<p class="muted">You did not face a decision in this hand.</p>`;
}

function tendencyRows() {
  const s = state.stats, rows = [];
  if (s.preflop >= 3) {
    const vpip = s.vpip / s.preflop;
    rows.push(["Starting-hand selection", vpip > .45 ? "Playing very loose" : vpip < .16 ? "Quite selective" : "Balanced so far"]);
    if (s.limps >= 2) rows.push(["Open limping", `${s.limps} passive entries`]);
  }
  if (s.calls + s.raises >= 3) rows.push(["Aggression", s.calls > s.raises * 2 ? "Calling more than raising" : "Applying healthy pressure"]);
  if (s.overbets) rows.push(["Bet sizing", `${s.overbets} oversized bet${s.overbets > 1 ? "s" : ""}`]);
  if (s.missedValue >= 2) rows.push(["Value betting", `${s.missedValue} possible missed bets`]);
  return rows.slice(0, 4);
}

function renderTendencies() {
  els.decisionCount.textContent = `${state.stats.decisions} decision${state.stats.decisions === 1 ? "" : "s"}`;
  const rows = tendencyRows();
  els.tendencies.innerHTML = rows.length ? rows.map(([a,b]) => `<div class="tendency"><span>${a}</span><em>${b}</em></div>`).join("") : `<p class="muted">Patterns will appear after a few decisions.</p>`;
}

function showSessionReport() {
  const s = state.stats, notes = [];
  if (s.preflop >= 3) notes.push(s.vpip / s.preflop > .45 ? "Tighten your preflop range, especially from early position." : "Your starting-hand selection has been reasonably disciplined.");
  if (s.calls > s.raises * 2 && s.calls >= 3) notes.push("Look for more spots to raise for value instead of defaulting to calls."); else if (s.raises >= 2) notes.push("You have shown useful aggression rather than relying only on passive lines.");
  if (s.missedValue >= 2) notes.push("When you are likely ahead, ask which worse hands could pay off a value bet.");
  if (s.overbets) notes.push("A few bets were very large; choose sizes that keep worse hands interested.");
  if (!notes.length) notes.push("Play a few more hands to build a reliable coaching sample.");
  while (notes.length < 3) notes.push(notes.length === 1 ? "Keep comparing the call price with your likely equity." : "Use position to widen carefully and apply pressure later in the hand.");
  els.report.innerHTML = `<ul>${notes.slice(0,3).map(n => `<li>${n}</li>`).join("")}</ul>`;
  els.dialog.showModal();
}

function resetSession() {
  state.token++; state.handNumber = 0; state.decisions = []; state.startStack = BUY_IN;
  state.stats = { decisions: 0, preflop: 0, vpip: 0, limps: 0, calls: 0, raises: 0, folds: 0, postflopPassive: 0, overbets: 0, missedValue: 0 };
  for (const p of state.players) p.stack = BUY_IN;
  els.dialog.close(); renderTendencies(); startHand();
}

els.range.addEventListener("input", () => { els.input.value = els.range.value; els.betValue.textContent = money(els.range.value); });
els.input.addEventListener("input", () => { const value = Math.max(Number(els.input.min), Math.min(Number(els.input.max), Number(els.input.value))); els.range.value = value; els.betValue.textContent = money(value); });
els.buttons.addEventListener("click", event => {
  const type = event.target.dataset.action; if (!type || state.actor !== 0) return;
  const p = state.players[0], toCall = Math.max(0, state.currentBet - p.streetBet);
  if (type === "fold") applyAction(0, { type: "fold" });
  if (type === "checkcall") applyAction(0, { type: toCall ? "call" : "check" });
  if (type === "betraise") applyAction(0, { type: "raise", target: Number(els.input.value) });
});
els.next.addEventListener("click", startHand);
$("#new-session").addEventListener("click", showSessionReport);
$("#keep-playing").addEventListener("click", () => els.dialog.close());
$("#reset-session").addEventListener("click", resetSession);

function registerWebMCP() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const tools = [
    { name: "read_poker_table", title: "Read poker table", description: "Read the current public table state and the human player's cards and legal actions.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: () => ({ street: state.street, board: state.board, holeCards: state.players[0].hand, pot: potSize(), stack: state.players[0].stack, isHumanTurn: state.actor === 0, toCall: Math.max(0, state.currentBet - state.players[0].streetBet) }) },
    { name: "take_poker_action", title: "Take poker action", description: "Take a legal fold, check, call, bet, or raise action for the human player.", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["fold","check","call","bet","raise"] }, amount: { type: "number", minimum: 1 } }, required: ["action"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: input => { if (state.actor !== 0) throw new Error("It is not the human player's turn"); const kind = input.action === "bet" ? "raise" : input.action; if (!applyAction(0, { type: kind, target: input.amount })) throw new Error("Illegal action"); return { accepted: true, action: input.action, amount: input.amount ?? null }; } }
  ];
  for (const tool of tools) try { Promise.resolve(context.registerTool(tool)).catch(() => {}); } catch { /* unsupported experimental API */ }
}

registerWebMCP();
startHand();
