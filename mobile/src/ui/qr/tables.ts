/**
 * The parts of the QR specification this app needs: byte mode at error-correction
 * level M, versions 1 to 14. That reaches 365 bytes, and the longest thing we ever
 * draw — an `otpauth://` setup link — is under 200, so a bigger table would only be
 * code nobody runs. Level M is what every authenticator's own setup code uses: a
 * quarter of the symbol can be lost to a thumb or a reflection and it still reads.
 */
export interface VersionSpec {
  /** Error-correction codewords in every block. */
  ec: number;
  /** Blocks of data codewords: one entry per group, `[blocks, codewordsEach]`. */
  groups: [number, number][];
  /** Centres of the alignment patterns, paired with themselves and each other. */
  align: number[];
}
export const versions: VersionSpec[] = [
  { ec: 10, groups: [[1, 16]], align: [] },
  { ec: 16, groups: [[1, 28]], align: [6, 18] },
  { ec: 26, groups: [[1, 44]], align: [6, 22] },
  { ec: 18, groups: [[2, 32]], align: [6, 26] },
  { ec: 24, groups: [[2, 43]], align: [6, 30] },
  { ec: 16, groups: [[4, 27]], align: [6, 34] },
  { ec: 18, groups: [[4, 31]], align: [6, 22, 38] },
  { ec: 22, groups: [[2, 38], [2, 39]], align: [6, 24, 42] },
  { ec: 22, groups: [[3, 36], [2, 37]], align: [6, 26, 46] },
  { ec: 26, groups: [[4, 43], [1, 44]], align: [6, 28, 50] },
  { ec: 30, groups: [[1, 50], [4, 51]], align: [6, 30, 54] },
  { ec: 22, groups: [[6, 36], [2, 37]], align: [6, 32, 58] },
  { ec: 22, groups: [[8, 37], [1, 38]], align: [6, 34, 62] },
  { ec: 24, groups: [[4, 40], [5, 41]], align: [6, 26, 46, 66] },
];
/** Data codewords the whole symbol holds — what decides which version a string needs. */
export const capacity = (spec: VersionSpec) => spec.groups.reduce((total, [blocks, size]) => total + blocks * size, 0);
/** Modules across one side of the symbol, quiet zone excluded. */
export const sideFor = (version: number) => version * 4 + 17;
