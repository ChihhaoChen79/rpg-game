// HUD and windows (plan §6 HUD layout, §7.21). Coordinates are logical px: the camera zoom
// matches the map view, so the map view is always 1024x576 here. On wide phones the HUD sits in
// the side panels beside the map; on 16:9 screens it overlays the map edges.
import Phaser from 'phaser';
import { CONTENT } from '../content';
import type { Command } from '../logic/commands';
import { currentMap, playerInSafeZone } from '../logic/game';
import { attackHitBonus, attackProfile, chooseArrow, damagePreview } from '../logic/combat';
import { scrollFits } from '../logic/enhance';
import { cannotEquip, countItem, firstStackOf } from '../logic/inventory';
import { chebyshev } from '../logic/map';
import { derive, expForLevel, levelProgress } from '../logic/stats';
import { TICKS_PER_SECOND } from '../logic/time';
import {
  EQUIP_SLOTS, SPEED_STAGES, STAT_KEYS, type EquipSlot, type GameEvent, type GameState, type HotbarRef, type ItemStack,
} from '../logic/types';
import { EVT_GAME, REG_ARMED, REG_SLOT, REG_ISSUE, REG_PICK_MONSTER, REG_SAVE, REG_STATE, REG_TARGETING } from '../render/WorldScene';
import { nameColor } from '../render/nameColor';
import { computeLayout, VIEW_H, VIEW_W, type Layout } from '../render/view';
import { deleteSave, exportSaveFile, loadSave, pickSaveFile, writeSave } from '../save/storage';
import { confirmBox, messageBox } from './menuLayout';
import { drawInfoLines, equipProblem, itemInfoLines } from './itemInfo';
import { SHOP_H, fillShop, fillSmith, fillWarehouse, newNpcSelection, npcWindowSignature, type NpcSelection, type NpcWindowCtx } from './npcWindows';
import { getVolumes, setVolumes } from '../audio/audio';
import { typing } from '../input/afterTap';
import { fillAfk, type AfkTab } from './afkWindow';
import { createScreensaver, type Screensaver } from './screensaver';
import { createMinimap, minimapPref, setMinimapPref, type Minimap } from './minimap';
import { bookBadge, magicSummary, spellCostText, spellEffectText, spellLevelText } from './spellText';
import { t } from './strings';
import { showCreditsBox } from './TitleScene';
import {
  bar, blockInput, button, COLORS, consumePointer, iconImage, iconTexture, label, panelFrame, setTextResolution, type Bar, type Button,
} from './widgets';

type PanelKind = 'character' | 'inventory' | 'spells' | 'settings' | 'afk' | 'shop' | 'warehouse' | 'blacksmith';
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
const LOG_LINES = 6; // visible lines, compact
const LOG_LINES_BIG = 14; // visible lines, expanded (⇕)
const LOG_HISTORY = 200; // lines kept for scrolling back
const LOG_LINE_H = 19;
const LOG_W = 440;
const LOG_FADE_MS = 10000;
/** Weight bar color per tier: fine, no regen, can't attack, can't move. */
const WEIGHT_COLORS = [0x6a8a5a, 0xc8a030, 0xd06020, 0xc02828];
/** Frame color for items an enhance scroll can be used on. */
const ENHANCE_COLOR = 0xff9040;
const BONUS_COLOR = '#8fe08a'; // equipment bonus in the character window
const SEP = '\u3000'; // full-width space between items on one line
const BOSS_BAR_RANGE = 15; // tiles

export class HudScene extends Phaser.Scene {
  private layout!: Layout;
  private root!: Phaser.GameObjects.Container;
  private hpBar!: Bar;
  private mpBar!: Bar;
  private expBar!: Bar;
  private weightBar!: Bar;
  private levelText!: Phaser.GameObjects.Text;
  private alignMarker!: Phaser.GameObjects.Image;
  private alignTrack = { x: 0, w: 0 }; // marker range: left end = fully good, right end = fully evil
  private goldText!: Phaser.GameObjects.Text;
  private buffText!: Phaser.GameObjects.Text;
  private afkButton!: Button;
  private afkShown: boolean | null = null;
  private mapText!: Phaser.GameObjects.Text;
  private minimap!: Minimap;
  private saver!: Screensaver;
  private afkTab: AfkTab = 'attack';
  private showMinimap = minimapPref();
  private hintText!: Phaser.GameObjects.Text;
  private bossName!: Phaser.GameObjects.Text;
  private bossBar!: Bar;
  private bossObjs: Phaser.GameObjects.GameObject[] = [];
  private logTexts: Phaser.GameObjects.Text[] = [];
  private slots: SlotView[] = [];
  private selectedSlot = 0; // hotbar slot picked with the mouse wheel or a swipe; middle-click uses it
  private swipe: { from: number; moved: boolean } | null = null; // finger/mouse held down on the hotbar
  private log: LogLine[] = [];
  private logScroll = 0; // lines scrolled back from the newest (0 = following new messages)
  private logBig = false;
  private logBottom = 0;
  private logLeft = 0;
  private logButtons: { up: Button; down: Button; size: Button } | null = null;

  private openPanel: PanelKind | null = null;
  private panel: Phaser.GameObjects.Container | null = null;
  private panelSig = '';
  private selectedUid: number | null = null;
  private selectedEquip: EquipSlot | null = null;
  private enhancing: string | null = null; // enhance scroll item id while picking the item to enhance
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
    this.saver = createScreensaver(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.build, this);
      this.game.events.off(EVT_GAME, onEvents);
      this.saver.destroy();
    });

    // PC: mouse wheel picks a hotbar slot, middle-click uses it.
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (dy === 0) return;
      if (this.overLog(p)) {
        this.scrollLog(dy > 0 ? -1 : 1); // wheel over the log scrolls it instead of the hotbar
        return;
      }
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

    // Touch: swiping along the hotbar chooses a slot without using it (like the wheel). A chosen
    // targeted spell is then cast at any monster you tap, until you choose another slot.
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.swipe || !p.isDown) return;
      const i = this.slotAt(p);
      if (i < 0 || i === this.selectedSlot) return;
      this.swipe.moved = true;
      this.selectedSlot = i;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const sw = this.swipe;
      this.swipe = null;
      if (!sw) return;
      if (sw.moved) {
        this.armSlot(this.selectedSlot);
      } else if (this.slotAt(p) === sw.from) {
        this.armSlot(-1);
        this.activateHotbar(sw.from);
      }
    });

    const kb = this.input.keyboard;
    if (kb) {
      // Shortcuts are off while typing in a text box (shop amounts): "1" mustn't drink a potion.
      const key = (name: string, fn: () => void) => kb.on(`keydown-${name}`, () => {
        if (!typing()) fn();
      });
      for (let i = 0; i < 6; i++) key(['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'][i]!, () => this.activateHotbar(i));
      key('I', () => this.togglePanel('inventory'));
      key('C', () => this.togglePanel('character'));
      key('S', () => this.togglePanel('spells'));
      key('M', () => this.setMinimap(!this.showMinimap));
      key('SPACE', () => this.issue({ type: 'pickupNearest' }));
      key('ESC', () => {
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
      const statusBg = this.add.rectangle(mx + 6, my + 6, 212, 194, 0x000000, 0.45).setOrigin(0);
      this.root.add(statusBg);
      this.buildStatus(mx + 12, my + 12, 200);
      const size = 48;
      const hotW = (size + 6) * 6;
      const hx = mx + (VIEW_W - hotW - 6 * 64) / 2;
      this.buildHotbar(hx, my + VIEW_H - size - 10, size, 'horizontal');
      this.buildMenu(hx + hotW + 8, my + VIEW_H - 50, 58, 'horizontal');
    }

    this.mapText = label(this, mx + VIEW_W - 10, my + 8, '', { size: 14, stroke: true, align: 'right' }).setOrigin(1, 0);
    this.minimap = createMinimap(this, mx + VIEW_W - 8, my + 70);
    this.root.add(this.minimap.objects);
    this.hintText = label(this, mx + VIEW_W / 2, my + 40, t('hud.pickTarget'), { size: 18, stroke: true, color: '#ffe08a' })
      .setOrigin(0.5).setVisible(false);
    this.root.add([this.mapText, this.hintText]);

    // Boss health bar, top center of the map view, while a boss is nearby.
    const bw = 420;
    this.bossName = label(this, mx + VIEW_W / 2, my + 64, '', { size: 15, bold: true, stroke: true, color: '#ffb0a0' }).setOrigin(0.5);
    this.bossBar = bar(this, mx + (VIEW_W - bw) / 2, my + 76, bw, 14, 0xb02828, 10);
    this.bossObjs = [this.bossName, ...this.bossBar.objects];
    this.root.add(this.bossObjs);

    // Message log: no background so it doesn't hide the map; ▲ ▼ scroll back through the
    // history, ⇕ shows more lines. Only the small buttons take taps.
    this.logTexts = [];
    this.logBottom = side ? my + VIEW_H - 10 : my + VIEW_H - 70;
    this.logLeft = mx + 10;
    for (let i = 0; i < LOG_LINES_BIG; i++) {
      const tx = label(this, this.logLeft, 0, '', { size: 13, stroke: true, wrap: LOG_W });
      this.logTexts.push(tx);
      this.root.add(tx);
    }
    const bx = this.logLeft + LOG_W + 8;
    const btn = (y: number, text: string, onClick: () => void) => {
      const b = button(this, bx, y, 30, 26, text, onClick, { size: 12, color: 0x2a2a3a });
      b.container.setAlpha(0.7);
      this.root.add(b.container);
      return b;
    };
    this.logButtons = {
      size: btn(this.logBottom - 3 * 30, '⇕', () => {
        this.logBig = !this.logBig;
        this.renderLog();
      }),
      up: btn(this.logBottom - 2 * 30, '▲', () => this.scrollLog(3)),
      down: btn(this.logBottom - 30, '▼', () => this.scrollLog(-3)),
    };
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
    this.weightBar = bar(this, x, y + 80, w, 12, WEIGHT_COLORS[0]!, 9);
    // Alignment bar: angel (good) on the left, devil (evil) on the right, the player marker
    // in between. The number itself is only shown in the character window.
    const ay = y + 106;
    const tx = x + 20;
    const tw = w - 40;
    const track = this.add.graphics();
    const steps = 24;
    const full = CONTENT.balance.nameColorFullAt;
    for (let i = 0; i < steps; i++) {
      const al = full - (2 * full * (i + 0.5)) / steps;
      track.fillStyle(Phaser.Display.Color.HexStringToColor(nameColor(al, full)).color, 0.85);
      track.fillRect(tx + (tw * i) / steps, ay - 3, tw / steps + 0.5, 6);
    }
    track.lineStyle(1, 0x000000, 0.8).strokeRect(tx, ay - 3, tw, 6);
    this.alignTrack = { x: tx, w: tw };
    this.alignMarker = iconImage(this, tx + tw / 2, ay, 'align_player', 16);
    this.root.add([track, iconImage(this, x + 8, ay, 'align_angel', 18), iconImage(this, x + w - 8, ay, 'align_devil', 18), this.alignMarker]);
    this.goldText = label(this, x, y + 116, '', { size: 12, stroke: true, color: '#ffe08a' });
    this.buffText = label(this, x, y + 134, '', { size: 12, stroke: true, color: '#ffb060' });
    this.root.add([this.levelText, ...this.hpBar.objects, ...this.mpBar.objects, ...this.expBar.objects, ...this.weightBar.objects,
      this.goldText, this.buffText]);
  }

  private buildMenu(x: number, y: number, w: number, dir: 'vertical' | 'horizontal'): void {
    const items: [PanelKind, string][] = [
      ['character', 'menu.character'], ['inventory', 'menu.inventory'], ['spells', 'menu.spells'], ['settings', 'menu.settings'],
      ['afk', 'menu.assist'], // 輔助: the auto-hunt / assist settings window
    ];
    const at = (i: number): [number, number] => (dir === 'vertical' ? [x, y + i * 46] : [x + i * (w + 6), y]);
    items.forEach(([kind, key], i) => {
      const [bx, by] = at(i);
      this.root.add(button(this, bx, by, w, 40, t(key), () => this.togglePanel(kind), { size: 15 }).container);
    });
    // AFK auto-hunt toggle (the label shows the state; see update()).
    const [ax, ay] = at(items.length);
    this.afkButton = button(this, ax, ay, w, 40, t('menu.afk'), () => {
      this.issue({ type: 'setAfk', on: !this.s.player.afk });
    }, { size: 15, color: 0x2a4a3a });
    this.root.add(this.afkButton.container);
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
        // Left button / finger: a tap uses the slot on release, a swipe chooses one (see create()).
        if (p.button === 0) this.swipe = { from: i, moved: false };
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
    this.saver.update(s, this.time.now);
    this.levelText.setText(t('hud.level', { class: c.classes[p.classId].nameKey, level: p.level }));
    this.hpBar.set(p.hp / d.maxHp, t('hud.hp', { hp: Math.max(0, p.hp), max: d.maxHp }));
    this.mpBar.set(p.mp / d.maxMp, t('hud.mp', { mp: p.mp, max: d.maxMp }));
    const prog = levelProgress(c, p);
    this.expBar.set(prog, t('hud.exp', { pct: (prog * 100).toFixed(1) }));
    // Weight: color shows the tiers (over 50%: no regen, over 80%: can't attack, 100%: can't move).
    const wf = d.weight / d.maxWeight;
    const tier = wf >= 1 ? 3 : wf > c.balance.weightNoAttack ? 2 : wf > c.balance.weightNoRegen ? 1 : 0;
    this.weightBar.set(wf, t('hud.weight', { pct: Math.floor(wf * 100) }), WEIGHT_COLORS[tier]);
    const full = CONTENT.balance.nameColorFullAt;
    const f = (full - Math.max(-full, Math.min(full, p.alignment))) / (2 * full);
    this.alignMarker.x = this.alignTrack.x + f * this.alignTrack.w;
    this.goldText.setText(t('hud.gold', { n: p.gold }));
    const left = (until: number) => Math.ceil((until - s.tick) / TICKS_PER_SECOND);
    const buffs: string[] = [];
    if (p.afk) buffs.push(t('hud.afk'));
    if (p.protected) buffs.push(t('hud.protected'));
    if (left(p.maxDamageUntil) > 0) buffs.push(`${t('hud.maxDamage')} ${left(p.maxDamageUntil)}s`);
    if (p.buffs.def) buffs.push(`${t('hud.buffDef', { n: p.buffs.def.amount })} ${left(p.buffs.def.until)}s`);
    if (p.buffs.mr) buffs.push(`${t('hud.buffMr', { n: p.buffs.mr.amount })} ${left(p.buffs.mr.until)}s`);
    for (const st of SPEED_STAGES) {
      const sp = p.buffs.speed?.[st];
      if (sp && left(sp.until) > 0) buffs.push(`${t('hud.haste', { stage: st })} ${left(sp.until)}s`);
    }
    this.buffText.setText(buffs.join('\n'));
    if (this.afkShown !== !!p.afk) {
      this.afkShown = !!p.afk;
      this.afkButton.setLabel(t(p.afk ? 'menu.afkOn' : 'menu.afk'));
    }

    const map = currentMap(s);
    const safe = playerInSafeZone(s);
    this.mapText.setText(`${t(map.nameKey)}\n${t(safe ? 'hud.safeZone' : 'hud.danger')}\n${t('hud.position', { x: p.mover.x, y: p.mover.y })}`);
    this.mapText.setColor(safe ? '#bfe4ff' : '#ffc0a8');
    const armed = this.registry.get(REG_ARMED) as number;
    const armedRef = armed >= 0 ? p.hotbar[armed] : null;
    if (armed >= 0 && armedRef?.kind !== 'spell') this.registry.set(REG_ARMED, -1); // slot was changed
    if ((this.registry.get(REG_TARGETING) as number) >= 0) this.hintText.setText(t('hud.pickTarget')).setVisible(true);
    else if (armedRef?.kind === 'spell') this.hintText.setText(t('hud.armed', { spell: CONTENT.spells[armedRef.id]!.nameKey })).setVisible(true);
    else this.hintText.setVisible(false);
    const boss = s.monsters.find((m) => !m.dead && CONTENT.monsters[m.defId]?.boss
      && chebyshev(m.mover.x, m.mover.y, p.mover.x, p.mover.y) <= BOSS_BAR_RANGE);
    for (const o of this.bossObjs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(!!boss);
    if (boss) {
      const md = CONTENT.monsters[boss.defId]!;
      this.bossName.setText(t(md.nameKey));
      this.bossBar.set(boss.hp / md.hp, `${boss.hp} / ${md.hp}`);
    }

    this.minimap.update(s, this.showMinimap);
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
      const armed = i === this.registry.get(REG_ARMED);
      v.frame.setStrokeStyle(sel || armed ? 3 : 2, armed ? 0xff9040 : sel ? COLORS.select : COLORS.slotEdge);
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

  /** Hotbar slot under the pointer, or -1. */
  private slotAt(p: Phaser.Input.Pointer): number {
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    return this.slots.findIndex((v) => v.frame.getBounds().contains(wp.x, wp.y));
  }

  /** Chooses a slot whose targeted spell replaces the plain attack when tapping monsters (-1 = none). */
  private armSlot(i: number): void {
    const ref = i >= 0 ? this.s.player.hotbar[i] : null;
    const armed = ref?.kind === 'spell' && CONTENT.spells[ref.id]?.target === 'enemy' ? i : -1;
    this.registry.set(REG_ARMED, armed);
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
      else if (e.type === 'monsterDied') this.saver.onKill();
      else if (e.type === 'playerDied') this.showDeath(e);
      else if (e.type === 'respawned') this.hideDeath();
      else if (e.type === 'mapChanged') this.closeDialog();
    }
  }

  private addLog(text: string, color: string): void {
    this.log.push({ text, color, at: this.time.now });
    if (this.log.length > LOG_HISTORY) this.log.shift();
    else if (this.logScroll > 0) this.logScroll++; // keep the lines being read in place
    this.renderLog();
  }

  private scrollLog(lines: number): void {
    const visible = this.logBig ? LOG_LINES_BIG : LOG_LINES;
    this.logScroll = Math.max(0, Math.min(this.log.length - visible, this.logScroll + lines));
    this.renderLog();
  }

  private overLog(p: Phaser.Input.Pointer): boolean {
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    const visible = this.logBig ? LOG_LINES_BIG : LOG_LINES;
    return wp.x >= this.logLeft && wp.x <= this.logLeft + LOG_W + 40 && wp.y <= this.logBottom && wp.y >= this.logBottom - visible * LOG_LINE_H;
  }

  /** The `visible` lines ending `logScroll` lines before the newest, bottom-aligned. */
  private logWindow(): { lines: LogLine[]; visible: number } {
    const visible = this.logBig ? LOG_LINES_BIG : LOG_LINES;
    this.logScroll = Math.max(0, Math.min(this.logScroll, Math.max(0, this.log.length - visible)));
    const end = this.log.length - this.logScroll;
    return { lines: this.log.slice(Math.max(0, end - visible), end), visible };
  }

  private renderLog(): void {
    const { lines, visible } = this.logWindow();
    this.logTexts.forEach((tx, i) => {
      const line = i < visible ? lines[i - (visible - lines.length)] : undefined;
      tx.setY(this.logBottom - (visible - i) * LOG_LINE_H).setVisible(i < visible);
      tx.setText(line ? line.text : '');
      if (line) tx.setColor(line.color);
    });
    if (this.logButtons) {
      this.logButtons.up.setEnabled(this.logScroll < this.log.length - visible);
      this.logButtons.down.setEnabled(this.logScroll > 0);
      this.logButtons.size.setLabel(this.logBig ? '⇓' : '⇕');
    }
    this.fadeLog();
  }

  /** New lines fade after a while; while scrolled back or expanded, everything stays readable. */
  private fadeLog(): void {
    const { lines, visible } = this.logWindow();
    const now = this.time.now;
    const reading = this.logScroll > 0 || this.logBig;
    this.logTexts.forEach((tx, i) => {
      const line = i < visible ? lines[i - (visible - lines.length)] : undefined;
      if (!line) return;
      const age = now - line.at;
      tx.setAlpha(reading || age < LOG_FADE_MS ? 1 : Math.max(0.25, 1 - (age - LOG_FADE_MS) / 3000));
    });
  }

  // ---------------------------------------------------------------- windows

  /** Talking to an NPC: the save NPC uses a dialog; shop, warehouse and blacksmith open windows. */
  private openNpc(npcId: string): void {
    const npc = CONTENT.npcs[npcId];
    if (!npc) return;
    if (npc.role === 'save' || npc.role === 'haste') {
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
      message: (text) => this.message(text),
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
    this.enhancing = null;
    this.panel?.destroy();
    this.panel = null;
  }

  private panelSignature(): string {
    const s = this.s;
    const p = s.player;
    const base = `${this.openPanel}|${this.selectedUid}|${this.selectedEquip}|${this.selectedSpell}|${this.enhancing}`;
    if (this.openPanel && NPC_PANELS.includes(this.openPanel)) return `${base}|${npcWindowSignature(s, this.npcSel)}`;
    switch (this.openPanel) {
      case 'inventory':
        return `${base}|${p.gold}|${p.level}|${p.inventory.map((i) => `${i.uid}:${i.count}:${i.dur}:${i.enh}`).join(',')}|${p.equipment.weapon?.dur}|${EQUIP_SLOTS.map((k) => `${p.equipment[k]?.uid ?? '-'}:${p.equipment[k]?.enh}`).join(',')}|${JSON.stringify(p.hotbar)}`;
      case 'character':
        return `${base}|${p.level}|${p.exp}|${p.hp}|${p.mp}|${p.alignment}|${p.inventory.length}|${EQUIP_SLOTS.map((k) => p.equipment[k]?.uid ?? '-').join(',')}`;
      case 'spells':
        return `${base}|${p.spells.join(',')}|${JSON.stringify(p.hotbar)}|${p.level}`;
      case 'settings':
        return `${base}|${JSON.stringify(p.afkSettings)}`;
      case 'afk':
        return `${base}|${this.afkTab}|${JSON.stringify(p.afkSettings)}|${p.spells.join(',')}|${p.inventory.map((i) => `${i.itemId}:${i.count}`).join(',')}`;
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
    const h = this.openPanel === 'shop' ? SHOP_H : this.openPanel === 'afk' ? 480 : 440;
    const x = L.sidePanelW + (VIEW_W - w) / 2;
    const y = L.mapY / L.zoom + (VIEW_H - h) / 2 - 10;
    const titles: Record<PanelKind, string> = {
      character: 'char.title', inventory: 'inv.title', spells: 'spells.title', settings: 'settings.title', afk: 'afkWin.title',
      shop: 'shop.title', warehouse: 'wh.title', blacksmith: 'smith.title',
    };
    const npcName = CONTENT.npcs[this.npcId]?.nameKey ?? '';
    const c = panelFrame(this, x, y, w, h, t(titles[this.openPanel], { npc: npcName }), () => this.closePanel());
    c.setDepth(500);
    this.panel = c;
    if (this.openPanel === 'character') this.fillCharacter(c);
    else if (this.openPanel === 'inventory') this.fillInventory(c, w, h);
    else if (this.openPanel === 'spells') this.fillSpells(c, w, h);
    else if (this.openPanel === 'afk') {
      fillAfk({
        scene: this, state: this.s, tab: this.afkTab,
        setTab: (tab) => {
          this.afkTab = tab;
          this.renderPanel();
        },
        issue: (cmd) => this.issue(cmd),
        center: () => this.viewCenter(),
      }, c, w);
    } else if (this.openPanel === 'shop') fillShop(this.npcWindowCtx(), c, w, h);
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
    // Each row: label, value, and the part that comes from equipment (shown in green after it).
    type Row = [string, string, number?];
    const g = d.gear;
    const signed = (n: number) => `${n >= 0 ? '+' : ''}${n}`;
    const al = p.alignment >= CONTENT.balance.alignmentLabelAt ? 'align.good' : p.alignment <= -CONTENT.balance.alignmentLabelAt ? 'align.evil' : 'align.neutral';
    const left: Row[] = [
      [t('char.name'), p.name || '—'],
      [t('char.class'), t(cls.nameKey)],
      [t('char.level'), String(p.level)],
      [t('char.exp'), `${p.exp} / ${next}`],
      [t('char.hp'), `${p.hp} / ${d.maxHp - g.hp}`, g.hp],
      [t('char.mp'), `${p.mp} / ${d.maxMp - g.mp}`, g.mp],
      [t('char.alignment'), `${p.alignment}（${t(al)}）`],
      [t('char.weight'), `${(d.weight / 10).toFixed(1)} / ${(d.maxWeight / 10).toFixed(1)}`],
    ];
    // Hit: class + level + STR (melee) or DEX (bow); the weapon's base hit rate stays hidden,
    // its accuracy, enhancement and accessories count as equipment.
    const w = p.equipment.weapon;
    const prof = attackProfile(CONTENT, p);
    const hitBase = prof.arrowId !== null ? d.rangedHit - g.rangedHit : d.meleeHit - g.meleeHit;
    const b = CONTENT.balance;
    const mrBase = Math.min(b.mrCap, Math.max(0, (p.stats.wis - 10) * b.mrPerWis + (p.buffs.mr?.amount ?? 0)));
    const right: Row[] = [
      ...STAT_KEYS.map((k): Row => [t(`stat.${k}`), String(p.stats[k])]),
      [t('char.hit'), `${signed(hitBase)}%`, attackHitBonus(CONTENT, p, prof) - hitBase],
      [t('char.evasion'), `${d.evasion}%`],
      [t('char.dmg'), signed(d.meleeBonus - g.meleeDmg), g.meleeDmg],
      [t('char.ranged'), signed(d.rangedBonus - g.rangedDmg), g.rangedDmg],
      [t('char.spell'), signed(d.spellBonus - g.spellDmg), g.spellDmg],
      [t('char.def'), String(d.def - g.def), g.def],
      [t('char.mr'), `${mrBase}%`, d.mr - mrBase],
      [t('char.attack'), (() => {
        const pv = damagePreview(CONTENT, p, w ? CONTENT.items[w.itemId]?.weapon : undefined, w?.enh ?? 0, w?.dur);
        return `${pv.total[0]}-${pv.total[1]}`;
      })()],
    ];
    const draw = (rows: Row[], kx: number, vx: number) => rows.forEach(([k, v, bonus], i) => {
      const y = 50 + i * 30;
      c.add(label(this, kx, y, k, { size: 15, color: '#b8b8d0' }));
      const tx = label(this, vx, y, v, { size: 15 });
      c.add(tx);
      if (bonus) c.add(label(this, vx + tx.width + 6, y, signed(bonus), { size: 15, color: BONUS_COLOR }));
    });
    draw(left, 24, 140);
    draw(right, 330, 480);
    c.add(label(this, 24, 50 + 9 * 30 + 10, t('char.bonusLegend'), { size: 12, color: BONUS_COLOR }));
  }

  private fillInventory(c: Phaser.GameObjects.Container, w: number, h: number): void {
    const s = this.s;
    const p = s.player;
    const d = derive(CONTENT, p);
    const pct = Math.round((d.weight / d.maxWeight) * 100);
    const wColor = pct >= 100 ? '#ff6060' : pct > 80 ? '#ff9a6a' : pct > 50 ? '#ffe08a' : '#c8e8c0';
    c.add(label(this, 16, 40, t('inv.gold', { n: p.gold }), { size: 14, color: '#ffe08a' }));
    c.add(label(this, 210, 40, t('inv.weight', { w: (d.weight / 10).toFixed(1), max: (d.maxWeight / 10).toFixed(1), pct }), { size: 14, color: wColor }));

    // Equipment slots placed on a body silhouette (paper doll), 5 columns x 6 rows of 36 px.
    const col = (i: number) => 16 + i * 36;
    const row = (i: number) => 66 + i * 40;
    const doll = this.add.graphics().fillStyle(0x4a4a6c, 1);
    doll.fillCircle(col(2) + 17, row(0) + 17, 20); // head
    doll.fillRect(col(2) - 4, row(1), 42, 3 * 40); // torso
    doll.fillRect(col(1) + 14, row(1) + 8, 2 * 36 + 6, 14); // shoulders
    doll.lineStyle(11, 0x4a4a6c, 1)
      .lineBetween(col(1) + 20, row(1) + 14, col(0) + 17, row(2) + 17) // arms down to the weapon / shield hands
      .lineBetween(col(3) + 14, row(1) + 14, col(4) + 17, row(2) + 17);
    doll.fillRect(col(2) + 1, row(4), 14, 2 * 40 + 10).fillRect(col(2) + 19, row(4), 14, 2 * 40 + 10); // legs
    c.add(doll);
    const SPOTS: Record<EquipSlot, [number, number]> = {
      earring1: [1, 0], helmet: [2, 0], earring2: [3, 0],
      necklace: [2, 1], cloak: [3, 1],
      weapon: [0, 2], armor: [2, 2], shield: [4, 2],
      ring1: [0, 3], gloves: [1, 3], belt: [2, 3], ring2: [4, 3],
      pants: [2, 4],
      boots: [2, 5],
    };
    EQUIP_SLOTS.forEach((slot) => {
      const [ci, ri] = SPOTS[slot];
      const sx = col(ci);
      const sy = row(ri);
      const st = p.equipment[slot];
      const sel = this.selectedEquip === slot;
      const fits = !!st && this.enhanceFits(st);
      const bg = this.add.rectangle(sx, sy, 34, 34, COLORS.slot).setOrigin(0)
        .setStrokeStyle(2, fits ? ENHANCE_COLOR : sel ? COLORS.select : COLORS.slotEdge);
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        consumePointer(this, ptr);
        if (this.enhancing) {
          if (st && fits) this.enhanceTarget(st.uid);
          return;
        }
        this.selectedEquip = st ? slot : null;
        this.selectedUid = null;
        this.renderPanel();
      });
      c.add(bg);
      if (st) {
        c.add(iconImage(this, sx + 17, sy + 17, CONTENT.items[st.itemId]!.icon, 28).setAlpha(this.enhancing && !fits ? 0.35 : 1));
        if (st.enh > 0) c.add(label(this, sx + 2, sy + 1, `+${st.enh}`, { size: 10, stroke: true, color: '#9fe0ff' }));
      } else {
        c.add(label(this, sx + 17, sy + 17, t(`slot.${slot}`), { size: 9, color: '#6a6a88' }).setOrigin(0.5));
      }
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
      const fits = this.enhanceFits(st);
      if (fits) bg.setStrokeStyle(2, ENHANCE_COLOR);
      const greyed = this.enhancing ? !fits : def.kind === 'equipment' && cannotEquip(p, def) !== null;
      c.add(iconImage(this, cx + 18, cy + 18, def.icon, 30).setAlpha(greyed ? 0.35 : 1));
      c.add(bookBadge(this, cx + 18, cy + 18, def, 30));
      if (st.enh > 0) c.add(label(this, cx + 3, cy + 1, `+${st.enh}`, { size: 10, stroke: true, color: '#9fe0ff' }));
      if (def.stackable && st.count > 1) c.add(label(this, cx + cell - 5, cy + cell - 4, String(st.count), { size: 10, stroke: true }).setOrigin(1, 1));
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        consumePointer(this, ptr);
        if (this.enhancing) {
          if (fits) this.enhanceTarget(st.uid);
          return;
        }
        this.selectedUid = st.uid;
        this.selectedEquip = null;
        this.renderPanel();
      });
    }

    // Detail area.
    const dy = gy + 6 * cell + 8;
    c.add(this.add.rectangle(12, dy, w - 24, h - dy - 12, 0x15151f).setOrigin(0).setStrokeStyle(1, COLORS.slotEdge));
    if (this.enhancing) {
      const sd = CONTENT.items[this.enhancing]!;
      c.add(iconImage(this, 40, dy + 28, sd.icon, 32));
      c.add(label(this, 64, dy + 12, t(sd.use?.type === 'enhanceWeapon' ? 'inv.enhancePickWeapon' : 'inv.enhancePickArmor',
        { n: countItem(p, this.enhancing) }), { size: 15, color: '#ffc080', wrap: 330 }));
      c.add(button(this, w - 210, dy + 10, 190, 34, t('inv.enhanceDone'), () => {
        this.enhancing = null;
        this.renderPanel();
      }).container);
      return;
    }
    const selected: ItemStack | undefined = this.selectedUid !== null
      ? p.inventory.find((i) => i.uid === this.selectedUid)
      : this.selectedEquip ? p.equipment[this.selectedEquip] : undefined;
    if (!selected) {
      c.add(label(this, 24, dy + 12, t('inv.empty'), { size: 14, color: '#9090a8' }));
      return;
    }
    const def = CONTENT.items[selected.itemId]!;
    c.add(iconImage(this, 40, dy + 28, def.icon, 32));
    c.add(bookBadge(this, 40, dy + 28, def, 32));
    const name = `${selected.enh > 0 ? `+${selected.enh} ` : ''}${t(def.nameKey)}${def.stackable ? ` ×${selected.count}` : ''}`;
    c.add(label(this, 64, dy + 10, name, { size: 16, bold: true }));
    const problem = equipProblem(p, def);
    const lines = itemInfoLines(p, def, selected.enh, def.weapon ? selected.dur : undefined);
    drawInfoLines(this, c, 64, dy + 34, lines, { size: 13, color: problem ? '#ffb0a0' : '#d0d0e0', wrap: 330, onHelp: (text) => this.message(text) });

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
        c.add(button(this, ax, dy + 10, 90, 34, t('inv.equip'), () => this.issue({ type: 'equip', uid: selected.uid }), { enabled: !problem }).container);
        if (problem) c.add(label(this, ax, dy + 52, problem, { size: 12, color: '#ffb0a0', wrap: 190 }));
      } else if (def.kind === 'ammo') {
        const active = chooseArrow(CONTENT, p) === selected.itemId;
        c.add(button(this, ax, dy + 10, 90, 34, t(active ? 'inv.ammoActive' : 'inv.selectAmmo'),
          () => this.issue({ type: 'useItem', uid: selected.uid }), { enabled: !active }).container);
      } else if (def.use?.type === 'enhanceWeapon' || def.use?.type === 'enhanceArmor') {
        c.add(button(this, ax, dy + 10, 90, 34, t('inv.use'), () => {
          this.enhancing = selected.itemId;
          this.renderPanel();
        }).container);
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

  /** While picking an item to enhance: can the chosen scroll be used on this stack? */
  private enhanceFits(st: ItemStack): boolean {
    return !!this.enhancing && scrollFits(CONTENT.items[this.enhancing]!, CONTENT.items[st.itemId]!);
  }

  /** Reads one scroll on the item; stays in picking mode while scrolls are left. */
  private enhanceTarget(uid: number): void {
    const scroll = firstStackOf(this.s.player, this.enhancing!);
    if (!scroll) {
      this.enhancing = null;
      this.renderPanel();
      return;
    }
    this.issue({ type: 'enhance', scrollUid: scroll.uid, targetUid: uid });
    if (scroll.count <= 1) this.enhancing = null;
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

  /** Spells: what this class can learn, a grid of known spells (sorted by school and level), details. */
  private fillSpells(c: Phaser.GameObjects.Container, w: number, h: number): void {
    const p = this.s.player;
    c.add(label(this, 20, 44, magicSummary(p).join('\n'), { size: 13, color: '#a8a8c8' }));
    const known = [...p.spells].sort((a, b) => {
      const x = CONTENT.spells[a]!, y = CONTENT.spells[b]!;
      return x.school.localeCompare(y.school) || x.magicLevel - y.magicLevel;
    });
    const cell = 48, cols = 12, gx = 18, gy = 92;
    known.forEach((id, i) => {
      const sp = CONTENT.spells[id]!;
      const cx = gx + (i % cols) * cell;
      const cy = gy + Math.floor(i / cols) * cell;
      const sel = this.selectedSpell === id;
      const bg = this.add.rectangle(cx, cy, cell - 4, cell - 4, COLORS.slot).setOrigin(0).setStrokeStyle(sel ? 2 : 1, sel ? COLORS.select : COLORS.slotEdge);
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        consumePointer(this, ptr);
        this.selectedSpell = id;
        this.renderPanel();
      });
      c.add(bg);
      c.add(iconImage(this, cx + (cell - 4) / 2, cy + (cell - 4) / 2, sp.icon, 36));
      c.add(label(this, cx + cell - 7, cy + cell - 6, String(sp.magicLevel), { size: 10, stroke: true }).setOrigin(1, 1));
    });

    const dy = gy + 3 * cell + 8;
    c.add(this.add.rectangle(12, dy, w - 24, h - dy - 12, 0x15151f).setOrigin(0).setStrokeStyle(1, COLORS.slotEdge));
    const id = this.selectedSpell && p.spells.includes(this.selectedSpell) ? this.selectedSpell : null;
    if (!id) {
      c.add(label(this, 24, dy + 12, t(known.length ? 'spells.pick' : 'spells.none'), { size: 14, color: '#9090a8', wrap: w - 60 }));
      return;
    }
    const sp = CONTENT.spells[id]!;
    c.add(iconImage(this, 40, dy + 28, sp.icon, 32));
    c.add(label(this, 64, dy + 10, `${t(sp.nameKey)}${SEP}${spellLevelText(sp)}`, { size: 16, bold: true }));
    c.add(label(this, 64, dy + 34, [spellCostText(sp), spellEffectText(sp), t(sp.descKey)].join('\n'),
      { size: 13, color: '#d0d0e0', wrap: 330 }));
    const ax = w - 210;
    c.add(button(this, ax, dy + 10, 90, 34, t('spells.cast'), () => this.issue({ type: 'castSpell', spellId: id })).container);
    this.addHotbarAssign(c, ax, dy + 54, { kind: 'spell', id });
  }

  private fillSettings(c: Phaser.GameObjects.Container, w: number): void {
    // Music / sound effect volume, in steps of 10% (0% = off). Remembered on this device.
    const vol = getVolumes();
    const half = (w - 60) / 2;
    const volRow = (x: number, key: 'bgm' | 'sfx') => {
      c.add(label(this, x, 52, t(`settings.${key}`, { n: Math.round(vol[key] * 100) }), { size: 14 }));
      c.add(button(this, x + half - 84, 42, 38, 32, '−', () => {
        setVolumes({ [key]: vol[key] - 0.1 });
        this.renderPanel();
      }, { size: 16 }).container);
      c.add(button(this, x + half - 40, 42, 38, 32, '+', () => {
        setVolumes({ [key]: vol[key] + 0.1 });
        this.renderPanel();
      }, { size: 16 }).container);
    };
    volRow(20, 'bgm');
    volRow(40 + half, 'sfx');
    const bw = (w - 60) / 2;
    c.add(button(this, 20, 86, bw, 44, t('settings.export'), () => {
      void loadSave(this.slot()).then((save) => {
        if (save) exportSaveFile(save);
        else this.message(t('settings.noSave'));
      });
    }).container);
    c.add(button(this, 40 + bw, 86, bw, 44, t('settings.import'), () => this.importSave()).container);
    c.add(button(this, 20, 146, bw, 44, t('settings.credits'), () => this.creditsBox()).container);
    c.add(button(this, 40 + bw, 146, bw, 44, t('settings.toTitle'), () => {
      this.confirm(t('settings.toTitleConfirm'), () => this.toTitle());
    }).container);
    c.add(button(this, 20, 206, bw, 44, t('settings.delete'), () => {
      this.confirm(t('settings.deleteConfirm'), () => void deleteSave(this.slot()).then(() => this.toTitle()));
    }, { color: 0x5a2a2a }).container);
    c.add(button(this, 40 + bw, 206, bw, 44, t('settings.minimap', { state: t(this.showMinimap ? 'afk.on' : 'afk.off') }),
      () => this.setMinimap(!this.showMinimap)).container);
    c.add(label(this, 24, 266, t('afk.title'), { size: 15, bold: true }));
    c.add(label(this, 24, 288, t('afk.help'), { size: 12, color: '#a8a8c8', wrap: w - 48 }));
    c.add(button(this, 20, 340, w - 40, 44, t('afkWin.open'), () => this.togglePanel('afk'), { color: 0x2a4a3a }).container);
  }

  private setMinimap(on: boolean): void {
    this.showMinimap = on;
    setMinimapPref(on);
    if (this.openPanel === 'settings') this.renderPanel();
  }

  /** AFK auto-hunt options: potion thresholds (steps of 10%) and two switches. */
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
        void writeSave(this.slot(), data).then(() => this.toTitle());
      });
    }).catch((e: unknown) => this.message(t('settings.importFailed', { reason: e instanceof Error ? e.message : String(e) })));
  }

  /** The save slot of the character being played. */
  private slot(): number {
    return (this.registry.get(REG_SLOT) as number | undefined) ?? 0;
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
    } else if (npc.role === 'haste') {
      c.add(label(this, 16, 40, t(`${npc.nameKey}.greet`), { size: 14, wrap: w - 32 }));
      c.add(button(this, 16, h - 50, 190, 38, t(`${npc.nameKey}.accept`), () => {
        this.issue({ type: 'npcHaste', npcId });
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
    const box = this.add.rectangle(v.x, v.y, 420, 220, COLORS.panel, 0.97).setStrokeStyle(2, 0xa04040);
    const c = this.add.container(0, 0, [shade, box]).setDepth(900);
    c.add(label(this, v.x, v.y - 66, t('death.title'), { size: 24, bold: true, color: '#ff8080' }).setOrigin(0.5));
    let txt = t('death.exp', { n: e.expLost });
    if (e.levelAfter < e.levelBefore) txt += `\n${t('death.level', { n: e.levelAfter })}`;
    if (e.dropped) {
      const d = CONTENT.items[e.dropped.itemId]!;
      txt += `\n${t('death.dropped', { item: `${e.dropped.enh > 0 ? `+${e.dropped.enh} ` : ''}${t(d.nameKey)}` })}`;
    } else if (e.protectionUsed) txt += `\n${t('death.protected')}`;
    c.add(label(this, v.x, v.y - 14, txt, { size: 15, align: 'center', wrap: 390 }).setOrigin(0.5));
    c.add(button(this, v.x - 90, v.y + 46, 180, 46, t('death.return'), () => this.issue({ type: 'respawn' }), { size: 17 }).container);
    this.deathBox = c;
  }

  private hideDeath(): void {
    this.deathBox?.destroy();
    this.deathBox = null;
    this.lastDeath = null;
  }
}
