// src/tests/testWestWallFlow.js
import assert from 'node:assert/strict';
import * as WestBox from '../alchemist_lab/alchWestCodeboxJigsaw.js';
import * as Ritual from '../alchemist_lab/alchKeyTransmutation.js';

function nextOf(res) {
  return res?.nextState ?? res?.state;
}

(function testWestCodeboxJigsaw() {
  let s = WestBox.init();

  // falscher Code
  let r = WestBox.apply(s, {
    objectId: 'alch:west-codebox',
    verb: 'enter_code',
    data: { code: '1111111' },
  });
  assert.equal(r.ok, true);
  s = nextOf(r);
  assert.equal(s.code.unlocked, false);
  assert.equal(s.code.attempts, 1);

  // richtiger Code
  r = WestBox.apply(s, {
    objectId: 'alch:west-codebox',
    verb: 'enter_code',
    data: { code: '2848693' },
  });
  assert.equal(r.ok, true);
  s = nextOf(r);
  assert.equal(s.code.unlocked, true);

  // Jigsaw lösen
  r = WestBox.apply(s, {
    objectId: 'alch:west-jigsaw',
    verb: 'set_layout',
    data: { tiles: [1,2,3,4,5,6,7,8,0] },
  });
  assert.equal(r.ok, true);
  s = nextOf(r);
  assert.equal(s.jigsaw.solved, true);
  assert.equal(s.output.blueRoseImageReady, true);
  assert.equal(s.solved, true);
})();

(function testRitualFlow() {
  let s = Ritual.init();

  // Reihenfolge
  let r = Ritual.apply(s, {
    objectId: 'alch:transmuter',
    verb: 'insert',
    data: { item: 'COAL_BLOCK' },
  });
  assert.equal(r.ok, true);
  s = nextOf(r);
  assert.equal(s.steps.symbolDrawn, true);

  r = Ritual.apply(s, {
    objectId: 'alch:transmuter',
    verb: 'insert',
    data: { item: 'BLUE_LIQUID' },
  });
  assert.equal(r.ok, true);
  s = nextOf(r);
  assert.equal(s.steps.blueApplied, true);

  r = Ritual.apply(s, {
    objectId: 'alch:transmuter',
    verb: 'insert',
    data: { item: 'GOLD_NUGGET' },
  });
  assert.equal(r.ok, true);
  s = nextOf(r);
  assert.equal(s.steps.goldPlaced, true);

  r = Ritual.apply(s, {
    objectId: 'alch:transmuter',
    verb: 'insert',
    data: { item: 'MATCHES' },
  });
  assert.equal(r.ok, true);
  s = nextOf(r);
  assert.equal(s.output.goldenKeyReady, true);
  assert.equal(s.solved, true);
})();

console.log('✅ testWestWallFlow passed');
