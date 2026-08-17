import { Component, MarkdownRenderer } from "obsidian";
import { resolvePersona } from "../ai/persona";
import type { ChatMessage } from "../ai/types";
import type { Mascot } from "../engine/Mascot";
import type { Rect } from "../engine/types";
import type { MascotPack } from "../shimeji/types";
import type { BubbleStyle } from "../speech/SpeechBubbles";

/** Gap between the bottom of the transcript and the top of the room picture — room for the tail to
 * float clear of both, which is what makes it read as its own "scroll to the newest message"
 * affordance instead of an ordinary speech-bubble point notched into the border. */
const GAP_PX = 22;
/** The tail's own exact size, in real pixels — see styles.css's .shimeji-bubble-chat-tail, a plain
 * CSS border-triangle with these same two numbers as its width/height. Kept here rather than only
 * in CSS specifically so update() can centre it in the gap by *computed* pixel math instead of a
 * hand-tuned offset: a `transform: rotate()` diamond's own visual footprint is its diagonal
 * (`side * sqrt(2)`), not its side length, which is exactly the arithmetic that made three rounds
 * of eyeballed CSS offsets all come out subtly wrong. A plain rectangle has no such conversion to
 * get wrong — TAIL_HEIGHT only ever has to be comfortably less than GAP_PX for both edges below to
 * stay positive. */
const TAIL_WIDTH = 16;
const TAIL_HEIGHT = 10;
/** How much of the pane's own top edge to leave clear for RoomView's own .shimeji-room-chat-toggle
 * button, which sits at a fixed `top:6px; right:8px` there regardless of anything this class does.
 * The transcript's own top is never allowed to climb higher than this, even when the room picture
 * is short enough that there would otherwise be plenty of headroom to do it — the button is a real
 * click target, not something a taller transcript should be allowed to bury. */
const TOGGLE_RESERVED_PX = 36;
/** The input bar sits flush-ish under the picture; a little breathing room reads better than none. */
const INPUT_GAP_PX = 4;
const INPUT_BAR_HEIGHT = 36;
/** Below this neither zone is worth showing — a sliver conveys nothing a hidden bubble doesn't. */
const MIN_VISIBLE = 40;

export interface ChatBubbleDeps {
	/** Sends through whichever AI provider is currently active (see ai/providers.ts) — ChatBubble
	 * itself has no idea whether that's Anthropic or a local server, and never needs to: a thrown
	 * Error (no key/URL configured, the request failed) is caught and shown in the transcript the
	 * same way regardless of which provider produced it. */
	sendMessage(messages: ChatMessage[], systemPrompt: string): Promise<string>;
	personas(): ReadonlyMap<string, string>;
	/** Matches whichever style ordinary remark bubbles are currently drawn in — see
	 * SpeechBubbles.getStyle(). Only the transcript follows it; the input bar is a UI control, not
	 * speech, and always keeps Obsidian's own look regardless. */
	style(): BubbleStyle;
	packFor(mascot: Mascot): MascotPack | undefined;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

/**
 * The chat surface: a transcript docked directly above the room picture, sized to match its own
 * height and width, and a thin input bar docked directly below it — "bubble on top, office under,
 * and under that a thin input field". Both float in SpeechBubbles' own layer (see its `getLayer()`)
 * rather than a layer of their own — a second independent full-viewport box was exactly the
 * title-bar-blocking bug SOURCE_AUDIT.md's Pass 35 fixed — and both are positioned off the room's
 * own rects (RoomView.layout().rect for the picture, RoomView.paneRect() for the outer limit)
 * every frame, the same way SpeechBubbles measures the mascot's own element rather than computing a
 * position from physics.
 *
 * Deliberately never touches the room picture's own size or position: RoomGeometry.layoutRoom
 * computes the room's rect once, from the pane alone, and the doc comment on that function is
 * explicit that the stylesheet's centring and the geometry's ledges are "the same sum" and have to
 * agree — folding chat into that computation would mean either re-deriving it here (a second place
 * that can drift out of sync) or changing what the mascot's own floor physics sees while chat is
 * open. Docking around the existing rect instead means the room a mascot is standing in never
 * changes shape just because someone opened a conversation with it, and capping the transcript's
 * own height to the picture's rather than however much room happens to be free above it keeps a
 * short pane's dead space from turning chat into something that swallows the rest of the window.
 *
 * Extends Component only so MarkdownRenderer.renderMarkdown has something to own the lifecycle of
 * whatever it renders (embeds, hover previews) — loaded once at construction and unloaded once at
 * destroy(), independent of how many times the bubble itself opens and closes in between.
 *
 * History lives only in memory and only for as long as a mascot stays the resident: closing the
 * bubble keeps it (reopening the same resident's chat continues where it left off), but a
 * different resident — or the same one leaving — clears it. No persistence across an Obsidian
 * restart, the same as this whole feature not existing yet from the pack's own point of view.
 */
export class ChatBubble extends Component {
	private transcriptEl?: HTMLDivElement;
	private messagesEl?: HTMLDivElement;
	/** A real element, not a CSS ::after on the transcript — independently positioned in update()
	 * so its placement is exact, computed pixel math rather than a value tuned by eye against a
	 * screenshot and hoped to generalize. */
	private tailEl?: HTMLDivElement;
	private inputBarEl?: HTMLDivElement;
	private inputEl?: HTMLInputElement;
	private mascot?: Mascot;
	private history: ChatMessage[] = [];
	private sending = false;
	private notice?: string;
	/** Bumped on every renderMessages() call so an older, still-in-flight one (markdown rendering
	 * is async) can tell it has been superseded and stop touching the DOM — the same "a later call
	 * wins" guard RoomView.loadImage() uses for the same reason. */
	private renderGeneration = 0;

	constructor(private layer: HTMLElement, private deps: ChatBubbleDeps) {
		super();
		this.load();
	}

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
		else void this.renderMessages();
	}

	/** Removes the bubble from the screen but keeps the conversation — see this class's own doc
	 * comment for why. */
	close(): void {
		this.transcriptEl?.remove();
		this.transcriptEl = undefined;
		this.messagesEl = undefined;
		this.tailEl?.remove();
		this.tailEl = undefined;
		this.inputBarEl?.remove();
		this.inputBarEl = undefined;
		this.inputEl = undefined;
	}

	destroy(): void {
		this.close();
		this.mascot = undefined;
		this.history = [];
		this.unload();
	}

	private build(): void {
		if (!this.mascot) return;
		const comic = this.deps.style() === "comic";

		const transcript = this.layer.createDiv({ cls: "shimeji-bubble shimeji-bubble-chat" });
		transcript.toggleClass("shimeji-bubble-comic", comic);
		transcript.style.pointerEvents = "auto";
		this.transcriptEl = transcript;
		// The scrolling element is a child, not the transcript itself — see styles.css's own doc
		// comment on .shimeji-bubble-chat-messages for why: an element that clips its own overflow
		// clips *all* of its own box content once it clips anything at all, which is exactly what ate
		// the tail back when it was this element's own ::after (see the tail's own doc comment for
		// the full story of why it's a plain sibling element now instead).
		this.messagesEl = transcript.createDiv({ cls: "shimeji-bubble-chat-messages" });

		// A real element rather than a pseudo-element specifically so update() can position it with
		// exact pixel math instead of a hand-tuned CSS offset — see TAIL_WIDTH/TAIL_HEIGHT's own doc
		// comment for why that matters here.
		const tail = this.layer.createDiv({ cls: "shimeji-bubble-chat-tail" });
		tail.toggleClass("shimeji-bubble-comic", comic);
		this.tailEl = tail;

		// Always Obsidian's own look, whatever the transcript's bubble style is set to — a text
		// field is a control, not a line of speech.
		const inputBar = this.layer.createDiv({ cls: "shimeji-room-chat-inputbar" });
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

		void this.renderMessages();
	}

	private async send(): Promise<void> {
		if (!this.inputEl || !this.mascot || this.sending) return;
		const text = this.inputEl.value.trim();
		if (!text) return;
		this.notice = undefined;
		this.inputEl.value = "";
		this.history.push({ role: "user", content: text });
		this.sending = true;
		void this.renderMessages();
		try {
			const persona = resolvePersona(this.deps.packFor(this.mascot), this.deps.personas());
			const reply = await this.deps.sendMessage(this.history, persona);
			this.history.push({ role: "assistant", content: reply });
		} catch (e) {
			// Deliberately not pushed into history: an error string sent back as a future "assistant"
			// turn would confuse the model about what it actually said last, for a message that was
			// never really part of the conversation at all. Covers "not configured" the same as any
			// other failure (see ai/providers.ts's providerConfigError) — the message stays visible in
			// the transcript below the turn that triggered it either way.
			this.notice = e instanceof Error ? e.message : String(e);
		} finally {
			this.sending = false;
			void this.renderMessages();
		}
	}

	/** Free-flowing markdown text, not per-message boxes — a user's own turns align right in a
	 * muted colour, the assistant's align left in the ordinary text colour, the same "who's talking"
	 * cue a right-aligned messaging app uses without needing a bubble outline to do it. */
	private async renderMessages(): Promise<void> {
		const el = this.messagesEl;
		if (!el) return;
		const generation = ++this.renderGeneration;
		el.empty();
		for (const entry of this.history) {
			if (generation !== this.renderGeneration) return;
			const row = el.createDiv({ cls: `shimeji-bubble-chat-msg shimeji-bubble-chat-msg-${entry.role}` });
			await MarkdownRenderer.renderMarkdown(entry.content, row, "", this);
			if (generation !== this.renderGeneration) return;
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
	 * pane around it (RoomView.paneRect()). The transcript is sized to match officeRect's own
	 * height, sitting GAP_PX above it — shrinking only if paneRect doesn't leave that much room,
	 * never growing past what the picture itself is tall, and never climbing higher than
	 * TOGGLE_RESERVED_PX below paneRect's own top edge, so a short office picture in a tall pane
	 * can't let the transcript grow tall enough to bury the toggle button that opened it. The tail
	 * centres itself in whatever's left of the gap once the transcript is placed — its own bottom
	 * edge is always exactly GAP_PX above the office regardless of whether the top got clamped, so
	 * the tail's math never needs to know which case it's in. The input bar takes a thin strip
	 * directly below the picture the same way.
	 */
	update(residentMascot: Mascot | undefined, paneRect: Rect | undefined, officeRect: Rect | undefined): void {
		if (!this.isOpen) return;
		if (this.mascot !== residentMascot) {
			this.close();
			return;
		}
		const transcript = this.transcriptEl;
		const tail = this.tailEl;
		const inputBar = this.inputBarEl;
		if (!transcript || !tail || !inputBar) return;
		if (!paneRect || !officeRect) {
			transcript.style.visibility = "hidden";
			tail.style.visibility = "hidden";
			inputBar.style.visibility = "hidden";
			return;
		}

		const left = officeRect.left;
		const width = officeRect.right - officeRect.left;
		if (width <= 0) {
			transcript.style.visibility = "hidden";
			tail.style.visibility = "hidden";
			inputBar.style.visibility = "hidden";
			return;
		}

		const officeHeight = officeRect.bottom - officeRect.top;
		const desiredTop = officeRect.top - GAP_PX - officeHeight;
		const top = Math.max(paneRect.top + TOGGLE_RESERVED_PX, desiredTop);
		const transcriptHeight = officeRect.top - GAP_PX - top;
		if (transcriptHeight < MIN_VISIBLE) {
			transcript.style.visibility = "hidden";
			tail.style.visibility = "hidden";
		} else {
			transcript.style.visibility = "";
			transcript.style.left = `${Math.round(left)}px`;
			transcript.style.top = `${Math.round(top)}px`;
			transcript.style.width = `${Math.round(width)}px`;
			transcript.style.height = `${Math.round(transcriptHeight)}px`;

			const bubbleBottom = top + transcriptHeight;
			tail.style.visibility = "";
			tail.style.left = `${Math.round(left + width / 2 - TAIL_WIDTH / 2)}px`;
			tail.style.top = `${Math.round(bubbleBottom + Math.max(0, (GAP_PX - TAIL_HEIGHT) / 2))}px`;
		}

		const inputTop = officeRect.bottom + INPUT_GAP_PX;
		const inputHeight = clamp(paneRect.bottom - inputTop, 0, INPUT_BAR_HEIGHT);
		if (inputHeight < MIN_VISIBLE / 2) {
			inputBar.style.visibility = "hidden";
		} else {
			inputBar.style.visibility = "";
			inputBar.style.left = `${Math.round(left)}px`;
			inputBar.style.top = `${Math.round(inputTop)}px`;
			inputBar.style.width = `${Math.round(width)}px`;
			inputBar.style.height = `${Math.round(inputHeight)}px`;
		}
	}
}
