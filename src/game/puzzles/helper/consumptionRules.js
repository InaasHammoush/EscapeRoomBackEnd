// src/game/puzzles/helpers/consumptionRules.js

// DEFINE CONSUMPTION RULES (Inputs)
export const CONSUMPTION_RULES = [
  // Alchemist Room Rules
  { objectId: 'alch:mortar',     verb: 'insert', item: 'MOONWORT' },
  { objectId: 'alch:transmuter', verb: 'insert', item: 'GOLD_NUGGET' },
  { objectId: 'alch:transmuter', verb: 'insert', item: 'BLUE_LIQUID' },
  
  // Wizard Room Rules
  { objectd: 'wizard_transformation_table', verb: 'PLACE',    item: 'WHITE_ROSE' },
  { objectId: 'wizard_transformation_table', verb: 'SPRINKLE', item: 'BLUE_POWDER' },
  { objectId: 'door_seal',                   verb: 'INSERT',   item: 'ASH_KEY' }
];

