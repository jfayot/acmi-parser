import bounds from "binary-search-bounds";
import {
  Cartesian3,
  Ellipsoid,
  HeadingPitchRoll,
  Math as CMath,
  Quaternion,
  Transforms,
  createWorldTerrainAsync,
} from "@cesium/engine";
import dayjs, { Dayjs } from "dayjs";
import duration from "dayjs/plugin/duration.js";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore.js";
dayjs.extend(duration);
dayjs.extend(isSameOrBefore);
import { ITrajectoryOptions, Trajectories, Trajectory } from "./trajectory.js";

export class AcmiHeader {
  public fileType: string = "";
  public fileVersion: string = "";
}

export class TimeSpan {
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

export class GlobalProperties {
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

export interface IEntityProps {
  id: number;
  timeSpan: { start: Dayjs; end: Dayjs };
  name?: string;
  types?: string[];
  callsign?: string;
  pilot?: string;
  group?: string;
  country?: string;
  coalition?: string;
  color?: string;
}

export class EntityProps implements IEntityProps {
  id: number;
  timeSpan: TimeSpan = new TimeSpan();
  name?: string;
  types?: string[];
  callsign?: string;
  pilot?: string;
  group?: string;
  country?: string;
  coalition?: string;
  color?: string;

  public constructor(id: number) {
    this.id = id;
  }
}

export interface ITransform {
  longitude: number;
  latitude: number;
  altitude: number;
  roll?: number;
  pitch?: number;
  yaw?: number;
}

export type Scene = Map<number, ITransform>;

export class Frame {
  public timeStamp: number;
  public scene: Scene;

  public constructor(timeStamp: number, scene?: Scene) {
    this.timeStamp = timeStamp;
    if (scene) this.scene = new Map<number, ITransform>(scene);
    else this.scene = new Map<number, ITransform>();
  }
}

export type Frames = Array<Frame>;

export class AcmiData {
  public isValid = true;
  public header = new AcmiHeader();
  public globalProperties = new GlobalProperties();
  public timeSpan = new TimeSpan();
  public entities = new Map<number, IEntityProps>();
  public frames: Frames = [];

  private readonly _fixedFrame = Transforms.localFrameToFixedFrameGenerator("north", "west");

  public getFrame(time: Dayjs): Frame | undefined {
    if (this.timeSpan.isValid()) {
      const start = this.globalProperties.referenceTime;
      const end = this.timeSpan.end;
      const frames = this.frames;
      if (start.isSameOrBefore(time) && time.isSameOrBefore(end)) {
        const timeStamp = dayjs.duration(time.diff(start)).asSeconds();
        const index = bounds.le(frames, new Frame(timeStamp), (a, b) => a.timeStamp - b.timeStamp);

        return frames[index];
      }
    }

    return undefined;
  }

  private _addFrame(trajectories: Trajectories, time: Dayjs, frame: Frame, lastFrame?: boolean) {
    const scene = frame.scene;
    lastFrame = lastFrame ?? false;
    scene.forEach((transform, id) => {
      let orientation: Quaternion | undefined = undefined;
      let trajectory = trajectories.get(id);
      if (trajectory === undefined) {
        trajectory = new Trajectory();
        trajectories.set(id, trajectory);
      }
      const samples = trajectory.samples;

      const position = Cartesian3.fromDegrees(
        transform.longitude,
        transform.latitude,
        transform.altitude,
        Ellipsoid.WGS84,
        new Cartesian3(),
      );

      if (transform.yaw !== undefined) {
        const hpr = new HeadingPitchRoll(
          transform.yaw * CMath.RADIANS_PER_DEGREE,
          (transform.pitch ?? 0) * CMath.RADIANS_PER_DEGREE,
          (transform.roll ?? 0) * CMath.RADIANS_PER_DEGREE,
        );

        orientation = Transforms.headingPitchRollQuaternion(
          position,
          hpr,
          Ellipsoid.WGS84,
          this._fixedFrame,
          new Quaternion(),
        );
      }

      // Check if the added sample is different from the previous one
      const length = samples.length;
      if (!lastFrame && length > 0) {
        const lastSample = samples[length - 1];
        const lastPosition = lastSample.state.position;
        const lastOrientation = lastSample.state.orientation;
        if (
          Cartesian3.equalsEpsilon(lastPosition, position, CMath.EPSILON6) &&
          Quaternion.equalsEpsilon(lastOrientation, orientation, CMath.EPSILON6)
        )
          return;
      }

      samples.push({
        time: time,
        state: {
          position: position,
          orientation: orientation,
        },
      });
    });
  }

  public createSampledTrajectories(options?: ITrajectoryOptions) {
    const sampleRate = options?.sampleRate ?? 1;
    const fixMslHeight = options?.fixMslHeight ?? false;
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
        if (frame !== undefined) this._addFrame(trajectories, time, frame);
        timeStamp += sampleRate;
      } while (timeStamp <= duration);

      if (timeStamp > duration) {
        const endFrame = this.getFrame(end);
        if (endFrame !== undefined) this._addFrame(trajectories, end, endFrame, true);
      }
    }

    if (fixMslHeight) trajectories.forEach((trajectory) => trajectory.fixMslHeight());
    if (emulateOrientation)
      trajectories.forEach((trajectory) => {
        if (!trajectory.hasOrientations()) trajectory.emulateOrientations(0.01, true);
      });

    return trajectories;
  }
}
