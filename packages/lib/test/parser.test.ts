import { TextReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js";
import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import DefaultAcmiParser, {
  AcmiParseError,
  AcmiParser,
  parseAcmi,
} from "../src/index";

const encoder = new TextEncoder();

function acmi(lines: string[]) {
  return encoder.encode(
    ["FileType=text/acmi/tacview", "FileVersion=2.2", ...lines, ""].join("\n"),
  );
}

function acmiText(lines: string[]) {
  return new TextDecoder().decode(acmi(lines));
}

describe("AcmiParser", () => {
  it("offers equivalent default, named, and one-shot APIs", async () => {
    expect(DefaultAcmiParser).toBe(AcmiParser);

    const data = await parseAcmi(
      acmiText([
        "0,ReferenceTime=2024-01-02T03:04:05Z",
        "#0",
        "1,Type=Air,T=0|0|0",
        "#1",
      ]),
    );

    expect(data.isValid).toBe(true);
    expect(data.entities.has(1)).toBe(true);
  });

  it("accepts Blob input directly", async () => {
    const input = new Blob([
      acmiText([
        "0,ReferenceTime=2024-01-02T03:04:05Z",
        "#0",
        "1,Type=Air,T=0|0|0",
        "#1",
      ]),
    ]);

    const data = await parseAcmi(input);

    expect(data.entities.has(1)).toBe(true);
  });

  it("keeps a single snapshot and parses an unterminated final line", async () => {
    const data = await parseAcmi(
      [
        "FileType=text/acmi/tacview",
        "FileVersion=2.2",
        "0,ReferenceTime=2024-01-02T03:04:05Z",
        "#0",
        "1,Type=Air,T=0|0|0",
      ].join("\n"),
    );

    expect(data.frames).toHaveLength(1);
    expect(data.frames[0].scene.has(1)).toBe(true);
    expect(data.timeSpan.duration()).toBe(0);
  });

  it("parses metadata, entity properties, transforms, and frame updates", async () => {
    const parser = new AcmiParser();
    const referenceTime = dayjs("2024-01-02T03:04:05Z");
    const data = await parser.parse(
      acmi([
        `0,ReferenceTime=${referenceTime.toISOString()},Author=Jane Doe,ReferenceLongitude=2,ReferenceLatitude=48,Custom=value`,
        "#0",
        "1,Name=Falcon,Type=Air+FixedWing,CallSign=Viper,T=1|2|1000|10|20|30",
        "#5",
        "1,T=||1200|||40",
      ]),
    );

    expect(data.isValid).toBe(true);
    expect(data.header).toMatchObject({
      fileType: "text/acmi/tacview",
      fileVersion: "2.2",
    });
    expect(data.globalProperties).toMatchObject({
      author: "Jane Doe",
      referenceLongitude: 2,
      referenceLatitude: 48,
    });
    expect(data.globalProperties.additionalProps?.get("Custom")).toBe("value");
    expect(data.timeSpan.start.toISOString()).toBe(referenceTime.toISOString());
    expect(data.timeSpan.end.toISOString()).toBe(
      referenceTime.add(5, "seconds").toISOString(),
    );

    const entity = data.entities.get(1);
    expect(entity).toMatchObject({
      id: 1,
      name: "Falcon",
      types: ["Air", "FixedWing"],
      callsign: "Viper",
    });
    expect(entity?.timeSpan.start.toISOString()).toBe(
      referenceTime.toISOString(),
    );
    expect(entity?.timeSpan.end.toISOString()).toBe(
      referenceTime.add(5, "seconds").toISOString(),
    );

    expect(data.frames.map((frame) => frame.timeStamp)).toEqual([0, 5]);
    expect(data.frames[0].scene.get(1)?.position.toArray()).toEqual([
      3, 50, 1000,
    ]);
    expect(data.frames[1].scene.get(1)?.position.toArray()).toEqual([
      3, 50, 1200,
    ]);
    expect(data.frames[1].scene.get(1)?.orientation?.yaw).toBeCloseTo(
      (40 * Math.PI) / 180,
    );
  });

  it("supports continued lines and escaped commas", async () => {
    const data = await new AcmiParser().parse(
      acmi([
        "0,ReferenceTime=2024-01-02T03:04:05Z,Comments=first\\",
        "second\\,part",
        "#0",
        "1,Type=Air,T=0|0|0",
      ]),
    );

    expect(data.isValid).toBe(true);
    expect(data.globalProperties.comments).toBe("first\nsecond\\,part");
  });

  it("excludes matching entity types and untyped entities", async () => {
    const input = acmi([
      "0,ReferenceTime=2024-01-02T03:04:05Z",
      "#0",
      "1,Type=Air+FixedWing,T=0|0|0",
      "2,Type=Ground,T=1|1|1",
      "3,T=2|2|2",
      "#1",
    ]);

    const data = await new AcmiParser().parse(input, {
      excludedTypes: ["Air", "Untyped"],
    });

    expect([...data.entities.keys()]).toEqual([2]);
    expect([...data.frames[0].scene.keys()]).toEqual([2]);
  });

  it("keeps the deprecated filter option compatible", async () => {
    const data = await parseAcmi(
      acmi([
        "0,ReferenceTime=2024-01-02T03:04:05Z",
        "#0",
        "1,Type=Air,T=0|0|0",
        "2,Type=Ground,T=1|1|1",
      ]),
      { filter: ["Air"] },
    );

    expect([...data.entities.keys()]).toEqual([2]);
  });

  it("tracks destruction time and removes the entity from later frames", async () => {
    const referenceTime = dayjs("2024-01-02T03:04:05Z");
    const data = await new AcmiParser().parse(
      acmi([
        `0,ReferenceTime=${referenceTime.toISOString()}`,
        "#0",
        "a,Type=Air,T=0|0|0",
        "#5",
        "-a",
        "#10",
      ]),
    );

    expect(data.entities.get(0xa)?.timeSpan.end.toISOString()).toBe(
      referenceTime.add(5, "seconds").toISOString(),
    );
    expect(data.frames[0].scene.has(0xa)).toBe(true);
    expect(data.frames[1].scene.has(0xa)).toBe(false);
    expect(data.frames[2].scene.has(0xa)).toBe(false);
  });

  it("parses a single-file ZIP archive", async () => {
    const writer = new ZipWriter(new Uint8ArrayWriter());
    await writer.add(
      "recording.txt.acmi",
      new TextReader(
        new TextDecoder().decode(
          acmi([
            "0,ReferenceTime=2024-01-02T03:04:05Z",
            "#0",
            "1,Type=Air,T=0|0|0",
          ]),
        ),
      ),
    );
    const zipped = await writer.close();

    const data = await new AcmiParser().parse(zipped);

    expect(data.isValid).toBe(true);
    expect(data.entities.has(1)).toBe(true);
  });

  it("rejects ZIP archives that do not contain exactly one file", async () => {
    const writer = new ZipWriter(new Uint8ArrayWriter());
    await writer.add("one.acmi", new TextReader("one"));
    await writer.add("two.acmi", new TextReader("two"));
    const zipped = await writer.close();

    await expect(new AcmiParser().parse(zipped)).rejects.toMatchObject({
      name: "AcmiParseError",
      code: "INVALID_ARCHIVE",
    } satisfies Partial<AcmiParseError>);
  });

  it("honors an AbortSignal", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled by test");
    controller.abort(reason);

    await expect(
      parseAcmi("FileType=text/acmi/tacview\nFileVersion=2.2\n", {
        signal: controller.signal,
      }),
    ).rejects.toBe(reason);
  });

  it.each([
    ["unsupported version", "FileType=text/acmi/tacview\nFileVersion=1.0\n"],
    ["unsupported type", "FileType=text/plain\nFileVersion=2.2\n"],
  ])("marks an %s as invalid", async (_name, input) => {
    const data = await new AcmiParser().parse(encoder.encode(input));

    expect(data.isValid).toBe(false);
  });

  it("resets all parsing state when reused", async () => {
    const parser = new AcmiParser();
    await parser.parse(
      acmi([
        "0,ReferenceTime=2024-01-02T03:04:05Z",
        "#0",
        "1,Type=Air,T=0|0|0",
        "#1",
      ]),
    );

    const data = await parser.parse(
      acmi([
        "0,ReferenceTime=2025-01-02T03:04:05Z",
        "#0",
        "2,Type=Ground,T=1|1|1",
        "#1",
      ]),
    );

    expect([...data.entities.keys()]).toEqual([2]);
    expect([...data.frames[0].scene.keys()]).toEqual([2]);
  });
});
