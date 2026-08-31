import dayjs, { Dayjs } from "dayjs";

/** Recording-level properties declared on ACMI object `0`. */
export default class GlobalProperties {
  /** Absolute origin used to resolve frame and entity timestamps. */
  public referenceTime = dayjs(null);

  /** Source application or system. */
  public dataSource?: string;

  /** Name of the recording system. */
  public dataRecorder?: string;

  /** Time at which the recording was created. */
  public recordingTime?: Dayjs;

  /** Recording author. */
  public author?: string;

  /** Recording title. */
  public title?: string;

  /** Recording category. */
  public category?: string;

  /** Briefing text. */
  public briefing?: string;

  /** Debriefing text. */
  public debriefing?: string;

  /** Free-form comments. */
  public comments?: string;

  /** Longitude offset added to relative entity positions, in degrees. */
  public referenceLongitude?: number;

  /** Latitude offset added to relative entity positions, in degrees. */
  public referenceLatitude?: number;

  /** Unrecognized global properties preserved by name. */
  public additionalProps?: Map<string, string>;
}
