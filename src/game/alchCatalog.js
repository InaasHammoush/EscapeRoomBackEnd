export const ALCH_SCHEMA_VERSION = 3;

export const ALCH_KEYS = Object.freeze({
  SOUTH_PORTRAIT: 'alchSouthPortraitDrop',
  SOUTH_FLASK: 'alchSouthFlaskTransfer',
  WEST_CODEBOX: 'alchWestCodeBox',
  WEST_JIGSAW: 'alchWestJigsawRose',
  WEST_MORTAR: 'alchMortarEssence',
  WEST_TRANSMUTER: 'alchKeyTransmutation',
  NORTH_NOTE: 'alchNorthNoteRules',
  NORTH_STATUE: 'alchNorthStatuePose',
  EAST_SLIDER: 'alchEastSlidingLock',
  EAST_BEAM: 'alchLightBeamGrid',
});

export const ALCH_OBJECT_ALIASES = Object.freeze({
  // alt -> neu
  'alch:portrait-books': 'alch:south:portrait',
  'alch:hierarchy': 'alch:north:note',
  'alch:north-hierarchy': 'alch:north:note',
  'alch:door-slider': 'alch:east:slider',

  // bestehende, bereits korrekte IDs einfach durchreichen
  'alch:mortar': 'alch:mortar',
  'alch:transmuter': 'alch:transmuter',
  'alch:light-grid': 'alch:light-grid',
});

export function normalizeAlchObjectId(id) {
  const k = String(id || '').trim();
  return ALCH_OBJECT_ALIASES[k] || k;
}
