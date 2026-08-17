import type { ChatMessage } from "../ai/anthropicProtocol";
import { sendChatMessage } from "../ai/AnthropicClient";
import { resolvePersona } from "../ai/persona";
import type { Mascot } from "../engine/Mascot";
import type { Rect } from "../engine/types";
import type { MascotPack } from "../shimeji/types";
import type { BubbleStyle } from "../speech/SpeechBubbles";

/** Below this the transcript is too short to read anything in, so it hides rather than show a
 * sliver — the room picture stays exactly where it is either way (see this file's own doc
 * comment), this only decides whether there is enough leftover room above it to bother with. */
const MIN_TRANSCRIPT_HEIGHT = 90;
/** The input bar's own height when there is room for it — "thin", a single line, not the
 * multi-row composer an ordinary chat app would use. */
const INPUT_BAR_HEIGHT = 36;
const MIN_INPUT_HEIGHT = 22;

export interface ChatBubbleDeps {
	apiKey(): string;
	model(): string;
	personas(): ReadonlyMap<string, string>;
	/** Matches whichever style ordinary remark bubbles are currently drawn in — see
	 * SpeechBubbles.getStyle(). */
	style(): BubbleStyle;
	packFor(mascot: Mascot): MascotPack | undefined;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

/**
 * The chat surface: a transcript docked directly above the room picture and a thin input bar
 * docked directly below it — "bubble on top, office under, and under that a thin input field",
 * matching the office's own width exactly. Both float in SpeechBubbles' own layer (see its
 * `getLayer()`) rather than a layer of their own — a second independent full-viewport box was
 * exactly the title-bar-blocking bug SOURCE_AUDIT.md's Pass 35 fixed — and both are positioned off
 * the room's own rects (RoomView.layout().rect for the picture, RoomView.paneRect() for the outer
 * limit) every frame, the same way SpeechBubbles measures the mascot's own element rather than
 * computing a position from physics.
 *
 * Deliberately never touches the room picture's own size or position: RoomGeometry.layoutRoom
 * computes the room's rect once, from the pane alone, and the doc comment on that function is
 * explicit that the stylesheet's centring and the geometry's ledges are "the same sum" and have to
 * agree — folding chat into that computation would mean either re-deriving it here (a second place
 * that can drift out of sync) or changing what the mascot's own floor physics sees while chat is
 * open. Docking around the existing rect instead means the room a mascot is standing in never
 * changes shape just because someone opened a conversation with it.
 *
 * Not built into RoomView's own contentEl for the same reason: a second, independent floating
 * layer can safely go to zero height (nothing to show above a room that already fills its pane)
 * without RoomGeometry ever finding out its own measurements changed underneath it.
 *
 * History lives only in memory and only for as long as a mascot stays the resident: closing the
 * bubble keeps it (reopening the same resident's chat continues where it left off), but a
 * different resident — or the same one leaving — clears it. No persistence across an Obsidian
 * restart, the same as this whole feature not existing yet from the pack's own point of view.
 */
export class ChatBubble {
	private transcriptEl?: HTMLDivElement;
	private inputBarEl?: HTMLDivElement;
	private inputEl?: HTMLInputElement;
	private mascot?: Mascot;
	private history: ChatMessage[] = [];
	private sending = false;
	private notice?: string;

	constructor(private layer: HTMLElement, private deps: ChatBubbleDeps) {}

	get isOpen(): boolean {
		return this.transcriptEl !== undefined;
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
		this.transcriptEl?.remove();
		this.transcriptEl = undefined;
		this.inputBarEl?.remove();
		this.inputBarEl = undefined;
		this.inputEl = undefined;
	}

	destroy(): void {
		this.close();
		this.mascot = undefined;
		this.history = [];
	}

	private build(): void {
		if (!this.mascot) return;
		const comic = this.deps.style() === "comic";

		const transcript = this.layer.createDiv({ cls: "shimeji-bubble shimeji-bubble-chat" });
		transcript.toggleClass("shimeji-bubble-comic", comic);
		transcript.style.pointerEvents = "auto";
		this.transcriptEl = transcript;

		const inputBar = this.layer.createDiv({ cls: "shimeji-room-chat-inputbar" });
		inputBar.toggleClass("shimeji-bubble-comic", comic);
		inputBar.style.pointerEvents = "auto";
		const input = inputBar.createEl("input", { cls: "shimeji-room-chat-inputbar-field", attr: { type: "text" } });
		input.placeholder = "Say something…";
		this.inputEl = input;
		const sendBtn = inputBar.createEl("button", { cls: "shimeji-room-chat-inputbar-send", text: "Send" });
		const trigger = () => void this.send();
		sendBtn.onclick = trigger;
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				trigger();
			}
		});
		this.inputBarEl = inputBar;

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
		const el = this.transcriptEl;
		if (!el) return;
		el.empty();
		for (const entry of this.history) {
			el.createDiv({ cls: `shimeji-bubble-chat-msg shimeji-bubble-chat-msg-${entry.role}`, text: entry.content });
		}
		if (this.sending) {
			el.createDiv({ cls: "shimeji-bubble-chat-msg shimeji-bubble-chat-msg-assistant shimeji-bubble-chat-thinking", text: "…" });
		}
		if (this.notice) el.createDiv({ cls: "shimeji-bubble-chat-notice", text: this.notice });
		el.scrollTop = el.scrollHeight;
	}

	/**
	 * Called every frame from the same loop that already drives SpeechBubbles/RoomForeground.
	 * `residentMascot` is the room's *current* resident (not necessarily this bubble's own mascot,
	 * which is why it's passed in rather than read off `this.mascot`) — a resident change closes an
	 * open chat rather than leaving it floating over a room its own mascot has left, the same way a
	 * remark bubble already disappears once its mascot is gone.
	 *
	 * `officeRect` is the room picture's own box (RoomView.layout().rect); `paneRect` is the whole
	 * pane around it (RoomView.paneRect()). The transcript fills whatever room paneRect leaves above
	 * officeRect, and the input bar takes a thin strip of whatever is left below it — both clamped
	 * to paneRect's own edges, so neither ever pokes outside the pane the room lives in, and neither
	 * ever overlaps the room picture itself.
	 */
	update(residentMascot: Mascot | undefined, paneRect: Rect | undefined, officeRect: Rect | undefined): void {
		if (!this.isOpen) return;
		if (this.mascot !== residentMascot) {
			this.close();
			return;
		}
		const transcript = this.transcriptEl;
		const inputBar = this.inputBarEl;
		if (!transcript || !inputBar) return;
		if (!paneRect || !officeRect) {
			transcript.style.visibility = "hidden";
			inputBar.style.visibility = "hidden";
			return;
		}

		const left = officeRect.left;
		const width = officeRect.right - officeRect.left;
		if (width <= 0) {
			transcript.style.visibility = "hidden";
			inputBar.style.visibility = "hidden";
			return;
		}

		const transcriptHeight = officeRect.top - paneRect.top;
		if (transcriptHeight < MIN_TRANSCRIPT_HEIGHT) {
			transcript.style.visibility = "hidden";
		} else {
			transcript.style.visibility = "";
			transcript.style.left = `${Math.round(left)}px`;
			transcript.style.top = `${Math.round(paneRect.top)}px`;
			transcript.style.width = `${Math.round(width)}px`;
			transcript.style.height = `${Math.round(transcriptHeight)}px`;
		}

		const inputHeight = clamp(paneRect.bottom - officeRect.bottom, 0, INPUT_BAR_HEIGHT);
		if (inputHeight < MIN_INPUT_HEIGHT) {
			inputBar.style.visibility = "hidden";
		} else {
			inputBar.style.visibility = "";
			inputBar.style.left = `${Math.round(left)}px`;
			inputBar.style.top = `${Math.round(officeRect.bottom)}px`;
			inputBar.style.width = `${Math.round(width)}px`;
			inputBar.style.height = `${Math.round(inputHeight)}px`;
		}
	}
}
