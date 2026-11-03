// Screen layout. In landscape the map view is VIEW_TILES_W x VIEW_TILES_H tiles (plan §6),
// scaled to fit the screen; leftover width on wide phones becomes side panels for the UI.
// On a portrait screen (phone held upright) the game screen is a smaller square on top and the
// UI sits below it (see computePlayLayout).

export const TILE_SIZE = 32;
// Single place to change the view size (fallback for small phones is 26x15, plan §6).
export const VIEW_TILES_W = 32;
export const VIEW_TILES_H = 18;
export const VIEW_W = VIEW_TILES_W * TILE_SIZE; // logical px
export const VIEW_H = VIEW_TILES_H * TILE_SIZE;
// Portrait: half as many tiles across, so tiles stay about as big as in landscape.
export const PORTRAIT_TILES = 16;
export const PORTRAIT_VIEW = PORTRAIT_TILES * TILE_SIZE;
/** Logical px the portrait UI (status, log, hotbar, menu) needs below the map view, at least. */
export const PORTRAIT_UI_MIN_H = 340;

export interface Layout {
  canvasW: number; // physical px
  canvasH: number;
  zoom: number; // physical px per logical px
  mapX: number; // map viewport in physical px
  mapY: number;
  mapW: number;
  mapH: number;
  uiW: number; // whole canvas in logical px (for HUD placement)
  uiH: number;
  sidePanelW: number; // logical px of each side panel (0 on 16:9 or narrower); portrait: left margin
  portrait: boolean; // phone held upright: map on top, UI below
  viewW: number; // map view in logical px
  viewH: number;
}

/** Is a canvas of this size "portrait" (clearly taller than wide)? */
export function isPortrait(canvasW: number, canvasH: number): boolean {
  return canvasH > canvasW * 1.05;
}

export function computeLayout(canvasW: number, canvasH: number): Layout {
  const zoom = Math.min(canvasW / VIEW_W, canvasH / VIEW_H);
  const mapW = Math.round(VIEW_W * zoom);
  const mapH = Math.round(VIEW_H * zoom);
  const mapX = Math.floor((canvasW - mapW) / 2);
  const mapY = Math.floor((canvasH - mapH) / 2);
  return {
    canvasW, canvasH, zoom, mapX, mapY, mapW, mapH,
    uiW: canvasW / zoom,
    uiH: canvasH / zoom,
    sidePanelW: mapX / zoom,
    portrait: false,
    viewW: VIEW_W,
    viewH: VIEW_H,
  };
}

/** Portrait menu screens (title, character creation): a 512 px wide column at least this tall. */
export const PORTRAIT_MENU_W = 512;
export const PORTRAIT_MENU_MIN_H = 880;

export interface MenuLayout {
  portrait: boolean;
  zoom: number; // physical px per logical px
  uiW: number; // whole canvas in logical px
  uiH: number;
  stageW: number; // the area menu screens lay out in: 1024x576 (landscape) or a 512-wide column (portrait)
  stageH: number;
}

/** Layout of the full-screen menu scenes: the landscape 1024x576 stage, or a tall column in portrait. */
export function computeMenuLayout(canvasW: number, canvasH: number): MenuLayout {
  if (!isPortrait(canvasW, canvasH)) {
    const L = computeLayout(canvasW, canvasH);
    return { portrait: false, zoom: L.zoom, uiW: L.uiW, uiH: L.uiH, stageW: VIEW_W, stageH: VIEW_H };
  }
  const zoom = Math.min(canvasW / PORTRAIT_MENU_W, canvasH / PORTRAIT_MENU_MIN_H);
  return { portrait: true, zoom, uiW: canvasW / zoom, uiH: canvasH / zoom, stageW: PORTRAIT_MENU_W, stageH: canvasH / zoom };
}

/**
 * Layout of the play screen (map + HUD): the landscape layout above, or on a portrait screen a
 * square map view at the top (full width) with the rest of the screen left for the UI.
 */
export function computePlayLayout(canvasW: number, canvasH: number): Layout {
  if (!isPortrait(canvasW, canvasH)) return computeLayout(canvasW, canvasH);
  const zoom = Math.min(canvasW / PORTRAIT_VIEW, canvasH / (PORTRAIT_VIEW + PORTRAIT_UI_MIN_H));
  const mapW = Math.round(PORTRAIT_VIEW * zoom);
  const mapX = Math.floor((canvasW - mapW) / 2);
  return {
    canvasW, canvasH, zoom, mapX, mapY: 0, mapW, mapH: mapW,
    uiW: canvasW / zoom,
    uiH: canvasH / zoom,
    sidePanelW: mapX / zoom,
    portrait: true,
    viewW: PORTRAIT_VIEW,
    viewH: PORTRAIT_VIEW,
  };
}
