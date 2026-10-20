import assert from "node:assert/strict";
import test from "node:test";
import {
	dateKeyFromParts,
	getMonthDays,
	isValidDateKey,
	shiftMonth,
	sortEntries,
} from "../src/calendar";

test("month grid aligns Monday-first calendars and includes the full month", () => {
	const days = getMonthDays(2026, 10, 1, "2026-10-20");
	assert.equal(days.length, 42);
	assert.equal(days[0].dateKey, "2026-09-28");
	assert.equal(days[0].isCurrentMonth, false);
	assert.equal(days[3].dateKey, "2026-10-01");
	assert.equal(days[3].isCurrentMonth, true);
	assert.equal(days.find((day) => day.isToday)?.dateKey, "2026-10-20");
});

test("month grid handles leap years and Sunday-first calendars", () => {
	const days = getMonthDays(2024, 2, 0, "2024-02-29");
	assert.equal(days.filter((day) => day.isCurrentMonth).length, 29);
	assert.equal(days.find((day) => day.isToday)?.dateKey, "2024-02-29");
	assert.equal(days.find((day) => day.isCurrentMonth)?.dateKey, "2024-02-01");
});

test("date validation rejects impossible calendar dates", () => {
	assert.equal(isValidDateKey("2024-02-29"), true);
	assert.equal(isValidDateKey("2025-02-29"), false);
	assert.equal(isValidDateKey("2026-1-02"), false);
	assert.equal(dateKeyFromParts(2026, 10, 20), "2026-10-20");
});

test("month navigation crosses year boundaries", () => {
	assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
	assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
});

test("entries sort by creation time and then path", () => {
	const sorted = sortEntries([
		{ path: "z.md", name: "z.md", dateKey: "2026-10-20", ctime: 10 },
		{ path: "b.md", name: "b.md", dateKey: "2026-10-20", ctime: 5 },
		{ path: "a.md", name: "a.md", dateKey: "2026-10-20", ctime: 10 },
	]);
	assert.deepEqual(sorted.map((entry) => entry.path), ["b.md", "a.md", "z.md"]);
});
