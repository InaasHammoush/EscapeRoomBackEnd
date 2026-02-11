// src/game/inventory.js

export const STARTER_INVENTORY = Object.freeze({
  MOONWORT: 1,
  GREEN_LIQUID: 1,
  GOLD_NUGGET: 1,
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
    // Alchemie-Insert-Checks
    if (action?.verb === 'insert') {
        const isAlchemyInsert =
            action.objectId === 'alch:mortar' || action.objectId === 'alch:transmuter';

        if (isAlchemyInsert) {
            const item = _normalizeItem(action?.data?.item);
            if (!item) return { ok: true }; // Puzzle-Validation übernimmt

            if (!_bagHas(room.state.internal.inventory, item, 1)) {
                return { ok: false, error: 'INVENTORY_ITEM_MISSING' };
            }
        }
    }
    return { ok: true };
}

export function applyInventoryBridge(room, prevPublic, action) {
    let changed = false;
    const bag = room.state.internal.inventory;

    // A) Verbrauch bei erfolgreichem insert in Alchemie-Puzzles
    if ( action?.verb === 'insert' &&
        (action.objectId === 'alch:mortar' || action.objectId === 'alch:transmuter')) {
        const item = _normalizeItem(action?.data?.item);
        if (item && _bagHas(bag, item, 1)) {
            _bagRemove(bag, item, 1);
            changed = true;
        }
    }

    // B) Reward: BLUE_LIQUID wenn Mörser erstmals ready
    const prevBlue = !!prevPublic?.alchMortarEssence?.output?.blueLiquidReady;
    const nextBlue = !!room.state.public?.alchMortarEssence?.output?.blueLiquidReady;
    if (!prevBlue && nextBlue) {
        _bagAdd(bag, 'BLUE_LIQUID', 1);
        changed = true;
    }

    // C) Reward: GOLDEN_KEY wenn Transmuter erstmals ready
    const prevKey = !!prevPublic?.alchKeyTransmutation?.output?.goldenKeyReady;
    const nextKey = !!room.state.public?.alchKeyTransmutation?.output?.goldenKeyReady;
    if (!prevKey && nextKey) {
        _bagAdd(bag, 'GOLDEN_KEY', 1);
        changed = true;
    }

    // D) Spiegelpuzzle: Reward fürs lösen
    const prevGridSolved = !!prevPublic?.alchLightBeamGrid?.solved;
    const nextGridSolved = !!room.state.public?.alchLightBeamGrid?.solved;

    if (!prevGridSolved && nextGridSolved) {
        _bagAdd(bag, 'LIGHT_SIGIL', 1);
        changed = true;
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

  if (['MOONWORT', 'MONDRAUTE', 'BOTRYCHIUM_LUNARIA', 'BOTRYCHIUM LUNARIA'].includes(raw)) return 'MOONWORT';
  if (['GREEN_LIQUID', 'GREENLIQUID', 'GRÜNE_FLÜSSIGKEIT', 'GRUENE_FLUESSIGKEIT'].includes(raw)) return 'GREEN_LIQUID';
  if (['BLUE_LIQUID', 'BLUELIQUID', 'BLAUE_FLÜSSIGKEIT', 'BLAUE_FLUESSIGKEIT'].includes(raw)) return 'BLUE_LIQUID';
  if (['GOLD_NUGGET', 'GOLDNUGGET', 'GOLDKLUMPEN', 'RAW_KEY_MATERIAL'].includes(raw)) return 'GOLD_NUGGET';
  if (['GOLDEN_KEY', 'GOLDENKEY', 'GOLDENER_SCHLUESSEL', 'GOLDENER_SCHLÜSSEL'].includes(raw)) return 'GOLDEN_KEY';
  if (['PURIFIED_CRYSTAL', 'CRYSTAL', 'REINER_KRISTALL', 'GEREINIGTER_KRISTALL'].includes(raw)) return 'PURIFIED_CRYSTAL';
  if (['LIGHT_SIGIL', 'LIGHTSIGIL', 'LICHT_SIGIL', 'LICHTSIGIL'].includes(raw)) return 'LIGHT_SIGIL';

  return null;
}