import { describe, expect, it } from "vitest";
import { decodeDxf } from "../decode";
import { dxfFile, textEntity } from "./fixtures";

/** Encode a JS string as windows-1252 bytes (test-only, Latin-1 subset). */
function cp1252Bytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0xff) throw new Error(`not Latin-1 encodable: ${text[i]}`);
    bytes[i] = code;
  }
  return bytes;
}

const ACCENTED = "SEÑALIZACIÓN";

describe("decodeDxf", () => {
  it("decodes AC1032 (2018) files as UTF-8", () => {
    const text = dxfFile([textEntity(ACCENTED, 0, 0, "x")], {
      acadver: "AC1032",
    });
    const result = decodeDxf(new TextEncoder().encode(text));
    expect(result.encoding).toBe("utf-8");
    expect(result.acadVersion).toBe("AC1032");
    expect(result.text).toContain(ACCENTED);
  });

  it("decodes legacy files with the $DWGCODEPAGE codepage", () => {
    const text = dxfFile([textEntity(ACCENTED, 0, 0, "x")], {
      acadver: "AC1015",
      codepage: "ANSI_1252",
    });
    const result = decodeDxf(cp1252Bytes(text));
    expect(result.encoding).toBe("windows-1252");
    expect(result.text).toContain(ACCENTED);
  });

  it("falls back to the codepage when a modern header lies over legacy bytes", () => {
    const text = dxfFile([textEntity(ACCENTED, 0, 0, "x")], {
      acadver: "AC1032",
      codepage: "ANSI_1252",
    });
    // cp1252 Ñ/Ó bytes are invalid UTF-8 → replacement chars → fallback.
    const result = decodeDxf(cp1252Bytes(text));
    expect(result.encoding).toBe("windows-1252");
    expect(result.text).toContain(ACCENTED);
  });

  it("reports header metadata from the pre-scan", () => {
    const text = dxfFile([], { acadver: "AC1015", codepage: "ANSI_1250" });
    const result = decodeDxf(cp1252Bytes(text));
    expect(result.acadVersion).toBe("AC1015");
    expect(result.codepage).toBe("ANSI_1250");
    expect(result.encoding).toBe("windows-1250");
  });
});
