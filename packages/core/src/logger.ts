import type { Logger } from "./types.ts";

/** Logger yang tidak menulis apa pun; default untuk handler dan test. */
export const silentLogger: Logger = {
  debug() {
    /* senyap */
  },
  info() {
    /* senyap */
  },
  warn() {
    /* senyap */
  },
  error() {
    /* senyap */
  },
};
