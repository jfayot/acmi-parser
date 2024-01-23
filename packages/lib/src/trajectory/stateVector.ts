import { Ellipsoid, Vector3, Quaternion, Matrix4, Matrix3 } from "@math3d";
import Transform from "../acmi//transform";

export default class StateVector {
  public cartesian: Vector3 = new Vector3();
  public quaternion?: Quaternion = undefined;

  public equals(stateVector: StateVector) {
    return (
      stateVector.cartesian.equals(this.cartesian) &&
      (this.quaternion !== undefined
        ? stateVector.quaternion?.equals(this.quaternion)
        : stateVector.quaternion === undefined)
    );
  }

  private static _scratchQuaternionX = new Quaternion();
  private static _scratchQuaternionY = new Quaternion();
  private static _scratchQuaternionZ = new Quaternion();
  private static _scratchHprMatrix = new Matrix4();
  private static _scratchTranslationMatrix = new Matrix4();
  private static _scratchRotation = new Matrix3();
  public static fromTransform(transform: Transform, result?: StateVector) {
    if (result === undefined) result = new StateVector();

    const cartesian = result.cartesian;

    let xQuat = StateVector._scratchQuaternionX.identity();
    let yQuat = StateVector._scratchQuaternionY.identity();
    let zQuat = StateVector._scratchQuaternionZ.identity();

    const wgs84 = Ellipsoid.WGS84;

    wgs84.cartographicToCartesian(transform.position, cartesian);

    const orientation = transform.orientation;
    if (orientation !== undefined) {
      xQuat.rotateX(orientation.roll);
      yQuat.rotateY(-orientation.pitch);
      zQuat.rotateZ(-orientation.yaw);
      const hprQuaternion = zQuat.multiplyRight(yQuat).multiplyRight(xQuat);

      const hprMatrix = this._scratchHprMatrix.fromQuaternion(hprQuaternion);

      const translationMatrix = wgs84.localFrameToFixedFrame(
        "north",
        "west",
        "up",
        cartesian,
        this._scratchTranslationMatrix
      );

      const headingPitchRollToFixedFrame =
        translationMatrix.multiplyRight(hprMatrix);

      const rotation = headingPitchRollToFixedFrame.getRotationMatrix3(
        this._scratchRotation
      );

      if (result.quaternion === undefined) result.quaternion = new Quaternion();
      result.quaternion.fromMatrix3(rotation);
    }

    return result;
  }
}
