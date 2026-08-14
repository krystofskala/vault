/**
 * Test stub for the `obsidian` module. The real package ships types only (no runtime entry), so
 * anything importing a *value* from it — PackLoader's `normalizePath` — is otherwise untestable:
 * Vite fails to resolve the id before `vi.mock` ever gets a look in. Aliased in vitest.config.ts.
 *
 * Only implement what tests actually exercise, and implement it faithfully: `normalizePath`'s real
 * behavior (backslashes to forward slashes, duplicate separators collapsed, leading/trailing ones
 * trimmed) is load-bearing for the sound-path tests, so a lazy identity stub would let a genuine
 * path bug pass.
 */
export function normalizePath(path: string): string {
	return path
		.replace(/\\/g, "/")
		.replace(/\/{2,}/g, "/")
		.replace(/^\/+|\/+$/g, "");
}

export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class Modal {}
export class Notice {}
export class MarkdownView {}
export class WorkspaceWindow {}
export class Menu {}
export const Platform = { isMobile: false };
