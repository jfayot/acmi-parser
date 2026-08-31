import AcmiData from "./acmi/acmiData";
import Entity from "./acmi/entity";
import Frame, { Scene } from "./acmi/frame";
import GlobalProperties from "./acmi/globalProperties";
import Header from "./acmi/header";
import TimeSpan from "./acmi/timeSpan";
import Transform from "./acmi/transform";
import StateVector from "./trajectory/stateVector";
import Trajectory, {
  ITrajectoryOptions,
  TrajectoryOptions,
  Trajectories,
} from "./trajectory/trajectory";
import TrajectorySample, {
  ITrajectorySample,
} from "./trajectory/trajectorySample";
import AcmiParser, {
  AcmiBinaryInput,
  AcmiInput,
  AcmiParseError,
  AcmiParseErrorCode,
  AcmiParserOptions,
  parseAcmi,
} from "./parser";

export type {
  Scene,
  ITrajectoryOptions,
  TrajectoryOptions,
  Trajectories,
  ITrajectorySample,
  TrajectorySample,
  AcmiBinaryInput,
  AcmiInput,
  AcmiParseErrorCode,
  AcmiParserOptions,
};

export {
  AcmiData,
  AcmiParseError,
  AcmiParser,
  Entity,
  Frame,
  GlobalProperties,
  Header,
  StateVector,
  TimeSpan,
  Trajectory,
  Transform,
  parseAcmi,
};

export default AcmiParser;
