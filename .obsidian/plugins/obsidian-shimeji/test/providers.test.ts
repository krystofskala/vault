import { describe, expect, it } from "vitest";
import { providerConfigError, type AiDispatchSettings } from "../src/ai/providers";

function settings(overrides: Partial<AiDispatchSettings> = {}): AiDispatchSettings {
	return {
		provider: "anthropic",
		anthropic: { apiKey: "sk-ant-test", model: "claude-sonnet-5" },
		local: { baseUrl: "http://localhost:11434/v1", apiKey: "", model: "llama3.2" },
		...overrides,
	};
}

describe("providerConfigError", () => {
	it("reports no error when the active provider (anthropic) has a key", () => {
		expect(providerConfigError(settings({ provider: "anthropic" }))).toBeUndefined();
	});

	it("reports an error when anthropic is active but its key is blank", () => {
		const error = providerConfigError(settings({ provider: "anthropic", anthropic: { apiKey: "", model: "claude-sonnet-5" } }));
		expect(error).toMatch(/Anthropic API key/);
	});

	it("reports an error when anthropic's key is only whitespace", () => {
		const error = providerConfigError(settings({ provider: "anthropic", anthropic: { apiKey: "   ", model: "claude-sonnet-5" } }));
		expect(error).toMatch(/Anthropic API key/);
	});

	it("reports no error when the active provider (local) has a server URL, even with no key", () => {
		expect(providerConfigError(settings({ provider: "local" }))).toBeUndefined();
	});

	it("reports an error when local is active but its URL is blank", () => {
		const error = providerConfigError(settings({ provider: "local", local: { baseUrl: "", apiKey: "", model: "llama3.2" } }));
		expect(error).toMatch(/local model server URL/);
	});

	it("ignores the inactive provider's own configuration entirely", () => {
		// Anthropic is blank, but local is active and configured -- no error.
		expect(
			providerConfigError(
				settings({ provider: "local", anthropic: { apiKey: "", model: "" }, local: { baseUrl: "http://localhost:11434/v1", apiKey: "", model: "llama3.2" } }),
			),
		).toBeUndefined();
	});
});
