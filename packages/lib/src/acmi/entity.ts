import TimeSpan from "./timeSpan";

/** Metadata and active time range for one ACMI entity. */
export default class Entity {
  /** Numeric value of the entity's hexadecimal ACMI ID. */
  public id: number;

  /** Absolute interval during which the entity exists. */
  public timeSpan: TimeSpan = new TimeSpan();

  /** Human-readable entity name. */
  public name?: string;

  /** Components of the ACMI `Type` property, split on `+`. */
  public types?: string[];

  /** Radio call sign. */
  public callsign?: string;

  /** Pilot name. */
  public pilot?: string;

  /** Group or formation name. */
  public group?: string;

  /** Country associated with the entity. */
  public country?: string;

  /** Coalition associated with the entity. */
  public coalition?: string;

  /** Source-provided display color. */
  public color?: string;

  /** @param id - Numeric ACMI entity ID. */
  public constructor(id: number) {
    this.id = id;
  }
}
