import assert from "node:assert/strict";
import { evaluateHand, compareScores, settlePots, chenScore } from "../dist/poker-engine.js";

const hand = cards => evaluateHand(cards.split(" "));
assert.equal(hand("As Ks Qs Js Ts 2d 3c").name, "Royal flush");
assert.equal(hand("Ah Ad Ac As 2d 3c 4h").name, "Four of a kind");
assert.equal(hand("Ah 2d 3c 4s 5h Kd Qd").name, "Straight");
assert.ok(compareScores(hand("Ah Ad Kc Qs 9h 3d 2c").score, hand("Kh Kd Ac Qs 9h 3d 2c").score) > 0);
assert.ok(chenScore(["As", "Ah"]) > chenScore(["7c", "2d"]));

const board = ["2c", "3d", "4h", "5s", "9c"];
const players = [
  { seat: 0, hand: ["As", "Kd"], totalContribution: 100, folded: false },
  { seat: 1, hand: ["Qs", "Qd"], totalContribution: 200, folded: false },
  { seat: 2, hand: ["Jh", "Jc"], totalContribution: 200, folded: false }
];
const result = settlePots(players, board, [0,1,2]);
assert.equal(result.pots.length, 2);
assert.equal(result.payouts[0], 300); // wheel wins main
assert.equal(result.payouts[1], 200); // queens win side

const split = settlePots([
  { seat: 0, hand: ["As", "Kd"], totalContribution: 5, folded: false },
  { seat: 1, hand: ["Ah", "Kc"], totalContribution: 5, folded: false }
], ["Qs", "Jd", "Tc", "2h", "3c"], [1,0]);
assert.equal(split.payouts[0], 5);
assert.equal(split.payouts[1], 5);
console.log("Poker engine tests passed");
