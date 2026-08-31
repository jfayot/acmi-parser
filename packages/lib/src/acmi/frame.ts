import ITransform from "./transform";

/** Entity transforms keyed by numeric ACMI entity ID. */
export type Scene = Map<number, ITransform>;

/** Timestamped snapshot of all active, retained entities. */
export default class Frame {
  /** Seconds relative to the recording's reference time. */
  public timeStamp: number;

  /** Entity transforms present at this timestamp. */
  public scene: Scene;

  /**
   * Creates a frame and shallow-copies an optional scene.
   *
   * @param timeStamp - Seconds relative to the recording's reference time.
   * @param scene - Scene state to copy into the frame.
   */
  public constructor(timeStamp: number, scene?: Scene) {
    this.timeStamp = timeStamp;
    if (scene) this.scene = new Map<number, ITransform>(scene);
    else this.scene = new Map<number, ITransform>();
  }
}
