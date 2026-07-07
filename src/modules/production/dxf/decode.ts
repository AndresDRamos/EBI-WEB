/**
 * DXF byte decoding. DXF 2007+ (`$ACADVER >= AC1021`) files are UTF-8; older
 * files use the `$DWGCODEPAGE` codepage. The windows-1252-first assumption
 * from the initial analysis was corrected by the 2026-07-06 spike: plant 7's
 * AC1032 file is UTF-8 and cp1252 decoding mangles its accented layer names.
 * Pure module — bytes in, string out.
 */

export interface DecodedDxf {
  text: string;
  /** Decoder actually used (after any fallback). */
  encoding: string;
  acadVersion: string | null;
  codepage: string | null;
}

/** First DXF revision whose files are UTF-8 encoded (AutoCAD 2007). */
const FIRST_UTF8_VERSION = "AC1021";

/** `$DWGCODEPAGE` values → WHATWG TextDecoder labels (extend as files appear). */
const CODEPAGE_LABELS: Record<string, string> = {
  ANSI_1250: "windows-1250",
  ANSI_1251: "windows-1251",
  ANSI_1252: "windows-1252",
  ANSI_1253: "windows-1253",
  ANSI_1254: "windows-1254",
};

function scanHeaderVar(head: string, name: string, groupCode: string): string | null {
  // Header vars serialize as: 9 \n $NAME \n <code> \n <value>
  const re = new RegExp(
    `\\$${name}\\s*[\\r\\n]+\\s*${groupCode}\\s*[\\r\\n]+([^\\r\\n]+)`,
    "i",
  );
  return re.exec(head)?.[1]?.trim() ?? null;
}

export function decodeDxf(bytes: Uint8Array): DecodedDxf {
  // Header vars are ASCII; latin1 never throws, so it is a safe pre-scan lens.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 64 * 1024));
  const acadVersion = scanHeaderVar(head, "ACADVER", "1");
  const codepage = scanHeaderVar(head, "DWGCODEPAGE", "3");

  // Same "ACnnnn" shape on both sides, so lexicographic compare is ordinal.
  const isModern = acadVersion !== null && acadVersion >= FIRST_UTF8_VERSION;
  const legacyLabel =
    CODEPAGE_LABELS[codepage?.toUpperCase() ?? ""] ?? "windows-1252";

  if (isModern) {
    const utf8 = new TextDecoder("utf-8").decode(bytes);
    // A modern header over legacy bytes (seen with some exporters) surfaces as
    // replacement chars; fall back to the declared codepage.
    if (!utf8.includes("�")) {
      return { text: utf8, encoding: "utf-8", acadVersion, codepage };
    }
  }
  return {
    text: new TextDecoder(legacyLabel).decode(bytes),
    encoding: legacyLabel,
    acadVersion,
    codepage,
  };
}
