import { Component, MarkdownRenderer } from "obsidian";
import { resolvePersona } from "../ai/persona";
import type { ChatMessage } from "../ai/types";
import type { Mascot } from "../engine/Mascot";
import type { Rect } from "../engine/types";
import type { MascotPack } from "../shimeji/types";
import type { BubbleStyle } from "../speech/SpeechBubbles";

/** The exact height, in real pixels, of the space reserved between the bottom of the transcript and
 * the top of the room picture — and also the tail's own height (styles.css's
 * .shimeji-bubble-chat-tail), a plain CSS border-triangle and a *child* of the transcript now rather
 * than an independently-positioned sibling. The two used to be different numbers (a wider GAP_PX
 * than TAIL_HEIGHT, split evenly above and below the tail) until that gap read as unwanted dead
 * space; making the tail a child means it hangs directly off the transcript's own bottom border with
 * a plain CSS `bottom: -TAIL_HEIGHT` offset (see the rule's own comment) and needs no independent
 * left/top math at all, so there is only one number left to keep in sync rather than three. */
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
	 * SpeechBubbles.getStyle(). The transcript and the input bar both follow it, so the whole chat
	 * surface reads as one object. */
	style(): BubbleStyle;
	packFor(mascot: Mascot): MascotPack | undefined;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

/** The transcript's own timeline is a superset of what the AI actually sees: a "scripted" entry is
 * one of the mascot's ordinary ambient/vault-reaction lines, redirected here instead of popping up
 * as its own floating bubble while chat is open (see main.ts's wiring of SpeechBubbles' tryRedirect
 * and this class's own addScriptedLine below). It has to render alongside real turns, but it is not
 * something anyone said to the model or the model said back — sendMessage must never see it. */
type TimelineRole = ChatMessage["role"] | "scripted";
interface TimelineEntry {
	role: TimelineRole;
	content: string;
}

/** Drops scripted lines before a turn goes out over the wire, so a mascot's ambient chatter can
 * never masquerade as conversation history the model believes it or the user actually said. */
function toChatMessages(entries: readonly TimelineEntry[]): ChatMessage[] {
	return entries.filter((entry): entry is ChatMessage => entry.role !== "scripted");
}

/**
 * The chat surface: a transcript docked directly above the room picture, sized to match its own
 * height and width, and a thin input bar docked directly below it — "bubble on top, room under,
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
	private inputBarEl?: HTMLDivElement;
	private inputEl?: HTMLInputElement;
	private mascot?: Mascot;
	/** The pack id resolved for `mascot` as of the last open()/history-reset — not just the mascot
	 * object itself. "Switch character" (the per-mascot context menu) reassigns a *different* pack
	 * to the same live Mascot instance rather than replacing it, so object identity alone never
	 * changes here and this class had no way to notice: the system prompt recomputed correctly on
	 * every send() (see resolvePersona there), but stale history in the old character's own voice
	 * kept riding along with it, outweighing a merely-updated prompt. Reloading used to "fix" this
	 * only by destroying and rebuilding this whole object, wiping the poisoned history along with
	 * it — undefined here means "no pack" (the placeholder character), a real, distinct value from
	 * any actual pack id, so switching to or from the placeholder counts as a change too. */
	private lastPackId?: string;
	private history: TimelineEntry[] = [];
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
		const packId = this.deps.packFor(mascot)?.id;
		if (this.mascot !== mascot || packId !== this.lastPackId) {
			this.history = [];
			this.notice = undefined;
		}
		this.mascot = mascot;
		this.lastPackId = packId;
		if (!this.isOpen) this.build();
		else void this.renderMessages();
	}

	/** Removes the bubble from the screen but keeps the conversation — see this class's own doc
	 * comment for why. */
	close(): void {
		// The tail is a child of transcript now (see build()), so removing transcript takes it too.
		this.transcriptEl?.remove();
		this.transcriptEl = undefined;
		this.messagesEl = undefined;
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

	/** Called from SpeechBubbles' tryRedirect hook when this mascot's chat is open, so an ambient
	 * line appears as a red entry in the transcript instead of its own floating bubble. Returns
	 * false (and touches nothing) for any mascot other than this bubble's own open one, so
	 * SpeechBubbles falls back to its normal floating bubble for everyone else. */
	addScriptedLine(mascot: Mascot, text: string): boolean {
		if (!this.isOpen || this.mascot !== mascot) return false;
		this.history.push({ role: "scripted", content: text });
		void this.renderMessages();
		return true;
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

		// A child of the transcript, not the layer — see styles.css's own comment on the rule for why
		// that is what finally makes it move as one fused object with no independent position math.
		const tail = transcript.createDiv({ cls: "shimeji-bubble-chat-tail" });
		tail.toggleClass("shimeji-bubble-comic", comic);

		// Same base bubble class as the transcript above it, and the same comic toggle — see
		// styles.css's own comment on .shimeji-room-chat-inputbar for the overrides that keep it a
		// full-width bar rather than a small speech bubble.
		const inputBar = this.layer.createDiv({ cls: "shimeji-room-chat-inputbar shimeji-bubble" });
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
			const reply = await this.deps.sendMessage(toChatMessages(this.history), persona);
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
	 * Called every frame from the same loop that already drives SpeechBubbles.
	 * `residentMascot` is the room's *current* resident (not necessarily this bubble's own mascot,
	 * which is why it's passed in rather than read off `this.mascot`) — a resident change closes an
	 * open chat rather than leaving it floating over a room its own mascot has left, the same way a
	 * remark bubble already disappears once its mascot is gone.
	 *
	 * `roomRect` is the room picture's own box (RoomView.layout().rect); `paneRect` is the whole
	 * pane around it (RoomView.paneRect()). The transcript is sized to match roomRect's own
	 * height, sitting exactly TAIL_HEIGHT above it — shrinking only if paneRect doesn't leave that
	 * much room, never growing past what the picture itself is tall, and never climbing higher than
	 * TOGGLE_RESERVED_PX below paneRect's own top edge, so a short room picture in a tall pane
	 * can't let the transcript grow tall enough to bury the toggle button that opened it. The tail
	 * itself needs no position math at all any more: it is a CSS child of the transcript (see
	 * build() and styles.css), hanging off its parent's own bottom border, so there is no separate
	 * gap left for it to sit in — the space between transcript and room picture is exactly the
	 * tail's own height, filled edge to edge, and the two move as one element by construction rather
	 * than by two independently-computed positions agreeing. The input bar takes a thin strip
	 * directly below the picture the same way the transcript does above it.
	 */
	update(residentMascot: Mascot | undefined, paneRect: Rect | undefined, roomRect: Rect | undefined): void {
		if (!this.isOpen) return;
		const mascot = this.mascot;
		// Same guard open() uses (see lastPackId's own comment) — a live "Switch character" on the
		// mascot this chat is already open for closes it exactly like the resident leaving/changing
		// object entirely already did, rather than silently carrying poisoned history forward.
		if (!mascot || mascot !== residentMascot || this.deps.packFor(mascot)?.id !== this.lastPackId) {
			this.close();
			return;
		}
		const transcript = this.transcriptEl;
		const inputBar = this.inputBarEl;
		if (!transcript || !inputBar) return;
		if (!paneRect || !roomRect) {
			transcript.style.visibility = "hidden";
			inputBar.style.visibility = "hidden";
			return;
		}

		const left = roomRect.left;
		const width = roomRect.right - roomRect.left;
		if (width <= 0) {
			transcript.style.visibility = "hidden";
			inputBar.style.visibility = "hidden";
			return;
		}

		// `top` and `bottom` are each rounded once, and transcriptHeight is derived from those two
		// integers rather than rounded on its own -- so the box's rendered bottom border lands
		// exactly on `bottom` instead of drifting up to a pixel off it from two separately-rounded
		// numbers. That pixel is what the CSS-positioned tail hangs its own top from, so landing on
		// it exactly is what keeps the tail visually flush against both the transcript above it and
		// the room picture below it, with nothing in between.
		const roomHeight = roomRect.bottom - roomRect.top;
		const bottom = Math.round(roomRect.top - TAIL_HEIGHT);
		const top = Math.round(Math.max(paneRect.top + TOGGLE_RESERVED_PX, roomRect.top - TAIL_HEIGHT - roomHeight));
		const transcriptHeight = bottom - top;
		if (transcriptHeight < MIN_VISIBLE) {
			transcript.style.visibility = "hidden";
		} else {
			transcript.style.visibility = "";
			transcript.style.left = `${Math.round(left)}px`;
			transcript.style.top = `${top}px`;
			transcript.style.width = `${Math.round(width)}px`;
			transcript.style.height = `${transcriptHeight}px`;
		}

		const inputTop = roomRect.bottom + INPUT_GAP_PX;
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
