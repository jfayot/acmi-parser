import dayjs from "dayjs";
import duration from "dayjs/plugin/duration.js";
dayjs.extend(duration);
import fs from "node:fs";
import path from "node:path";
import AcmiParser from "acmi-parser";

const sample = fs.readFileSync(path.join(__dirname, "resources/sample.zip.acmi"));
const model = fs.readFileSync(path.join(__dirname, "resources/egm2008-5.pgm"));

const parser = new AcmiParser(model);

const filter: string[] = ["Weapon", "Untyped", "Navaid", "Misc", "Projectile", "Parachutist"];

let start = dayjs();
parser.parse(sample, { filter: filter }).then((data) => {
  let end = dayjs();
  console.log(dayjs.duration(end.diff(start)).asMilliseconds());

  start = dayjs();
  const trajectories = data.createSampledTrajectories({
    sampleRate: 1,
    fixMslHeight: true,
    emulateOrientation: true,
  });
  end = dayjs();
  console.log(dayjs.duration(end.diff(start)).asMilliseconds());

  trajectories.forEach((trajectory, id) => {
    const csvPath = path.join(__dirname, `${id}.csv`);
    const stream = fs.createWriteStream(csvPath);
    const samples = trajectory.samples;

    samples.forEach((sample) => {
      const state = sample.state;
      const pos = state.position;
      const orient = state.orientation;

      stream.write(
        `${sample.time.toISOString()},${pos.x},${pos.y},${
          pos.z
        },${orient?.x},${orient?.y},${orient?.z},${orient?.w}\n`,
      );
    });

    stream.close();
  });

  console.log("done");
});
