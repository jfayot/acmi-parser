import dayjs from "dayjs";
import duration from "dayjs/plugin/duration.js";
import ITrajectorySample from "./trajectorySample";
import {
  Euler,
  Matrix3,
  Quaternion,
  Vector3,
  config,
  toRadians,
  Ellipsoid,
} from "@math3d";
dayjs.extend(duration);

const _oneDegree = toRadians(1);
const _G0 = 9.80665;
const _TWO_PI = 2.0 * Math.PI;
const _defaultEuler = new Euler();
const _hpr0 = new Euler();
const _hpr1 = new Euler();
const _alpha = 0.05;
const _v0 = new Vector3();
const _v1 = new Vector3();
const _r0 = new Matrix3();
const _r1 = new Matrix3();
const _q0 = new Quaternion();
const _q1 = new Quaternion();
const _rollQuat = new Quaternion();
const _hprQuat = new Quaternion();
const _wgs84 = Ellipsoid.WGS84;

export interface ITrajectoryOptions {
  sampleRate?: number;
  emulateOrientation?: boolean;
}

export default class Trajectory {
  public samples: ITrajectorySample[] = [];

  public hasOrientations() {
    return this.samples[0]?.stateVector.quaternion !== undefined;
  }

  private _lastRoll = 0;
  private _simpleSmooth(value: number, alpha: number) {
    value = alpha * value + (1 - alpha) * this._lastRoll;
    // Round roll below 1 degree to zero to avoid getting seasick
    if (value < _oneDegree) value = 0;
    this._lastRoll = value;
    return value;
  }

  private _computeRoll(
    p0: Vector3,
    q0: Quaternion,
    p1: Vector3,
    q1: Quaternion,
    speed: number,
    dt: number
  ) {
    const hpr0 = _wgs84
      .getEulerFromPositionQuaternion(p0, q0, _hpr0)
      .toHeadingPitchRoll(_hpr0);
    const hpr1 = _wgs84
      .getEulerFromPositionQuaternion(p1, q1, _hpr1)
      .toHeadingPitchRoll(_hpr1);

    const TWO_PI = _TWO_PI;

    let h0 = hpr0.yaw;
    if (h0 < 0) h0 += TWO_PI;

    let h1 = hpr1.yaw;
    if (h1 < 0) h1 += TWO_PI;

    let delta = h1 - h0;
    let angle = Math.abs(delta);
    if (angle > Math.PI) {
      angle = TWO_PI - angle;
      delta = TWO_PI + delta;
    }

    const alpha = Math.sign(delta) * angle;

    return this._simpleSmooth(Math.atan((speed * alpha) / (_G0 * dt)), _alpha);
  }

  private _computeOrientation(
    s0: ITrajectorySample,
    s1: ITrajectorySample,
    s2: ITrajectorySample,
    withRoll: boolean
  ) {
    const p0 = s0.stateVector.cartesian;
    const p1 = s1.stateVector.cartesian;

    const t0 = s0.time;
    const t1 = s1.time;

    const dt0 = dayjs.duration(t1.diff(t0)).asSeconds();
    const v0 = _v0.subVectors(p1, p0).multiplyByScalar(1 / dt0);
    const speed = v0.magnitude();

    if (speed > config.EPSILON) {
      v0.normalize();

      const r0 = _wgs84.getRotationMatrixFromPositionVelocity(p0, v0, _r0);

      const q0 = _q0.fromMatrix3(r0);

      let roll = 0;

      if (withRoll) {
        const p2 = s2.stateVector.cartesian;

        const t2 = s2.time;

        const dt1 = dayjs.duration(t2.diff(t1)).asSeconds();
        const v1 = _v1.subVectors(p2, p1).multiplyByScalar(1 / dt1);
        v1.normalize();

        const r1 = _wgs84.getRotationMatrixFromPositionVelocity(p1, v1, _r1);

        const q1 = _q1.fromMatrix3(r1);

        roll = this._computeRoll(p0, q0, p1, q1, speed, dt0);
      }

      const rollQuaternion = _rollQuat.fromAxisRotation(v0, roll);

      return rollQuaternion.multiplyRight(q0).clone();
    } else {
      return _wgs84.getQuaternionFromEuler(p0, _defaultEuler, _hprQuat).clone();
    }
  }

  public emulateOrientations(withRoll?: boolean) {
    const samples = this.samples;

    const length = samples.length - 2; // last 2 points treated appart because of interval availability
    if (length < 1) {
      samples.forEach((sample) => {
        const stateVector = sample.stateVector;
        stateVector.quaternion = _wgs84
          .getQuaternionFromEuler(
            stateVector.cartesian,
            _defaultEuler,
            _hprQuat
          )
          .clone();
      });
      return;
    }

    withRoll = withRoll ?? false;

    for (let i = 0; i < length; ++i) {
      const s0 = samples[i];
      const s1 = samples[i + 1];
      const s2 = samples[i + 2];
      samples[i].stateVector.quaternion = this._computeOrientation(
        s0,
        s1,
        s2,
        withRoll
      );
    }

    samples[length].stateVector.quaternion =
      samples[length - 1].stateVector.quaternion;
    samples[length + 1].stateVector.quaternion =
      samples[length - 1].stateVector.quaternion;
  }
}

export type Trajectories = Map<number, Trajectory>;
