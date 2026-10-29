// HUD and windows (plan §6 HUD layout, §7.21). Coordinates are logical px: the camera zoom
// matches the map view, so the map view is always 1024x576 here. On wide phones the HUD sits in
// the side panels beside the map; on 16:9 screens it overlays the map edges.
import Phaser from 'phaser';
import { CONTENT } from '../content';
import type { Command } from '../logic/commands';
import { currentMap, playerInSafeZone } from '../logic/game';
import { chooseArrow, damagePreview } from '../logic/combat';
import { cannotEquip, countItem } from '../logic/inventory';
import { chebyshev } from '../logic/map';
import { derive, expForLevel, levelProgress } from '../logic/stats';
import { TICKS_PER_SECOND } from '../logic/time';
import {
  EQUIP_SLOTS, STAT_KEYS, type EquipSlot, type GameEvent, type GameState, type HotbarRef, type ItemStack, type WeaponStats,
} from '../logic/types';
import { EVT_GAME, REG_ISSUE, REG_PICK_MONSTER, REG_SAVE, REG_STATE, REG_TARGETING } from '../render/WorldScene';
import { computeLayout, VIEW_H, VIEW_W, type Layout } from '../render/view';
import { exportSaveFile, loadSave, pickSaveFile, writeSave } from '../save/storage';
import { confirmBox, messageBox } from './menuLayout';
import { fillShop, fillSmith, fillWarehouse, newNpcSelection, npcWindowSignature, type NpcSelection, type NpcWindowCtx } from './npcWindows';
import { t } from './strings';
import { showCreditsBox } from './TitleScene';
import {
  bar, blockInput, button, COLORS, consumePointer, iconImage, iconTexture, label, panelFrame, setTextResolution, type Bar,
} from './widgets';

type PanelKind = 'character' | 'inventory' | 'spells' | 'settings' | 'shop' | 'warehouse' | 'blacksmith';
const NPC_PANELS: PanelKind[] = ['shop', 'warehouse', 'blacksmith'];

interface LogLine {
  text: string;
  color: string;
  at: number;
}

interface SlotView {
  frame: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Image;
  count: Phaser.GameObjects.Text;
  cd: Phaser.GameObjects.Rectangle;
  size: number;
  ref: string; // signature of what is drawn, to avoid redundant updates
}

const TONE_COLORS: Record<string, string> = { info: '#e8e8e8', good: '#9fe09a', bad: '#ff9a8a', loot: '#ffe08a' };
const LOG_LINES = 6;
const LOG_FADE_MS = 10000;
const SEP = '\u3000'; // full-width space between items on one line
const BOSS_BAR_RANGE = 15; // tiles

export class HudScene extends Phaser.Scene {
  private layout!: Layout;
  private root!: Phaser.GameObjects.Container;
  private hpBar!: Bar;
  private mpBar!: Bar;
  private expBar!: Bar;
  private levelText!: Phaser.GameObjects.Text;
  private alignText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private buffText!: Phaser.GameObjects.Text;
  private mapText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private bossName!: Phaser.GameObjects.Text;
  private bossBar!: Bar;
  private bossObjs: Phaser.GameObjects.GameObject[] = [];
  private logTexts: Phaser.GameObjects.Text[] = [];
  private slots: SlotView[] = [];
  private selectedSlot = 0; // hotbar slot picked with the mouse wheel; middle-click uses it
  private log: LogLine[] = [];

  private openPanel: PanelKind | null = null;
  private panel: Phaser.GameObjects.Container | null = null;
  private panelSig = '';
  private selectedUid: number | null = null;
  private selectedEquip: EquipSlot | null = null;
  private selectedSpell: string | null = null;
  private npcId = ''; // NPC whose window (shop / warehouse / blacksmith) is open
  private npcSel: NpcSelection = newNpcSelection();
  private dialog: Phaser.GameObjects.Container | null = null;
  private deathBox: Phaser.GameObjects.Container | null = null;
  private lastDeath: Extract<GameEvent, { type: 'playerDied' }> | null = null;

  constructor() {
    super('Hud');
  }

  private get s(): GameState {
    return this.registry.get(REG_STATE) as GameState;
  }

  private issue(cmd: Command): void {
    (this.registry.get(REG_ISSUE) as (c: Command) => void)(cmd);
  }

  create(): void {
    this.log = [];
    this.openPanel = null;
    this.panel = null;
    this.dialog = null;
    this.deathBox = null;
    this.build();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.build, this);
    const onEvents = (evs: GameEvent[]) => this.onGameEvents(evs);
    this.game.events.on(EVT_GAME, onEvents);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.build, this);
      this.game.events.off(EVT_GAME, onEvents);
    });

    // PC: mouse wheel picks a hotbar slot, middle-click uses it.
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (dy === 0) return;
      this.selectedSlot = (this.selectedSlot + (dy > 0 ? 1 : -1) + 6) % 6;
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.button !== 1) return;
      consumePointer(this, p);
      // Middle-click on a monster casts the selected targeted spell at it (walking into range if needed).
      const ref = this.s.player.hotbar[this.selectedSlot];
      const sp = ref?.kind === 'spell' ? CONTENT.spells[ref.id] : undefined;
      const under = sp?.target === 'enemy' ? (this.registry.get(REG_PICK_MONSTER) as (x: number, y: number) => number | null)(p.x, p.y) : null;
      if (under !== null) {
        this.issue({ type: 'useHotbar', slot: this.selectedSlot, targetId: under });
        return;
      }
      this.activateHotbar(this.selectedSlot);
    });

    const kb = this.input.keyboard;
    if (kb) {
      for (let i = 0; i < 6; i++) kb.on(`keydown-${['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'][i]}`, () => this.activateHotbar(i));
      kb.on('keydown-I', () => this.togglePanel('inventory'));
      kb.on('keydown-C', () => this.togglePanel('character'));
      kb.on('keydown-S', () => this.togglePanel('spells'));
      kb.on('keydown-SPACE', () => this.issue({ type: 'pickupNearest' }));
      kb.on('keydown-ESC', () => {
        if (this.cancelTargeting()) return;
        if (this.dialog) this.closeDialog();
        else this.closePanel();
      });
    }
  }

  // ---------------------------------------------------------------- layout

  private build(): void {
    this.root?.destroy();
    const L = computeLayout(this.scale.width, this.scale.height);
    this.layout = L;
    setTextResolution(L.zoom);
    this.cameras.main.setViewport(0, 0, L.canvasW, L.canvasH).setOrigin(0, 0).setZoom(L.zoom).setScroll(0, 0);

    this.root = this.add.container(0, 0);
    const side = L.sidePanelW >= 96;
    const mx = L.sidePanelW;
    const my = L.mapY / L.zoom;

    if (side) {
      const bg = this.add.graphics();
      bg.fillStyle(0x15151f, 1);
      bg.fillRect(0, 0, L.sidePanelW, L.uiH);
      bg.fillRect(L.uiW - L.sidePanelW, 0, L.sidePanelW, L.uiH);
      this.root.add(bg);
      this.buildStatus(8, 10, L.sidePanelW - 16);
      this.buildMenu(8, 196, L.sidePanelW - 16, 'vertical');
      const size = Math.min(56, L.sidePanelW - 24, Math.floor((L.uiH - 20) / 6) - 8);
      this.buildHotbar(L.uiW - L.sidePanelW / 2 - size / 2, (L.uiH - (size + 8) * 6) / 2, size, 'vertical');
    } else {
      const statusBg = this.add.rectangle(mx + 6, my + 6, 212, 178, 0x000000, 0.45).setOrigin(0);
      this.root.add(statusBg);
      this.buildStatus(mx + 12, my + 12, 200);
      const size = 48;
      const hotW = (size + 6) * 6;
      const hx = mx + (VIEW_W - hotW - 4 * 64) / 2;
      this.buildHotbar(hx, my + VIEW_H - size - 10, size, 'horizontal');
      this.buildMenu(hx + hotW + 8, my + VIEW_H - 50, 58, 'horizontal');
    }

    this.mapText = label(this, mx + VIEW_W - 10, my + 8, '', { size: 14, stroke: true, align: 'right' }).setOrigin(1, 0);
    this.hintText = label(this, mx + VIEW_W / 2, my + 40, t('hud.pickTarget'), { size: 18, stroke: true, color: '#ffe08a' })
      .setOrigin(0.5).setVisible(false);
    this.root.add([this.mapText, this.hintText]);

    // Boss health bar, top center of the map view, while a boss is nearby.
    const bw = 420;
    this.bossName = label(this, mx + VIEW_W / 2, my + 64, '', { size: 15, bold: true, stroke: true, color: '#ffb0a0' }).setOrigin(0.5);
    this.bossBar = bar(this, mx + (VIEW_W - bw) / 2, my + 76, bw, 14, 0xb02828, 10);
    this.bossObjs = [this.bossName, ...this.bossBar.objects];
    this.root.add(this.bossObjs);

    this.logTexts = [];
    const logBottom = side ? my + VIEW_H - 10 : my + VIEW_H - 70;
    for (let i = 0; i < LOG_LINES; i++) {
      const tx = label(this, mx + 10, logBottom - (LOG_LINES - i) * 19, '', { size: 13, stroke: true, wrap: 440 });
      this.logTexts.push(tx);
      this.root.add(tx);
    }
    this.renderLog();

    // Windows are positioned against the map view, so rebuild them too.
    if (this.openPanel) this.renderPanel();
    if (this.deathBox && this.lastDeath) this.showDeath(this.lastDeath);
    if (this.dialog) this.closeDialog();
  }

  private buildStatus(x: number, y: number, w: number): void {
    this.levelText = label(this, x, y, '', { size: 15, bold: true, stroke: true });
    this.hpBar = bar(this, x, y + 24, w, 16, COLORS.hp, 11);
    this.mpBar = bar(this, x, y + 44, w, 16, COLORS.mp, 11);
    this.expBar = bar(this, x, y + 64, w, 12, COLORS.exp, 9);
    this.alignText = label(this, x, y + 82, '', { size: 12, stroke: true });
    this.goldText = label(this, x, y + 100, '', { size: 12, stroke: true, color: '#ffe08a' });
    this.buffText = label(this, x, y + 118, '', { size: 12, stroke: true, color: '#ffb060' });
    this.root.add([this.levelText, ...this.hpBar.objects, ...this.mpBar.objects, ...this.expBar.objects,
      this.alignText, this.goldText, this.buffText]);
  }

  private buildMenu(x: number, y: number, w: number, dir: 'vertical' | 'horizontal'): void {
    const items: [PanelKind, string][] = [
      ['character', 'menu.character'], ['inventory', 'menu.inventory'], ['spells', 'menu.spells'], ['settings', 'menu.settings'],
    ];
    items.forEach(([kind, key], i) => {
      const bx = dir === 'vertical' ? x : x + i * (w + 6);
      const by = dir === 'vertical' ? y + i * 46 : y;
      this.root.add(button(this, bx, by, w, 40, t(key), () => this.togglePanel(kind), { size: 15 }).container);
    });
  }

  private buildHotbar(x: number, y: number, size: number, dir: 'vertical' | 'horizontal'): void {
    this.slots = [];
    for (let i = 0; i < 6; i++) {
      const sx = dir === 'vertical' ? x : x + i * (size + 6);
      const sy = dir === 'vertical' ? y + i * (size + 8) : y;
      const bg = this.add.rectangle(sx, sy, size, size, COLORS.slot, 0.9).setOrigin(0).setStrokeStyle(2, COLORS.slotEdge);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
        consumePointer(this, p);
        if (p.button === 0) this.activateHotbar(i); // middle button is handled globally
      });
      const icon = iconImage(this, sx + size / 2, sy + size / 2, 'gold', size - 12).setVisible(false);
      const cd = this.add.rectangle(sx + 1, sy + 1, size - 2, 0, 0x000000, 0.6).setOrigin(0);
      const key = label(this, sx + 3, sy + 1, String(i + 1), { size: 10, stroke: true, color: '#c8c8e0' });
      const count = label(this, sx + size - 3, sy + size - 2, '', { size: 11, stroke: true }).setOrigin(1, 1);
      this.root.add([bg, icon, cd, key, count]);
      this.slots.push({ frame: bg, icon, count, cd, size, ref: '' });
    }
  }

  // ---------------------------------------------------------------- per-frame refresh

  update(): void {
    const s = this.s;
    if (!s) return;
    const c = CONTENT;
    const p = s.player;
    const d = derive(c, p);
    this.levelText.setText(t('hud.level', { class: c.classes[p.classId].nameKey, level: p.level }));
    this.hpBar.set(p.hp / d.maxHp, t('hud.hp', { hp: Math.max(0, p.hp), max: d.maxHp }));
    this.mpBar.set(p.mp / d.maxMp, t('hud.mp', { mp: p.mp, max: d.maxMp }));
    const prog = levelProgress(c, p);
    this.expBar.set(prog, t('hud.exp', { pct: (prog * 100).toFixed(1) }));
    const al = p.alignment >= 300 ? 'align.good' : p.alignment <= -300 ? 'align.evil' : 'align.neutral';
    this.alignText.setText(t('hud.alignment', { n: p.alignment, label: al }));
    this.goldText.setText(t('hud.gold', { n: p.gold }));
    const buffLeft = Math.ceil((p.maxDamageUntil - s.tick) / TICKS_PER_SECOND);
    this.buffText.setText(buffLeft > 0 ? `${t('hud.maxDamage')} ${buffLeft}s` : '');

    const map = currentMap(s);
    const safe = playerInSafeZone(s);
    this.mapText.setText(`${t(map.nameKey)}\n${t(safe ? 'hud.safeZone' : 'hud.danger')}\n${t('hud.position', { x: p.mover.x, y: p.mover.y })}`);
    this.mapText.setColor(safe ? '#bfe4ff' : '#ffc0a8');
    this.hintText.setVisible((this.registry.get(REG_TARGETING) as number) >= 0);
    const boss = s.monsters.find((m) => !m.dead && CONTENT.monsters[m.defId]?.boss
      && chebyshev(m.mover.x, m.mover.y, p.mover.x, p.mover.y) <= BOSS_BAR_RANGE);
    for (const o of this.bossObjs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(!!boss);
    if (boss) {
      const md = CONTENT.monsters[boss.defId]!;
      this.bossName.setText(t(md.nameKey));
      this.bossBar.set(boss.hp / md.hp, `${boss.hp} / ${md.hp}`);
    }

    this.updateHotbar(s);
    this.fadeLog();
    if (this.openPanel && NPC_PANELS.includes(this.openPanel)) {
      // Walking away from the NPC closes its window.
      const n = map.npcs.find((x) => x.npcId === this.npcId);
      if (!n || p.dead || chebyshev(p.mover.x, p.mover.y, n.x, n.y) > CONTENT.balance.npcReach + 1) this.closePanel();
    }
    if (this.openPanel) {
      const sig = this.panelSignature();
      if (sig !== this.panelSig) this.renderPanel();
    }
  }

  private updateHotbar(s: GameState): void {
    const p = s.player;
    p.hotbar.forEach((ref, i) => {
      const v = this.slots[i];
      if (!v) return;
      let icon = '';
      let countText = '';
      let cdFrac = 0;
      let usable = true;
      if (ref?.kind === 'item') {
        const def = CONTENT.items[ref.id];
        if (def) {
          icon = def.icon;
          const n = countItem(p, ref.id);
          countText = def.stackable ? String(n) : '';
          usable = n > 0;
          if (def.cooldownGroup) cdFrac = ((p.cooldowns[def.cooldownGroup] ?? 0) - s.tick) / (def.cooldownTicks || 1);
        }
      } else if (ref?.kind === 'spell') {
        const sp = CONTENT.spells[ref.id];
        if (sp) {
          icon = sp.icon;
          usable = p.mp >= sp.mp;
          cdFrac = ((p.cooldowns[`spell:${ref.id}`] ?? 0) - s.tick) / (sp.cooldownTicks || 1);
        }
      }
      const sig = `${icon}|${countText}|${usable}`;
      if (sig !== v.ref) {
        v.ref = sig;
        if (icon) v.icon.setTexture(iconTexture(icon)).setDisplaySize(v.size - 12, v.size - 12).setVisible(true).setAlpha(usable ? 1 : 0.35);
        else v.icon.setVisible(false);
        v.count.setText(countText);
      }
      v.cd.height = Math.max(0, Math.min(1, cdFrac)) * (v.size - 2);
      const sel = i === this.selectedSlot;
      v.frame.setStrokeStyle(sel ? 3 : 2, sel ? COLORS.select : COLORS.slotEdge);
    });
  }

  // ---------------------------------------------------------------- hotbar

  private activateHotbar(i: number): void {
    this.selectedSlot = i;
    const s = this.s;
    const p = s.player;
    const ref = p.hotbar[i];
    if (!ref || p.dead) return;
    if (ref.kind === 'spell') {
      const sp = CONTENT.spells[ref.id];
      if (sp?.target === 'enemy') {
        // Targeted spells use the current target if valid, otherwise the next tap picks one (plan §5).
        const cur = p.action.kind === 'attack' ? s.monsters.find((m) => !m.dead && m.id === (p.action as { monsterId: number }).monsterId) : undefined;
        if (cur && chebyshev(p.mover.x, p.mover.y, cur.mover.x, cur.mover.y) <= sp.range) {
          this.issue({ type: 'useHotbar', slot: i, targetId: cur.id });
        } else {
          this.registry.set(REG_TARGETING, i);
        }
        return;
      }
    }
    this.issue({ type: 'useHotbar', slot: i });
  }

  /** Cancels a pending "pick a target" spell. Returns true if one was pending. */
  private cancelTargeting(): boolean {
    if ((this.registry.get(REG_TARGETING) as number) < 0) return false;
    this.registry.set(REG_TARGETING, -1);
    return true;
  }

  // ---------------------------------------------------------------- message log

  private onGameEvents(evs: GameEvent[]): void {
    for (const e of evs) {
      if (e.type === 'log') this.addLog(t(e.key, e.params), TONE_COLORS[e.tone ?? 'info'] ?? '#e8e8e8');
      else if (e.type === 'npcInteract') this.openNpc(e.npcId);
      else if (e.type === 'playerDied') this.showDeath(e);
      else if (e.type === 'respawned') this.hideDeath();
      else if (e.type === 'mapChanged') this.closeDialog();
    }
  }

  private addLog(text: string, color: string): void {
    this.log.push({ text, color, at: this.time.now });
    if (this.log.length > LOG_LINES) this.log.shift();
    this.renderLog();
  }

  private renderLog(): void {
    const start = LOG_LINES - this.log.length;
    this.logTexts.forEach((tx, i) => {
      const line = this.log[i - start];
      tx.setText(line ? line.text : '');
      if (line) tx.setColor(line.color);
    });
    this.fadeLog();
  }

  private fadeLog(): void {
    const start = LOG_LINES - this.log.length;
    const now = this.time.now;
    this.logTexts.forEach((tx, i) => {
      const line = this.log[i - start];
      if (!line) return;
      const age = now - line.at;
      tx.setAlpha(age < LOG_FADE_MS ? 1 : Math.max(0.25, 1 - (age - LOG_FADE_MS) / 3000));
    });
  }

  // ---------------------------------------------------------------- windows

  /** Talking to an NPC: the save NPC uses a dialog; shop, warehouse and blacksmith open windows. */
  private openNpc(npcId: string): void {
    const npc = CONTENT.npcs[npcId];
    if (!npc) return;
    if (npc.role === 'save') {
      this.showNpcDialog(npcId);
      return;
    }
    this.closeDialog();
    this.npcId = npcId;
    this.npcSel = newNpcSelection();
    this.openPanel = npc.role === 'shop' ? 'shop' : npc.role;
    this.renderPanel();
  }

  private npcWindowCtx(): NpcWindowCtx {
    return {
      scene: this, state: this.s, npcId: this.npcId, sel: this.npcSel,
      issue: (cmd) => this.issue(cmd),
      rerender: () => this.renderPanel(),
    };
  }

  private togglePanel(kind: PanelKind): void {
    if (this.openPanel === kind) this.closePanel();
    else {
      this.openPanel = kind;
      this.selectedUid = null;
      this.selectedEquip = null;
      this.selectedSpell = null;
      this.renderPanel();
    }
  }

  private closePanel(): void {
    this.openPanel = null;
    this.panel?.destroy();
    this.panel = null;
  }

  private panelSignature(): string {
    const s = this.s;
    const p = s.player;
    const base = `${this.openPanel}|${this.selectedUid}|${this.selectedEquip}|${this.selectedSpell}`;
    if (this.openPanel && NPC_PANELS.includes(this.openPanel)) return `${base}|${npcWindowSignature(s, this.npcSel)}`;
    switch (this.openPanel) {
      case 'inventory':
        return `${base}|${p.gold}|${p.level}|${p.inventory.map((i) => `${i.uid}:${i.count}:${i.dur}`).join(',')}|${p.equipment.weapon?.dur}|${EQUIP_SLOTS.map((k) => p.equipment[k]?.uid ?? '-').join(',')}|${JSON.stringify(p.hotbar)}`;
      case 'character':
        return `${base}|${p.level}|${p.exp}|${p.hp}|${p.mp}|${p.alignment}|${p.inventory.length}|${EQUIP_SLOTS.map((k) => p.equipment[k]?.uid ?? '-').join(',')}`;
      case 'spells':
        return `${base}|${p.spells.join(',')}|${JSON.stringify(p.hotbar)}`;
      default:
        return base;
    }
  }

  private renderPanel(): void {
    this.panel?.destroy();
    this.panel = null;
    if (!this.openPanel) return;
    const L = this.layout;
    const w = 620;
    const h = this.openPanel === 'settings' ? 330 : 440;
    const x = L.sidePanelW + (VIEW_W - w) / 2;
    const y = L.mapY / L.zoom + (VIEW_H - h) / 2 - 10;
    const titles: Record<PanelKind, string> = {
      character: 'char.title', inventory: 'inv.title', spells: 'spells.title', settings: 'settings.title',
      shop: 'shop.title', warehouse: 'wh.title', blacksmith: 'smith.title',
    };
    const npcName = CONTENT.npcs[this.npcId]?.nameKey ?? '';
    const c = panelFrame(this, x, y, w, h, t(titles[this.openPanel], { npc: npcName }), () => this.closePanel());
    c.setDepth(500);
    this.panel = c;
    if (this.openPanel === 'character') this.fillCharacter(c);
    else if (this.openPanel === 'inventory') this.fillInventory(c, w, h);
    else if (this.openPanel === 'spells') this.fillSpells(c, w);
    else if (this.openPanel === 'shop') fillShop(this.npcWindowCtx(), c, w, h);
    else if (this.openPanel === 'warehouse') fillWarehouse(this.npcWindowCtx(), c, w, h);
    else if (this.openPanel === 'blacksmith') fillSmith(this.npcWindowCtx(), c, w, h);
    else this.fillSettings(c, w);
    this.panelSig = this.panelSignature();
  }

  private fillCharacter(c: Phaser.GameObjects.Container): void {
    const p = this.s.player;
    const d = derive(CONTENT, p);
    const cls = CONTENT.classes[p.classId];
    const next = p.level >= CONTENT.balance.levelCap ? '—' : String(expForLevel(CONTENT, p.level + 1));
    const left: [string, string][] = [
      [t('char.class'), t(cls.nameKey)],
      [t('char.level'), String(p.level)],
      [t('char.exp'), `${p.exp} / ${next}`],
      [t('char.hp'), `${p.hp} / ${d.maxHp}`],
      [t('char.mp'), `${p.mp} / ${d.maxMp}`],
      [t('char.alignment'), String(p.alignment)],
      [t('char.weight'), `${(d.weight / 10).toFixed(1)} / ${(d.maxWeight / 10).toFixed(1)}`],
    ];
    const right: [string, string][] = [
      ...STAT_KEYS.map((k): [string, string] => [t(`stat.${k}`), String(p.stats[k])]),
      [t('char.hit'), `${d.hitBonus >= 0 ? '+' : ''}${d.hitBonus}%`],
      [t('char.evasion'), `${d.evasion}%`],
      [t('char.dmg'), `${d.meleeBonus >= 0 ? '+' : ''}${d.meleeBonus}`],
      [t('char.ranged'), `${d.rangedBonus >= 0 ? '+' : ''}${d.rangedBonus}`],
      [t('char.spell'), `${d.spellBonus >= 0 ? '+' : ''}${d.spellBonus}`],
      [t('char.def'), String(d.def)],
      [t('char.mr'), `${d.mr}%`],
      [t('char.attack'), (() => {
        const w = p.equipment.weapon;
        const pv = damagePreview(CONTENT, p, w ? CONTENT.items[w.itemId]?.weapon : undefined, w?.enh ?? 0, w?.dur);
        return `${pv.total[0]}-${pv.total[1]}`;
      })()],
    ];
    left.forEach(([k, v], i) => {
      c.add(label(this, 24, 50 + i * 30, k, { size: 15, color: '#b8b8d0' }));
      c.add(label(this, 140, 50 + i * 30, v, { size: 15 }));
    });
    right.forEach(([k, v], i) => {
      c.add(label(this, 330, 50 + i * 30, k, { size: 15, color: '#b8b8d0' }));
      c.add(label(this, 480, 50 + i * 30, v, { size: 15 }));
    });
  }

  private fillInventory(c: Phaser.GameObjects.Container, w: number, h: number): void {
    const s = this.s;
    const p = s.player;
    const d = derive(CONTENT, p);
    const pct = Math.round((d.weight / d.maxWeight) * 100);
    const wColor = pct >= 100 ? '#ff6060' : pct > 80 ? '#ff9a6a' : pct > 50 ? '#ffe08a' : '#c8e8c0';
    c.add(label(this, 16, 40, t('inv.gold', { n: p.gold }), { size: 14, color: '#ffe08a' }));
    c.add(label(this, 210, 40, t('inv.weight', { w: (d.weight / 10).toFixed(1), max: (d.maxWeight / 10).toFixed(1), pct }), { size: 14, color: wColor }));

    // Equipment slots: 2 columns x 4 rows.
    EQUIP_SLOTS.forEach((slot, i) => {
      const sx = 16 + (i % 2) * 90;
      const sy = 66 + Math.floor(i / 2) * 58;
      const st = p.equipment[slot];
      const sel = this.selectedEquip === slot;
      const bg = this.add.rectangle(sx, sy, 40, 40, COLORS.slot).setOrigin(0).setStrokeStyle(2, sel ? COLORS.select : COLORS.slotEdge);
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        consumePointer(this, ptr);
        this.selectedEquip = st ? slot : null;
        this.selectedUid = null;
        this.renderPanel();
      });
      c.add(bg);
      if (st) c.add(iconImage(this, sx + 20, sy + 20, CONTENT.items[st.itemId]!.icon, 32));
      c.add(label(this, sx + 46, sy + 12, t(`slot.${slot}`), { size: 12, color: '#a0a0c0' }));
    });

    // Bag grid: 10 x 6.
    const gx = 200;
    const gy = 66;
    const cell = 40;
    for (let i = 0; i < CONTENT.balance.inventorySlots; i++) {
      const cx = gx + (i % 10) * cell;
      const cy = gy + Math.floor(i / 10) * cell;
      const st = p.inventory[i];
      const sel = st && st.uid === this.selectedUid;
      const bg = this.add.rectangle(cx, cy, cell - 3, cell - 3, COLORS.slot).setOrigin(0).setStrokeStyle(1, sel ? COLORS.select : COLORS.slotEdge);
      if (sel) bg.setStrokeStyle(2, COLORS.select);
      c.add(bg);
      if (!st) continue;
      const def = CONTENT.items[st.itemId]!;
      const greyed = def.kind === 'equipment' && cannotEquip(p, def) !== null;
      c.add(iconImage(this, cx + 18, cy + 18, def.icon, 30).setAlpha(greyed ? 0.35 : 1));
      if (def.stackable && st.count > 1) c.add(label(this, cx + cell - 5, cy + cell - 4, String(st.count), { size: 10, stroke: true }).setOrigin(1, 1));
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        consumePointer(this, ptr);
        this.selectedUid = st.uid;
        this.selectedEquip = null;
        this.renderPanel();
      });
    }

    // Detail area.
    const dy = gy + 6 * cell + 8;
    c.add(this.add.rectangle(12, dy, w - 24, h - dy - 12, 0x15151f).setOrigin(0).setStrokeStyle(1, COLORS.slotEdge));
    const selected: ItemStack | undefined = this.selectedUid !== null
      ? p.inventory.find((i) => i.uid === this.selectedUid)
      : this.selectedEquip ? p.equipment[this.selectedEquip] : undefined;
    if (!selected) {
      c.add(label(this, 24, dy + 12, t('inv.empty'), { size: 14, color: '#9090a8' }));
      return;
    }
    const def = CONTENT.items[selected.itemId]!;
    c.add(iconImage(this, 40, dy + 28, def.icon, 32));
    const name = `${selected.enh > 0 ? `+${selected.enh} ` : ''}${t(def.nameKey)}${def.stackable ? ` ×${selected.count}` : ''}`;
    c.add(label(this, 64, dy + 10, name, { size: 16, bold: true }));
    const lines: string[] = [];
    if (def.descKey) lines.push(t(def.descKey));
    if (def.weapon) {
      lines.push(t('inv.dmg', { min: def.weapon.dmg[0], max: def.weapon.dmg[1], hit: def.weapon.hit })
        + (def.weapon.range > 1 ? `${SEP}${t('inv.range', { n: def.weapon.range })}` : '')
        + (def.weapon.twoHanded ? `${SEP}${t('inv.twoHanded')}` : ''));
      lines.push(this.damageLine(def.weapon, selected.enh, selected.dur));
      lines.push(t('inv.durability', { n: selected.dur, max: def.weapon.durability }));
    }
    if (def.kind === 'ammo') lines.push(t('inv.arrowDamage', { n: def.arrowDamage ?? 0 }));
    if (def.def) lines.push(t('inv.def', { n: def.def }) + (def.mr ? `${SEP}${t('inv.mr', { n: def.mr })}` : ''));
    const req: string[] = [];
    if (def.classes && def.classes.length < 3) req.push(t('inv.classes', { list: def.classes.map((k) => t(CONTENT.classes[k].nameKey)).join('、') }));
    if (def.level && def.level > 1) req.push(t('inv.levelReq', { n: def.level }));
    req.push(t('inv.itemWeight', { w: (def.weight / 10).toFixed(1) }));
    lines.push(req.join(SEP));
    const reason = def.kind === 'equipment' ? cannotEquip(p, def) : null;
    if (reason) lines.push(t('inv.cannotEquip', { reason: t(reason) }));
    c.add(label(this, 64, dy + 34, lines.join('\n'), { size: 13, color: reason ? '#ffb0a0' : '#d0d0e0', wrap: 330 }));

    // Actions
    const ax = w - 210;
    const equipped = this.selectedEquip !== null;
    if (equipped) {
      c.add(button(this, ax, dy + 10, 90, 34, t('inv.unequip'), () => {
        this.issue({ type: 'unequip', slot: this.selectedEquip! });
        this.selectedEquip = null;
      }).container);
    } else {
      if (def.kind === 'equipment') {
        c.add(button(this, ax, dy + 10, 90, 34, t('inv.equip'), () => this.issue({ type: 'equip', uid: selected.uid }), { enabled: !reason }).container);
      } else if (def.kind === 'ammo') {
        const active = chooseArrow(CONTENT, p) === selected.itemId;
        c.add(button(this, ax, dy + 10, 90, 34, t(active ? 'inv.ammoActive' : 'inv.selectAmmo'),
          () => this.issue({ type: 'useItem', uid: selected.uid }), { enabled: !active }).container);
      } else if (def.use) {
        c.add(button(this, ax, dy + 10, 90, 34, t('inv.use'), () => this.issue({ type: 'useItem', uid: selected.uid })).container);
      }
      c.add(button(this, ax + 100, dy + 10, 90, 34, t('inv.drop'), () => {
        this.issue({ type: 'dropItem', uid: selected.uid, count: selected.count });
        this.selectedUid = null;
      }).container);
      if (def.use || def.kind === 'ammo') this.addHotbarAssign(c, ax, dy + 54, { kind: 'item', id: selected.itemId });
    }
  }

  /** "實際傷害 6-10（敏捷 +4、箭 +1）": what this weapon would really do, before the target's Def. */
  private damageLine(w: WeaponStats, enh: number, dur: number): string {
    const p = this.s.player;
    const pv = damagePreview(CONTENT, p, w, enh, dur);
    if (w.ranged && !pv.arrowId) return t('inv.noArrows', { min: pv.total[0], max: pv.total[1] });
    const sign = (n: number) => (n >= 0 ? `+${n}` : String(n));
    const parts = [t(`inv.part.${pv.stat}`, { n: sign(pv.statBonus) })];
    if (pv.arrowId) parts.push(t('inv.part.arrow', { item: CONTENT.items[pv.arrowId]!.nameKey, n: sign(pv.arrowDamage) }));
    if (pv.enh) parts.push(t('inv.part.enh', { n: sign(pv.enh) }));
    return t('inv.dmgTotal', { min: pv.total[0], max: pv.total[1], parts: parts.join('、') });
  }

  /** "Put on hotbar: [1]..[6]" row. */
  private addHotbarAssign(c: Phaser.GameObjects.Container, x: number, y: number, ref: HotbarRef): void {
    c.add(label(this, x, y + 6, t('inv.toHotbar'), { size: 12, color: '#a0a0c0' }));
    for (let i = 0; i < 6; i++) {
      const cur = this.s.player.hotbar[i];
      const same = cur && cur.kind === ref.kind && cur.id === ref.id;
      c.add(button(this, x + i * 32, y + 26, 28, 28, String(i + 1), () => {
        this.issue({ type: 'setHotbar', slot: i, ref: same ? null : ref });
      }, { size: 13, color: same ? 0x6a6030 : undefined }).container);
    }
  }

  private fillSpells(c: Phaser.GameObjects.Container, w: number): void {
    const p = this.s.player;
    p.spells.forEach((id, i) => {
      const sp = CONTENT.spells[id]!;
      const y = 44 + i * 70;
      const sel = this.selectedSpell === id;
      const bg = this.add.rectangle(12, y, w - 24, 64, sel ? 0x2c2a44 : 0x1a1a26).setOrigin(0).setStrokeStyle(1, sel ? COLORS.select : COLORS.slotEdge);
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        consumePointer(this, ptr);
        this.selectedSpell = id;
        this.renderPanel();
      });
      c.add(bg);
      c.add(iconImage(this, 40, y + 32, sp.icon, 36));
      c.add(label(this, 68, y + 6, t(sp.nameKey), { size: 15, bold: true }));
      c.add(label(this, 68, y + 26, t('spells.cost', {
        mp: sp.mp, cd: (sp.cooldownTicks / TICKS_PER_SECOND).toFixed(1), range: sp.target === 'self' ? t('spells.self') : sp.range,
      }), { size: 12, color: '#a8a8c8' }));
      c.add(label(this, 68, y + 44, t(sp.descKey), { size: 12, color: '#d0d0e0', wrap: 300 }));
      if (sel) this.addHotbarAssign(c, w - 214, y + 2, { kind: 'spell', id });
    });
  }

  private fillSettings(c: Phaser.GameObjects.Container, w: number): void {
    c.add(label(this, 24, 46, t('settings.audio'), { size: 14, color: '#a8a8c8' }));
    const bw = (w - 60) / 2;
    c.add(button(this, 20, 86, bw, 44, t('settings.export'), () => {
      void loadSave().then((save) => {
        if (save) exportSaveFile(save);
        else this.message(t('settings.noSave'));
      });
    }).container);
    c.add(button(this, 40 + bw, 86, bw, 44, t('settings.import'), () => this.importSave()).container);
    c.add(button(this, 20, 146, bw, 44, t('settings.credits'), () => this.creditsBox()).container);
    c.add(button(this, 40 + bw, 146, bw, 44, t('settings.toTitle'), () => {
      this.confirm(t('settings.toTitleConfirm'), () => this.toTitle());
    }).container);
  }

  private viewCenter(): { x: number; y: number } {
    const L = this.layout;
    return { x: L.sidePanelW + VIEW_W / 2, y: L.mapY / L.zoom + VIEW_H / 2 };
  }

  private message(text: string): void {
    const v = this.viewCenter();
    messageBox(this, v.x, v.y, text);
  }

  private confirm(text: string, onYes: () => void): void {
    const v = this.viewCenter();
    confirmBox(this, v.x, v.y, text, onYes);
  }

  private creditsBox(): void {
    const v = this.viewCenter();
    showCreditsBox(this, v.x, v.y);
  }

  private importSave(): void {
    pickSaveFile().then((data) => {
      this.confirm(t('settings.importConfirm'), () => {
        void writeSave(data).then(() => this.toTitle());
      });
    }).catch((e: unknown) => this.message(t('settings.importFailed', { reason: e instanceof Error ? e.message : String(e) })));
  }

  private toTitle(): void {
    this.scene.stop('World');
    this.scene.start('Title');
  }

  // ---------------------------------------------------------------- NPC dialog & death

  private showNpcDialog(npcId: string): void {
    this.closeDialog();
    const npc = CONTENT.npcs[npcId];
    if (!npc) return;
    const L = this.layout;
    const w = 520;
    const h = 130;
    const x = L.sidePanelW + (VIEW_W - w) / 2;
    const y = L.mapY / L.zoom + VIEW_H - h - 80;
    const bg = this.add.rectangle(0, 0, w, h, COLORS.panel, 0.97).setOrigin(0).setStrokeStyle(2, COLORS.panelEdge);
    blockInput(this, bg);
    const c = this.add.container(x, y, [bg]).setDepth(600);
    c.add(label(this, 16, 12, t(npc.nameKey), { size: 15, bold: true, color: '#ffe9a8' }));
    if (npc.role === 'save') {
      c.add(label(this, 16, 40, t('npc.scribe.greet'), { size: 14, wrap: w - 32 }));
      c.add(button(this, 16, h - 50, 150, 38, t('npc.scribe.save'), () => {
        void (this.registry.get(REG_SAVE) as () => Promise<boolean>)();
        this.closeDialog();
      }).container);
    }
    c.add(button(this, w - 116, h - 50, 100, 38, t('npc.leave'), () => this.closeDialog()).container);
    this.dialog = c;
  }

  private closeDialog(): void {
    this.dialog?.destroy();
    this.dialog = null;
  }

  private showDeath(e: Extract<GameEvent, { type: 'playerDied' }>): void {
    this.hideDeath();
    this.lastDeath = e;
    this.closePanel();
    this.closeDialog();
    this.registry.set(REG_TARGETING, -1);
    const v = this.viewCenter();
    const shade = this.add.rectangle(v.x - VIEW_W / 2, v.y - VIEW_H / 2, VIEW_W, VIEW_H, 0x300000, 0.45).setOrigin(0);
    blockInput(this, shade);
    const box = this.add.rectangle(v.x, v.y, 380, 200, COLORS.panel, 0.97).setStrokeStyle(2, 0xa04040);
    const c = this.add.container(0, 0, [shade, box]).setDepth(900);
    c.add(label(this, v.x, v.y - 66, t('death.title'), { size: 24, bold: true, color: '#ff8080' }).setOrigin(0.5));
    let txt = t('death.exp', { n: e.expLost });
    if (e.levelAfter < e.levelBefore) txt += `\n${t('death.level', { n: e.levelAfter })}`;
    c.add(label(this, v.x, v.y - 18, txt, { size: 15, align: 'center' }).setOrigin(0.5));
    c.add(button(this, v.x - 90, v.y + 36, 180, 46, t('death.return'), () => this.issue({ type: 'respawn' }), { size: 17 }).container);
    this.deathBox = c;
  }

  private hideDeath(): void {
    this.deathBox?.destroy();
    this.deathBox = null;
    this.lastDeath = null;
  }
}
