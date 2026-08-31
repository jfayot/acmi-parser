import { parsePGM } from "@math3d";
import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from "@zip.js/zip.js";
import dayjs from "dayjs";
import Transform from "./acmi/transform";
import AcmiData from "./acmi/acmiData";
import Frame from "./acmi/frame";
import Entity from "./acmi/entity";

/** Options that control entity filtering and cancellation during parsing. */
export interface AcmiParserOptions {
  /**
   * ACMI entity type components to omit from the result.
   *
   * @remarks Use `"Untyped"` to omit entities without a `Type` property.
   */
  excludedTypes?: readonly string[];
  /** Signal used to cancel input normalization or ZIP decompression. */
  signal?: AbortSignal;
  /** @deprecated Use `excludedTypes` instead. */
  filter?: string[];
  /** @deprecated Pass the controller's `signal` instead. */
  controller?: AbortController;
}

/** Binary input accepted by the parser, including typed arrays and Node.js buffers. */
export type AcmiBinaryInput = ArrayBuffer | ArrayBufferView;

/** Plain ACMI text, binary ACMI data, or a browser `Blob`/`File`. */
export type AcmiInput = string | AcmiBinaryInput | Blob;

/** Stable codes exposed by {@link AcmiParseError}. */
export type AcmiParseErrorCode = "INVALID_ARCHIVE" | "UNSUPPORTED_INPUT";

/** Error thrown when input cannot be normalized or a ZIP archive cannot be read. */
export class AcmiParseError extends Error {
  /** Machine-readable category for the failure. */
  public readonly code: AcmiParseErrorCode;

  /** Underlying error, when the failure originated in ZIP decompression. */
  public readonly cause?: unknown;

  /**
   * Creates a parser error.
   *
   * @param message - Human-readable description of the failure.
   * @param code - Stable machine-readable failure category.
   * @param cause - Optional lower-level error that caused the failure.
   */
  public constructor(
    message: string,
    code: AcmiParseErrorCode,
    cause?: unknown,
  ) {
    super(message);
    this.name = "AcmiParseError";
    this.code = code;
    this.cause = cause;
  }
}

/** Stateful parser for Tacview ACMI 2.1 and 2.2 recordings. */
export default class AcmiParser {
  private _decoder = new TextDecoder();
  private _currentLine = "";
  private _currentTimeStamp = 0;
  private _currentFrame = new Frame(0);
  private _destroyedIds: number[] = [];
  private _filteredIds: number[] = [];
  private _data = new AcmiData();
  private _excludedTypes: readonly string[] = [];

  private readonly _acmiVersions = ["2.1", "2.2"];
  private readonly _acmiType = "text/acmi/tacview";
  private readonly _propertySeparator = /(?<!\\),/;
  private readonly _headerPattern =
    /^\ufeff?FileType=(?<type>.*)\r?\nFileVersion=(?<version>.*)\r?\n/;

  /**
   * Creates a reusable parser.
   *
   * @param geoidPgm - Optional binary PGM geoid model used to correct altitude.
   * @remarks Parser instances are reusable sequentially. Do not call `parse()`
   * concurrently on the same instance.
   */
  public constructor(geoidPgm?: AcmiBinaryInput) {
    if (geoidPgm !== undefined)
      Transform.geoid = parsePGM(this._toUint8Array(geoidPgm), {});
  }

  private _toUint8Array(data: AcmiBinaryInput) {
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  private async _normalizeInput(data: AcmiInput) {
    if (typeof data === "string") return new TextEncoder().encode(data);
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data))
      return this._toUint8Array(data);
    if (typeof Blob !== "undefined" && data instanceof Blob)
      return new Uint8Array(await data.arrayBuffer());
    throw new AcmiParseError(
      "Unsupported ACMI input. Expected text, binary data, or a Blob.",
      "UNSUPPORTED_INPUT",
    );
  }

  private _throwIfAborted(signal?: AbortSignal) {
    if (!signal?.aborted) return;
    if (signal.reason !== undefined) throw signal.reason;
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    throw error;
  }

  private _isValidVersion() {
    return (
      this._acmiVersions.find((version) => {
        return version === this._data.header.fileVersion;
      }) !== undefined
    );
  }

  private _isValidType() {
    return this._data.header.fileType === this._acmiType;
  }

  private _parseHeader(buffer: Uint8Array) {
    const data = this._data;
    const header = this._decoder.decode(buffer.slice(0, 64));
    const res = this._headerPattern.exec(header);
    if (res !== null && res.groups !== undefined) {
      data.header.fileType = res.groups["type"];
      data.header.fileVersion = res.groups["version"];
      data.isValid = this._isValidType() && this._isValidVersion();
    }
  }

  private _consumeContentLine(line: string, index: number) {
    if (index <= 1 || line.trim().length === 0 || line.startsWith("//")) return;
    if (line.endsWith("\\")) {
      this._currentLine += line.slice(0, line.length - 1) + "\n";
    } else {
      this._currentLine += line;
      this._parseLine();
    }
  }

  private _parseContent(buffer: Uint8Array) {
    const length = buffer.length;
    let start = 0;
    let current = 0;
    let previousCR = false;
    let lineEnd = 0;
    let line = "";
    let index = 0;
    while (current < length) {
      if (buffer[current] === 0x0d) previousCR = true;
      else if (buffer[current] === 0x0a) {
        if (previousCR) {
          previousCR = false;
          lineEnd = current - 1;
        } else lineEnd = current;
        line = this._decoder.decode(buffer.slice(start, lineEnd));
        start = current + 1;

        this._consumeContentLine(line, index);
        ++index;
      }
      ++current;
    }

    if (start < length) {
      line = this._decoder.decode(buffer.slice(start));
      if (line.endsWith("\r")) line = line.slice(0, -1);
      this._consumeContentLine(line, index);
    }

    const data = this._data;
    const frames = data.frames;

    if (frames.length > 0 || this._currentFrame.scene.size > 0) {
      // Last frame still missing
      frames.push(this._currentFrame);

      const referenceTime = data.globalProperties.referenceTime;
      const firstNonEmptyFrameIndex = frames.findIndex(
        (frame) => frame.scene.size > 0,
      );
      if (referenceTime.isValid() && firstNonEmptyFrameIndex !== -1) {
        data.timeSpan.start = referenceTime.add(
          frames[firstNonEmptyFrameIndex].timeStamp,
          "seconds",
        );
        data.timeSpan.end = referenceTime.add(
          frames[frames.length - 1].timeStamp,
          "seconds",
        );
      } else data.isValid = false;
    }
  }

  private _parseLine() {
    const data = this._data;
    const frames = data.frames;
    const currentFrame = this._currentFrame;
    const destroyedIds = this._destroyedIds;
    const filteredIds = this._filteredIds;
    let line = this._currentLine;
    if (line.startsWith("0,Event")) {
      //TODO parse events
    } else if (line.startsWith("0,")) {
      line = line.slice(2);
      const props = line.split(this._propertySeparator);
      props.forEach((prop) => {
        const equalPos = prop.indexOf("=");
        if (equalPos >= 0) {
          const propName = prop.slice(0, equalPos);
          const propValue = prop.slice(equalPos + 1);
          const globProp = data.globalProperties;
          switch (propName) {
            case "DataSource":
              globProp.dataSource = propValue;
              break;
            case "DataRecorder":
              globProp.dataRecorder = propValue;
              break;
            case "ReferenceTime":
              globProp.referenceTime = dayjs(propValue);
              break;
            case "RecordingTime":
              globProp.recordingTime = dayjs(propValue);
              break;
            case "Author":
              globProp.author = propValue;
              break;
            case "Title":
              globProp.title = propValue;
              break;
            case "Category":
              globProp.category = propValue;
              break;
            case "Briefing":
              globProp.briefing = propValue;
              break;
            case "Debriefing":
              globProp.debriefing = propValue;
              break;
            case "Comments":
              globProp.comments = propValue;
              break;
            case "ReferenceLongitude":
              globProp.referenceLongitude = +propValue;
              Transform.refLong = globProp.referenceLongitude;
              break;
            case "ReferenceLatitude":
              globProp.referenceLatitude = +propValue;
              Transform.refLat = globProp.referenceLatitude;
              break;
            default:
              if (globProp.additionalProps === undefined)
                globProp.additionalProps = new Map<string, string>();
              globProp.additionalProps.set(propName, propValue);
              break;
          }
        } else {
          data.isValid = false;
        }
      });
    } else if (line.startsWith("#")) {
      if (destroyedIds.length > 0) {
        destroyedIds.forEach((id) => currentFrame.scene.delete(id));
        this._destroyedIds = [];
      }
      const newTimeStamp = +line.slice(1);
      if (newTimeStamp !== this._currentTimeStamp) {
        frames.push(currentFrame);
        this._currentTimeStamp = newTimeStamp;
        this._currentFrame = new Frame(
          this._currentTimeStamp,
          currentFrame.scene,
        );
      }
    } else if (line.startsWith("-")) {
      const id = parseInt(line.slice(1), 16);
      const entityProps = data.entities.get(id);
      if (entityProps) {
        entityProps.timeSpan.end = data.globalProperties.referenceTime.add(
          this._currentTimeStamp,
          "second",
        );
      }

      if (filteredIds.indexOf(id) >= 0) destroyedIds.push(id);
    } else {
      const commaPos = line.indexOf(",");
      if (commaPos >= 0) {
        const id = parseInt(line.slice(0, commaPos), 16);
        const entityLine = line.slice(commaPos + 1);
        let entityProps = data.entities.get(id);
        let newEntity = false;
        if (entityProps === undefined) {
          newEntity = true;
          entityProps = new Entity(id);
          entityProps.timeSpan.start = data.globalProperties.referenceTime.add(
            this._currentTimeStamp,
            "second",
          );
        }

        const props = entityLine.split(this._propertySeparator);
        props.forEach((prop) => {
          const equalPos = prop.indexOf("=");
          if (equalPos >= 0) {
            const name = prop.slice(0, equalPos);
            const value = prop.slice(equalPos + 1);
            switch (name) {
              case "Name":
                entityProps!.name = value;
                break;
              case "Type":
                entityProps!.types = value.split("+");
                break;
              case "CallSign":
                entityProps!.callsign = value;
                break;
              case "Pilot":
                entityProps!.pilot = value;
                break;
              case "Group":
                entityProps!.group = value;
                break;
              case "Country":
                entityProps!.country = value;
                break;
              case "Coalition":
                entityProps!.coalition = value;
                break;
              case "Color":
                entityProps!.color = value;
                break;
              case "destroyed":
                if (+value === 1) {
                  entityProps!.timeSpan.end =
                    data.globalProperties.referenceTime.add(
                      this._currentTimeStamp,
                      "second",
                    );
                }
                break;
              default:
                break;
            }
          } else {
            data.isValid = false;
          }
        });

        if (newEntity) {
          const filter = this._excludedTypes;
          let keep = true;
          if (filter !== undefined && filter.length > 0) {
            const types = entityProps!.types;
            keep =
              types !== undefined
                ? types.every((type) => !filter.includes(type))
                : !filter.includes("Untyped");
          }

          if (keep) {
            data.entities.set(id, entityProps);
            filteredIds.push(id);
          }
        }

        if (filteredIds.indexOf(id) >= 0) {
          // Handle Transform property
          const indexT = props.findIndex((prop) => prop.startsWith("T="));
          if (indexT >= 0) {
            const prop = props[indexT];
            const equalPos = prop.indexOf("=");
            if (equalPos >= 0) {
              // Parse entity's coordinates
              const propValue = prop.slice(equalPos + 1);
              const coords = propValue.split("|");

              const components = coords.map((coord) =>
                coord?.length > 0 ? +coord : undefined,
              );

              currentFrame.scene.set(
                id,
                new Transform(components, currentFrame.scene.get(id)),
              );
            }
          }
        }
      } else {
        data.isValid = false;
      }
    }
    this._currentLine = "";
  }

  private async _unzip(data: Uint8Array, signal?: AbortSignal) {
    this._throwIfAborted(signal);
    let isZipped = false;
    if (data.length > 1)
      isZipped = new TextDecoder().decode(data.slice(0, 2)) === "PK";

    if (isZipped) {
      const reader = new ZipReader(new Uint8ArrayReader(data));
      try {
        const entries = await reader.getEntries();
        this._throwIfAborted(signal);
        if (entries.length === 1 && !entries[0].directory)
          return await entries[0].getData(new Uint8ArrayWriter(), { signal });
        throw new AcmiParseError(
          "A compressed ACMI archive must contain exactly one file.",
          "INVALID_ARCHIVE",
        );
      } catch (error) {
        this._throwIfAborted(signal);
        if (error instanceof AcmiParseError) throw error;
        throw new AcmiParseError(
          "Unable to read the compressed ACMI archive.",
          "INVALID_ARCHIVE",
          error,
        );
      } finally {
        await reader.close();
      }
    } else return data;
  }

  private _parseBuffer(buffer: Uint8Array) {
    this._parseHeader(buffer);
    this._parseContent(buffer);

    // Finalize entities time span
    this._data.entities.forEach((entity) => {
      if (!entity.timeSpan.end.isValid())
        entity.timeSpan.end = this._data.timeSpan.end.clone();
    });

    return this._data;
  }

  /**
   * Parses plain or single-file ZIP-compressed ACMI input.
   *
   * @param data - ACMI text, binary data, or a browser `Blob`/`File`.
   * @param options - Entity filtering and cancellation options.
   * @returns The parsed recording model.
   * @throws {@link AcmiParseError} if input normalization or ZIP reading fails.
   * @throws The abort signal's reason when the operation is cancelled.
   */
  public async parse(data: AcmiInput, options: AcmiParserOptions = {}) {
    const signal = options.signal ?? options.controller?.signal;
    this._throwIfAborted(signal);
    this._data = new AcmiData();
    this._excludedTypes = options.excludedTypes ?? options.filter ?? [];
    this._currentLine = "";
    this._currentTimeStamp = 0;
    this._currentFrame = new Frame(this._currentTimeStamp);
    this._destroyedIds = [];
    this._filteredIds = [];

    const buffer = await this._normalizeInput(data);
    this._throwIfAborted(signal);
    return this._parseBuffer(await this._unzip(buffer, signal));
  }
}

/**
 * Parses an ACMI recording with a fresh parser instance.
 *
 * @param data - ACMI text, binary data, or a browser `Blob`/`File`.
 * @param options - Entity filtering and cancellation options.
 * @returns The parsed recording model.
 * @throws {@link AcmiParseError} if input normalization or ZIP reading fails.
 */
export function parseAcmi(data: AcmiInput, options?: AcmiParserOptions) {
  return new AcmiParser().parse(data, options);
}
