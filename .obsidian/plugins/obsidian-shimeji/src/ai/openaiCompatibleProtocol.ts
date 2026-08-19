import { AiRequestError, type ChatMessage } from "./types";

/**
 * Pure request-building and response-parsing for the OpenAI-compatible `/chat/completions` shape
 * — the wire format Ollama, LM Studio, and most other local model runners have converged on as a
 * common baseline, so one adapter against this shape covers all of them rather than needing one
 * per runtime. Kept separate from the actual `requestUrl` call (OpenAiCompatibleClient.ts) for the
 * same reason anthropicProtocol.ts is kept separate from AnthropicClient.ts: this is the part
 * actually worth getting right, and pure functions are testable without a running local server.
 */

export interface OpenAiCompatibleSettings {
	/** e.g. "http://localhost:11434/v1" for Ollama's own compat endpoint, or
	 * "http://localhost:1234/v1" for LM Studio. A trailing slash is tolerated — see
	 * normalizeBaseUrl. */
	baseUrl: string;
	/** Almost always blank — most local servers, Ollama included, don't check one at all. Sent as
	 * a Bearer token only when non-empty, for the servers that do want one. */
	apiKey: string;
	model: string;
}

export interface OpenAiCompatibleRequest {
	url: string;
	headers: Record<string, string>;
	body: string;
}

const MAX_TOKENS = 1024;

/** A URL typed by hand is exactly the kind of place a stray trailing slash creeps in — trimmed so
 * "http://localhost:11434/v1" and "http://localhost:11434/v1/" both resolve to the same endpoint. */
function normalizeBaseUrl(baseUrl: string): string {
	return baseUrl.trim().replace(/\/+$/, "");
}

/** The exact request an OpenAI-compatible `/chat/completions` endpoint expects. Unlike Anthropic's
 * Messages API, there is no separate top-level system field — the system prompt is just another
 * message, first, with role "system". */
export function buildOpenAiCompatibleRequest(settings: OpenAiCompatibleSettings, messages: ChatMessage[], systemPrompt?: string): OpenAiCompatibleRequest {
	const chatMessages: Array<{ role: string; content: string }> = systemPrompt ? [{ role: "system", content: systemPrompt }] : [];
	chatMessages.push(...messages.map((m) => ({ role: m.role, content: m.content })));
	const headers: Record<string, string> = { "content-type": "application/json" };
	const apiKey = settings.apiKey.trim();
	if (apiKey) headers["authorization"] = `Bearer ${apiKey}`;
	return {
		url: `${normalizeBaseUrl(settings.baseUrl)}/chat/completions`,
		headers,
		body: JSON.stringify({ model: settings.model, max_tokens: MAX_TOKENS, messages: chatMessages }),
	};
}

/**
 * Turns an OpenAI-compatible JSON response body into the assistant's reply text, or throws a
 * clear, specific `Error`. Takes the HTTP status alongside the body deliberately, the same reason
 * parseAnthropicResponse does: an error response here is real, useful JSON (a model name that
 * doesn't exist on this server, a malformed request) worth surfacing rather than discarding for a
 * generic "request failed".
 */
export function parseOpenAiCompatibleResponse(status: number, json: unknown): string {
	const obj = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
	if (status < 200 || status >= 300) {
		const error = obj?.error && typeof obj.error === "object" ? (obj.error as Record<string, unknown>) : undefined;
		const message = error?.message;
		throw new AiRequestError(typeof message === "string" && message ? message : `Local model server request failed (HTTP ${status}).`, status);
	}
	const choices = obj?.choices;
	const first = Array.isArray(choices) && choices.length > 0 ? choices[0] : undefined;
	const message = first && typeof first === "object" ? (first as Record<string, unknown>).message : undefined;
	const content = message && typeof message === "object" ? (message as Record<string, unknown>).content : undefined;
	if (typeof content !== "string" || !content) throw new Error("Unexpected response shape from the local model server (no message content).");
	return content;
}
