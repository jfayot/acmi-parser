declare module "@cesium/engine" {
  export enum BoundingSphereState {
    DONE = 0,
    PENDING = 1,
    FAILED = 2,
  }
  export interface DataSourceDisplay {
    getBoundingSphere(
      entity: Entity,
      allowPartial: boolean,
      result?: BoundingSphere
    ): BoundingSphereState;
  }
}
