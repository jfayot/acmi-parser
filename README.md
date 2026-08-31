# acmi-parser

[![CI](https://github.com/jfayot/acmi-parser/actions/workflows/ci.yml/badge.svg)](https://github.com/jfayot/acmi-parser/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/acmi-parser.svg)](https://www.npmjs.com/package/acmi-parser)
[![npm downloads](https://img.shields.io/npm/dm/acmi-parser.svg)](https://www.npmjs.com/package/acmi-parser)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Parse Tacview ACMI 2.1 and 2.2 recordings in Node.js or the browser.

[Open the browser demo](https://jfayot.github.io/acmi-parser/)

## Install

```sh
npm install acmi-parser
```

## Quick start

For most use cases, use the one-shot `parseAcmi` function. It accepts ACMI text,
binary data, or a browser `Blob`/`File`, and automatically handles single-file
ZIP archives.

```ts
import { parseAcmi } from "acmi-parser";

const recording = await parseAcmi(file, {
  excludedTypes: ["Weapon", "Projectile"],
});

console.log(recording.entities, recording.frames, recording.timeSpan);
```

In Node.js, `Buffer` can be passed directly:

```ts
import { readFile } from "node:fs/promises";
import { parseAcmi } from "acmi-parser";

const recording = await parseAcmi(await readFile("flight.zip.acmi"));
```

## Inputs and parser options

`parseAcmi()` and `AcmiParser.parse()` accept the following input directly:

| Input             | Typical source                                  |
| ----------------- | ----------------------------------------------- |
| `string`          | Uncompressed ACMI text                          |
| `ArrayBuffer`     | `Response.arrayBuffer()`                        |
| `ArrayBufferView` | `Uint8Array`, `DataView`, or a Node.js `Buffer` |
| `Blob`            | A browser `Blob` or `File`                      |

Binary input may contain either plain ACMI text or a ZIP archive. A ZIP archive
must contain exactly one non-directory entry.

```ts
interface AcmiParserOptions {
  excludedTypes?: readonly string[];
  signal?: AbortSignal;
}
```

`excludedTypes` removes an entity when any of its ACMI `Type` components matches
the list. Use `"Untyped"` to remove entities without a `Type` property.

The legacy `filter` and `controller` options remain available for compatibility,
but new code should use `excludedTypes` and `signal`.

## Parsed output

Both parsing entry points resolve to an `AcmiData` instance:

```ts
class AcmiData {
  isValid: boolean;
  header: Header;
  globalProperties: GlobalProperties;
  timeSpan: TimeSpan;
  entities: Map<number, Entity>;
  frames: Frame[];

  getFrame(time: Dayjs): Frame | undefined;
  createSampledTrajectories(options?: TrajectoryOptions): Trajectories;
}
```

The maps use numeric entity IDs. ACMI hexadecimal IDs such as `a` are exposed as
their numeric value, for example `data.entities.get(0x0a)`.

### Validation and header

`isValid` reports basic structural validation, including the ACMI header,
property syntax, and the reference time required by parsed frames. It is not a
schema validator for every custom property. Unsupported ACMI types or versions
return an `AcmiData` object with `isValid === false`; they do not throw.

| `Header` field | Type     | Description                                                |
| -------------- | -------- | ---------------------------------------------------------- |
| `fileType`     | `string` | Header `FileType`; supported value is `text/acmi/tacview`  |
| `fileVersion`  | `string` | Header `FileVersion`; supported values are `2.1` and `2.2` |

### Global properties

| `GlobalProperties` field | Type                               | Description                                     |
| ------------------------ | ---------------------------------- | ----------------------------------------------- |
| `referenceTime`          | `Dayjs`                            | Absolute origin used for frame and entity times |
| `recordingTime`          | `Dayjs \| undefined`               | Recording timestamp, when provided              |
| `dataSource`             | `string \| undefined`              | Source application or system                    |
| `dataRecorder`           | `string \| undefined`              | Recorder name                                   |
| `author`                 | `string \| undefined`              | Recording author                                |
| `title`                  | `string \| undefined`              | Recording title                                 |
| `category`               | `string \| undefined`              | Recording category                              |
| `briefing`               | `string \| undefined`              | Briefing text                                   |
| `debriefing`             | `string \| undefined`              | Debriefing text                                 |
| `comments`               | `string \| undefined`              | Recording comments                              |
| `referenceLongitude`     | `number \| undefined`              | Longitude offset in degrees                     |
| `referenceLatitude`      | `number \| undefined`              | Latitude offset in degrees                      |
| `additionalProps`        | `Map<string, string> \| undefined` | Unrecognized global ACMI properties             |

Day.js instances provide methods such as `toISOString()`, `add()`, and `diff()`.
An absent or invalid reference time is represented by an invalid Day.js value;
check it with `referenceTime.isValid()`.

### Time spans

`data.timeSpan` describes the recording range, while every `Entity` has its own
active range.

```ts
class TimeSpan {
  start: Dayjs;
  end: Dayjs;
  isValid(): boolean;
  duration(): number;
}
```

`duration()` returns seconds, including fractional seconds, or `-1` when either
endpoint is invalid.

### Entities

`data.entities` contains metadata keyed by numeric entity ID:

```ts
class Entity {
  id: number;
  timeSpan: TimeSpan;
  name?: string;
  types?: string[];
  callsign?: string;
  pilot?: string;
  group?: string;
  country?: string;
  coalition?: string;
  color?: string;
}
```

`types` contains the components of the ACMI `Type` value split on `+`. Entity
metadata is stored once; position and orientation over time are stored in
frames.

### Frames and transforms

Each frame is a scene snapshot:

```ts
type Scene = Map<number, Transform>;

class Frame {
  timeStamp: number;
  scene: Scene;
}
```

`timeStamp` is the number of seconds relative to
`globalProperties.referenceTime`. `scene` maps every active, non-excluded entity
ID to its transform at that frame.

```ts
class Transform {
  position: Vector3;
  orientation?: Euler;
}
```

Transform components use these units:

| Value               | Meaning   | Unit    |
| ------------------- | --------- | ------- |
| `position.x`        | Longitude | Degrees |
| `position.y`        | Latitude  | Degrees |
| `position.z`        | Altitude  | Metres  |
| `orientation.roll`  | Roll      | Radians |
| `orientation.pitch` | Pitch     | Radians |
| `orientation.yaw`   | Yaw       | Radians |

`orientation` is `undefined` until the source supplies orientation components.
When a PGM geoid is supplied to the parser constructor, its height is added to
the ACMI altitude.

Use `getFrame()` with an absolute Day.js time to retrieve the most recent frame
at or before that time. It returns `undefined` outside the recording time span.

```ts
import dayjs from "dayjs";

const frame = recording.getFrame(dayjs("2024-01-02T03:04:10Z"));
const transform = frame?.scene.get(entityId);

if (transform) {
  console.log(transform.position.x, transform.position.y, transform.position.z);
}
```

## Reusing a parser

Create an `AcmiParser` when parsing more than one recording or when supplying a
PGM geoid model:

```ts
function parseAcmi(
  data: AcmiInput,
  options?: AcmiParserOptions,
): Promise<AcmiData>;

class AcmiParser {
  constructor(geoidPgm?: AcmiBinaryInput);
  parse(data: AcmiInput, options?: AcmiParserOptions): Promise<AcmiData>;
}
```

```ts
import { AcmiParser } from "acmi-parser";

const parser = new AcmiParser(geoidPgm);
const first = await parser.parse(firstFile);
const second = await parser.parse(secondFile);
```

The geoid argument accepts `ArrayBuffer` or any `ArrayBufferView`, including a
Node.js `Buffer`. Parser instances are reusable sequentially; each `parse()` call
replaces the instance's previous parsing state. The class remains available as
the package's default export for compatibility.

## Cancellation

Pass an `AbortSignal` to cancel input processing or ZIP decompression:

```ts
const controller = new AbortController();
const result = parseAcmi(file, { signal: controller.signal });

controller.abort();
await result;
```

Compressed-input failures reject with `AcmiParseError`. Its `code` is suitable
for programmatic handling:

```ts
import { AcmiParseError, parseAcmi } from "acmi-parser";

try {
  await parseAcmi(file);
} catch (error) {
  if (error instanceof AcmiParseError && error.code === "INVALID_ARCHIVE") {
    // Show an actionable message to the user.
  }
}
```

| Error code          | Meaning                                                    |
| ------------------- | ---------------------------------------------------------- |
| `INVALID_ARCHIVE`   | The ZIP is unreadable or does not contain exactly one file |
| `UNSUPPORTED_INPUT` | A JavaScript caller supplied an unsupported runtime value  |

Cancellation rejects with the `AbortSignal`'s reason, normally an `AbortError`.
`AcmiParseError.cause` retains the underlying ZIP error when one is available.

## Trajectories

Parsed recordings can produce regularly sampled trajectories:

```ts
const trajectories = recording.createSampledTrajectories({
  sampleRate: 1,
  emulateOrientation: true,
});
```

```ts
interface TrajectoryOptions {
  sampleRate?: number;
  emulateOrientation?: boolean;
}

type Trajectories = Map<number, Trajectory>;

class Trajectory {
  samples: TrajectorySample[];
  hasOrientations(): boolean;
  emulateOrientations(withRoll?: boolean): void;
}

interface TrajectorySample {
  time: Dayjs;
  stateVector: StateVector;
}

class StateVector {
  cartesian: Vector3;
  quaternion?: Quaternion;
}
```

`sampleRate` defaults to `1` second and must be finite and greater than zero.
Samples whose state is unchanged are omitted, while the recording's final state
is always retained.

`stateVector.cartesian` is a WGS84 Earth-centred, Earth-fixed Cartesian position
in metres. When present, `stateVector.quaternion` contains the fixed-frame
orientation as `x`, `y`, `z`, and `w` components.

If `emulateOrientation` is `true`, orientations are derived from the
trajectory's velocity and turning motion and assigned to every sample, replacing
source orientations. `Trajectory.emulateOrientations()` can also perform this
operation later and mutates the trajectory's samples. Its optional `withRoll`
argument enables turn-based bank-angle estimation.

```ts
for (const [entityId, trajectory] of trajectories) {
  for (const sample of trajectory.samples) {
    const { x, y, z } = sample.stateVector.cartesian;
    const orientation = sample.stateVector.quaternion;
    console.log(entityId, sample.time.toISOString(), x, y, z, orientation?.w);
  }
}
```

## Public exports

The package provides both ESM and CommonJS builds. `AcmiParser` is available as
both a named and default export.

| Export                         | Kind     | Purpose                                            |
| ------------------------------ | -------- | -------------------------------------------------- |
| `parseAcmi`                    | Function | Parse one recording with a fresh parser            |
| `AcmiParser`                   | Class    | Reusable parser and optional geoid configuration   |
| `AcmiParseError`               | Class    | Typed compressed-input error                       |
| `AcmiData`                     | Class    | Parsed recording and query methods                 |
| `Header`                       | Class    | ACMI header values                                 |
| `GlobalProperties`             | Class    | Recording-level metadata                           |
| `TimeSpan`                     | Class    | Absolute start/end and duration helper             |
| `Entity`                       | Class    | Entity metadata and active time span               |
| `Frame`                        | Class    | Timestamped scene snapshot                         |
| `Transform`                    | Class    | Geodetic position and optional orientation         |
| `Trajectory`                   | Class    | Ordered trajectory samples and orientation helpers |
| `StateVector`                  | Class    | ECEF Cartesian position and optional quaternion    |
| `AcmiInput`, `AcmiBinaryInput` | Types    | Accepted parser inputs                             |
| `AcmiParserOptions`            | Type     | Filtering and cancellation options                 |
| `AcmiParseErrorCode`           | Type     | Stable parser error codes                          |
| `Scene`                        | Type     | Entity-to-transform map                            |
| `TrajectoryOptions`            | Type     | Trajectory sampling options                        |
| `Trajectories`                 | Type     | Entity-to-trajectory map                           |
| `TrajectorySample`             | Type     | Timestamped state vector                           |

`ITrajectoryOptions` and `ITrajectorySample` are deprecated aliases retained for
source compatibility.

## Development and releases

Pull requests and pushes to `main` run the Vitest suite and build the library and
both demos. User-facing changes should include a changeset:

```sh
pnpm changeset
```

On `main`, the release workflow maintains a Changesets version pull request.
Merging that pull request publishes `acmi-parser`, creates the corresponding
GitHub release, and attaches npm provenance.

Repository maintainers must allow GitHub Actions to create pull requests. npm
publishing uses the trusted publisher configured for
`.github/workflows/release.yml`; no long-lived npm token is required. The
workflow grants the `id-token: write` permission needed for npm's OIDC exchange.

The browser demo is deployed to GitHub Pages after every push to `main`. Its
Pages build uses `/acmi-parser/` as the Vite base path while local development
continues to use `/`.
