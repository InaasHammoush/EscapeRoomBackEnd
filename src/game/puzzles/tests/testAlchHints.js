// src/tests/testAlchHints.js
import assert from 'node:assert/strict';
import * as HintB1 from '../game/puzzles/hints/alchHintB1.js';
import * as HintB2 from '../game/puzzles/hints/alchHintB2.js';

/**
 * makeResult-Adapter:
 * Je nach fsm.js kann der Folgezustand in res.nextState ODER res.state liegen.
 */
function getNextState(res) {
  return res?.nextState ?? res?.state ?? null;
}

function mustOk(res, msg = 'Expected ok=true') {
  assert.equal(res?.ok, true, `${msg}. Got error=${res?.error ?? 'unknown'}`);
  const next = getNextState(res);
  assert.ok(next, 'Result enthält keinen Folgezustand (nextState/state fehlt).');
  return next;
}

function mustFail(res, expectedError, msg = 'Expected ok=false') {
  assert.equal(res?.ok, false, msg);
  assert.equal(
    res?.error,
    expectedError,
    `Expected error=${expectedError}, got=${res?.error}`
  );
}

function act(mod, state, objectId, verb, data = {}) {
  return mod.apply(
    state,
    { objectId, verb, data, actionId: `t-${Date.now()}-${Math.random()}` },
    Date.now()
  );
}

function testB1() {
  console.log('--- Test B1 (alch:hint:b1) ---');

  let s = HintB1.init();
  let p = HintB1.exportPublic(s);

  // Initialzustand
  assert.equal(p.discovered, false);
  assert.equal(p.hintLevel, 0);
  assert.equal(p.share.enabled, false);
  assert.equal(p.text, null);

  // request_hint vor inspect -> Fehler
  let r = act(HintB1, s, 'alch:hint:b1', 'request_hint');
  mustFail(r, 'HINT_NOT_DISCOVERED', 'B1 request_hint vor inspect sollte fehlschlagen');

  // inspect -> discovered + level 1
  r = act(HintB1, s, 'alch:hint:b1', 'inspect');
  s = mustOk(r, 'B1 inspect sollte funktionieren');
  p = HintB1.exportPublic(s);
  assert.equal(p.discovered, true);
  assert.equal(p.hintLevel, 1);
  assert.ok(typeof p.text === 'string' && p.text.length > 0);

  // level 2
  r = act(HintB1, s, 'alch:hint:b1', 'request_hint');
  s = mustOk(r, 'B1 request_hint #2 sollte funktionieren');
  p = HintB1.exportPublic(s);
  assert.equal(p.hintLevel, 2);

  // level 3 (max)
  r = act(HintB1, s, 'alch:hint:b1', 'request_hint');
  s = mustOk(r, 'B1 request_hint #3 sollte funktionieren');
  p = HintB1.exportPublic(s);
  assert.equal(p.hintLevel, 3);
  assert.equal(p.canRequestMore, false);

  // darüber hinaus -> NO_MORE_HINTS
  r = act(HintB1, s, 'alch:hint:b1', 'request_hint');
  mustFail(r, 'NO_MORE_HINTS', 'B1 request_hint über max sollte fehlschlagen');

  // reset
  r = act(HintB1, s, 'alch:hint:b1', 'reset');
  s = mustOk(r, 'B1 reset sollte funktionieren');
  p = HintB1.exportPublic(s);
  assert.equal(p.discovered, false);
  assert.equal(p.hintLevel, 0);

  console.log('✅ B1 erfolgreich getestet');
}

function testB2() {
  console.log('--- Test B2 (alch:hint:b2) ---');

  let s = HintB2.init();
  let p = HintB2.exportPublic(s);

  // Initialzustand
  assert.equal(p.discovered, false);
  assert.equal(p.hintLevel, 0);
  assert.equal(p.share.enabled, true);
  assert.equal(p.share.revealed, false);
  assert.equal(p.share.token, null);

  // mark_shared vor reveal -> Fehler
  let r = act(HintB2, s, 'alch:hint:b2', 'mark_shared');
  mustFail(r, 'SHARE_TOKEN_NOT_REVEALED', 'B2 mark_shared vor reveal sollte fehlschlagen');

  // inspect -> level 1
  r = act(HintB2, s, 'alch:hint:b2', 'inspect');
  s = mustOk(r, 'B2 inspect sollte funktionieren');
  p = HintB2.exportPublic(s);
  assert.equal(p.hintLevel, 1);
  assert.equal(p.share.revealed, false);
  assert.equal(p.share.token, null);

  // request_hint -> level 2 => token sichtbar
  r = act(HintB2, s, 'alch:hint:b2', 'request_hint');
  s = mustOk(r, 'B2 request_hint #2 sollte funktionieren');
  p = HintB2.exportPublic(s);
  assert.equal(p.hintLevel, 2);
  assert.equal(p.share.revealed, true);
  assert.ok(typeof p.share.token === 'string' && p.share.token.length > 0);

  // mark_shared jetzt erlaubt
  r = act(HintB2, s, 'alch:hint:b2', 'mark_shared');
  s = mustOk(r, 'B2 mark_shared nach reveal sollte funktionieren');
  p = HintB2.exportPublic(s);
  assert.equal(p.share.shared, true);

  // level 3
  r = act(HintB2, s, 'alch:hint:b2', 'request_hint');
  s = mustOk(r, 'B2 request_hint #3 sollte funktionieren');
  p = HintB2.exportPublic(s);
  assert.equal(p.hintLevel, 3);

  // darüber hinaus -> NO_MORE_HINTS
  r = act(HintB2, s, 'alch:hint:b2', 'request_hint');
  mustFail(r, 'NO_MORE_HINTS', 'B2 request_hint über max sollte fehlschlagen');

  // falsche objectId -> INVALID_OBJECT
  r = act(HintB2, s, 'alch:hint:wrong', 'inspect');
  mustFail(r, 'INVALID_OBJECT', 'Falsche objectId sollte fehlschlagen');

  console.log('✅ B2 erfolgreich getestet');
}

function run() {
  testB1();
  testB2();
  console.log('\n🎉 Alle Hint-Tests bestanden.');
}

run();
