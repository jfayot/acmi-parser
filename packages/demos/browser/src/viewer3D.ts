import {
  BoundingSphere,
  BoundingSphereState,
  CallbackProperty,
  Cartesian3,
  CesiumWidget,
  Color,
  DataSourceCollection,
  DataSourceDisplay,
  Entity,
  EntityCollection,
  Event,
  HermitePolynomialApproximation,
  JulianDate,
  ModelGraphics,
  Quaternion,
  QuaternionSpline,
  SampledPositionProperty,
  Terrain,
  TimeInterval,
  TimeIntervalCollection,
} from "@cesium/engine";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
dayjs.extend(duration);
import f18c from "./resources/F-18C.glb?url";
import su27 from "./resources/SU-27.glb?url";
import { notEmpty } from "./utils/notEmpty";
import { AcmiData, Entity as AcmiEntity, Trajectory } from "acmi-parser";

export default class Viewer3D {
  private _widget: CesiumWidget;
  private _dataSourceDisplay: DataSourceDisplay;
  private _entities: EntityCollection;
  private _start?: JulianDate;
  private _duration?: number;
  private _removeTickCb: Event.RemoveCallback;
  private _removePostRenderCb: Event.RemoveCallback;
  private _requestFlyTo = false;
  private _controller = new AbortController();

  constructor(cesiumRoot: HTMLDivElement) {
    this._widget = new CesiumWidget(cesiumRoot, {
      terrain: Terrain.fromWorldTerrain(),
    });
    const scene = this._widget.scene;
    scene.globe.depthTestAgainstTerrain = true;
    scene.globe.enableLighting = true;
    const dataSourceCollection = new DataSourceCollection();
    this._dataSourceDisplay = new DataSourceDisplay({
      scene: scene,
      dataSourceCollection: dataSourceCollection,
    });
    this._entities = this._dataSourceDisplay.defaultDataSource.entities;

    this._removeTickCb = this._widget.clock.onTick.addEventListener(
      this._tickHandler
    );
    this._removePostRenderCb = scene.postRender.addEventListener(
      this._postRenderHandler
    );
  }

  public destroy() {
    this._controller.abort();
    this._removeTickCb();
    this._removePostRenderCb();
    this._widget.camera.cancelFlight();
    this._widget.destroy();
  }

  private _createEntity(
    id: number,
    trajectory: Trajectory,
    entity: AcmiEntity
  ) {
    const timeSpan = entity.timeSpan;
    const startTime = JulianDate.fromDate(timeSpan.start.toDate());
    const endTime = JulianDate.fromDate(timeSpan.end.toDate());
    const samples = trajectory.samples;

    const orientationSpline = new QuaternionSpline({
      times: samples.map((sample) =>
        dayjs.duration(sample.time.diff(timeSpan.start)).asSeconds()
      ),
      points: samples
        .map((sample) =>
          sample.stateVector.quaternion
            ? Quaternion.unpack(sample.stateVector.quaternion)
            : undefined
        )
        .filter(notEmpty),
    });

    const scratch = new Quaternion();
    const orientationCb = (time: JulianDate) => {
      const delta = JulianDate.secondsDifference(time, startTime);
      return orientationSpline.evaluate(delta, scratch);
    };

    const sampledPos = new SampledPositionProperty();
    sampledPos.setInterpolationOptions({
      interpolationAlgorithm: HermitePolynomialApproximation,
      interpolationDegree: 2,
    });
    samples.forEach((sample) => {
      const time = JulianDate.fromIso8601(
        sample.time.toISOString(),
        new JulianDate()
      );
      const pos = sample.stateVector.cartesian;
      sampledPos.addSample(time, Cartesian3.unpack(pos));
    });

    return new Entity({
      id: id.toString(16),
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
    this._requestFlyTo = true;
  }

  public loadAcmiData(acmiData: AcmiData) {
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
      acmiData.timeSpan.start.toISOString()
    );
    const endTime = JulianDate.fromIso8601(acmiData.timeSpan.end.toISOString());

    this._start = startTime.clone();
    this._duration = acmiData.timeSpan.duration();

    this._widget.clock.startTime = startTime.clone();
    this._widget.clock.stopTime = endTime.clone();
    this._widget.clock.currentTime = startTime.clone();
  }

  public setTime(timePercent: number) {
    if (this._start && this._duration) {
      const timeStamp = this._duration * timePercent;
      JulianDate.addSeconds(
        this._start,
        timeStamp,
        this._widget.clock.currentTime
      );
    }
  }

  private _tickHandler = () => {
    this._dataSourceDisplay.update(this._widget.clock.currentTime);
  };

  private _postRenderHandler = () => {
    if (this._requestFlyTo) {
      const boundingSpheres: BoundingSphere[] = [];
      const entities = this._entities.values;
      for (const entity of entities) {
        const boundingSphere = new BoundingSphere();
        const trackedState = this._dataSourceDisplay?.getBoundingSphere(
          entity,
          false,
          boundingSphere
        );
        if (trackedState !== BoundingSphereState.DONE) return;
        boundingSpheres.push(boundingSphere);
      }

      this._requestFlyTo = false;

      const boundingSphere = BoundingSphere.fromBoundingSpheres(
        boundingSpheres,
        new BoundingSphere()
      );
      this._widget.camera.flyToBoundingSphere(boundingSphere);
    }
  };
}
