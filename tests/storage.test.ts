import assert from "node:assert/strict";
import test from "node:test";
import {
	calendarBlock,
	calendarIdFromBlock,
	hasCalendarBlock,
	insertCalendarBlock,
	parseFrontmatter,
	removeCalendarBlock,
	setFrontmatterValue,
} from "../src/storage";

test("calendar block inserts after Properties and can be removed idempotently", () => {
	const original = "---\ntags: [journal]\n---\n\n# Journal\n\nBody\n";
	const enabled = insertCalendarBlock(original, "calendar-123");
	assert.equal(calendarIdFromBlock(enabled), "calendar-123");
	assert.equal(enabled.indexOf("note-calendar:start") > enabled.indexOf("tags"), true);
	assert.equal(insertCalendarBlock(enabled, "calendar-456"), enabled);
	assert.equal(removeCalendarBlock(enabled), original);
	assert.equal(removeCalendarBlock(original), original);
});

test("calendar block can be created in a note without frontmatter", () => {
	const enabled = insertCalendarBlock("# Journal\n", "calendar-abc");
	assert.equal(enabled.startsWith(calendarBlock("calendar-abc")), true);
	assert.equal(hasCalendarBlock(enabled), true);
});

test("frontmatter parsing and updates preserve unrelated content", () => {
	const content = "---\nnote-calendar-id: old-id\ntags: [journal]\n---\n\nText\n";
	const parsed = parseFrontmatter(content);
	assert.equal(parsed.values["note-calendar-id"], "old-id");
	const updated = setFrontmatterValue(content, "note-calendar-id", "new-id");
	assert.match(updated, /note-calendar-id: new-id/);
	assert.match(updated, /tags: \[journal\]/);
	assert.match(updated, /Text/);
});

test("frontmatter values are added when a note has no Properties", () => {
	const updated = setFrontmatterValue("# Journal\n", "note-calendar-id", "calendar-123");
	assert.equal(updated, "---\nnote-calendar-id: calendar-123\n---\n\n# Journal\n");
});
