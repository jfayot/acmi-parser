import dayjs, { Dayjs } from "dayjs";

export default class GlobalProperties {
  public referenceTime = dayjs(null);
  public dataSource?: string;
  public dataRecorder?: string;
  public recordingTime?: Dayjs;
  public author?: string;
  public title?: string;
  public category?: string;
  public briefing?: string;
  public debriefing?: string;
  public comments?: string;
  public referenceLongitude?: number;
  public referenceLatitude?: number;
  public additionalProps?: Map<string, string>;
}
