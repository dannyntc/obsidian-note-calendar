export type FirstDayOfWeek = 0 | 1;

export interface CalendarDay {
	year: number;
	month: number;
	day: number;
	dateKey: string;
	isCurrentMonth: boolean;
	isToday: boolean;
}

export interface CalendarEntryLike {
	path: string;
	name: string;
	dateKey: string;
	ctime: number;
}

export function dateKeyFromParts(year: number, month: number, day: number): string {
	return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function dateKeyFromDate(date: Date): string {
	return dateKeyFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function isValidDateKey(value: unknown): value is string {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const [year, month, day] = value.split("-").map(Number);
	if (month < 1 || month > 12 || day < 1 || day > 31) return false;
	const date = new Date(year, month - 1, day);
	return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function parseDateKey(value: string): { year: number; month: number; day: number } | undefined {
	if (!isValidDateKey(value)) return undefined;
	const [year, month, day] = value.split("-").map(Number);
	return { year, month, day };
}

export function getMonthDays(
	year: number,
	month: number,
	firstDayOfWeek: FirstDayOfWeek,
	todayKey = dateKeyFromDate(new Date()),
): CalendarDay[] {
	const firstDate = new Date(year, month - 1, 1);
	const leadingDays = (firstDate.getDay() - firstDayOfWeek + 7) % 7;
	const daysInMonth = new Date(year, month, 0).getDate();
	const totalCells = 42;
	const days: CalendarDay[] = [];

	for (let index = 0; index < totalCells; index += 1) {
		const date = new Date(year, month - 1, index - leadingDays + 1);
		const dateKey = dateKeyFromDate(date);
		days.push({
			year: date.getFullYear(),
			month: date.getMonth() + 1,
			day: date.getDate(),
			dateKey,
			isCurrentMonth: index >= leadingDays && index < leadingDays + daysInMonth,
			isToday: dateKey === todayKey,
		});
	}

	return days;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
	const date = new Date(year, month - 1 + delta, 1);
	return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function monthLabel(year: number, month: number, locale?: string): string {
	return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

export function weekdayLabels(firstDayOfWeek: FirstDayOfWeek, locale?: string): string[] {
	const sunday = new Date(Date.UTC(2023, 0, 1));
	const labels = Array.from({ length: 7 }, (_, index) =>
		new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
			new Date(sunday.getTime() + index * 24 * 60 * 60 * 1000),
		),
	);
	return [...labels.slice(firstDayOfWeek), ...labels.slice(0, firstDayOfWeek)];
}

export function formatDateForDisplay(dateKey: string, locale?: string): string {
	const parsed = parseDateKey(dateKey);
	if (!parsed) return dateKey;
	return new Intl.DateTimeFormat(locale, {
		weekday: "long",
		month: "long",
		day: "numeric",
		year: "numeric",
	}).format(new Date(parsed.year, parsed.month - 1, parsed.day));
}

export function sortEntries<T extends CalendarEntryLike>(entries: T[]): T[] {
	return [...entries].sort((a, b) => a.ctime - b.ctime || a.path.localeCompare(b.path));
}

export function timestampForFilename(date = new Date()): string {
	const dateKey = dateKeyFromDate(date);
	const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
		.map((part) => String(part).padStart(2, "0"))
		.join("-");
	return `${dateKey} ${time}`;
}
