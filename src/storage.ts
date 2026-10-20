export const CALENDAR_ID_KEY = "note-calendar-id";
export const ENTRY_PARENT_KEY = "note-calendar-parent";
export const ENTRY_DATE_KEY = "note-calendar-date";
export const CALENDAR_BLOCK_LANGUAGE = "note-calendar";

const BLOCK_START = "<!-- note-calendar:start -->";
const BLOCK_END = "<!-- note-calendar:end -->";

export interface FrontmatterResult {
	values: Record<string, string>;
	endOffset: number;
}

export function parseFrontmatter(content: string): FrontmatterResult {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) return { values: {}, endOffset: 0 };

	const values: Record<string, string> = {};
	for (const line of match[1].split(/\r?\n/)) {
		const field = line.match(/^\s*([A-Za-z0-9_-]+):\s*(.*?)\s*$/);
		if (!field) continue;
		values[field[1]] = stripYamlScalar(field[2]);
	}
	return { values, endOffset: match[0].length };
}

export function setFrontmatterValue(content: string, key: string, value: string): string {
	const parsed = parseFrontmatter(content);
	const scalar = quoteYamlScalar(value);
	if (!parsed.endOffset) return `---\n${key}: ${scalar}\n---\n\n${content}`;

	const frontmatter = content.slice(0, parsed.endOffset);
	const linePattern = new RegExp(`^\\s*${escapeRegExp(key)}:.*$`, "m");
	const replacement = `${key}: ${scalar}`;
	const updatedFrontmatter = linePattern.test(frontmatter)
		? frontmatter.replace(linePattern, replacement)
		: frontmatter.replace(/\r?\n---(\r?\n|$)/, `\n${replacement}\n---$1`);
	return updatedFrontmatter + content.slice(parsed.endOffset);
}

export function calendarBlock(id: string): string {
	return `${BLOCK_START}\n\`\`\`${CALENDAR_BLOCK_LANGUAGE}\nid: ${id}\n\`\`\`\n${BLOCK_END}`;
}

export function calendarIdFromBlock(content: string): string | undefined {
	const match = content.match(
		/<!-- note-calendar:start -->\s*```note-calendar\r?\nid:\s*([^\s\r\n]+)\s*\r?\n```\s*<!-- note-calendar:end -->/,
	);
	return match?.[1];
}

export function hasCalendarBlock(content: string): boolean {
	return calendarIdFromBlock(content) !== undefined;
}

export function insertCalendarBlock(content: string, id: string): string {
	if (hasCalendarBlock(content)) return content;
	const block = calendarBlock(id);
	const parsed = parseFrontmatter(content);
	if (!parsed.endOffset) return `${block}\n\n${content}`;

	const before = content.slice(0, parsed.endOffset).replace(/\s+$/, "");
	const after = content.slice(parsed.endOffset).replace(/^\s+/, "");
	return after ? `${before}\n\n${block}\n\n${after}` : `${before}\n\n${block}\n`;
}

export function removeCalendarBlock(content: string): string {
	const pattern = /(^|\n)[ \t]*<!-- note-calendar:start -->\r?\n```note-calendar\r?\nid:\s*[^\s\r\n]+\s*\r?\n```\r?\n<!-- note-calendar:end -->[ \t]*(?=\n|$)/m;
	const removed = content.replace(pattern, "$1");
	return removed.replace(/\n{3,}/g, "\n\n");
}

function stripYamlScalar(value: string): string {
	if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
		return value.slice(1, -1);
	}
	return value;
}

function quoteYamlScalar(value: string): string {
	return /^[A-Za-z0-9._/-]+$/.test(value) ? value : JSON.stringify(value);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
