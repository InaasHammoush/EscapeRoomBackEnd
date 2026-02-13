// src/tests/testLightBeamGrid.js
import * as Grid from '../alchLightBeamGrid.js';

function act(state, verb, data = {}) {
  const res = Grid.apply(state, {
    objectId: 'alch:mirror-grid',
    verb,
    data,
  });
  if (!res.ok) throw new Error(`${verb} failed: ${res.error}`);
  return res.nextState;
}

let s = Grid.init(Grid.GRID_7X7_PRESET);

for (const m of Grid.GRID_7X7_REFERENCE_MIRRORS) {
  s = act(s, 'place_mirror', m);
}

s = act(s, 'simulate');

const pub = Grid.exportPublic(s);

console.log('Solved:', pub.solved);
console.log('Active runes:', pub.progress.activeRunes, '/', pub.progress.totalRunes);
console.log('Goal reached:', pub.progress.goalReached);
console.log('Stopped reason:', pub.beam.stoppedReason);

if (!pub.solved) {
  process.exitCode = 1;
  throw new Error('Expected puzzle to be solved with reference mirror setup.');
}
