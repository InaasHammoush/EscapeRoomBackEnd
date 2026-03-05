// src/game/puzzles/helper/consumptionRules.js

export const CONSUMPTION_RULES = [
  // --- Wizard ---
  { objectId: 'puzzle_transformation_table', verb: 'PLACE',    item: 'WHITE_ROSE' },
  { objectId: 'puzzle_transformation_table', verb: 'SPRINKLE', item: 'BLUE_POWDER' },
  { objectId: 'puzzle_door_seal',            verb: 'INSERT',   item: 'ASH_KEY' },
  { objectId: 'puzzle_recipe_hint',          verb: 'PLACE',    item: 'CHEST_KEY' },

  // --- Alchemist ---
  // check for "alch:mortar" and consume "MOONWORT"
  { objectId: 'alch:mortar',           verb: 'insert', item: 'MOONWORT' },
  { objectId: 'puzzle_mortar',         verb: 'insert', item: 'MOONWORT' }, // Alias
  { objectId: 'alch:mortar',           verb: 'insert', item: 'GREEN_LIQUID' },
  { objectId: 'puzzle_mortar',         verb: 'insert', item: 'GREEN_LIQUID' }, // Alias
  
  // check for "alch:transmuter" and consume transmutation inputs
  { objectId: 'alch:transmuter',       verb: 'insert', item: 'COAL_BLOCK' },
  { objectId: 'puzzle_transmuter',     verb: 'insert', item: 'COAL_BLOCK' }, // Alias
  { objectId: 'alch:transmuter',       verb: 'insert', item: 'BLUE_LIQUID' },
  { objectId: 'puzzle_transmuter',     verb: 'insert', item: 'BLUE_LIQUID' }, // Alias
  { objectId: 'alch:transmuter',       verb: 'insert', item: 'GOLD_NUGGET' },
  { objectId: 'puzzle_transmuter',     verb: 'insert', item: 'GOLD_NUGGET' }, // Alias
  { objectId: 'alch:transmuter',       verb: 'insert', item: 'MATCHES' },
  { objectId: 'puzzle_transmuter',     verb: 'insert', item: 'MATCHES' }, // Alias

  // check for "alch:east-door-lock" and consume "GOLDEN_KEY"
  { objectId: 'alch:east-door-lock',   verb: 'insert', item: 'GOLDEN_KEY' },
  { objectId: 'puzzle_east_door_sync', verb: 'insert', item: 'GOLDEN_KEY' } // Alias
];
