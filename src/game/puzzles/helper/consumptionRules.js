// src/game/puzzles/helper/consumptionRules.js

export const CONSUMPTION_RULES = [
  // --- Wizard ---
  { objectId: 'puzzle_wizard_transformation_table', verb: 'PLACE',    item: 'WHITE_ROSE' },
  { objectId: 'puzzle_wizard_transformation_table', verb: 'SPRINKLE', item: 'BLUE_POWDER' },
  { objectId: 'puzzle_door_seal',                   verb: 'INSERT',   item: 'ASH_KEY' },

  // --- Alchemist ---
  // check for "alch:mortar" and consume "MOONWORT"
  { objectId: 'alch:mortar',           verb: 'insert', item: 'MOONWORT' },
  { objectId: 'puzzle_mortar',         verb: 'insert', item: 'MOONWORT' }, // Alias
  
  // check for "alch:transmuter" and consume "GOLD_NUGGET"
  { objectId: 'alch:transmuter',       verb: 'insert', item: 'GOLD_NUGGET' },
  { objectId: 'puzzle_transmuter',     verb: 'insert', item: 'GOLD_NUGGET' }, // Alias

  // check for "alch:east-door-lock" and consume "GOLDEN_KEY"
  { objectId: 'alch:east-door-lock',   verb: 'insert', item: 'GOLDEN_KEY' },
  { objectId: 'puzzle_east_door_sync', verb: 'insert', item: 'GOLDEN_KEY' } // Alias
];