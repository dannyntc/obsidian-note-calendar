declare module "obsidian" {
	export interface PluginManifest {
		id: string;
		name: string;
		version: string;
		minAppVersion: string;
		[key: string]: unknown;
	}

	export interface TAbstractFile {
		path: string;
		name: string;
		parent?: TFolder | null;
	}

	export interface TFolder extends TAbstractFile {
		children: TAbstractFile[];
	}

	export interface TFile extends TAbstractFile {
		extension: string;
		stat: { ctime: number; mtime: number; size: number };
	}

	export interface App {
		workspace: any;
		vault: any;
		metadataCache: any;
		fileManager: any;
		[key: string]: any;
	}

	export interface WorkspaceLeaf {
		view: any;
	}

	export interface ItemView {
		addAction(icon: string, title: string, callback: (event: MouseEvent) => any): HTMLElement;
	}

	export interface MarkdownView extends ItemView {
		file: TFile;
	}

	export interface MarkdownPostProcessorContext {
		sourcePath: string;
		addChild(component: Component): void;
		[key: string]: any;
	}

	export class Component {
		load(): void;
		onload(): void;
		unload(): void;
		onunload(): void;
		addChild<T extends Component>(component: T): T;
		registerEvent(event: any): void;
		registerDomEvent(
			el: HTMLElement | Document | Window,
			event: string,
			callback: (event: any) => any,
			options?: boolean | AddEventListenerOptions,
		): void;
	}

	export interface Command {
		id: string;
		name: string;
		checkCallback?: (checking: boolean) => boolean | void;
		callback?: () => void;
	}

	export class Plugin extends Component {
		app: App;
		manifest: PluginManifest;
		constructor(app: App, manifest: PluginManifest);
		loadData(): Promise<any>;
		saveData(data: any): Promise<void>;
		addCommand(command: Command): any;
		addSettingTab(tab: PluginSettingTab): any;
		registerMarkdownCodeBlockProcessor(
			language: string,
			handler: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => Promise<any> | void,
			sortOrder?: number,
		): any;
		registerEvent(event: any): void;
		registerDomEvent(
			el: HTMLElement | Document | Window,
			event: string,
			callback: (event: any) => any,
			options?: boolean | AddEventListenerOptions,
		): void;
	}

	export class PluginSettingTab {
		app: App;
		plugin: Plugin;
		containerEl: HTMLElement;
		constructor(app: App, plugin: Plugin);
		display(): void;
	}

	export class Setting {
		constructor(containerEl: HTMLElement);
		setName(name: string): this;
		setDesc(description: string | DocumentFragment): this;
		addText(callback: (component: any) => any): this;
		addDropdown(callback: (component: any) => any): this;
	}

	export class Notice {
		constructor(message: string, timeout?: number);
	}

	export class Menu {
		addItem(callback: (item: any) => any): this;
	}

	export function setIcon(element: HTMLElement, icon: string): void;
	export function setTooltip(element: HTMLElement, tooltip: string, placement?: string): void;
	export function normalizePath(path: string): string;
}
