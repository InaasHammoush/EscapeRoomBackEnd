// src/game/puzzles/helpers/alchemyItems.js

export const ALCHEMY_ITEMS = Object.freeze({
  MOONWORT: 'MOONWORT',
  GREEN_LIQUID: 'GREEN_LIQUID',
  BLUE_LIQUID: 'BLUE_LIQUID',
});

/**
 * Normalisiert verschiedene Schreibweisen aus Frontend/Content
 * auf kanonische Item-Keys.
 */
export function normalizeAlchemyItem(input) {
  const raw = String(input ?? '').trim().toUpperCase();

  if ([
    'MOONWORT',
    'MONDRAUTE',
    'BOTRYCHIUM_LUNARIA',
    'BOTRYCHIUM LUNARIA'
  ].includes(raw)) return ALCHEMY_ITEMS.MOONWORT;

  if ([
    'GREEN_LIQUID',
    'GREENLIQUID',
    'GRÜNE_FLÜSSIGKEIT',
    'GRUENE_FLUESSIGKEIT',
    'GRUENE_FLUESSIGKEIT'
  ].includes(raw)) return ALCHEMY_ITEMS.GREEN_LIQUID;

  if ([
    'BLUE_LIQUID',
    'BLUELIQUID',
    'BLAUE_FLÜSSIGKEIT',
    'BLAUE_FLUESSIGKEIT'
  ].includes(raw)) return ALCHEMY_ITEMS.BLUE_LIQUID;

  return null;
}
