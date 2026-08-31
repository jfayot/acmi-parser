import { Vector3, Euler, toRadians, Geoid } from "@math3d";

/** Geodetic position and optional orientation for an entity in one frame. */
export default class Transform {
  /** Longitude (degrees), latitude (degrees), and altitude (metres). */
  public position: Vector3;

  /** Roll, pitch, and yaw in radians, when supplied by the recording. */
  public orientation?: Euler;

  /** Global longitude offset in degrees used while decoding transforms. */
  public static refLong = 0;

  /** Global latitude offset in degrees used while decoding transforms. */
  public static refLat = 0;

  /** Optional geoid used to convert source altitudes. */
  public static geoid: Geoid | undefined = undefined;

  /**
   * Decodes ACMI transform components, inheriting omitted values.
   *
   * @param components - Longitude, latitude, altitude, roll, pitch, and yaw.
   * Empty components are represented by `undefined`.
   * @param previousTransform - Previous entity state used for omitted values.
   */
  public constructor(
    components: (number | undefined)[],
    previousTransform: Transform | undefined,
  ) {
    if (
      components[0] !== undefined ||
      components[1] !== undefined ||
      components[2] !== undefined
    ) {
      const previousPosition = previousTransform?.position.clone();

      const longitude =
        components[0] !== undefined
          ? components[0] + Transform.refLong
          : (previousPosition?.x ?? Transform.refLong);

      const latitude =
        components[1] !== undefined
          ? components[1] + Transform.refLat
          : (previousPosition?.y ?? Transform.refLat);

      const geoidHeight = Transform.geoid?.getHeight(latitude, longitude) ?? 0;

      const altitude =
        components[2] !== undefined
          ? components[2] + geoidHeight
          : (previousPosition?.z ?? geoidHeight);

      this.position = new Vector3(longitude, latitude, altitude);
    } else {
      this.position = previousTransform?.position ?? new Vector3();
    }

    if (
      components[3] !== undefined ||
      components[4] !== undefined ||
      components[5] !== undefined
    ) {
      const previousOrientation = previousTransform?.orientation?.clone();

      const roll =
        components[3] !== undefined
          ? toRadians(components[3])
          : previousOrientation?.roll;

      const pitch =
        components[4] !== undefined
          ? toRadians(components[4])
          : previousOrientation?.pitch;

      const yaw =
        components[5] !== undefined
          ? toRadians(components[5])
          : previousOrientation?.yaw;

      this.orientation = new Euler(roll, pitch, yaw);
    } else {
      this.orientation = previousTransform?.orientation;
    }
  }
}
