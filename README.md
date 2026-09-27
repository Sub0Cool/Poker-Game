# Poker Trainer

A local, six-handed No-Limit Texas Hold'em training game with five computer opponents and a post-hand Poker Coach.

## Run it

### Windows — easiest method

Double-click **Start Poker Trainer.bat**. It starts the game and opens it in your default browser. Keep the black terminal window open while playing; press `Ctrl+C` there to stop.

No installation is required.

### Command-line alternatives

From PowerShell, run `powershell -ExecutionPolicy Bypass -File tools/preview-server.ps1`. If Node.js is installed, `node tools/preview-server.mjs` also works.

The game is available at [http://127.0.0.1:4173](http://127.0.0.1:4173) while the launcher is running.

## Tests

Run `node --test tests/engine.test.mjs` to check hand ranking, comparisons, side pots, and split pots.

If npm is installed, the equivalent shortcuts are `npm start` and `npm test`.

## Version 1 features

- 100-big-blind stacks with rotating dealer, small blind, and big blind
- Preflop, flop, turn, and river betting with fold, check, call, bet, raise, and all-in handling
- Seven-card hand evaluation, side pots, and split pots
- Five opponents with different loose/tight and passive/aggressive tendencies
- Decision reviews that consider hand strength, position, pot odds, estimated equity, sizing, and aggression
- Session-level tendency tracking and a concise coaching report

The coach intentionally withholds recommendations until after the player acts.
