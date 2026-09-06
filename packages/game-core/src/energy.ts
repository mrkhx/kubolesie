import { ENERGY_PER_INTERVAL, ENERGY_REGEN_INTERVAL_MS } from '@kubolesie/shared';

export interface EnergyState {
  energy: number;
  maxEnergy: number;
  lastEnergyAt: Date;
}

export function regenerateEnergy<T extends EnergyState>(player: T, now: Date): T {
  if (player.energy >= player.maxEnergy) {
    return { ...player, lastEnergyAt: now };
  }

  const elapsed = now.getTime() - player.lastEnergyAt.getTime();
  if (elapsed < ENERGY_REGEN_INTERVAL_MS) {
    return player;
  }

  const restored = Math.floor(elapsed / ENERGY_REGEN_INTERVAL_MS) * ENERGY_PER_INTERVAL;
  if (restored <= 0) {
    return player;
  }

  const energy = Math.min(player.maxEnergy, player.energy + restored);
  if (energy >= player.maxEnergy) {
    return { ...player, energy, lastEnergyAt: now };
  }

  const consumedTicks = energy - player.energy;
  return {
    ...player,
    energy,
    lastEnergyAt: new Date(player.lastEnergyAt.getTime() + consumedTicks * ENERGY_REGEN_INTERVAL_MS),
  };
}

export function spendEnergy<T extends EnergyState>(player: T, amount: number, now: Date): T {
  const refreshed = regenerateEnergy(player, now);
  if (refreshed.energy < amount) {
    return refreshed;
  }
  return { ...refreshed, energy: refreshed.energy - amount };
}
