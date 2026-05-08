/** Strip ANSI escape sequences from terminal output.
 *  Handles CSI (color/style), OSC (title), and other common escape sequences. */

/** CSI sequences: ESC [ followed by parameter bytes (digits/semicolons) and a final letter.
 *  Covers SGR (m), cursor movement (A-H), erase (J/K), scrolling, etc. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes require control chars
const CSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

/** OSC sequences: ESC ] followed by text until BEL (\x07) or ST (ESC \).
 *  Covers window title, hyperlink, etc. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes require control chars
const OSC_RE = /\x1b\](?:[^\x07]|\x1b(?=\\))*\x07|\x1b\].*?\x1b\\/g;

/** Other ESC sequences: ESC followed by (, ), *, + and a character (character set designation).
 *  Also handles ESC # (DEC screen alignment), ESC > / ESC = (keypad mode).
 *  Also handles ESC \ (string terminator used after OSC). */
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes require control chars
const ESC_MISC_RE = /\x1b[(][B0UK]|\x1b[>#=]|\x1b\\\\/g;

/** 8-bit CSI: \x9b followed by parameter bytes and a final letter. */
const CSI_8BIT_RE = /\x9b[0-9;]*[A-Za-z]/g;

/** Strip all ANSI escape sequences from a string. */
export function stripAnsi(text: string): string {
  return text
    .replace(OSC_RE, "")
    .replace(CSI_RE, "")
    .replace(ESC_MISC_RE, "")
    .replace(CSI_8BIT_RE, "");
}
