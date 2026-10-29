// Content integrity: every id referenced in data/ and maps/ exists.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTENT, TILED_MAPS } from '../src/content';
import { parseTiledMap } from '../src/logic/map';
import { CLASS_IDS } from '../src/logic/types';

const pair = (v: unknown) => Array.isArray(v) && v.length === 2 && v[0] <= v[1];

describe('content', () => {
  it('classes reference existing items and spells', () => {
    for (const id of CLASS_IDS) {
      const c = CONTENT.classes[id];
      for (const si of c.startItems) expect(CONTENT.items[si.itemId], si.itemId).toBeDefined();
      for (const sp of c.startSpells) expect(CONTENT.spells[sp], sp).toBeDefined();
      for (const h of c.hotbar) {
        if (h?.kind === 'item') expect(CONTENT.items[h.id], h.id).toBeDefined();
        if (h?.kind === 'spell') expect(c.startSpells, h.id).toContain(h.id);
      }
      expect(c.hotbar).toHaveLength(6);
      expect(pair(c.hpGain) && pair(c.mpGain)).toBe(true);
    }
  });

  it('monster drops and ranges are valid', () => {
    for (const [id, m] of Object.entries(CONTENT.monsters)) {
      expect(pair(m.dmg) && pair(m.gold), id).toBe(true);
      for (const d of m.drops) expect(CONTENT.items[d.itemId], d.itemId).toBeDefined();
    }
  });

  it('weapons have valid stats', () => {
    for (const [id, it] of Object.entries(CONTENT.items)) {
      if (it.slot === 'weapon') expect(pair(it.weapon?.dmg), id).toBe(true);
    }
  });

  it('the Exp table covers every level up to the cap and increases', () => {
    expect(CONTENT.totalExp).toHaveLength(CONTENT.balance.levelCap);
    for (let i = 1; i < CONTENT.totalExp.length; i++) expect(CONTENT.totalExp[i]!).toBeGreaterThan(CONTENT.totalExp[i - 1]!);
  });

  it('maps reference existing monsters, NPCs and respawn maps', () => {
    for (const [id, tm] of Object.entries(TILED_MAPS)) {
      const m = parseTiledMap(id, tm);
      for (const sp of m.spawns) expect(CONTENT.monsters[sp.monster], sp.monster).toBeDefined();
      for (const n of m.npcs) expect(CONTENT.npcs[n.npcId], n.npcId).toBeDefined();
      expect(TILED_MAPS[m.respawnMap], m.respawnMap).toBeDefined();
    }
  });
});

describe('art references', () => {
  const exists = (rel: string) => existsSync(new URL(`../${rel}`, import.meta.url));
  it('every character layer named in classes, NPCs and items has a sheet', () => {
    const names = new Set<string>();
    for (const c of Object.values(CONTENT.classes)) c.appearance.forEach((n) => names.add(n));
    for (const n of Object.values(CONTENT.npcs)) n.appearance.forEach((x) => names.add(x));
    for (const it of Object.values(CONTENT.items)) if (it.sprite) names.add(it.sprite);
    for (const n of names) expect(exists(`assets/sprites/characters/${n}.png`), n).toBe(true);
  });
  it('every monster has a sheet', () => {
    for (const m of Object.values(CONTENT.monsters)) expect(exists(`assets/sprites/monsters/${m.sprite}.png`), m.sprite).toBe(true);
  });
  it('every weapon has an attack animation', () => {
    for (const [id, it] of Object.entries(CONTENT.items)) {
      if (it.weapon) expect(['slash', 'thrust', 'shoot'], id).toContain(it.weapon.anim);
    }
  });
});
