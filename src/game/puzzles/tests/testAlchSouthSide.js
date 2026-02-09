// src/tests/testAlchSouthSide.js
import assert from 'node:assert/strict';
import * as Portrait from '../game/puzzles/alchemist/alchPortraitBooks.js';
import * as Flasks from '../game/puzzles/alchemist/alchFlaskTransfer.js';

function runPortrait() {
  let s = Portrait.init();

  // Falsch -> reset
  let r = Portrait.apply(s, {
    objectId: 'alch:portrait_books',
    verb: 'press_book',
    data: { book: 'VERFALL' },
  }, 1000);
  assert.equal(r.ok, true);
  s = r.nextState;
  assert.equal(s.entered.length, 0);
  assert.equal(s.mistakes, 1);

  // Korrekt lösen
  for (const b of ['SALZ', 'SCHWEFEL', 'QUECKSILBER', 'VERFALL']) {
    r = Portrait.apply(s, {
      objectId: 'alch:portrait_books',
      verb: 'press_book',
      data: { book: b },
    }, 1100);
    assert.equal(r.ok, true);
    s = r.nextState;
  }

  assert.equal(s.solved, true);
  assert.equal(s.output.featherReady, true);
  assert.equal(s.output.goldNuggetReady, true);
}

function runFlasks() {
  let s = Flasks.init();

  // Falsch -> cooldown
  let r = Flasks.apply(s, {
    objectId: 'alch:flasks',
    verb: 'pour',
    data: { flask: 'AMETHYST' },
  }, 2000);
  assert.equal(r.ok, true);
  s = r.nextState;
  assert.equal(s.cooldownUntil, 5000);

  // Während cooldown -> Fehler
  r = Flasks.apply(s, {
    objectId: 'alch:flasks',
    verb: 'pour',
    data: { flask: 'RUBIN' },
  }, 3000);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'COOLDOWN_ACTIVE');

  // Nach cooldown korrekt lösen
  for (const f of ['RUBIN', 'CITRIN', 'SMARAGD', 'AMETHYST']) {
    r = Flasks.apply(s, {
      objectId: 'alch:flasks',
      verb: 'pour',
      data: { flask: f },
    }, 6000);
    assert.equal(r.ok, true);
    s = r.nextState;
  }

  assert.equal(s.solved, true);
  assert.equal(s.output.coalBlockReady, true);
  assert.equal(s.output.moonwortReady, true);
  assert.equal(s.output.matchesReady, true);
  assert.equal(s.output.greenLiquidReady, true);
}

runPortrait();
runFlasks();
console.log('✅ testAlchSouthSide passed');
