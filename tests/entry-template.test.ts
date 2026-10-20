import assert from "node:assert/strict";
import test from "node:test";
import { ENTRY_CURSOR_POSITION, buildEntryContent } from "../src/entry-template";

test("entry content puts the backlink on the first body row", () => {
	const content = buildEntryContent("calendar-123", "2026-10-20", "Journal");
	const lines = content.split("\n");

	assert.equal(lines[4], "[[Journal|← Back to calendar]]");
	assert.equal(lines[5], "");
	assert.equal(lines[6], "");
	assert.equal(lines[7], "");
	assert.equal(lines[8], "");
	assert.equal(ENTRY_CURSOR_POSITION.line, 8);
	assert.equal(ENTRY_CURSOR_POSITION.ch, 0);
});

test("entry content preserves calendar metadata", () => {
	const content = buildEntryContent("calendar-123", "2026-10-20", "Folder/Journal");

	assert.match(content, /note-calendar-parent: calendar-123/);
	assert.match(content, /note-calendar-date: 2026-10-20/);
	assert.match(content, /\[\[Folder\/Journal\|← Back to calendar\]\]/);
});
