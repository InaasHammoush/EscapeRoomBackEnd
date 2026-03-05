// src/game/puzzles/helper/rewardRules.js

export const REWARD_RULES = [
  // --- Wizard ---
  {
    puzzle: 'bookshelf_puzzle',
    check: (prev, next) => !prev.solved && next.solved,
    item: ['BLUE_POWDER', 'NOTE_CODE']
  },
  {
    puzzle: 'candle_puzzle',
    check: (prev, next) => !prev.solved && next.solved,
    item: 'NOTE_RUNES'
  },
  {
    puzzle: 'transformation_table_puzzle',
    check: (prev, next) => !prev.keyTaken && next.keyTaken,
    item: 'ASH_KEY'
  },
  {
    puzzle: 'merlin_scale',
    check: (prev, next) => !prev.solved && next.solved,
    item: ['WHITE_ROSE', 'SKETCH_ALCHEMIST']
  },
  {
    puzzle: 'vase_puzzle',
    check: (prev, next) => !prev.keyTaken && next.keyTaken,
    item: 'CHEST_KEY'
  },
  {
    puzzle: 'recipe_hint',
    check: (prev, next) => !prev.recipeTaken && next.recipeTaken,
    item: 'RECIPE'
  },

  // --- Alchemist ---
  
  // 1. Mortar (Blue Liquid)
  {
    puzzle: 'alchMortarEssence',
    check: (prev, next) => !prev.inserted?.greenLiquid && next.inserted?.greenLiquid,
    item: 'EMPTY_BOTTLE'
  },
  {
    puzzle: 'alchMortarEssence',
    check: (prev, next) => !prev.output?.blueLiquidTaken && next.output?.blueLiquidTaken,
    item: 'BLUE_LIQUID'
  },
  // 2. Transmuter (Golden Key)
  {
    puzzle: 'alchKeyTransmutation',
    check: (prev, next) => !prev.output?.goldenKeyReady && next.output?.goldenKeyReady,
    item: 'GOLDEN_KEY'
  },
  // 3. Mirror Grid (Light Sigil)
  {
    puzzle: 'alchLightBeamGrid',
    check: (prev, next) => !prev.solved && next.solved,
    item: 'LIGHT_SIGIL'
  },
  // 4. Portrait (Feather + Gold)
  {
    puzzle: 'alchPortraitBooks',
    check: (prev, next) => !prev.output?.featherReady && next.output?.featherReady,
    item: 'FEATHER'
  },
  {
    puzzle: 'alchPortraitBooks',
    check: (prev, next) => !prev.output?.goldNuggetReady && next.output?.goldNuggetReady,
    item: 'GOLD_NUGGET'
  },
  // 5. Flasks (Complex Multi-Reward)
  {
    puzzle: 'alchFlaskTransfer',
    check: (prev, next) => {
      const prevCoal = !!(prev.output?.coalReady || prev.output?.coalBlockReady);
      const nextCoal = !!(next.output?.coalReady || next.output?.coalBlockReady);
      return (!prevCoal && nextCoal) || (!prev.solved && next.solved);
    },
    item: 'COAL_BLOCK'
  },
  {
    puzzle: 'alchFlaskTransfer',
    check: (prev, next) => (!prev.output?.moonwortReady && next.output?.moonwortReady) || (!prev.solved && next.solved),
    item: 'MOONWORT'
  },
  {
    puzzle: 'alchFlaskTransfer',
    check: (prev, next) => (!prev.output?.matchesReady && next.output?.matchesReady) || (!prev.solved && next.solved),
    item: 'MATCHES'
  },
  {
    puzzle: 'alchFlaskTransfer',
    check: (prev, next) => (!prev.output?.greenLiquidReady && next.output?.greenLiquidReady) || (!prev.solved && next.solved),
    item: 'GREEN_LIQUID'
  }
];
