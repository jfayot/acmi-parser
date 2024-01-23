import dayjs from "dayjs";
import duration from "dayjs/plugin/duration.js";
dayjs.extend(duration);

export default class TimeSpan {
  public start = dayjs(null);
  public end = dayjs(null);

  public isValid() {
    return this.start.isValid() && this.end.isValid();
  }

  public duration() {
    if (this.isValid()) {
      return dayjs.duration(this.end.diff(this.start)).asSeconds();
    }

    return -1;
  }
}
