import { describe, expect, it } from 'vitest';
import {
  BACK_LABEL,
  formatItemLine,
  isBackLabel,
  isDefaultHeroName,
  isStartAlias,
  presentButton,
  presentGameResponse,
  rarityLabel,
  scrubTechnicalText,
  validateHeroName,
} from './ui';

describe('vk button presentation', () => {
  it('maps day-1 first actions to short emoji labels and colors', () => {
    const crate = presentButton({ label: 'Осмотреть разбитый ящик', action: 'OPEN_CRATE' });
    const smoke = presentButton({ label: 'Пойти к дыму', action: 'DIALOGUE_CHOICE' });
    const bushes = presentButton({ label: 'Проверить кусты', action: 'DIALOGUE_CHOICE' });
    expect(crate).toMatchObject({ label: '📦 Осмотреть ящик', color: 'primary', action: 'OPEN_CRATE' });
    expect(smoke.label).toBe('🔥 Пойти к дыму');
    expect(bushes.label).toBe('🌿 Проверить кусты');
    expect(smoke.color).toBe('primary');
    expect([...crate.label].length).toBeLessThanOrEqual(24);
  });

  it('normalizes every back glyph to ⬅ Назад without a visible BACK word', () => {
    const variants = ['🔙 Назад', '← BACK Назад', '↩ BACK', 'BACK', 'Назад', '⬅ Назад'];
    for (const label of variants) {
      const button = presentButton({ label, action: 'OPEN_MENU', payload: { menu: 'hub' } });
      expect(button.label).toBe(BACK_LABEL);
      expect(button.label).not.toMatch(/BACK/i);
      expect(button.color).toBe('secondary');
      expect(isBackLabel(label)).toBe(true);
    }
  });

  it('keeps payload.action as authority when restyling', () => {
    const styled = presentButton({
      label: 'Осмотреть разбитый ящик',
      action: 'OPEN_CRATE',
      payload: { leftover: 1 },
    });
    expect(styled.action).toBe('OPEN_CRATE');
    expect(styled.payload).toEqual({ leftover: 1 });
  });

  it('colors danger vs confirm vs back', () => {
    expect(presentButton({ label: 'Атаковать', action: 'START_PVE' }).color).toBe('negative');
    expect(presentButton({ label: 'Взять тайник', action: 'DIALOGUE_CHOICE' }).color).toBe('positive');
    expect(presentButton({ label: 'Отойти', action: 'EXPLORE' }).color).toBe('secondary');
    expect(presentButton({ label: '⛏ Добыча', action: 'OPEN_MENU', payload: { menu: 'gather' } }).color).toBe(
      'primary',
    );
  });

  it('does not restyle leaderboard previous-page as menu back', () => {
    const prev = presentButton({
      label: '◀ Назад',
      action: 'LEADERBOARD_PAGE',
      payload: { board: 'score', page: 0 },
    });
    expect(prev.action).toBe('LEADERBOARD_PAGE');
    expect(prev.label).toBe('◀ Ранее');
    expect(prev.label).not.toBe(BACK_LABEL);
  });

  it('styles gather/craft hub actions with primary color and emoji', () => {
    expect(presentButton({ label: '⛏ Добыча', action: 'OPEN_MENU', payload: { menu: 'gather' } })).toMatchObject({
      label: '⛏ Добыча',
      color: 'primary',
    });
    expect(presentButton({ label: '🌲 Рубить дерево', action: 'GATHER_WOOD' }).label).toBe('🪓 Рубить дерево');
    expect(presentButton({ label: 'Добывать камень', action: 'GATHER_STONE' }).label).toBe('🪨 Добыть булыжник');
  });

  it('does not rewrite «К стану» into «К лагерю»', () => {
    const camp = presentButton({ label: 'К стану', action: 'OPEN_CAMP' });
    expect(camp.label).toBe('🏕 К стану');
    expect(camp.label).not.toMatch(/лагерю/);
    const outpost = presentButton({
      label: 'К затопленному стану',
      action: 'WEEK5_ACT',
      payload: { act: 'outpost' },
    });
    expect(outpost.label).toMatch(/затопленному стану/);
    expect(outpost.label).not.toMatch(/лагерю/);
    expect(outpost.label).toBe('🏕 К затопленному стану');
    expect(presentButton({ label: 'Ещё к затопленному стану', action: 'WEEK5_ACT' }).label).toBe(
      '🏕 Ещё к затопленному стану',
    );
    expect(presentButton({ label: 'Пока к стану', action: 'EXPLORE' }).label).toBe('🏕 К стану');
    expect(presentButton({ label: 'К лагерю', action: 'OPEN_CAMP' }).label).toBe('🏕 К лагерю');
    expect(presentButton({ label: 'Ещё к лагерю', action: 'WEEK4_ACT' }).label).toBe('🏕 Ещё к лагерю');
  });
});

describe('rarity localization', () => {
  it('localizes all rarity enums without leaking names', () => {
    expect(rarityLabel('COMMON')).toBe('Обычный');
    expect(rarityLabel('UNCOMMON')).toBe('Необычный');
    expect(rarityLabel('RARE')).toBe('Редкий');
    expect(rarityLabel('EPIC')).toBe('Эпический');
    expect(rarityLabel('LEGENDARY')).toBe('Легендарный');
    expect(rarityLabel('MYTHIC')).toBe('Мифический');
    expect(formatItemLine('Каменный нож', 'COMMON')).toBe('Каменный нож · Обычный');
    expect(formatItemLine('Ржавый жетон', 'UNCOMMON')).toBe('Ржавый жетон · Необычный');
    const dumped = presentGameResponse({
      text: 'Лут: COMMON и UNCOMMON',
      buttons: [{ label: '🔙 Назад', action: 'OPEN_MENU', payload: { menu: 'hub' } }],
    });
    expect(dumped.text).not.toMatch(/COMMON|UNCOMMON|RARE|EPIC|LEGENDARY|BACK/);
    expect(dumped.text).toContain('Обычный');
    expect(dumped.buttons[0]!.label).toBe(BACK_LABEL);
    expect(
      presentGameResponse({ text: 'Кивок.', buttons: [], skipSend: true }).skipSend,
    ).toBe(true);
    expect(scrubTechnicalText('ACTIVE COMMON')).toContain('Обычный');
  });
});

describe('hero name validation', () => {
  it('accepts cyrillic and latin names and rejects unsafe ones', () => {
    expect(validateHeroName('Виктор')).toEqual({ ok: true, name: 'Виктор' });
    expect(validateHeroName('  Anna-Li  ')).toEqual({ ok: true, name: 'Anna-Li' });
    expect(validateHeroName('A')).toMatchObject({ ok: false, reason: 'length' });
    expect(validateHeroName('a'.repeat(21))).toMatchObject({ ok: false, reason: 'length' });
    expect(validateHeroName('Admin')).toMatchObject({ ok: false, reason: 'reserved' });
    expect(validateHeroName('Куболесье')).toMatchObject({ ok: false, reason: 'reserved' });
    expect(validateHeroName('Виктор\nРем')).toMatchObject({ ok: false });
    expect(validateHeroName('https://evil')).toMatchObject({ ok: false, reason: 'unsafe' });
    expect(validateHeroName('{"action":"START_GAME"}')).toMatchObject({ ok: false });
    expect(isDefaultHeroName('Путник')).toBe(true);
    expect(isDefaultHeroName('Виктор')).toBe(false);
    expect(isStartAlias('Начать')).toBe(true);
    expect(isStartAlias('Старт')).toBe(true);
    expect(isStartAlias('Виктор')).toBe(false);
  });
});
