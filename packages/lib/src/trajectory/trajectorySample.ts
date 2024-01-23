import { Dayjs } from "dayjs";
import StateVector from "./stateVector";

export default interface ITrajectorySample {
  time: Dayjs;
  stateVector: StateVector;
}
