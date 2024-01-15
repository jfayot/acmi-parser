import {
  Cartesian3,
  Ellipsoid,
  HeadingPitchRoll,
  Math as CMath,
  Matrix4,
  Quaternion,
  Transforms,
  Matrix3,
  CatmullRomSpline,
  Cartographic,
  Ion,
} from "@cesium/engine";
import { parsePGM, Geoid } from "@math.gl/geoid";
import dayjs, { Dayjs } from "dayjs";
import duration from "dayjs/plugin/duration.js";
dayjs.extend(duration);

Ion.defaultAccessToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2YjczZDQ0NS02NmMyLTQ2N2QtOTJkNS1mZjIwZGFkNGM0YTMiLCJpZCI6MTE2NzQ1LCJpYXQiOjE2Njk4ODMxOTZ9.bnltrQAZUJe27N3FViFmb5_T0y-znJja_QuN-8ncDqw";

const G0 = 9.80665;

export interface IStateVector {
  position: Cartesian3;
  orientation?: Quaternion;
}

export interface ITrajectorySample {
  time: Dayjs;
  state: IStateVector;
}

export interface ITrajectoryOptions {
  sampleRate?: number;
  fixMslHeight?: boolean;
  emulateOrientation?: boolean;
}

export class Trajectory {
  public samples: ITrajectorySample[] = [];
  private _mslHeightFixed = false;

  private static _geoid?: Geoid;

  private readonly _fixedFrame = Transforms.localFrameToFixedFrameGenerator("north", "west");

  public static loadGeoidModel(model: Uint8Array) {
    this._geoid = parsePGM(model, {});
  }

  public hasOrientations() {
    return this.samples[0]?.state.orientation !== undefined;
  }

  private _lastRoll = 0;
  private _simpleSmooth(value: number, alpha: number) {
    value = alpha * value + (1 - alpha) * this._lastRoll;
    if (value < 2 * CMath.RADIANS_PER_DEGREE) value = 0;
    this._lastRoll = value;
    return value;
  }

  private _m0 = new Matrix4();
  private _m1 = new Matrix4();
  private _hpr0 = new HeadingPitchRoll();
  private _hpr1 = new HeadingPitchRoll();
  private _alpha = 0.05;
  private _computeRoll(
    p0: Cartesian3,
    q0: Quaternion,
    p1: Cartesian3,
    q1: Quaternion,
    speed: number,
    dt: number,
  ) {
    const m0 = Matrix4.fromTranslationQuaternionRotationScale(p0, q0, Cartesian3.ONE, this._m0);
    const m1 = Matrix4.fromTranslationQuaternionRotationScale(p1, q1, Cartesian3.ONE, this._m1);

    const hpr0 = Transforms.fixedFrameToHeadingPitchRoll(
      m0,
      Ellipsoid.WGS84,
      this._fixedFrame,
      this._hpr0,
    );
    const hpr1 = Transforms.fixedFrameToHeadingPitchRoll(
      m1,
      Ellipsoid.WGS84,
      this._fixedFrame,
      this._hpr1,
    );

    let h0 = hpr0.heading;
    if (h0 < 0) h0 += CMath.TWO_PI;

    let h1 = hpr1.heading;
    if (h1 < 0) h1 += CMath.TWO_PI;

    let delta = h1 - h0;
    let angle = Math.abs(delta);
    if (angle > Math.PI) {
      angle = CMath.TWO_PI - angle;
      delta = CMath.TWO_PI + delta;
    }

    const alpha = Math.sign(delta) * angle;

    return this._simpleSmooth(Math.atan((speed * alpha) / (G0 * dt)), this._alpha);
  }

  private _p0 = new Cartesian3();
  private _p1 = new Cartesian3();
  private _p2 = new Cartesian3();
  private _v0 = new Cartesian3();
  private _v1 = new Cartesian3();
  private _r0 = new Matrix3();
  private _r1 = new Matrix3();
  private _q0 = new Quaternion();
  private _q1 = new Quaternion();
  private _rollQuat = new Quaternion();
  private _defaultHpr = new HeadingPitchRoll();
  private _computeOrientation(
    posSpline: CatmullRomSpline,
    t0: number,
    t1: number,
    t2: number,
    withRoll: boolean,
  ) {
    const dt = t1 - t0;

    const p0 = posSpline.evaluate(t0, this._p0);
    const p1 = posSpline.evaluate(t1, this._p1);

    const v0 = Cartesian3.subtract(p1, p0, this._v0);
    Cartesian3.divideByScalar(v0, t1 - t0, v0);
    const speed = Cartesian3.magnitude(v0);

    if (speed > CMath.EPSILON6) {
      Cartesian3.normalize(v0, v0);

      const r0 = Transforms.rotationMatrixFromPositionVelocity(p0, v0, Ellipsoid.WGS84, this._r0);

      const q0 = Quaternion.fromRotationMatrix(r0, this._q0);

      let roll = 0;

      if (withRoll) {
        const p2 = posSpline.evaluate(t2, this._p2);

        const v1 = Cartesian3.subtract(p2, p1, this._v1);
        Cartesian3.divideByScalar(v1, t2 - t1, v1);
        Cartesian3.normalize(v1, v1);

        const r1 = Transforms.rotationMatrixFromPositionVelocity(p1, v1, Ellipsoid.WGS84, this._r1);

        const q1 = Quaternion.fromRotationMatrix(r1, this._q1);

        roll = this._computeRoll(p0, q0, p1, q1, speed, dt);
      }

      const rollQuaternion = Quaternion.fromAxisAngle(v0, roll, this._rollQuat);

      return Quaternion.multiply(rollQuaternion, q0, new Quaternion());
    } else {
      return Transforms.headingPitchRollQuaternion(
        p0,
        this._defaultHpr,
        Ellipsoid.WGS84,
        this._fixedFrame,
        new Quaternion(),
      );
    }
  }

  public emulateOrientations(dt: number, withRoll?: boolean) {
    const samples = this.samples;

    if (samples.length < 2) return;
    if (dayjs.duration(samples[1].time.diff(samples[0].time)).asSeconds() < 2 * dt) return;

    const length = samples.length - 1; // last point treated appart because of interval availability
    const start = samples[0].time;
    const times = samples.map((sample) => dayjs.duration(sample.time.diff(start)).asSeconds());

    const positions = samples.map((sample) =>
      Cartesian3.fromElements(
        sample.state.position.x,
        sample.state.position.y,
        sample.state.position.z,
      ),
    );
    const posSpline = new CatmullRomSpline({ times: times, points: positions });
    withRoll = withRoll ?? false;

    for (let i = 0; i < length; ++i) {
      const t0 = times[i];
      const t1 = t0 + dt;
      const t2 = t1 + dt;
      samples[i].state.orientation = this._computeOrientation(posSpline, t0, t1, t2, withRoll);
    }

    const t2 = times[length];
    const t1 = t2 - dt;
    const t0 = t1 - dt;
    samples[length].state.orientation = this._computeOrientation(posSpline, t0, t1, t2, withRoll);
  }

  private _cartographicScratch = new Cartographic();
  public fixMslHeight() {
    if (this._mslHeightFixed) return;
    if (Trajectory._geoid === undefined) return;

    const geoid = Trajectory._geoid;
    const samples = this.samples;

    samples.forEach((sample, i) => {
      const lgz = Cartographic.fromCartesian(
        sample.state.position,
        Ellipsoid.WGS84,
        this._cartographicScratch,
      );
      lgz.height += geoid?.getHeight(
        lgz.latitude * CMath.DEGREES_PER_RADIAN,
        lgz.longitude * CMath.DEGREES_PER_RADIAN,
      );
      samples[i].state.position = Cartographic.toCartesian(lgz, Ellipsoid.WGS84, new Cartesian3());
    });

    this._mslHeightFixed = true;
  }
}

export type Trajectories = Map<number, Trajectory>;
