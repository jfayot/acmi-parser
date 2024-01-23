import ITransform from "./transform";

export type Scene = Map<number, ITransform>;

export default class Frame {
  public timeStamp: number;
  public scene: Scene;

  public constructor(timeStamp: number, scene?: Scene) {
    this.timeStamp = timeStamp;
    if (scene) this.scene = new Map<number, ITransform>(scene);
    else this.scene = new Map<number, ITransform>();
  }
}
