import { sendChatMessage } from "./AnthropicClient";
import { sendOpenAiCompatibleMessage } from "./OpenAiCompatibleClient";
import type { ChatMessage } from "./types";

export type AiProvider = "anthropic" | "local";

/** Everything either backend needs, gathered under one shape so a caller (ChatBubble, the
 * per-persona "Test" button) can send a message without knowing which provider is actually
 * answering it — main.ts assembles this fresh from live settings on every call, same as every
 * other "read live via thunks" spot in this plugin. Each provider keeps its own settings block
 * rather than sharing fields, so switching back and forth never loses what was typed into the
 * other one. */
export interface AiDispatchSettings {
	provider: AiProvider;
	anthropic: { apiKey: string; model: string };
	local: { baseUrl: string; apiKey: string; model: string };
}

/**
 * Whether the currently active provider has enough to actually try — pulled out as its own pure
 * function (rather than folded into sendAiMessage) purely so it's testable without a network stub:
 * sendAiMessage itself reaches `requestUrl` through whichever client it delegates to, the same
 * reason AnthropicClient.sendChatMessage was never unit-tested directly, but the validation this
 * gates on has real branches worth getting right.
 */
export function providerConfigError(settings: AiDispatchSettings): string | undefined {
	if (settings.provider === "local") {
		if (!settings.local.baseUrl.trim()) return "No local model server URL configured — set one in Settings → AI Assistant.";
		return undefined;
	}
	if (!settings.anthropic.apiKey.trim()) return "No Anthropic API key configured — set one in Settings → AI Assistant.";
	return undefined;
}

/** Sends through whichever provider is currently active. Both ChatBubble's own chat and the
 * per-persona "Test" button in settings go through this rather than a specific client directly —
 * the settings screen's own per-provider "Test connection" buttons are the exception, since those
 * exist specifically to test one provider's own settings regardless of which is active. */
export async function sendAiMessage(settings: AiDispatchSettings, messages: ChatMessage[], systemPrompt?: string): Promise<string> {
	const error = providerConfigError(settings);
	if (error) throw new Error(error);
	if (settings.provider === "local") return sendOpenAiCompatibleMessage(settings.local, messages, systemPrompt);
	return sendChatMessage(settings.anthropic, messages, systemPrompt);
}
