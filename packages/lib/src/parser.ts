import { parsePGM } from "@math3d";
import dayjs from "dayjs";
import { unzip } from "unzipit";
import Transform from "./acmi/transform";
import AcmiData from "./acmi/acmiData";
import Frame from "./acmi/frame";
import Entity from "./acmi/entity";

export interface AcmiParserOptions {
  filter?: string[];
  controller?: AbortController;
}

export default class AcmiParser {
  private _decoder = new TextDecoder();
  private _currentLine = "";
  private _currentTimeStamp = 0;
  private _currentFrame = new Frame(0);
  private _destroyedIds: number[] = [];
  private _filteredIds: number[] = [];
  private _data = new AcmiData();
  private _filter: string[] = [];

  private readonly _acmiVersions = ["2.1", "2.2"];
  private readonly _acmiType = "text/acmi/tacview";
  private readonly _propertySeparator = /(?<!\\),/;
  private readonly _headerPattern =
    /^\ufeff?FileType=(?<type>.*)\r?\nFileVersion=(?<version>.*)\r?\n/;

  public constructor(geoidPgm?: Uint8Array) {
    if (geoidPgm !== undefined) Transform.geoid = parsePGM(geoidPgm, {});
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

        if (index > 1) {
          if (line.trim().length !== 0 && !line.startsWith("//")) {
            if (line.endsWith("\\")) {
              this._currentLine += line.slice(0, line.length - 1) + "\n";
            } else {
              this._currentLine += line;
              this._parseLine();
            }
          }
        }
        ++index;
      }
      ++current;
    }

    const data = this._data;
    const frames = data.frames;

    if (frames.length > 0) {
      // Last frame still missing
      frames.push(this._currentFrame);

      const referenceTime = data.globalProperties.referenceTime;
      const firstNonEmptyFrameIndex = frames.findIndex(
        (frame) => frame.scene.size > 0
      );
      if (referenceTime.isValid() && firstNonEmptyFrameIndex !== -1) {
        data.timeSpan.start = referenceTime.add(
          frames[firstNonEmptyFrameIndex].timeStamp,
          "seconds"
        );
        data.timeSpan.end = referenceTime.add(
          frames[frames.length - 1].timeStamp,
          "seconds"
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
          currentFrame.scene
        );
      }
    } else if (line.startsWith("-")) {
      const id = parseInt(line.slice(1), 16);
      const entityProps = data.entities.get(id);
      if (entityProps) {
        entityProps.timeSpan.end = data.globalProperties.referenceTime.add(
          this._currentTimeStamp,
          "second"
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
            "second"
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
                      "second"
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
          const filter = this._filter;
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
                coord?.length > 0 ? +coord : undefined
              );

              currentFrame.scene.set(
                id,
                new Transform(components, currentFrame.scene.get(id))
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

  private async _unzip(data: Uint8Array) {
    let isZipped = false;
    if (data.length > 1)
      isZipped = new TextDecoder().decode(data.slice(0, 2)) === "PK";

    if (isZipped) {
      const { entries } = await unzip(data);
      const zipEntries = Object.values(entries);
      if (zipEntries.length === 1)
        return new Uint8Array(await zipEntries[0].arrayBuffer());
      throw "Invalid compressed ACMI file";
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

  public async parse(data: Uint8Array, options?: AcmiParserOptions) {
    this._data = new AcmiData();
    this._filter = options?.filter ?? [];
    this._currentLine = "";
    this._currentTimeStamp = 0;
    this._currentFrame = new Frame(this._currentTimeStamp);
    this._destroyedIds = [];
    this._filteredIds = [];

    return this._parseBuffer(await this._unzip(data));
  }
}
