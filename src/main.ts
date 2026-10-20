import {
	Component,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	setIcon,
	setTooltip,
} from "obsidian";
import {
	CalendarDay,
	CalendarEntryLike,
	FirstDayOfWeek,
	dateKeyFromDate,
	formatDateForDisplay,
	getMonthDays,
	isValidDateKey,
	monthLabel,
	shiftMonth,
	sortEntries,
	timestampForFilename,
	weekdayLabels,
} from "./calendar";
import {
	CALENDAR_BLOCK_LANGUAGE,
	CALENDAR_ID_KEY,
	ENTRY_DATE_KEY,
	ENTRY_PARENT_KEY,
	calendarIdFromBlock,
	hasCalendarBlock,
	insertCalendarBlock,
	parseFrontmatter,
	removeCalendarBlock,
} from "./storage";
import { ENTRY_CURSOR_POSITION, buildEntryContent } from "./entry-template";

interface NoteCalendarSettings {
	entryFolder: string;
	firstDayOfWeek: FirstDayOfWeek;
}

const DEFAULT_SETTINGS: NoteCalendarSettings = {
	entryFolder: "Calendar entries",
	firstDayOfWeek: 1,
};

interface CalendarEntry extends CalendarEntryLike {
	calendarId: string;
}

interface FileRecord {
	path: string;
	kind: "owner" | "entry";
	calendarId: string;
	dateKey?: string;
	name: string;
	ctime: number;
}

interface MonthPosition {
	year: number;
	month: number;
}

export default class NoteCalendarPlugin extends Plugin {
	settings: NoteCalendarSettings = { ...DEFAULT_SETTINGS };
	private readonly fileRecords = new Map<string, FileRecord>();
	private readonly ownersByCalendar = new Map<string, Set<string>>();
	private readonly entriesByCalendar = new Map<string, Map<string, CalendarEntry>>();
	private readonly renderers = new Set<CalendarRenderer>();
	private readonly selectedMonths = new Map<string, MonthPosition>();
	private readonly indexTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly creatingEntries = new Set<string>();
	private readonly headerActions = new Map<any, HTMLElement>();

	async onload(): Promise<void> {
		const saved = await this.loadData().catch(() => ({}));
		this.settings = {
			...DEFAULT_SETTINGS,
			...(saved && typeof saved === "object" ? saved : {}),
			firstDayOfWeek: saved?.firstDayOfWeek === 0 ? 0 : 1,
		};

		this.addSettingTab(new NoteCalendarSettingTab(this.app, this));
		this.registerMarkdownCodeBlockProcessor(CALENDAR_BLOCK_LANGUAGE, (source, el, ctx) => {
			this.renderCalendarBlock(source, el, ctx);
		});
		this.registerCommands();
		this.registerWorkspaceEvents();

		this.app.workspace.onLayoutReady?.(() => {
			this.attachHeaderAction(this.app.workspace.activeLeaf);
			void this.rebuildIndex();
		});
	}

	onunload(): void {
		for (const timer of this.indexTimers.values()) clearTimeout(timer);
		this.indexTimers.clear();
		this.headerActions.clear();
		this.renderers.clear();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.refreshAllRenderers();
	}

	getEntries(calendarId: string, dateKey?: string): CalendarEntry[] {
		const values = [...(this.entriesByCalendar.get(calendarId)?.values() ?? [])];
		const filtered = dateKey ? values.filter((entry) => entry.dateKey === dateKey) : values;
		return sortEntries(filtered);
	}

	getSelectedMonth(calendarId: string): MonthPosition {
		return this.selectedMonths.get(calendarId) ?? {
			year: new Date().getFullYear(),
			month: new Date().getMonth() + 1,
		};
	}

	setSelectedMonth(calendarId: string, position: MonthPosition): void {
		this.selectedMonths.set(calendarId, position);
	}

	async openEntry(path: string, sourcePath: string): Promise<void> {
		try {
			await this.app.workspace.openLinkText(path, sourcePath, false);
			this.positionEntryCursor();
		} catch (error) {
			new Notice(`Could not open entry: ${errorMessage(error)}`);
		}
	}

	private positionEntryCursor(): void {
		const view = this.app.workspace.activeLeaf?.view;
		const editor = view?.editor;
		if (!editor) return;

		try {
			if (typeof view.getMode === "function" && view.getMode() !== "source") {
				view.setMode?.("source");
			}
			editor.setCursor(ENTRY_CURSOR_POSITION);
			editor.focus();
		} catch {
			// The entry is still usable if Obsidian has not finished activating its editor.
		}
	}

	private registerCommands(): void {
		this.addCommand({
			id: "toggle-calendar-in-current-note",
			name: "Toggle calendar in current note",
			checkCallback: (checking) => {
				const file = this.currentMarkdownFile();
				if (!file) return false;
				if (!checking) void this.toggleCalendar(file);
				return true;
			},
		});
	}

	private registerWorkspaceEvents(): void {
		const workspace = this.app.workspace;
		if (workspace?.on) {
			this.registerEvent(workspace.on("active-leaf-change", (leaf: any) => {
				this.attachHeaderAction(leaf);
			}));
			this.registerEvent(workspace.on("file-rename", (file: TFile, oldPath: string) => {
				this.removeRecord(oldPath);
				if (isMarkdownFile(file)) this.scheduleIndex(file);
				this.refreshAllRenderers();
				this.refreshHeaderActions();
			}));
		}

		const vault = this.app.vault;
		if (vault?.on) {
			this.registerEvent(vault.on("create", (file: TFile) => {
				if (isMarkdownFile(file)) this.scheduleIndex(file);
			}));
			this.registerEvent(vault.on("modify", (file: TFile) => {
				if (isMarkdownFile(file)) this.scheduleIndex(file);
			}));
			this.registerEvent(vault.on("delete", (file: TFile) => {
				this.removeRecord(file.path);
				this.refreshAllRenderers();
				this.refreshHeaderActions();
			}));
			this.registerEvent(vault.on("rename", (file: TFile, oldPath: string) => {
				this.removeRecord(oldPath);
				if (isMarkdownFile(file)) this.scheduleIndex(file);
				this.refreshAllRenderers();
				this.refreshHeaderActions();
			}));
		}

		if (this.app.metadataCache?.on) {
			this.registerEvent(this.app.metadataCache.on("changed", (file: TFile) => {
				if (isMarkdownFile(file)) this.scheduleIndex(file);
			}));
		}
	}

	private attachHeaderAction(leaf: any): void {
		const view = leaf?.view;
		if (!view) return;
		if (view.isDeferred && typeof view.loadIfDeferred === "function") {
			void view.loadIfDeferred().then(() => this.attachHeaderAction(leaf));
			return;
		}
		if (typeof view.addAction !== "function") return;

		const existing = this.headerActions.get(view);
		if (existing) {
			void this.updateHeaderAction(view, existing);
			return;
		}

		const action = view.addAction("calendar-days", "Enable calendar", () => {
			const file = view.file;
			if (isMarkdownFile(file)) void this.toggleCalendar(file);
		});
		action.classList.add("note-calendar-header-action");
		this.headerActions.set(view, action);
		void this.updateHeaderAction(view, action);
	}

	private async updateHeaderAction(view: any, action?: HTMLElement): Promise<void> {
		const headerAction = action ?? this.headerActions.get(view);
		const file = view?.file;
		if (!headerAction || !isMarkdownFile(file)) return;

		let enabled = this.fileRecords.get(file.path)?.kind === "owner";
		try {
			enabled = hasCalendarBlock(await this.app.vault.cachedRead(file));
		} catch {
			// The index remains the fallback while the note is unavailable.
		}

		const label = enabled ? "Disable calendar" : "Enable calendar";
		setIcon(headerAction, "calendar-days");
		setTooltip(headerAction, label);
		headerAction.setAttribute("aria-label", label);
		headerAction.setAttribute("aria-pressed", String(enabled));
		headerAction.classList.toggle("is-enabled", enabled);
	}

	private refreshHeaderActions(path?: string): void {
		for (const [view, action] of this.headerActions) {
			if (!path || view?.file?.path === path) void this.updateHeaderAction(view, action);
		}
	}

	private renderCalendarBlock(source: string, el: HTMLElement, ctx: any): void {
		const id = source.match(/(?:^|\n)\s*id:\s*([^\s\r\n]+)/)?.[1];
		if (!id) {
			el.classList.add("note-calendar-error");
			el.textContent = "Note Calendar could not find this calendar’s identity.";
			return;
		}

		const renderer = new CalendarRenderer(
			this,
			el,
			id,
			ctx.sourcePath,
			() => this.renderers.delete(renderer),
		);
		this.renderers.add(renderer);
		ctx.addChild(renderer);
		renderer.mount();
	}

	private async toggleCalendar(file: TFile): Promise<void> {
		try {
			const current = await this.app.vault.read(file);
			if (hasCalendarBlock(current)) {
				await this.app.vault.modify(file, removeCalendarBlock(current));
				await this.reindexFile(file);
				this.refreshHeaderActions(file.path);
				new Notice("Calendar hidden from this note.");
				return;
			}

			const frontmatter = parseFrontmatter(current).values;
			const id = frontmatter[CALENDAR_ID_KEY] || calendarIdFromBlock(current) || createId();
			if (!frontmatter[CALENDAR_ID_KEY]) {
				await this.app.fileManager.processFrontMatter(file, (values: Record<string, unknown>) => {
					values[CALENDAR_ID_KEY] = id;
				});
			}

			const latest = await this.app.vault.read(file);
			await this.app.vault.modify(file, insertCalendarBlock(latest, id));
			await this.reindexFile(file);
			this.refreshHeaderActions(file.path);
			new Notice("Calendar enabled in this note.");
		} catch (error) {
			new Notice(`Could not update the calendar: ${errorMessage(error)}`);
		}
	}

	hasOwnerConflict(calendarId: string): boolean {
		return (this.ownersByCalendar.get(calendarId)?.size ?? 0) > 1;
	}

	async createEntry(calendarId: string, dateKey: string, sourcePath: string): Promise<void> {
		const owners = this.ownersByCalendar.get(calendarId) ?? new Set<string>();
		if (owners.size !== 1 || !owners.has(sourcePath)) {
			new Notice("This calendar has conflicting owners. Resolve the duplicate calendar ID first.");
			return;
		}
		const operationKey = `${calendarId}:${dateKey}`;
		if (this.creatingEntries.has(operationKey)) return;
		this.creatingEntries.add(operationKey);

		try {
			const folder = `${normalizeVaultPath(this.settings.entryFolder)}/${calendarId}`;
			await this.ensureFolder(folder);
			const baseName = timestampForFilename();
			const path = await this.availableEntryPath(folder, baseName);
			const sourceTarget = sourcePath.replace(/\.md$/i, "");
			const content = buildEntryContent(calendarId, dateKey, sourceTarget);
			const file = await this.app.vault.create(path, content);
			await this.reindexFile(file);
			await this.openEntry(file.path, sourcePath);
		} catch (error) {
			new Notice(`Could not create entry: ${errorMessage(error)}`);
		} finally {
			this.creatingEntries.delete(operationKey);
		}
	}

	private async ensureFolder(path: string): Promise<void> {
		let current = "";
		for (const segment of path.split("/").filter(Boolean)) {
			current = current ? `${current}/${segment}` : segment;
			const existing = this.app.vault.getAbstractFileByPath(current);
			if (existing) {
				if (!Array.isArray(existing.children)) throw new Error(`${current} is a file`);
				continue;
			}
			await this.app.vault.createFolder(current);
		}
	}

	private async availableEntryPath(folder: string, baseName: string): Promise<string> {
		let suffix = 0;
		while (true) {
			const name = suffix === 0 ? baseName : `${baseName} (${suffix + 1})`;
			const path = `${folder}/${name}.md`;
			if (!this.app.vault.getAbstractFileByPath(path)) return path;
			suffix += 1;
		}
	}

	private currentMarkdownFile(): TFile | undefined {
		const file = this.app.workspace.getActiveFile?.();
		return isMarkdownFile(file) ? file : undefined;
	}

	private async rebuildIndex(): Promise<void> {
		this.fileRecords.clear();
		this.ownersByCalendar.clear();
		this.entriesByCalendar.clear();
		const files = this.app.vault.getMarkdownFiles?.() ?? [];
		await Promise.all(files.map((file: TFile) => this.reindexFile(file, false)));
		this.refreshAllRenderers();
		this.refreshHeaderActions();
	}

	private scheduleIndex(file: TFile): void {
		const existing = this.indexTimers.get(file.path);
		if (existing) clearTimeout(existing);
		const timer = setTimeout(() => {
			this.indexTimers.delete(file.path);
			void this.reindexFile(file);
		}, 100);
		this.indexTimers.set(file.path, timer);
	}

	private async reindexFile(file: TFile, refresh = true): Promise<void> {
		const affected = new Set<string>();
		const previous = this.fileRecords.get(file.path);
		if (previous) affected.add(previous.calendarId);
		this.removeRecord(file.path);

		let content: string;
		try {
			content = await this.app.vault.cachedRead(file);
		} catch {
			this.refreshHeaderActions(file.path);
			return;
		}

		const frontmatter = parseFrontmatter(content).values;
		const blockId = calendarIdFromBlock(content);
		const calendarId = frontmatter[CALENDAR_ID_KEY] || blockId;
		if (calendarId && blockId) {
			this.addOwner({
				path: file.path,
				kind: "owner",
				calendarId,
				name: file.name,
				ctime: file.stat?.ctime ?? 0,
			});
			affected.add(calendarId);
		} else if (frontmatter[ENTRY_PARENT_KEY] && isDateKey(frontmatter[ENTRY_DATE_KEY])) {
			const entry: FileRecord = {
				path: file.path,
				kind: "entry",
				calendarId: frontmatter[ENTRY_PARENT_KEY],
				dateKey: frontmatter[ENTRY_DATE_KEY],
				name: file.name,
				ctime: file.stat?.ctime ?? 0,
			};
			this.addEntry(entry);
			affected.add(entry.calendarId);
		}

		this.refreshHeaderActions(file.path);
		if (refresh) this.refreshCalendars(affected);
	}

	private addOwner(record: FileRecord): void {
		this.fileRecords.set(record.path, record);
		const owners = this.ownersByCalendar.get(record.calendarId) ?? new Set<string>();
		owners.add(record.path);
		this.ownersByCalendar.set(record.calendarId, owners);
	}

	private addEntry(record: FileRecord): void {
		this.fileRecords.set(record.path, record);
		const entries = this.entriesByCalendar.get(record.calendarId) ?? new Map<string, CalendarEntry>();
		entries.set(record.path, {
			path: record.path,
			name: record.name,
			dateKey: record.dateKey!,
			ctime: record.ctime,
			calendarId: record.calendarId,
		});
		this.entriesByCalendar.set(record.calendarId, entries);
	}

	private removeRecord(path: string): void {
		const record = this.fileRecords.get(path);
		if (!record) return;
		this.fileRecords.delete(path);
		if (record.kind === "owner") {
			const owners = this.ownersByCalendar.get(record.calendarId);
			owners?.delete(path);
			if (owners && owners.size === 0) this.ownersByCalendar.delete(record.calendarId);
		} else {
			const entries = this.entriesByCalendar.get(record.calendarId);
			entries?.delete(path);
			if (entries && entries.size === 0) this.entriesByCalendar.delete(record.calendarId);
		}
	}

	private refreshCalendars(calendarIds: Set<string>): void {
		for (const renderer of this.renderers) {
			if (calendarIds.has(renderer.calendarId)) renderer.refresh();
		}
	}

	private refreshAllRenderers(): void {
		for (const renderer of this.renderers) renderer.refresh();
	}
}

class CalendarRenderer extends Component {
	private month: MonthPosition;

	constructor(
		private readonly plugin: NoteCalendarPlugin,
		private readonly root: HTMLElement,
		readonly calendarId: string,
		private readonly sourcePath: string,
		private readonly onDispose: () => void,
	) {
		super();
		this.month = plugin.getSelectedMonth(calendarId);
	}

	mount(): void {
		this.refresh();
	}

	refresh(): void {
		const document = this.root.ownerDocument;
		this.root.replaceChildren();
		this.root.className = "note-calendar-root";

		const scroll = document.createElement("div");
		scroll.className = "note-calendar-scroll";
		const shell = document.createElement("section");
		shell.className = "note-calendar-shell";
		shell.setAttribute("aria-label", "Note calendar");
		scroll.append(shell);
		this.root.append(scroll);

		const toolbar = document.createElement("div");
		toolbar.className = "note-calendar-toolbar";
		const title = document.createElement("h2");
		title.className = "note-calendar-title";
		title.textContent = monthLabel(this.month.year, this.month.month);

		const navigation = document.createElement("div");
		navigation.className = "note-calendar-navigation";
		navigation.append(
			this.iconButton(document, "Previous month", "chevron-left", () => this.moveMonth(-1)),
			title,
			this.iconButton(document, "Next month", "chevron-right", () => this.moveMonth(1)),
		);
		toolbar.append(navigation);

		const today = document.createElement("button");
		today.type = "button";
		today.className = "note-calendar-today";
		today.textContent = "Today";
		today.addEventListener("click", () => {
			const now = new Date();
			this.month = { year: now.getFullYear(), month: now.getMonth() + 1 };
			this.plugin.setSelectedMonth(this.calendarId, this.month);
			this.refresh();
		});
		toolbar.append(today);
		shell.append(toolbar);

		const conflict = this.plugin.hasOwnerConflict(this.calendarId);
		if (conflict) {
			const warning = document.createElement("p");
			warning.className = "note-calendar-conflict";
			warning.textContent = "This calendar has duplicate owners. Resolve the duplicate note-calendar-id before adding entries.";
			shell.append(warning);
		}

		const grid = document.createElement("div");
		grid.className = "note-calendar-grid";
		grid.setAttribute("role", "grid");
		const labels = weekdayLabels(this.plugin.settings.firstDayOfWeek);
		for (const label of labels) {
			const heading = document.createElement("div");
			heading.className = "note-calendar-weekday";
			heading.setAttribute("role", "columnheader");
			heading.textContent = label;
			grid.append(heading);
		}

		const todayKey = dateKeyFromDate(new Date());
		for (const day of getMonthDays(this.month.year, this.month.month, this.plugin.settings.firstDayOfWeek, todayKey)) {
			grid.append(this.dayCell(document, day, conflict));
		}
		shell.append(grid);
	}

	onunload(): void {
		this.onDispose();
		this.root.replaceChildren();
	}

	private moveMonth(delta: number): void {
		this.month = shiftMonth(this.month.year, this.month.month, delta);
		this.plugin.setSelectedMonth(this.calendarId, this.month);
		this.refresh();
	}

	private dayCell(document: Document, day: CalendarDay, conflict: boolean): HTMLElement {
		const cell = document.createElement("div");
		cell.className = "note-calendar-day";
		if (!day.isCurrentMonth) cell.classList.add("is-outside-month");
		if (day.isToday) cell.classList.add("is-today");
		cell.setAttribute("role", "gridcell");
		cell.setAttribute("aria-label", formatDateForDisplay(day.dateKey));

		const header = document.createElement("div");
		header.className = "note-calendar-day-header";
		const number = document.createElement("span");
		number.className = "note-calendar-day-number";
		number.textContent = String(day.day);
		header.append(number);

		const dateLabel = document.createElement("div");
		dateLabel.className = "note-calendar-day-date";
		dateLabel.textContent = formatDateForDisplay(day.dateKey);
		cell.append(dateLabel);

		const add = document.createElement("button");
		add.type = "button";
		add.className = "note-calendar-add";
		add.textContent = "+ Add";
		add.setAttribute("aria-label", `Add entry for ${formatDateForDisplay(day.dateKey)}`);
		setTooltip(add, `Add entry for ${formatDateForDisplay(day.dateKey)}`);
		add.disabled = conflict;
		add.addEventListener("click", () => void this.plugin.createEntry(this.calendarId, day.dateKey, this.sourcePath));
		header.append(add);
		cell.append(header);

		const list = document.createElement("ul");
		list.className = "note-calendar-entries";
		for (const entry of this.plugin.getEntries(this.calendarId, day.dateKey)) {
			const item = document.createElement("li");
			const link = document.createElement("a");
			link.className = "internal-link note-calendar-entry";
			link.href = "#";
			link.textContent = entry.name.replace(/\.md$/i, "");
			link.setAttribute("aria-label", `Open ${entry.name.replace(/\.md$/i, "")}`);
			link.addEventListener("click", (event) => {
				event.preventDefault();
				void this.plugin.openEntry(entry.path, this.sourcePath);
			});
			item.append(link);
			list.append(item);
		}
		cell.append(list);
		return cell;
	}

	private iconButton(
		document: Document,
		label: string,
		icon: string,
		onClick: () => void,
	): HTMLButtonElement {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "note-calendar-icon-button";
		button.setAttribute("aria-label", label);
		setIcon(button, icon);
		setTooltip(button, label);
		button.addEventListener("click", onClick);
		return button;
	}
}

class NoteCalendarSettingTab extends PluginSettingTab {
	constructor(app: any, private readonly calendarPlugin: NoteCalendarPlugin) {
		super(app, calendarPlugin);
	}

	display(): void {
		this.containerEl.replaceChildren();
		new Setting(this.containerEl)
			.setName("Entry folder")
			.setDesc("New notes are stored in this folder, inside a folder for each calendar.")
			.addText((text: any) => text
				.setPlaceholder(DEFAULT_SETTINGS.entryFolder)
				.setValue(this.calendarPlugin.settings.entryFolder)
				.onChange(async (value: string) => {
					this.calendarPlugin.settings.entryFolder = value.trim() || DEFAULT_SETTINGS.entryFolder;
					await this.calendarPlugin.saveSettings();
				}));

		new Setting(this.containerEl)
			.setName("First day of week")
			.setDesc("Choose which weekday starts each calendar row.")
			.addDropdown((dropdown: any) => dropdown
				.addOption("1", "Monday")
				.addOption("0", "Sunday")
				.setValue(String(this.calendarPlugin.settings.firstDayOfWeek))
				.onChange(async (value: string) => {
					this.calendarPlugin.settings.firstDayOfWeek = value === "0" ? 0 : 1;
					await this.calendarPlugin.saveSettings();
				}));
	}
}

function isMarkdownFile(file: any): file is TFile {
	return !!file && typeof file.path === "string" && String(file.extension).toLowerCase() === "md";
}

function isDateKey(value: unknown): value is string {
	return isValidDateKey(value);
}

function normalizeVaultPath(value: string): string {
	return value.trim().replaceAll("\\", "/").replace(/^\/+|\/+$/g, "") || DEFAULT_SETTINGS.entryFolder;
}

function createId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
	return `calendar-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
