import { describe, expect, it } from "vitest";
import { buildOpenAiCompatibleRequest, parseOpenAiCompatibleResponse, type OpenAiCompatibleSettings } from "../src/ai/openaiCompatibleProtocol";
import type { ChatMessage } from "../src/ai/types";

const SETTINGS: OpenAiCompatibleSettings = { baseUrl: "http://localhost:11434/v1", apiKey: "", model: "llama3.2" };

describe("buildOpenAiCompatibleRequest", () => {
	it("posts to <baseUrl>/chat/completions", () => {
		const req = buildOpenAiCompatibleRequest(SETTINGS, []);
		expect(req.url).toBe("http://localhost:11434/v1/chat/completions");
	});

	it("trims a trailing slash off the base URL before appending the path", () => {
		const req = buildOpenAiCompatibleRequest({ ...SETTINGS, baseUrl: "http://localhost:11434/v1/" }, []);
		expect(req.url).toBe("http://localhost:11434/v1/chat/completions");
	});

	it("carries the content-type header, and no authorization header when the key is blank", () => {
		const req = buildOpenAiCompatibleRequest(SETTINGS, []);
		expect(req.headers["content-type"]).toBe("application/json");
		expect("authorization" in req.headers).toBe(false);
	});

	it("sends the key as a Bearer token only when one is actually configured", () => {
		const req = buildOpenAiCompatibleRequest({ ...SETTINGS, apiKey: "  sk-local-123  " }, []);
		expect(req.headers["authorization"]).toBe("Bearer sk-local-123");
	});

	it("includes the configured model and a max_tokens cap in the body", () => {
		const req = buildOpenAiCompatibleRequest(SETTINGS, []);
		const body = JSON.parse(req.body);
		expect(body.model).toBe("llama3.2");
		expect(typeof body.max_tokens).toBe("number");
		expect(body.max_tokens).toBeGreaterThan(0);
	});

	it("maps messages to plain role/content pairs, in order, with no system message when none is given", () => {
		const messages: ChatMessage[] = [
			{ role: "user", content: "hello" },
			{ role: "assistant", content: "hi there" },
		];
		const req = buildOpenAiCompatibleRequest(SETTINGS, messages);
		const body = JSON.parse(req.body);
		expect(body.messages).toEqual([
			{ role: "user", content: "hello" },
			{ role: "assistant", content: "hi there" },
		]);
	});

	it("puts the system prompt first in the messages array, unlike Anthropic's separate top-level field", () => {
		const req = buildOpenAiCompatibleRequest(SETTINGS, [{ role: "user", content: "hello" }], "You are a helpful desktop companion.");
		const body = JSON.parse(req.body);
		expect(body.messages).toEqual([
			{ role: "system", content: "You are a helpful desktop companion." },
			{ role: "user", content: "hello" },
		]);
	});
});

describe("parseOpenAiCompatibleResponse", () => {
	it("extracts the reply text from the first choice's message content", () => {
		const json = { choices: [{ message: { role: "assistant", content: "Connected." } }] };
		expect(parseOpenAiCompatibleResponse(200, json)).toBe("Connected.");
	});

	it("only ever reads the first choice", () => {
		const json = { choices: [{ message: { content: "first" } }, { message: { content: "second" } }] };
		expect(parseOpenAiCompatibleResponse(200, json)).toBe("first");
	});

	it("throws the server's own error message for a non-2xx status with a real error body", () => {
		const json = { error: { message: "model 'nonexistent' not found" } };
		expect(() => parseOpenAiCompatibleResponse(404, json)).toThrow("model 'nonexistent' not found");
	});

	it("falls back to a generic HTTP-status message when the error body doesn't match the expected shape", () => {
		expect(() => parseOpenAiCompatibleResponse(500, { totally: "unexpected" })).toThrow(/HTTP 500/);
		expect(() => parseOpenAiCompatibleResponse(503, null)).toThrow(/HTTP 503/);
	});

	it("throws a clear error when a 2xx response has no usable choices array at all", () => {
		expect(() => parseOpenAiCompatibleResponse(200, { choices: "not an array" })).toThrow(/Unexpected response shape/);
		expect(() => parseOpenAiCompatibleResponse(200, {})).toThrow(/Unexpected response shape/);
		expect(() => parseOpenAiCompatibleResponse(200, { choices: [] })).toThrow(/Unexpected response shape/);
	});

	it("throws a clear error when the first choice has no message content", () => {
		expect(() => parseOpenAiCompatibleResponse(200, { choices: [{}] })).toThrow(/Unexpected response shape/);
		expect(() => parseOpenAiCompatibleResponse(200, { choices: [{ message: { content: "" } }] })).toThrow(/Unexpected response shape/);
	});
});
