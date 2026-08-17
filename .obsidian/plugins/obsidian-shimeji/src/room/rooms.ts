import { OFFICE } from "./office";
import type { RoomDef } from "./roomDef";

/**
 * The rooms on offer.
 *
 * Office is the only one currently listed — self-drawn by the plugin, no image file needed. Two
 * supplied-artwork styles (apartment, cellar) and a second self-drawn one ("painted", the plant
 * nook) existed here before and were removed by request; their code is gone from apartment.ts/
 * cellar.ts (deleted) but the plant nook's own definition, `LIVING_ROOM`, is still exported from
 * roomDef.ts — RoomView.ts keeps it as the generic "image not ready yet" fallback for any
 * *future* image-based room, even with none currently registered here. Adding a room back is a
 * definition file and an entry here — the feature itself has no other idea how many there are.
 */

export type RoomStyleId = "office";

export interface RoomStyle {
	id: RoomStyleId;
	label: string;
	description: string;
	def: RoomDef;
	/**
	 * Where this room's picture goes, relative to the plugin's own folder, without an extension —
	 * several are accepted, because people save whatever their image already is rather than
	 * converting it first. Absent for the room this plugin paints.
	 */
	imageBase?: string;
}

export const ROOM_STYLES: Record<RoomStyleId, RoomStyle> = {
	office: {
		id: "office",
		label: "Office",
		description: "A post-apocalyptic office, drawn by the plugin: broken window, damp concrete, one lamp still working. The shimeji sits at the desk and stays there, behind the monitor.",
		def: OFFICE,
	},
};

export const ROOM_STYLE_IDS: RoomStyleId[] = ["office"];

/** Tried in order. PNG first because that is what pixel art is normally saved as. */
export const ROOM_IMAGE_EXTENSIONS = ["png", "webp", "jpg", "jpeg", "gif"] as const;

/** Every filename a room's picture may have — for looking one up, and for telling the user where to
 * put it when there is none. */
export function roomImageCandidates(style: RoomStyle): string[] {
	return style.imageBase ? ROOM_IMAGE_EXTENSIONS.map((ext) => `${style.imageBase}.${ext}`) : [];
}

export function roomStyle(id: string | undefined): RoomStyle {
	return ROOM_STYLES[(id ?? "office") as RoomStyleId] ?? ROOM_STYLES.office;
}
