import type { BattleResult } from '@kubolesie/combat-engine';

export function formatCombatLog(
  battle: BattleResult,
  playerId: string,
  playerName: string,
  enemyName: string,
): string {
  const lines = ['⚔ Бой начался!'];
  const body = battle.events.filter((event) => event.type !== 'DEFEAT').slice(0, 8);
  for (const event of body) {
    const isPlayer = event.actor === playerId;
    if (event.type === 'DODGE') {
      lines.push(isPlayer ? `${enemyName} уклоняется.` : 'Ты уклоняешься.');
      continue;
    }
    if (event.type === 'CRIT') {
      lines.push(isPlayer ? `Критический удар — ${event.value}.` : `${enemyName} бьёт в слабость — ${event.value}.`);
      continue;
    }
    if (isPlayer) lines.push(`Ты наносишь ${event.value} урона.`);
    else lines.push(`${enemyName} кусает тебя — ${event.value}.`);
  }
  if (battle.result === 'WIN') lines.push('🏆 Победа!');
  else if (battle.result === 'LOSS') lines.push('Ты падаешь, но приходишь в себя.');
  else lines.push('Бой затихает вничью.');
  return lines.join('\n');
  void playerName;
}
