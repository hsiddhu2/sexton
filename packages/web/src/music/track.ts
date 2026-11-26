// The Track slot (spec clean-site, design C12, requirement 14): one recorded music track, its beat and its credit.
// Empty until the owner names the track and its licence; while it is empty no audio file ships, the Music button is
// not rendered and the CSP allows no media.

export interface Track {
  /** The file under public/, served from the page origin, for example "/music/track.mp3". */
  readonly file: string;
  readonly title: string;
  readonly artist: string;
  readonly licence: string;
  /** Where the track and its licence can be read, an https address. */
  readonly source: string;
  /** Beats a minute; the Characters take one Pose step every half beat. */
  readonly bpm: number;
}

export const TRACK: Track | null = null;

/** Pure. The credit line of a track (14.6): its title, artist and licence; the source is its link. */
export function creditLine(track: Track): string {
  return `Music: “${track.title}” by ${track.artist}, ${track.licence}.`;
}

/** Pure. One beat in milliseconds, or null for a tempo that is not a positive finite number. */
export function beatMs(track: Track): number | null {
  return Number.isFinite(track.bpm) && track.bpm > 0 ? 60_000 / track.bpm : null;
}
