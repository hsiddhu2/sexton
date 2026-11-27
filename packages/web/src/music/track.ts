// The Track slot (spec clean-site, design C12, requirement 14): one recorded music track, its beat and its credit.
// The track is Ghost Party by The Piano Says, CC BY 3.0, confirmed by the owner. It ships under public/music, plays
// only after the Music button is pressed, and the CSP allows media from the page origin only.

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
  /** The credit the licence asks for, word for word, one entry a line (14.6); the Guide page shows it in full. */
  readonly credit: readonly string[];
  /** The short credit of the site footer, one line, its title and licence linked to their sources (14.6). */
  readonly footer: readonly CreditPart[];
}

export const TRACK: Track | null = {
  file: "/music/ghost-party.mp3",
  title: "Ghost Party",
  artist: "The Piano Says",
  licence: "CC BY 3.0",
  source: "https://soundcloud.com/thepianosays",
  bpm: 110,
  credit: [
    "Ghost Party by The Piano Says | https://soundcloud.com/thepianosays",
    "Royalty Free Music by https://www.free-stock-music.com",
    "Creative Commons / Attribution 3.0 Unported License (CC BY 3.0)",
    "https://creativecommons.org/licenses/by/3.0/deed.en_US",
  ],
  footer: [
    { text: "Music: ", href: null },
    { text: "Ghost Party by The Piano Says", href: "https://soundcloud.com/thepianosays" },
    { text: ", ", href: null },
    { text: "CC BY 3.0", href: "https://creativecommons.org/licenses/by/3.0/deed.en_US" },
  ],
};

/** A piece of a credit line: plain text, or an https address shown as itself and linked. */
export interface CreditPart {
  readonly text: string;
  readonly href: string | null;
}

/** Pure. A credit line split into its text and its https addresses; nothing else becomes a link. */
export function creditParts(line: string): CreditPart[] {
  return line
    .split(/(https:\/\/[^\s|]+)/)
    .filter((text) => text !== "")
    .map((text) => ({ text, href: /^https:\/\/[^\s|]+$/.test(text) ? text : null }));
}

/** Pure. One beat in milliseconds, or null for a tempo that is not a positive finite number. */
export function beatMs(track: Track): number | null {
  return Number.isFinite(track.bpm) && track.bpm > 0 ? 60_000 / track.bpm : null;
}
