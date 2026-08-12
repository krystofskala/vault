/** Shimeji-ee's own engine runs a fixed-timestep loop; Duration/Velocity in actions.xml are
 * expressed in ticks of that loop, not real time. Converting once at parse time (see
 * ActionsParser) keeps the rest of the engine working in plain ms / px-per-second. */
export const SHIMEJI_TICK_MS = 40;
export const SHIMEJI_TICKS_PER_SEC = 1000 / SHIMEJI_TICK_MS;
