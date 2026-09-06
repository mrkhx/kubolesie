import type { ResourceType } from '@kubolesie/shared';

export interface TradeBuySku {
  id: string;
  name: string;
  price: number;
  kind: 'item' | 'resource';
  templateId?: string;
  resource?: ResourceType;
  amount?: number;
  once?: boolean;
}

export interface TradeSellSku {
  id: string;
  resource: ResourceType;
  price: number;
}

export const VEL_BUYS: TradeSellSku[] = [
  { id: 'log', resource: 'LOG', price: 1 },
  { id: 'plank', resource: 'PLANK', price: 1 },
  { id: 'cobble', resource: 'COBBLESTONE', price: 1 },
  { id: 'coal', resource: 'COAL', price: 3 },
  { id: 'ore', resource: 'IRON_ORE', price: 4 },
  { id: 'ingot', resource: 'IRON_INGOT', price: 8 },
  { id: 'hide', resource: 'HIDE', price: 5 },
  { id: 'chitin', resource: 'CHITIN_PLATE', price: 6 },
];

export const VEL_SELLS: TradeBuySku[] = [
  { id: 'rusk', name: 'Сухарь', price: 8, kind: 'item', templateId: 'dry_rusk' },
  { id: 'sticks', name: 'Палки ×4', price: 6, kind: 'resource', resource: 'STICK', amount: 4 },
  { id: 'glass', name: 'Стекло', price: 15, kind: 'item', templateId: 'glass_pane', once: true },
  { id: 'stone_sword', name: 'Каменный меч', price: 25, kind: 'item', templateId: 'stone_sword' },
  { id: 'plank_pack', name: 'Пачка досок ×8', price: 12, kind: 'resource', resource: 'PLANK', amount: 8 },
  { id: 'resin_mail', name: 'Смоляная кольчуга', price: 55, kind: 'item', templateId: 'resin_mail' },
];

export const TOKEN_SALE_PRICE = 40;
export const TOOTH_SALE_PRICE = 20;
export const TRIBUTE_COINS = 20;
export const TRIBUTE_COBBLE = 10;
export const PVP_MAX = 3;
export const PVP_WIN_COINS = 3;
export const PVP_WIN_XP = 10;

export function getVelBuy(id: string): TradeBuySku | undefined {
  return VEL_SELLS.find((sku) => sku.id === id);
}

export function getVelSell(id: string): TradeSellSku | undefined {
  return VEL_BUYS.find((sku) => sku.id === id);
}
