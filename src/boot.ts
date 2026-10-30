// Startup report shown under 載入中… (see window.__boot in index.html), so a screenshot from a
// phone shows how far the game got. Does nothing if the page has no reporter.
type BootReport = { step(text: string): void; error(text: string): void; done(): void };
const report = (window as unknown as { __boot?: BootReport }).__boot;

export function bootStep(text: string): void {
  report?.step(text);
}
export function bootError(text: string): void {
  report?.error(text);
}
/** The title screen is up: hide the report (it stays if an error was shown). */
export function bootDone(): void {
  report?.done();
}
