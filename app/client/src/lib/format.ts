/** "Aug 28, 2026" — the app's default for a calendar date. */
export const mediumDate = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	year: "numeric",
});
