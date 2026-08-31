import { Dayjs } from "dayjs";
import StateVector from "./stateVector";

/** One absolute-time sample in an entity trajectory. */
export default interface TrajectorySample {
  /** Absolute sample time. */
  time: Dayjs;

  /** Fixed-frame position and optional orientation. */
  stateVector: StateVector;
}

/** @deprecated Use `TrajectorySample` instead. */
export type ITrajectorySample = TrajectorySample;
