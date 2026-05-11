/**
 * portable-paths.js
 *
 * Cross-platform path helpers pentru skill-uri portate care presupun
 * conventii POSIX (~/Downloads, /tmp, etc.). Pe Windows, ~ nu se expandeaza
 * automat in toate contextele, asa ca skill-urile trebuie sa rezolve
 * explicit prin os.homedir() + path.join().
 *
 * Folosit de skill-urile care:
 *  - Copiaza fisiere finale in Downloads (PDF, MP4, etc.) — tool-pdf-generator,
 *    viz-hyperframes, 00-youtube-to-ebook, mkt-youtube-content-package
 *  - Folosesc temp directories pentru pipeline intermediar
 *
 * Comportament:
 *  - Windows:     getDownloadsPath() → C:\Users\{user}\Downloads
 *  - macOS/Linux: getDownloadsPath() → ~/Downloads
 *
 * NU verifica daca folderul exista — caller-ul e responsabil. Folosesti
 * mkdirSync(path, {recursive:true}) inainte sa scrii.
 */

import { homedir, tmpdir } from 'os';
import { join } from 'path';

/**
 * @returns {string} Absolute path la folderul Downloads al user-ului curent.
 */
export function getDownloadsPath() {
  return join(homedir(), 'Downloads');
}

/**
 * @returns {string} Absolute path la home directory al user-ului curent.
 *   Wrapper peste os.homedir() pentru convenience si test-mockability.
 */
export function getHomeDir() {
  return homedir();
}

/**
 * @returns {string} Absolute path la temp directory al sistemului.
 *   Wrapper peste os.tmpdir() pentru convenience.
 */
export function getTempDir() {
  return tmpdir();
}

/**
 * Detecteaza daca rulam pe Windows (pentru skill-uri care au comportament
 * platform-specific — ex: ffmpeg vs ffmpeg.exe, HandBrakeCLI vs HandBrakeCLI.exe).
 *
 * @returns {boolean}
 */
export function isWindows() {
  return process.platform === 'win32';
}

/**
 * @returns {boolean}
 */
export function isMacOS() {
  return process.platform === 'darwin';
}

/**
 * @returns {boolean}
 */
export function isLinux() {
  return process.platform === 'linux';
}
