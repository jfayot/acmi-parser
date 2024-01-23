import dayjs, { Dayjs } from "dayjs";
import duration from "dayjs/plugin/duration";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
dayjs.extend(duration);
dayjs.extend(isSameOrBefore);
import Entity from "./entity";
import Frame from "./frame";
import GlobalProperties from "./globalProperties";
import Header from "./header";
import TimeSpan from "./timeSpan";
import Trajectory, {
  ITrajectoryOptions,
  Trajectories,
} from "../trajectory/trajectory";
import StateVector from "../trajectory/stateVector";

export default class AcmiData {
  public isValid = true;
  public header = new Header();
  public globalProperties = new GlobalProperties();
  public timeSpan = new TimeSpan();
  public entities = new Map<number, Entity>();
  public frames: Array<Frame> = [];

  private _searchFrameIndex(searchedTimeStamp: number) {
    const frames = this.frames;

    let index = -1;
    let lowIndex = 0;
    let highIndex = this.frames.length - 1;

    while (lowIndex <= highIndex) {
      let midIndex = lowIndex + ((highIndex - lowIndex) >>> 1);

      if (frames[midIndex].timeStamp - searchedTimeStamp <= 0) {
        index = midIndex;
        lowIndex = midIndex + 1;
      } else highIndex = midIndex - 1;
    }

    return index;
  }

  public getFrame(time: Dayjs): Frame | undefined {
    if (this.timeSpan.isValid()) {
      const start = this.globalProperties.referenceTime;
      const end = this.timeSpan.end;
      const frames = this.frames;
      if (start.isSameOrBefore(time) && time.isSameOrBefore(end)) {
        const timeStamp = dayjs.duration(time.diff(start)).asSeconds();
        return frames[this._searchFrameIndex(timeStamp)];
      }
    }

    return undefined;
  }

  private _addFrame(
    time: Dayjs,
    frame: Frame,
    trajectories: Trajectories,
    lastFrame?: boolean
  ) {
    const scene = frame.scene;
    lastFrame = lastFrame ?? false;
    scene.forEach((transform, id) => {
      let trajectory = trajectories.get(id);
      if (trajectory === undefined) {
        trajectory = new Trajectory();
        trajectories.set(id, trajectory);
      }
      const samples = trajectory.samples;

      const stateVector = StateVector.fromTransform(transform);

      // Check if the added sample is different from the previous one
      const length = samples.length;
      if (!lastFrame && length > 0) {
        const lastSample = samples[length - 1];
        if (stateVector.equals(lastSample.stateVector)) return;
      }

      samples.push({
        time: time,
        stateVector: stateVector,
      });
    });
  }

  public createSampledTrajectories(options?: ITrajectoryOptions) {
    const sampleRate = options?.sampleRate ?? 1;
    const emulateOrientation = options?.emulateOrientation ?? false;

    const trajectories: Trajectories = new Map<number, Trajectory>();
    const timeSpan = this.timeSpan;
    if (timeSpan.isValid()) {
      const duration = timeSpan.duration();
      const start = timeSpan.start;
      const end = timeSpan.end;
      let timeStamp = 0;
      do {
        const time = start.add(timeStamp, "seconds");
        const frame = this.getFrame(time);
        if (frame !== undefined) this._addFrame(time, frame, trajectories);
        timeStamp += sampleRate;
      } while (timeStamp <= duration);

      if (timeStamp > duration) {
        const endFrame = this.getFrame(end);
        if (endFrame !== undefined)
          this._addFrame(end, endFrame, trajectories, true);
      }
    }

    if (emulateOrientation)
      trajectories.forEach((trajectory) =>
        trajectory.emulateOrientations(true)
      );

    return trajectories;
  }
}
