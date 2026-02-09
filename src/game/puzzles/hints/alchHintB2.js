// src/game/puzzles/hints/alchHintB2.js
import { createHintModule } from './baseHint.js';

const moduleImpl = createHintModule({
  puzzleKey: 'alchHintB2',
  objectId: 'alch:hint:b2',
  title: 'Hinweis B2 – Nachricht für den Partnerraum',
  levels: [
    'Eine eingeritzte Botschaft: „Nicht jede Lösung bleibt im eigenen Labor.“',
    (state) => `Übermittle diesen Code in den anderen Raum: ${state?.share?.token}`,
    'Der Code wird im Partnerraum für ein spätes Rätsel benötigt.',
  ],
  share: {
    enabled: true,
    revealAtLevel: 2,
    prefix: 'ALCH',
    length: 4,
  },
});

export const init = moduleImpl.init;
export const apply = moduleImpl.apply;
export const exportPublic = moduleImpl.exportPublic;
export const isSolved = moduleImpl.isSolved;
