/** Provider-agnostic — every protocol adapter (anthropicProtocol.ts, openaiCompatibleProtocol.ts)
 * builds its own wire format from the same shape, so ChatBubble's own history never needs to know
 * which backend is actually answering it. */
export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}
