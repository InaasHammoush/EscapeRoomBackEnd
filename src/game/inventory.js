// src/game/inventory.js

import { CONSUMPTION_RULES } from './puzzles/helper/consumptionRules.js';
import { REWARD_RULES } from './puzzles/helper/rewardRules.js';

export const STARTER_INVENTORY = Object.freeze({
   //MOONWORT: 1,
   //GREEN_LIQUID: 1,
   //COAL_BLOCK: 1,
   //GOLD_NUGGET: 1,
   //MATCHES: 1,
   //FEATHER: 1,
});


// ----------------------------------------------------------
// Inventory-Bridge Helpers
// ----------------------------------------------------------

export function ensureInventory(room) {
    if (!room.state.public) room.state.public = {};
    if (!room.state.internal) room.state.internal = {};

    if (!room.state.internal.inventory) {
        const fromPub = fromPublicInventory(room.state.public.inventory);
        room.state.internal.inventory =
        Object.keys(fromPub).length > 0 ? fromPub : cloneBag(STARTER_INVENTORY);
    }

    room.state.public.inventory = toPublicInventory(room.state.internal.inventory);
}

export function normalizeActionItems(action) {
    if (!action?.data?.item) return action;
    const normalized = _normalizeItem(action.data.item);
    if (!normalized) return action; // Puzzle-Validation kann INVALID_ITEM liefern
    return {
        ...action,
        data: { ...action.data, item: normalized },
    };
}

export function precheckInventoryForAction(room, action) {
    const item = _normalizeItem(action?.data?.item);
    if (!item) return { ok: true }; 

    const objectId = String(action?.objectId || '');
    const verb = String(action?.verb || '').toLowerCase();
    // Mortar extraction requires an empty bottle in inventory.
    if (
      (objectId === 'alch:mortar' || objectId === 'puzzle_mortar') &&
      verb === 'take' &&
      item === 'BLUE_LIQUID' &&
      !_bagHas(room.state.internal.inventory, 'EMPTY_BOTTLE', 1)
    ) {
      return { ok: false, error: 'INVENTORY_ITEM_MISSING' };
    }

    const rule = CONSUMPTION_RULES.find(r => 
      r.objectId === objectId && 
      r.verb.toLowerCase() === verb &&
      r.item === item
    );

    if (rule) {
      if (!_bagHas(room.state.internal.inventory, item, 1)) {
        return { ok: false, error: 'INVENTORY_ITEM_MISSING' };
      }
    }
    return { ok: true };
}

export function applyInventoryBridge(room, prevPublic, action) {
  let changed = false;
  const bag = room.state.internal.inventory;
  const objectId = String(action?.objectId || '');
  const verb = String(action?.verb || '').toLowerCase();

  // 1. Consumption
  const item = _normalizeItem(action?.data?.item);
  if (item) {
    const rule = CONSUMPTION_RULES.find(r => 
      r.objectId === objectId && 
      r.verb.toLowerCase() === verb &&
      r.item === item
    );
    if (rule && _bagHas(bag, item, 1)) {
      _bagRemove(bag, item, 1);
      changed = true;
    }
  }

  // 1b. Special swap: taking blue liquid consumes one empty bottle.
  if (
    (objectId === 'alch:mortar' || objectId === 'puzzle_mortar') &&
    verb === 'take' &&
    item === 'BLUE_LIQUID' &&
    _bagHas(bag, 'EMPTY_BOTTLE', 1)
  ) {
    _bagRemove(bag, 'EMPTY_BOTTLE', 1);
    changed = true;
  }

  // 2. Rewards
  for (const rule of REWARD_RULES) {
    const prev = prevPublic?.[rule.puzzle] || {};
    const next = room.state.public?.[rule.puzzle] || {};

    if (rule.check(prev, next)) {
      // Handle Array or Single Item
      const itemsToAward = Array.isArray(rule.item) ? rule.item : [rule.item];

      for (const rewardItem of itemsToAward) {
        console.log(`[Inventory] Awarding ${rewardItem} from ${rule.puzzle}`);
        _bagAdd(bag, rewardItem, 1);
        changed = true;
      }
    }
  }

  if (changed) {
    room.state.public.inventory = toPublicInventory(bag);
  }
  return changed;
}

// ------------------------------------------------------------
// Inventory utilities
// ------------------------------------------------------------

export function toPublicInventory(bag) {
  const items = Object.entries(bag || {})
    .filter(([, count]) => Number(count) > 0)
    .map(([item, count]) => ({ item, count: Number(count) }))
    .sort((a, b) => a.item.localeCompare(b.item));

  return { items };
}

export function fromPublicInventory(publicInventory) {
  const bag = {};
  for (const entry of publicInventory?.items || []) {
    if (!entry?.item) continue;
    bag[String(entry.item)] = Number(entry.count || 0);
  }
  return bag;
}

export function cloneBag(bag) {
  return { ...(bag || {}) };
}

export function _bagHas(bag, item, amount = 1) {
  return Number(bag?.[item] || 0) >= amount;
}

export function _bagAdd(bag, item, amount = 1) {
  bag[item] = Number(bag[item] || 0) + amount;
}

export function _bagRemove(bag, item, amount = 1) {
  const next = Number(bag[item] || 0) - amount;
  if (next > 0) bag[item] = next;
  else delete bag[item];
}

export function _normalizeItem(input) {
  const raw = String(input ?? '').trim().toUpperCase();

  // Alchemist Items
  if (['MOONWORT', 'MONDRAUTE'].includes(raw)) return 'MOONWORT';
  if (['GREEN_LIQUID', 'GREENLIQUID'].includes(raw)) return 'GREEN_LIQUID';
  if (['BLUE_LIQUID', 'BLUELIQUID'].includes(raw)) return 'BLUE_LIQUID';
  if (['EMPTY_BOTTLE', 'BOTTLE'].includes(raw)) return 'EMPTY_BOTTLE'; 
  if (['GOLD_NUGGET', 'GOLDNUGGET'].includes(raw)) return 'GOLD_NUGGET';
  if (['GOLDEN_KEY', 'GOLDENKEY'].includes(raw)) return 'GOLDEN_KEY';
  if (['LIGHT_SIGIL', 'LIGHTSIGIL'].includes(raw)) return 'LIGHT_SIGIL';
  if (['FEATHER', 'FEDER'].includes(raw)) return 'FEATHER';
  if (['COAL_BLOCK', 'COAL'].includes(raw)) return 'COAL_BLOCK';
  if (['MATCHES', 'STREICHHOLZ'].includes(raw)) return 'MATCHES';
  if (['HIRACHY', 'HIERARCHY'].includes(raw)) return 'HIERARCHY';

  // Wizard Items
  if (['WHITE_ROSE', 'WHITEROSE'].includes(raw)) return 'WHITE_ROSE';
  if (['BLUE_POWDER', 'BLUEPOWDER'].includes(raw)) return 'BLUE_POWDER';
  if (['NOTE_CODE', 'CODE_NOTE'].includes(raw)) return 'NOTE_CODE';
  if (['NOTE_RUNES', 'RUNE_NOTE'].includes(raw)) return 'NOTE_RUNES';
  if (['ASH_KEY', 'ASHKEY'].includes(raw)) return 'ASH_KEY';
  if (['SKETCH_ALCHEMIST', 'ALCHEMIST_SKETCH'].includes(raw)) return 'SKETCH_ALCHEMIST';
  if (['CHEST_KEY', 'CHESTKEY', 'TRUHENSCHLÜSSEL'].includes(raw)) return 'CHEST_KEY';

  return null;
}
