// Screen layout. The map view is always VIEW_TILES_W x VIEW_TILES_H tiles (plan §6), scaled
// to fit the screen; leftover width on wide phones becomes side panels for the UI.

export const TILE_SIZE = 32;
// Single place to change the view size (fallback for small phones is 26x15, plan §6).
export const VIEW_TILES_W = 32;
export const VIEW_TILES_H = 18;
export const VIEW_W = VIEW_TILES_W * TILE_SIZE; // logical px
export const VIEW_H = VIEW_TILES_H * TILE_SIZE;

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
  sidePanelW: number; // logical px of each side panel (0 on 16:9 or narrower)
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
  };
}
