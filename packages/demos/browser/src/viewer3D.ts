import {
  CallbackProperty,
  Cartesian3,
  CesiumWidget,
  ClockRange,
  Color,
  Entity,
  EntityCollection,
  HermitePolynomialApproximation,
  JulianDate,
  ModelGraphics,
  Quaternion,
  QuaternionSpline,
  SampledPositionProperty,
  ScreenSpaceEventType,
  type ScreenSpaceEventHandler,
  Terrain,
  TimeInterval,
  TimeIntervalCollection,
  TrackingReferenceFrame,
} from "@cesium/engine";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
dayjs.extend(duration);
import f18c from "./resources/F-18C.glb?url";
import su27 from "./resources/SU-27.glb?url";
import { notEmpty } from "./utils/notEmpty";
import { AcmiData, Entity as AcmiEntity, Trajectory } from "acmi-parser";

const trackingOffset = new Cartesian3(-150, 0, 20);

export default class Viewer3D {
  private _widget: CesiumWidget;
  private _entities: EntityCollection;
  private _start?: JulianDate;
  private _duration?: number;
  private _controller = new AbortController();

  constructor(cesiumRoot: HTMLDivElement) {
    this._widget = new CesiumWidget(cesiumRoot, {
      terrain: Terrain.fromWorldTerrain(),
    });
    const scene = this._widget.scene;
    scene.globe.depthTestAgainstTerrain = true;
    scene.globe.enableLighting = true;
    this._entities = this._widget.entities;

    this._widget.screenSpaceEventHandler.setInputAction(
      this._doubleClickHandler,
      ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
    );
  }

  public destroy() {
    this._controller.abort();
    this._widget.camera.cancelFlight();
    this._widget.destroy();
  }

  private _createEntity(
    id: number,
    trajectory: Trajectory,
    entity: AcmiEntity,
  ) {
    const timeSpan = entity.timeSpan;
    const startTime = JulianDate.fromDate(timeSpan.start.toDate());
    const endTime = JulianDate.fromDate(timeSpan.end.toDate());
    const samples = trajectory.samples;

    const orientationSpline = new QuaternionSpline({
      times: samples.map((sample) =>
        dayjs.duration(sample.time.diff(timeSpan.start)).asSeconds(),
      ),
      points: samples
        .map((sample) =>
          sample.stateVector.quaternion
            ? Quaternion.unpack(sample.stateVector.quaternion)
            : undefined,
        )
        .filter(notEmpty),
    });

    const scratch = new Quaternion();
    const orientationCb = (time = JulianDate.now(), result = scratch) => {
      const delta = JulianDate.secondsDifference(time, startTime);
      return orientationSpline.evaluate(delta, result);
    };

    const sampledPos = new SampledPositionProperty();
    sampledPos.setInterpolationOptions({
      interpolationAlgorithm: HermitePolynomialApproximation,
      interpolationDegree: 2,
    });
    samples.forEach((sample) => {
      const time = JulianDate.fromIso8601(
        sample.time.toISOString(),
        new JulianDate(),
      );
      const pos = sample.stateVector.cartesian;
      sampledPos.addSample(time, Cartesian3.unpack(pos));
    });

    return new Entity({
      id: id.toString(16),
      trackingReferenceFrame: TrackingReferenceFrame.INERTIAL,
      viewFrom: trackingOffset,
      availability: new TimeIntervalCollection([
        new TimeInterval({
          start: startTime,
          stop: endTime,
        }),
      ]),
      position: sampledPos,
      orientation: new CallbackProperty(orientationCb, false),
      model: new ModelGraphics({
        uri: entity.name === "FA-18C_hornet" ? f18c : su27,
        minimumPixelSize: 48,
        color: entity.color
          ? Color.fromCssColorString(entity.color)
          : undefined,
      }),
      path: {
        width: 2,
        leadTime: 30,
        trailTime: 30,
        material: entity.color
          ? Color.fromCssColorString(entity.color)
          : undefined,
      },
    });
  }

  public flyToEntities() {
    const currentTime = this._widget.clock.currentTime;
    const availableEntities = this._entities.values.filter((entity) =>
      entity.isAvailable(currentTime),
    );
    if (availableEntities.length > 0) {
      void this._widget.flyTo(availableEntities, { duration: 1 });
    }
  }

  /** Stops entity tracking and restores the overview of all loaded entities. */
  public home() {
    this._widget.trackedEntity = undefined;
    this.flyToEntities();
  }

  public loadAcmiData(acmiData: AcmiData) {
    this._widget.clock.shouldAnimate = false;
    this._entities.removeAll();
    const entities = acmiData.entities;
    const trajectories = acmiData.createSampledTrajectories({
      sampleRate: 1,
      emulateOrientation: true,
    });
    for (const [id, trajectory] of trajectories) {
      const entity = entities.get(id);
      if (entity !== undefined) {
        const cesiumEntity = this._createEntity(id, trajectory, entity);
        this._entities.add(cesiumEntity);
      }
    }

    const startTime = JulianDate.fromIso8601(
      acmiData.timeSpan.start.toISOString(),
    );
    const endTime = JulianDate.fromIso8601(acmiData.timeSpan.end.toISOString());

    this._start = startTime.clone();
    this._duration = acmiData.timeSpan.duration();

    this._widget.clock.startTime = startTime.clone();
    this._widget.clock.stopTime = endTime.clone();
    this._widget.clock.currentTime = startTime.clone();
    this._widget.clock.clockRange = ClockRange.CLAMPED;
  }

  public setTime(timePercent: number) {
    if (this._start && this._duration !== undefined) {
      const timeStamp = this._duration * timePercent;
      JulianDate.addSeconds(
        this._start,
        timeStamp,
        this._widget.clock.currentTime,
      );
    }
  }

  public getTimePercent() {
    if (!this._start || this._duration === undefined || this._duration <= 0) {
      return 0;
    }

    const elapsed = JulianDate.secondsDifference(
      this._widget.clock.currentTime,
      this._start,
    );
    return Math.min(1, Math.max(0, elapsed / this._duration));
  }

  public setPlaying(isPlaying: boolean) {
    this._widget.clock.shouldAnimate = isPlaying;
  }

  private _doubleClickHandler = (
    event: ScreenSpaceEventHandler.PositionedEvent,
  ) => {
    const picked = this._widget.scene.pick(event.position) as
      { id?: unknown } | undefined;
    const entity = picked?.id instanceof Entity ? picked.id : undefined;
    if (!entity) return;

    this._widget.trackedEntity =
      this._widget.trackedEntity === entity ? undefined : entity;
  };
}
