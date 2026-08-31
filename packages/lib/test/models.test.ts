import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import AcmiData from "../src/acmi/acmiData";
import Frame from "../src/acmi/frame";
import TimeSpan from "../src/acmi/timeSpan";
import Transform from "../src/acmi/transform";

describe("TimeSpan", () => {
  it("reports validity and duration in seconds", () => {
    const timeSpan = new TimeSpan();
    expect(timeSpan.isValid()).toBe(false);
    expect(timeSpan.duration()).toBe(-1);

    timeSpan.start = dayjs("2024-01-01T00:00:00Z");
    timeSpan.end = timeSpan.start.add(1500, "milliseconds");

    expect(timeSpan.isValid()).toBe(true);
    expect(timeSpan.duration()).toBe(1.5);
  });
});

describe("Frame", () => {
  it("copies the supplied scene so later mutations are isolated", () => {
    const source = new Map([[1, new Transform([1, 2, 3], undefined)]]);
    const frame = new Frame(10, source);

    source.delete(1);

    expect(frame.timeStamp).toBe(10);
    expect(frame.scene.has(1)).toBe(true);
  });
});

describe("Transform", () => {
  it("inherits omitted position and orientation components", () => {
    Transform.refLong = 0;
    Transform.refLat = 0;
    Transform.geoid = undefined;
    const previous = new Transform([1, 2, 3, 10, 20, 30], undefined);

    const transform = new Transform([undefined, 4, undefined, 40], previous);

    expect(transform.position.toArray()).toEqual([1, 4, 3]);
    expect(transform.orientation?.roll).toBeCloseTo((40 * Math.PI) / 180);
    expect(transform.orientation?.pitch).toBeCloseTo((20 * Math.PI) / 180);
    expect(transform.orientation?.yaw).toBeCloseTo((30 * Math.PI) / 180);
  });
});

describe("AcmiData", () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid sample rate of %s",
    (sampleRate) => {
      const data = new AcmiData();

      expect(() => data.createSampledTrajectories({ sampleRate })).toThrow(
        new RangeError("sampleRate must be a finite number greater than 0"),
      );
    },
  );
});
