// src/game/puzzles/helpers/rewardRules.js


// DEFINE REWARD RULES (Outputs)
export const REWARD_RULES = [
  // Alchemist Room Rewards
  { 
    puzzle: 'alchMortarEssence', 
    check: (prev, next) => !prev.output?.blueLiquidReady && next.output?.blueLiquidReady,
    item: 'BLUE_LIQUID'
  },
  { 
    puzzle: 'alchKeyTransmutation', 
    check: (prev, next) => !prev.output?.goldenKeyReady && next.output?.goldenKeyReady,
    item: 'GOLDEN_KEY'
  },
  {
    puzzle: 'alchLightBeamGrid',
    check: (prev, next) => !prev.solved && next.solved,
    item: 'LIGHT_SIGIL'
  },

  // Wizard Room Rewards
  {
    puzzle: 'bookshelf_puzzle',
    check: (prev, next) => !prev.solved && next.solved,
    item: ['BLUE_POWDER', 'NOTE_CODE'] // Bookshelf solved -> receive Blue Powder & Code for the Alchemist room
  },
  {
    puzzle: 'candle_puzzle',
    check: (prev, next) => !prev.solved && next.solved,
    item: 'NOTE_RUNES'      // Candle sequence correct -> receive rune translation note for the final door
  },
  {
    puzzle: 'wizard_transformation_table',
    check: (prev, next) => !prev.keyTaken && next.keyTaken,
    item: 'ASH_KEY'     // Rose burned -> receive Ash Key
  },
  {
    puzzle: 'merlin_scale',
    check: (prev, next) => !prev.solved && next.solved,
    item: ['WHITE_ROSE', 'SKETCH_ALCHEMIST'] // Scale balanced -> receive White Rose for transformation and sketch of the Alchemist
  }
];