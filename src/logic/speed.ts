// Walk and attack speed (hidden values) and speed-up buffs. Stage 1 = potion / village NPC,
// 2 = class potions or spells, 3 = rare items (balance.speedStages). A stage holds one buff:
// a new one replaces it even if the old one had more time left. Different stages multiply.
import type { Content, GameState, Player, SpeedStage } from './types';
import { SPEED_STAGES } from './types';
import { TICKS_PER_SECOND } from './time';

/** Speed multiplier from the active speed-up buffs (1 = normal). */
export function speedMult(c: Content, p: Player, tick: number): number {
  let m = 1;
  for (const st of SPEED_STAGES) {
    const b = p.buffs.speed?.[st];
    if (b && tick < b.until) m *= c.balance.speedStages[st - 1] ?? 1;
  }
  return m;
}

/** Ticks per tile while walking (may be fractional; movement carries the remainder). */
export function playerStepTicks(s: GameState): number {
  return s.config.stepTicks / speedMult(s.content, s.player, s.tick);
}

/** Ticks between two attacks with a weapon of this speed. */
export function playerAttackTicks(s: GameState, attackTicks: number): number {
  return Math.max(1, Math.round(attackTicks / speedMult(s.content, s.player, s.tick)));
}

/** Gives a speed-up of this stage, replacing the stage's current one. */
export function applyHaste(s: GameState, stage: SpeedStage, ticks: number, source: string): void {
  const p = s.player;
  p.buffs.speed = { ...p.buffs.speed, [stage]: { until: s.tick + ticks, source } };
  s.events.push({ type: 'log', key: 'log.hasteOn', params: { stage, sec: Math.round(ticks / TICKS_PER_SECOND) }, tone: 'good' });
}

/** Ends speed-ups whose time is up. */
export function hasteTick(s: GameState): void {
  const sp = s.player.buffs.speed;
  if (!sp) return;
  for (const st of SPEED_STAGES) {
    const b = sp[st];
    if (b && s.tick >= b.until) {
      delete sp[st];
      s.events.push({ type: 'log', key: 'log.hasteEnded', params: { stage: st } });
    }
  }
}
