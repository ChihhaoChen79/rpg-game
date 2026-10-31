// Browser actions that iPhone only allows from a real tap.

/**
 * Runs `fn` when the current tap or click ends. Game buttons react on finger-down, but iPhone
 * only lets a page open a file picker, start a download or show the keyboard from a real tap,
 * which it counts when the finger lifts (touchend); from touchstart it silently does nothing.
 */
export function afterTap(fn: () => void): void {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    window.removeEventListener('touchend', run, true);
    window.removeEventListener('mouseup', run, true);
    fn();
  };
  window.addEventListener('touchend', run, true);
  window.addEventListener('mouseup', run, true);
  setTimeout(run, 2000); // no release seen (e.g. a keyboard press): try anyway
}

/** True while an HTML text box has the keyboard (key shortcuts should be ignored). */
export function typing(): boolean {
  return document.activeElement instanceof HTMLInputElement;
}
