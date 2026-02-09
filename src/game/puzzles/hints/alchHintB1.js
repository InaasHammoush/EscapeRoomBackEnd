// src/game/puzzles/hints/alchHintB1.js
import { createHintModule } from './baseHint.js';

const moduleImpl = createHintModule({
  puzzleKey: 'alchHintB1',
  objectId: 'alch:hint:b1',
  title: 'Hinweis B1 – Rezept des Mörsers',
  levels: [
    'Ein Alchemist notiert: „Die Pflanze zuerst, das Reagenz danach.“',
    'Für die blaue Essenz gilt: erst Mondwurz, dann grüne Flüssigkeit.',
    'Wenn die Reihenfolge stimmt, wird BLUE_LIQUID bereitgestellt.',
  ],
  share: { enabled: false },
});

export const init = moduleImpl.init;
export const apply = moduleImpl.apply;
export const exportPublic = moduleImpl.exportPublic;
export const isSolved = moduleImpl.isSolved;
