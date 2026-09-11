import { ENERGY_PER_INTERVAL, ENERGY_REGEN_INTERVAL_MS, HP_PER_INTERVAL } from '@kubolesie/shared';

export interface EnergyState {
  energy: number;
  maxEnergy: number;
  lastEnergyAt: Date;
}

function hasVitals(player: EnergyState): player is EnergyState & { hp: number; maxHp: number } {
  return (
    'hp' in player &&
    'maxHp' in player &&
    typeof (player as EnergyState & { hp?: unknown }).hp === 'number' &&
    typeof (player as EnergyState & { maxHp?: unknown }).maxHp === 'number'
  );
}

export function regenerateEnergy<T extends EnergyState>(player: T, now: Date): T {
  const vitals = hasVitals(player);
  const hpFull = !vitals || player.hp >= player.maxHp;
  const energyFull = player.energy >= player.maxEnergy;

  if (energyFull && hpFull) {
    return { ...player, lastEnergyAt: now };
  }

  const elapsed = now.getTime() - player.lastEnergyAt.getTime();
  if (elapsed < ENERGY_REGEN_INTERVAL_MS) {
    return player;
  }

  const ticks = Math.floor(elapsed / ENERGY_REGEN_INTERVAL_MS);
  if (ticks <= 0) {
    return player;
  }

  const energy = Math.min(player.maxEnergy, player.energy + ticks * ENERGY_PER_INTERVAL);
  const nextHp = vitals ? Math.min(player.maxHp, player.hp + ticks * HP_PER_INTERVAL) : undefined;
  const energyDone = energy >= player.maxEnergy;
  const hpDone = !vitals || (nextHp != null && nextHp >= player.maxHp);
  const lastEnergyAt =
    energyDone && hpDone
      ? now
      : new Date(player.lastEnergyAt.getTime() + ticks * ENERGY_REGEN_INTERVAL_MS);

  if (vitals) {
    return { ...player, energy, hp: nextHp as number, lastEnergyAt };
  }
  return { ...player, energy, lastEnergyAt };
}

export function spendEnergy<T extends EnergyState>(player: T, amount: number, now: Date): T {
  const refreshed = regenerateEnergy(player, now);
  if (refreshed.energy < amount) {
    return refreshed;
  }
  return { ...refreshed, energy: refreshed.energy - amount };
}
