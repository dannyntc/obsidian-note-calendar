export const ENTRY_CURSOR_POSITION = Object.freeze({ line: 8, ch: 0 });

export function buildEntryContent(calendarId: string, dateKey: string, sourceTarget: string): string {
	return [
		"---",
		`note-calendar-parent: ${calendarId}`,
		`note-calendar-date: ${dateKey}`,
		"---",
		`[[${sourceTarget}|← Back to calendar]]`,
		"",
		"",
		"",
		"",
	].join("\n");
}
