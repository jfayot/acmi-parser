import { Vector3, Euler, toRadians, Geoid } from "@math3d";

export default class Transform {
  public position: Vector3; // Longitude, Latitude, Altitude
  public orientation?: Euler; // Roll, Pitch, Yaw

  public static refLong = 0;
  public static refLat = 0;
  public static geoid: Geoid | undefined = undefined;

  public constructor(
    components: (number | undefined)[],
    previousTransform: Transform | undefined
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
          : previousPosition?.x ?? Transform.refLong;

      const latitude =
        components[1] !== undefined
          ? components[1] + Transform.refLat
          : previousPosition?.y ?? Transform.refLat;

      const geoidHeight = Transform.geoid?.getHeight(latitude, longitude) ?? 0;

      const altitude =
        components[2] !== undefined
          ? components[2] + geoidHeight
          : previousPosition?.z ?? geoidHeight;

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
