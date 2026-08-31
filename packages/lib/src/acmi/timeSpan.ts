import dayjs from "dayjs";
import duration from "dayjs/plugin/duration.js";
dayjs.extend(duration);

/** Absolute start and end times for a recording or entity. */
export default class TimeSpan {
  /** Inclusive start time, or an invalid Day.js value when unknown. */
  public start = dayjs(null);

  /** Inclusive end time, or an invalid Day.js value when unknown. */
  public end = dayjs(null);

  /** @returns Whether both endpoints contain valid Day.js values. */
  public isValid() {
    return this.start.isValid() && this.end.isValid();
  }

  /** @returns Duration in seconds, or `-1` when the span is invalid. */
  public duration() {
    if (this.isValid()) {
      return dayjs.duration(this.end.diff(this.start)).asSeconds();
    }

    return -1;
  }
}
