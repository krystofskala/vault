import { APARTMENT } from "./apartment";
import { CELLAR } from "./cellar";
import { LIVING_ROOM, type RoomDef } from "./roomDef";

/**
 * The rooms on offer.
 *
 * Two of them are supplied artwork with hand-authored geometry; the third is the small nook the
 * plugin draws itself, which is also what any of the others falls back to when its image file is
 * missing. Adding a fourth is a definition file and an entry here — the room feature has no other
 * idea how many there are.
 */

export type RoomStyleId = "apartment" | "cellar" | "painted";

export interface RoomStyle {
	id: RoomStyleId;
	label: string;
	description: string;
	def: RoomDef;
	/** Relative to the plugin's own folder. Absent for the room this plugin paints. */
	imageFile?: string;
}

export const ROOM_STYLES: Record<RoomStyleId, RoomStyle> = {
	apartment: {
		id: "apartment",
		label: "Apartment",
		description: "A square studio flat: bed, bookshelf, desk, a plant on the nightstand.",
		def: APARTMENT,
		imageFile: "room/room.png",
	},
	cellar: {
		id: "cellar",
		label: "Cellar",
		description: "A timber grow-room: hydroponic rack, a tank of seedlings, a heater and an armchair.",
		def: CELLAR,
		imageFile: "room/room2.png",
	},
	painted: {
		id: "painted",
		label: "Plant nook (drawn by the plugin)",
		description: "A tall narrow nook full of plants. Needs no image file.",
		def: LIVING_ROOM,
	},
};

export const ROOM_STYLE_IDS: RoomStyleId[] = ["apartment", "cellar", "painted"];

export function roomStyle(id: string | undefined): RoomStyle {
	return ROOM_STYLES[(id ?? "apartment") as RoomStyleId] ?? ROOM_STYLES.apartment;
}
