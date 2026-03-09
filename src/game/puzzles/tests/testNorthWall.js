// src/tests/testNorthWall.js
import assert from 'node:assert/strict';
import * as Note from '../alchemist_lab/alchNorthHierarchyNote.js';
import * as Statue from '../alchemist_lab/alchStatuePose.js';

const nextState = (res) => res?.nextState ?? res?.state;

// --- Hierarchy note ---
{
  let s = Note.init();
  const r = Note.apply(s, { objectId: 'alch:north-hierarchy-note', verb: 'read' });
  assert.equal(r.ok, true, 'Hierarchy note should be readable');
  s = nextState(r);
  assert.equal(s.solved, true);
  assert.equal(s.output.noteRevealed, true);
}

// --- Statue pose ---
{
  let s = Statue.init();

  // Pose zuerst korrekt setzen (ohne Feder -> noch nicht solved)
  let r = Statue.apply(s, {
    objectId: 'alch:statue',
    verb: 'set_pose',
    data: { leftArm: 'HALF_UP', rightArm: 'FULL_UP', head: 'UP' },
  });
  assert.equal(r.ok, true);
  s = nextState(r);
  assert.equal(s.solved, false);

  // Feder einsetzen -> solved + flammaReady
  r = Statue.apply(s, {
    objectId: 'alch:statue',
    verb: 'insert',
    data: { item: 'FEATHER', ear: 'LEFT' },
  });
  assert.equal(r.ok, true);
  s = nextState(r);
  assert.equal(s.solved, true);
  assert.equal(s.output.flammaReady, true);

  // Optional: Note nehmen
  r = Statue.apply(s, {
    objectId: 'alch:statue',
    verb: 'take',
    data: { item: 'NOTE_FLAMMA' },
  });
  assert.equal(r.ok, true);
  s = nextState(r);
  assert.equal(s.output.noteTaken, true);
}

console.log('✅ testNorthWall passed');
