// Generates placeholder character layers in the LPC "Universal" spritesheet layout, so real
// LPC art (e.g. from the Universal LPC Spritesheet Character Generator) can replace any layer
// file one-to-one. See assets/ASSETS.md for the layout.
//   assets/sprites/characters/<layer>.png   832x1344 (13 x 21 frames of 64x64)
//   public/icons/icon-192.png, icon-512.png   app icon (the starting knight)
// Run: npm run gen:characters
import { mkdirSync, writeFileSync } from 'node:fs';
import { encodePng } from './png.mjs';
import {
  createImage, fillRect, fillEllipse, setPx, shade, blit, outline, line, thickLine, rotate,
} from './draw.mjs';

const F = 64;
const COLS = 13;
const ROWS = 21;

/** LPC universal rows. Each animation has 4 rows in the order up, left, down, right (hurt: 1 row). */
export const ANIMS = {
  spellcast: { row: 0, frames: 7 },
  thrust: { row: 4, frames: 8 },
  walk: { row: 8, frames: 9 },
  slash: { row: 12, frames: 6 },
  shoot: { row: 16, frames: 13 },
  hurt: { row: 20, frames: 6, single: true },
};
const LPC_DIRS = ['up', 'left', 'down', 'right'];

// ---------------------------------------------------------------- pose model

const SHOULDERS = {
  down: { w: { x: 22, y: 37 }, o: { x: 42, y: 37 } }, // weapon hand = character's right = screen left
  up: { w: { x: 42, y: 37 }, o: { x: 22, y: 37 } },
  right: { w: { x: 34, y: 37 }, o: { x: 30, y: 37 } }, // near arm holds the weapon
};
const FACING_ANGLE = { down: 90, up: -90, right: 0 };

/** Where everything is for one frame. Coordinates are absolute in the 64x64 frame. */
function pose(anim, view, f) {
  const sh = SHOULDERS[view];
  const P = {
    bob: 0,
    legs: { l: { dx: 0, lift: 0 }, r: { dx: 0, lift: 0 } },
    W: { x: sh.w.x, y: sh.w.y + 11 },
    O: { x: sh.o.x, y: sh.o.y + 11 },
    wAngle: view === 'right' ? 70 : 95,
    bowHand: null, // set while shooting
    bowAim: FACING_ANGLE[view],
    draw: 0,
    arrow: false,
    rot: 0,
  };
  if (anim === 'walk' && f > 0) {
    const s = Math.sin(((f - 1) / 8) * 2 * Math.PI);
    P.bob = -Math.round(Math.abs(s));
    if (view === 'right') {
      P.legs.l.dx = Math.round(s * 4);
      P.legs.r.dx = -Math.round(s * 4);
      P.legs.l.lift = s > 0 ? Math.round(s * 2) : 0;
      P.legs.r.lift = s < 0 ? Math.round(-s * 2) : 0;
      P.W.x -= Math.round(s * 4);
      P.O.x += Math.round(s * 4);
    } else {
      P.legs.l.lift = s > 0 ? Math.round(s * 2.5) : 0;
      P.legs.r.lift = s < 0 ? Math.round(-s * 2.5) : 0;
      P.W.y -= Math.round(s * 1.5);
      P.O.y += Math.round(s * 1.5);
    }
  } else if (anim === 'slash') {
    const tables = {
      down: [[2, -12, -120], [-2, -14, -100], [6, -6, -40], [10, 4, 30], [8, 10, 80], [4, 11, 100]],
      up: [[-2, -12, -60], [2, -14, -80], [-6, -6, -140], [-10, 4, 150], [-8, 10, 100], [-4, 11, 80]],
      right: [[-4, -12, -110], [-2, -14, -80], [6, -8, -30], [10, 0, 10], [9, 6, 45], [6, 9, 70]],
    };
    const [dx, dy, a] = tables[view][f];
    P.W = { x: sh.w.x + dx, y: sh.w.y + dy };
    P.wAngle = a;
  } else if (anim === 'thrust') {
    const push = [0, -1, -2, 2, 6, 8, 5, 2][f];
    if (view === 'right') {
      P.W = { x: 35 + push, y: 43 };
      P.O = { x: P.W.x - 6, y: 43 };
      P.wAngle = 0;
    } else if (view === 'down') {
      P.W = { x: 30, y: 44 + push };
      P.O = { x: 35, y: P.W.y - 2 };
      P.wAngle = 90;
    } else {
      P.W = { x: 34, y: 42 - push };
      P.O = { x: 29, y: P.W.y + 2 };
      P.wAngle = -90;
    }
  } else if (anim === 'shoot') {
    P.draw = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1, 1, 1, 1, 0, 0, 0][f];
    P.arrow = f >= 1 && f <= 9;
    if (view === 'right') {
      P.O = { x: 45, y: 41 };
      P.W = { x: P.O.x - 4 - Math.round(P.draw * 10), y: 41 };
    } else if (view === 'down') {
      P.O = { x: 32, y: 50 };
      P.W = { x: 32, y: 47 - Math.round(P.draw * 7) };
    } else {
      P.O = { x: 32, y: 30 };
      P.W = { x: 32, y: 33 + Math.round(P.draw * 7) };
    }
    P.bowHand = P.O;
  } else if (anim === 'spellcast') {
    const r = [0, 0.3, 0.7, 1, 1, 0.6, 0.2][f];
    if (view === 'right') {
      P.W = { x: 34 + Math.round(4 * r), y: 48 - Math.round(22 * r) };
      P.O = { x: 30 + Math.round(2 * r), y: 48 - Math.round(20 * r) };
    } else {
      const out = view === 'down' ? 1 : -1;
      P.W = { x: sh.w.x - Math.round(6 * r) * out, y: 48 - Math.round(24 * r) };
      P.O = { x: sh.o.x + Math.round(6 * r) * out, y: 48 - Math.round(24 * r) };
    }
    P.wAngle = r > 0.2 ? -90 : P.wAngle;
  } else if (anim === 'hurt') {
    P.rot = [0, 10, 25, 45, 70, 90][f];
    P.W = { x: 20, y: 44 };
    P.O = { x: 44, y: 44 };
  }
  P.W.y += P.bob;
  P.O.y += P.bob;
  return P;
}

// ---------------------------------------------------------------- body geometry helpers

const torsoRect = (view, P) => (view === 'right'
  ? { x: 27, y: 35 + P.bob, w: 12, h: 15 }
  : { x: 23, y: 35 + P.bob, w: 18, h: 15 });
const headC = (P) => ({ x: 32, y: 25 + P.bob });

/** Leg segments: hip -> foot for far/left and near/right legs. */
function legs(view, P) {
  const hipY = 49 + P.bob;
  if (view === 'right') {
    return [
      { hip: { x: 31, y: hipY }, foot: { x: 31 + P.legs.l.dx, y: 59 - P.legs.l.lift }, far: true },
      { hip: { x: 34, y: hipY }, foot: { x: 34 + P.legs.r.dx, y: 59 - P.legs.r.lift }, far: false },
    ];
  }
  return [
    { hip: { x: 28, y: hipY }, foot: { x: 28, y: 59 - P.legs.l.lift } },
    { hip: { x: 36, y: hipY }, foot: { x: 36, y: 59 - P.legs.r.lift } },
  ];
}

function arms(view, P) {
  const sh = SHOULDERS[view];
  const w = { s: { x: sh.w.x, y: sh.w.y + P.bob }, h: P.W };
  const o = { s: { x: sh.o.x, y: sh.o.y + P.bob }, h: P.O };
  // In side view the off arm is the far arm (drawn first, behind the torso).
  return view === 'right' ? { far: o, near: w, both: [] } : { far: null, near: null, both: [w, o] };
}

const mid = (a, b, t) => ({ x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t) });

// ---------------------------------------------------------------- layer painters

function paintBody(img, P, view, o) {
  const skin = o.skin;
  const dark = shade(skin, 0.85);
  const A = arms(view, P);
  const armLine = (a, c) => {
    thickLine(img, a.s.x, a.s.y, a.h.x, a.h.y, 4, c);
    fillRect(img, a.h.x - 2, a.h.y - 2, 4, 4, c);
  };
  if (A.far) armLine(A.far, dark);
  for (const l of legs(view, P)) thickLine(img, l.hip.x, l.hip.y, l.foot.x, l.foot.y, 5, l.far ? dark : skin);
  const t = torsoRect(view, P);
  fillRect(img, t.x, t.y, t.w, t.h, skin);
  if (A.near) armLine(A.near, skin);
  for (const a of A.both) armLine(a, skin);
  const h = headC(P);
  if (o.ears && view !== 'up') {
    if (view === 'down') {
      thickLine(img, h.x - 9, h.y, h.x - 14, h.y - 4, 2, skin);
      thickLine(img, h.x + 9, h.y, h.x + 14, h.y - 4, 2, skin);
    } else thickLine(img, h.x - 3, h.y, h.x - 7, h.y - 5, 2, skin);
  }
  fillEllipse(img, h.x, h.y, 10, 10, skin);
  fillEllipse(img, h.x, h.y + 5, 8, 4, dark);
  fillEllipse(img, h.x, h.y + 3, 9, 5, skin);
  const eye = [34, 30, 44];
  if (view === 'down') {
    fillRect(img, h.x - 5, h.y + 1, 2, 3, eye);
    fillRect(img, h.x + 3, h.y + 1, 2, 3, eye);
    setPx(img, h.x - 7, h.y + 5, [236, 150, 140]);
    setPx(img, h.x + 6, h.y + 5, [236, 150, 140]);
  } else if (view === 'right') {
    fillRect(img, h.x + 5, h.y + 1, 2, 3, eye);
  }
}

function paintPants(img, P, view, o) {
  const t = torsoRect(view, P);
  fillRect(img, t.x, t.y + t.h - 3, t.w, 4, o.color);
  for (const l of legs(view, P)) {
    const end = mid(l.hip, l.foot, 0.8);
    thickLine(img, l.hip.x, l.hip.y, end.x, end.y, 6, l.far ? shade(o.color, 0.85) : o.color);
  }
}

function paintShoes(img, P, view, o) {
  for (const l of legs(view, P)) {
    const c = l.far ? shade(o.color, 0.85) : o.color;
    if (view === 'right') fillRect(img, l.foot.x - 3, l.foot.y - 2, 7, 3, c);
    else fillRect(img, l.foot.x - 3, l.foot.y - 2, 6, 3, c);
  }
}

function sleeves(img, P, view, color, lengthT, width) {
  const A = arms(view, P);
  const sl = (a, c) => {
    const e = mid(a.s, a.h, lengthT);
    thickLine(img, a.s.x, a.s.y, e.x, e.y, width, c);
  };
  if (A.far) sl(A.far, shade(color, 0.85));
  if (A.near) sl(A.near, color);
  for (const a of A.both) sl(a, color);
}

function paintShirt(img, P, view, o) {
  const t = torsoRect(view, P);
  sleeves(img, P, view, o.color, 0.55, 5);
  fillRect(img, t.x, t.y, t.w, t.h - 2, o.color);
  fillRect(img, t.x, t.y, t.w, 2, shade(o.color, 1.12));
}

function paintArmor(img, P, view, o) {
  const t = torsoRect(view, P);
  if (o.style === 'chain') {
    sleeves(img, P, view, o.color, 0.4, 6);
    fillRect(img, t.x - 1, t.y, t.w + 2, t.h - 1, o.color);
    for (let y = t.y + 2; y < t.y + t.h - 2; y += 2) {
      for (let x = t.x + ((y >> 1) & 1); x < t.x + t.w; x += 2) setPx(img, x, y, shade(o.color, 0.8));
    }
    fillRect(img, t.x - 1, t.y + t.h - 4, t.w + 2, 2, [110, 76, 46]);
  } else {
    fillRect(img, t.x + 1, t.y + 1, t.w - 2, t.h - 3, o.color);
    fillRect(img, t.x + 1, t.y + 1, t.w - 2, 2, shade(o.color, 1.15));
    if (view !== 'up') line(img, t.x + 2, t.y + 2, t.x + t.w - 3, t.y + t.h - 5, shade(o.color, 0.7));
    fillRect(img, t.x, t.y + t.h - 4, t.w, 2, shade(o.color, 0.65));
    if (view !== 'up') setPx(img, t.x + Math.floor(t.w / 2), t.y + t.h - 4, [230, 196, 80]);
  }
}

function paintRobe(img, P, view, o) {
  const t = torsoRect(view, P);
  const c = o.color;
  sleeves(img, P, view, c, 0.95, 6);
  fillRect(img, t.x, t.y, t.w, 10, c);
  fillRect(img, t.x, t.y, t.w, 2, shade(c, 1.15));
  const stride = view === 'right' ? P.legs.l.dx : 0;
  for (let y = t.y + 8; y <= 59; y++) {
    const half = (view === 'right' ? 6 : 9) + Math.floor((y - t.y - 8) / 3);
    const lean = Math.round((stride * (y - t.y - 8)) / 30);
    fillRect(img, 32 - half + lean, y, half * 2, 1, y > 55 ? shade(c, 0.85) : c);
  }
  fillRect(img, t.x, t.y + 9, t.w, 2, o.trim);
}

function paintHair(img, P, view, o) {
  const h = headC(P);
  const c = o.color;
  if (view === 'up') {
    fillEllipse(img, h.x, h.y, 10, 10, c);
    if (o.long) fillRect(img, h.x - 8, h.y + 4, 16, 12, c);
  } else if (view === 'down') {
    fillEllipse(img, h.x, h.y - 5, 10, 6, c);
    fillRect(img, h.x - 10, h.y - 5, 3, 8, c);
    fillRect(img, h.x + 7, h.y - 5, 3, 8, c);
    if (o.long) {
      fillRect(img, h.x - 11, h.y, 3, 13, c);
      fillRect(img, h.x + 8, h.y, 3, 13, c);
    }
  } else {
    fillEllipse(img, h.x - 2, h.y - 4, 10, 7, c);
    fillRect(img, h.x - 10, h.y - 4, 6, 10, c);
    if (o.long) fillRect(img, h.x - 10, h.y, 6, 14, c);
  }
}

function paintHelmet(img, P, view, o) {
  const h = headC(P);
  const c = o.color;
  if (o.style === 'cap') {
    fillEllipse(img, h.x, h.y - 4, 10, 7, c);
    fillRect(img, h.x - 11, h.y - 2, 22, 2, shade(c, 0.8));
    return;
  }
  // full iron helmet
  fillEllipse(img, h.x, h.y - 2, 11, 9, c);
  fillEllipse(img, h.x - 3, h.y - 6, 4, 2, shade(c, 1.3));
  if (view === 'down') {
    fillRect(img, h.x - 9, h.y + 1, 18, 3, c);
    fillRect(img, h.x - 7, h.y + 2, 14, 1, [40, 40, 52]);
    fillRect(img, h.x - 1, h.y - 10, 2, 12, shade(c, 0.8));
  } else if (view === 'right') {
    fillRect(img, h.x - 9, h.y - 1, 14, 6, c);
    fillRect(img, h.x + 2, h.y + 1, 8, 1, [40, 40, 52]);
  } else fillEllipse(img, h.x, h.y + 1, 11, 9, c);
  if (o.plume) {
    fillRect(img, h.x - 1, h.y - 14, 3, 5, o.plume);
    fillRect(img, h.x - 3, h.y - 16, 3, 3, o.plume);
  }
}

function paintHat(img, P, view, o) {
  const h = headC(P);
  fillRect(img, h.x - 14, h.y - 6, 28, 3, o.color);
  fillRect(img, h.x - 13, h.y - 7, 26, 1, shade(o.color, 1.15));
  for (let i = 0; i < 14; i++) {
    const half = Math.max(1, 9 - Math.floor(i * 0.65));
    const lean = view === 'right' ? -Math.floor(i / 4) : Math.floor(i / 6);
    fillRect(img, h.x - half + lean, h.y - 7 - i, half * 2, 1, o.color);
  }
  fillRect(img, h.x - 9, h.y - 9, 18, 2, o.trim);
}

function paintGloves(img, P, view, o) {
  const A = arms(view, P);
  const hands = [A.far, A.near, ...A.both].filter(Boolean).map((a) => a.h);
  for (const hd of hands) fillRect(img, hd.x - 2, hd.y - 2, 5, 5, o.color);
}

function paintBoots(img, P, view, o) {
  for (const l of legs(view, P)) {
    const c = l.far ? shade(o.color, 0.85) : o.color;
    const top = mid(l.hip, l.foot, 0.6);
    thickLine(img, top.x, top.y, l.foot.x, l.foot.y - 1, 6, c);
    fillRect(img, l.foot.x - 3, l.foot.y - 2, view === 'right' ? 8 : 6, 3, c);
  }
}

function paintShield(img, P, view, o) {
  if (P.bowHand) return; // never shown while shooting
  const c = P.O;
  if (view === 'right') {
    fillEllipse(img, c.x + 1, c.y - 2, 4, 9, o.color);
    fillRect(img, c.x, c.y - 9, 2, 14, o.rim);
  } else {
    fillEllipse(img, c.x, c.y - 2, 7, 9, o.color);
    fillEllipse(img, c.x, c.y - 2, 4, 6, o.face);
    fillRect(img, c.x - 1, c.y - 9, 2, 15, o.rim);
  }
}

const dirVec = (deg) => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) });
const along = (p, d, n) => ({ x: Math.round(p.x + d.x * n), y: Math.round(p.y + d.y * n) });

function paintSword(img, P, view, o) {
  if (P.bowHand) return;
  const d = dirVec(P.wAngle);
  const n = { x: -d.y, y: d.x };
  const H = P.W;
  const g0 = along(H, d, -3);
  thickLine(img, g0.x, g0.y, H.x, H.y, 2, [110, 76, 44]);
  const a = along(H, n, 4);
  const b = along(H, n, -4);
  thickLine(img, a.x, a.y, b.x, b.y, 2, [200, 160, 60]);
  const s = along(H, d, 2);
  const e = along(H, d, o.length);
  thickLine(img, s.x, s.y, e.x, e.y, 3, o.blade);
  line(img, s.x, s.y, e.x, e.y, shade(o.blade, 1.15));
}

function paintStaff(img, P, view, o) {
  if (P.bowHand) return;
  const d = dirVec(P.wAngle);
  const s = along(P.W, d, -10);
  const e = along(P.W, d, 20);
  thickLine(img, s.x, s.y, e.x, e.y, 2, o.wood);
  const orb = along(P.W, d, 22);
  fillEllipse(img, orb.x, orb.y, 3.5, 3.5, o.orb);
  setPx(img, orb.x - 1, orb.y - 1, [255, 255, 255]);
}

function paintBow(img, P, view, o) {
  const B = P.bowHand ?? P.O;
  const aim = P.bowHand ? P.bowAim : (view === 'right' ? -60 : FACING_ANGLE[view] === 90 ? 60 : -120);
  const d = dirVec(aim);
  const n = { x: -d.y, y: d.x };
  const e1 = along(along(B, n, 10), d, -3);
  const e2 = along(along(B, n, -10), d, -3);
  const peak = along(B, d, 3);
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const x = (1 - t) * (1 - t) * e1.x + 2 * (1 - t) * t * (2 * peak.x - (e1.x + e2.x) / 2) + t * t * e2.x;
    const y = (1 - t) * (1 - t) * e1.y + 2 * (1 - t) * t * (2 * peak.y - (e1.y + e2.y) / 2) + t * t * e2.y;
    fillRect(img, Math.round(x) - 1, Math.round(y) - 1, 2, 2, o.wood);
  }
  const sp = P.draw > 0 ? P.W : mid(e1, e2, 0.5);
  line(img, e1.x, e1.y, sp.x, sp.y, [235, 235, 235]);
  line(img, sp.x, sp.y, e2.x, e2.y, [235, 235, 235]);
  if (P.arrow) {
    const tip = along(B, d, 8);
    line(img, sp.x, sp.y, tip.x, tip.y, [170, 130, 80]);
    fillRect(img, tip.x - 1, tip.y - 1, 3, 3, [210, 210, 220]);
  }
}

// ---------------------------------------------------------------- layer catalogue

const SKIN = [240, 200, 164];
export const LAYERS = {
  body_light: [paintBody, { skin: SKIN }],
  body_elf: [paintBody, { skin: [246, 214, 182], ears: true }],
  pants_brown: [paintPants, { color: [104, 80, 56] }],
  pants_gray: [paintPants, { color: [92, 94, 108] }],
  pants_green: [paintPants, { color: [70, 96, 60] }],
  shirt_white: [paintShirt, { color: [226, 222, 210] }],
  shirt_green: [paintShirt, { color: [64, 132, 70] }],
  shirt_blue: [paintShirt, { color: [70, 100, 170] }],
  shoes_brown: [paintShoes, { color: [88, 62, 40] }],
  hair_short_brown: [paintHair, { color: [98, 64, 40] }],
  hair_short_black: [paintHair, { color: [44, 40, 48] }],
  hair_long_blonde: [paintHair, { color: [236, 210, 120], long: true }],
  hair_long_brown: [paintHair, { color: [110, 72, 44], long: true }],
  armor_leather: [paintArmor, { color: [150, 100, 60] }],
  armor_chain: [paintArmor, { color: [162, 168, 184], style: 'chain' }],
  robe_purple: [paintRobe, { color: [92, 64, 160], trim: [226, 190, 80] }],
  robe_blue: [paintRobe, { color: [60, 96, 160], trim: [236, 236, 236] }],
  helmet_leather: [paintHelmet, { color: [140, 94, 56], style: 'cap' }],
  helmet_iron: [paintHelmet, { color: [176, 182, 196], plume: [200, 50, 50] }],
  hat_wizard: [paintHat, { color: [80, 54, 146], trim: [226, 190, 80] }],
  boots_leather: [paintBoots, { color: [120, 80, 46] }],
  gloves_leather: [paintGloves, { color: [140, 94, 56] }],
  shield_wood: [paintShield, { color: [130, 88, 52], face: [176, 40, 44], rim: [210, 180, 90] }],
  sword_short: [paintSword, { blade: [200, 206, 218], length: 16 }],
  sword_long: [paintSword, { blade: [226, 232, 244], length: 20 }],
  staff_wood: [paintStaff, { wood: [130, 90, 50], orb: [120, 200, 255] }],
  bow_short: [paintBow, { wood: [150, 100, 52] }],
};

function makeLayerSheet(paint, opts) {
  const sheet = createImage(F * COLS, F * ROWS);
  for (const [anim, def] of Object.entries(ANIMS)) {
    const dirs = def.single ? ['down'] : LPC_DIRS;
    dirs.forEach((dir, di) => {
      const view = dir === 'left' ? 'right' : dir;
      for (let f = 0; f < def.frames; f++) {
        const P = pose(anim, view, f);
        let frame = createImage(F, F);
        paint(frame, P, view, opts);
        if (P.rot) frame = rotate(frame, P.rot, 32, 42, 0, Math.round((P.rot / 90) * 14));
        outline(frame);
        blit(sheet, frame, f * F, (def.row + di) * F, dir === 'left');
      }
    });
  }
  return sheet;
}

/** App icon: the starting knight, standing, scaled up. */
function makeAppIcon(size) {
  const frame = createImage(F, F);
  for (const name of ['body_light', 'pants_gray', 'shoes_brown', 'shirt_white', 'armor_chain', 'hair_short_brown', 'helmet_iron', 'shield_wood', 'sword_short']) {
    const [paint, opts] = LAYERS[name];
    const layer = createImage(F, F);
    paint(layer, pose('walk', 'down', 0), 'down', opts);
    outline(layer);
    blit(frame, layer, 0, 0);
  }
  const img = createImage(size, size);
  fillRect(img, 0, 0, size, size, [27, 27, 47]);
  const s = size / 56; // crop a little so the figure fills the icon
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.floor(x / s) + 4;
      const sy = Math.floor(y / s) + 6;
      if (sx >= F || sy >= F) continue;
      const i = (sy * F + sx) * 4;
      if (frame.px[i + 3] > 0) setPx(img, x, y, [frame.px[i], frame.px[i + 1], frame.px[i + 2], frame.px[i + 3]]);
    }
  }
  return img;
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', encodePng(makeAppIcon(192)));
writeFileSync('public/icons/icon-512.png', encodePng(makeAppIcon(512)));

mkdirSync('assets/sprites/characters', { recursive: true });
for (const [name, [paint, opts]] of Object.entries(LAYERS)) {
  writeFileSync(`assets/sprites/characters/${name}.png`, encodePng(makeLayerSheet(paint, opts)));
  console.log('wrote', name);
}
