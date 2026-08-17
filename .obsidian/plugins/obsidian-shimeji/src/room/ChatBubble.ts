import type { ChatMessage } from "../ai/anthropicProtocol";
import { sendChatMessage } from "../ai/AnthropicClient";
import { resolvePersona } from "../ai/persona";
import type { Mascot } from "../engine/Mascot";
import type { Rect } from "../engine/types";
import type { MascotPack } from "../shimeji/types";
import type { BubbleStyle } from "../speech/SpeechBubbles";

/** Gap between the top of the sprite and the bottom of the bubble — matches SpeechBubbles' own
 * BUBBLE_OFFSET_PX, so an expanded chat and an ordinary remark sit the same distance from the
 * sprite either way. */
const BUBBLE_OFFSET_PX = 8;
const MIN_WIDTH = 240;
const MAX_WIDTH = 460;
const MIN_HEIGHT = 260;
const MAX_HEIGHT = 560;

export interface ChatBubbleDeps {
	apiKey(): string;
	model(): string;
	personas(): Record<string, string>;
	/** Matches whichever style ordinary remark bubbles are currently drawn in — see
	 * SpeechBubbles.getStyle(). */
	style(): BubbleStyle;
	packFor(mascot: Mascot): MascotPack | undefined;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

/**
 * The chat surface: the mascot's own speech bubble, expanded — same `.shimeji-bubble` styling
 * (theme or comic, whichever the user has picked) as an ordinary one-line remark, just much
 * bigger, roughly square, and holding a scrollable transcript with its own input pinned under it
 * instead of a single line of text. Lives inside SpeechBubbles' own layer (see its `getLayer()`)
 * rather than a second one of its own — a second independent full-viewport box was exactly the
 * title-bar-blocking bug SOURCE_AUDIT.md's Pass 35 fixed, and this way there is nothing new to
 * re-break it.
 *
 * Deliberately not built into RoomView's own contentEl: a speech bubble is drawn relative to
 * whichever mascot it belongs to, the same way every other remark already is, so a resident that
 * moves around within its room (or the room's own pane moving/resizing) doesn't leave the chat
 * pointing at empty air. RoomView only ever offers the small button that opens it — see
 * RoomViewOptions.onToggleChat.
 *
 * History lives only in memory and only for as long as a mascot stays the resident: closing the
 * bubble keeps it (reopening the same resident's chat continues where it left off), but a
 * different resident — or the same one leaving — clears it. No persistence across an Obsidian
 * restart, the same as this whole feature not existing yet from the pack's own point of view.
 */
export class ChatBubble {
	private el?: HTMLDivElement;
	private messagesEl?: HTMLDivElement;
	private inputEl?: HTMLTextAreaElement;
	private mascot?: Mascot;
	private history: ChatMessage[] = [];
	private sending = false;
	private notice?: string;

	constructor(private layer: HTMLElement, private deps: ChatBubbleDeps) {}

	get isOpen(): boolean {
		return this.el !== undefined;
	}

	toggle(mascot: Mascot | undefined): void {
		if (this.isOpen) this.close();
		else if (mascot) this.open(mascot);
	}

	open(mascot: Mascot): void {
		if (this.mascot !== mascot) {
			this.history = [];
			this.notice = undefined;
		}
		this.mascot = mascot;
		if (!this.isOpen) this.build();
		else this.renderMessages();
	}

	/** Removes the bubble from the screen but keeps the conversation — see this class's own doc
	 * comment for why. */
	close(): void {
		this.el?.remove();
		this.el = undefined;
		this.messagesEl = undefined;
		this.inputEl = undefined;
	}

	destroy(): void {
		this.close();
		this.mascot = undefined;
		this.history = [];
	}

	private build(): void {
		if (!this.mascot) return;
		const el = this.layer.createDiv({ cls: "shimeji-bubble shimeji-bubble-chat" });
		el.toggleClass("shimeji-bubble-comic", this.deps.style() === "comic");
		el.style.pointerEvents = "auto";

		const header = el.createDiv({ cls: "shimeji-bubble-chat-header" });
		header.createSpan({ text: this.deps.packFor(this.mascot)?.name ?? "Chat" });
		const closeBtn = header.createEl("button", { cls: "shimeji-bubble-chat-close", text: "×" });
		closeBtn.setAttribute("aria-label", "Close chat");
		closeBtn.onclick = () => this.close();

		this.messagesEl = el.createDiv({ cls: "shimeji-bubble-chat-messages" });

		const inputRow = el.createDiv({ cls: "shimeji-bubble-chat-input-row" });
		const input = inputRow.createEl("textarea", { cls: "shimeji-bubble-chat-input" });
		input.rows = 2;
		input.placeholder = "Say something…";
		this.inputEl = input;
		const sendBtn = inputRow.createEl("button", { cls: "shimeji-bubble-chat-send", text: "Send" });
		const trigger = () => void this.send();
		sendBtn.onclick = trigger;
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				trigger();
			}
		});

		this.el = el;
		this.renderMessages();
	}

	private async send(): Promise<void> {
		if (!this.inputEl || !this.mascot || this.sending) return;
		const text = this.inputEl.value.trim();
		if (!text) return;
		const apiKey = this.deps.apiKey().trim();
		if (!apiKey) {
			this.notice = "No API key configured — set one in Settings → AI Assistant.";
			this.renderMessages();
			return;
		}
		this.notice = undefined;
		this.inputEl.value = "";
		this.history.push({ role: "user", content: text });
		this.sending = true;
		this.renderMessages();
		try {
			const persona = resolvePersona(this.deps.packFor(this.mascot), this.deps.personas());
			const reply = await sendChatMessage({ apiKey, model: this.deps.model() || "claude-sonnet-5" }, this.history, persona);
			this.history.push({ role: "assistant", content: reply });
		} catch (e) {
			// Deliberately not pushed into history: an error string sent back as a future "assistant"
			// turn would confuse the model about what it actually said last, for a message that was
			// never really part of the conversation at all.
			this.notice = e instanceof Error ? e.message : String(e);
		} finally {
			this.sending = false;
			this.renderMessages();
		}
	}

	private renderMessages(): void {
		if (!this.messagesEl) return;
		this.messagesEl.empty();
		for (const entry of this.history) {
			this.messagesEl.createDiv({ cls: `shimeji-bubble-chat-msg shimeji-bubble-chat-msg-${entry.role}`, text: entry.content });
		}
		if (this.sending) {
			this.messagesEl.createDiv({ cls: "shimeji-bubble-chat-msg shimeji-bubble-chat-msg-assistant shimeji-bubble-chat-thinking", text: "…" });
		}
		if (this.notice) this.messagesEl.createDiv({ cls: "shimeji-bubble-chat-notice", text: this.notice });
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}

	/**
	 * Called every frame from the same loop that already drives SpeechBubbles/RoomForeground.
	 * `residentMascot` is the room's *current* resident (not necessarily this bubble's own mascot,
	 * which is why it's passed in rather than read off `this.mascot`) — a resident change closes an
	 * open chat rather than leaving it floating over a room its own mascot has left, the same way a
	 * remark bubble already disappears once its mascot is gone.
	 */
	update(residentMascot: Mascot | undefined, roomRect: Rect | undefined): void {
		if (!this.isOpen) return;
		if (this.mascot !== residentMascot) {
			this.close();
			return;
		}
		const el = this.el;
		const mascot = this.mascot;
		if (!el || !mascot) return;
		const mascotRect = mascot.el.getBoundingClientRect();
		if (mascotRect.width === 0 && mascotRect.height === 0) {
			el.style.visibility = "hidden";
			return;
		}
		el.style.visibility = "";

		// Bigger and squarer than an ordinary remark, roughly matching the room pane's own footprint
		// when it's on screen to measure — clamped either way so it's never absurdly small or larger
		// than the window itself.
		const paneWidth = roomRect ? roomRect.right - roomRect.left : MAX_WIDTH;
		const paneHeight = roomRect ? roomRect.bottom - roomRect.top : MAX_HEIGHT;
		const width = clamp(paneWidth * 0.92, MIN_WIDTH, MAX_WIDTH);
		const height = clamp(Math.min(paneHeight * 0.7, width * 1.15), MIN_HEIGHT, MAX_HEIGHT);
		el.style.width = `${Math.round(width)}px`;
		el.style.height = `${Math.round(height)}px`;

		const centred = mascotRect.left + mascotRect.width / 2 - width / 2;
		const left = clamp(centred, 4, window.innerWidth - width - 4);
		const top = Math.max(4, mascotRect.top - height - BUBBLE_OFFSET_PX);
		el.style.left = `${Math.round(left)}px`;
		el.style.top = `${Math.round(top)}px`;
	}
}
