import TimeSpan from "./timeSpan";

export default class Entity {
  public id: number;
  public timeSpan: TimeSpan = new TimeSpan();
  public name?: string;
  public types?: string[];
  public callsign?: string;
  public pilot?: string;
  public group?: string;
  public country?: string;
  public coalition?: string;
  public color?: string;

  public constructor(id: number) {
    this.id = id;
  }
}
