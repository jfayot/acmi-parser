import React from "react";
import Slider from "@mui/material/Slider";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Viewer3D from "./viewer3D";
import styles from "./App.module.css";
import pgmUri from "./resources/egm2008-5.pgm?url";
import sampleUri from "./resources/sample.txt.acmi?url";
import { AcmiParser, type AcmiInput } from "acmi-parser";
import type { Dayjs } from "dayjs";

const defaultFileName = "sample.txt.acmi";
const excludedTypes = [
  "Weapon",
  "Untyped",
  "Navaid",
  "Misc",
  "Projectile",
  "Parachutist",
] as const;

interface Timeline {
  start: Dayjs;
  duration: number;
}

const App: React.FC = () => {
  const divRef = React.useRef<HTMLDivElement>(null);
  const acmiInputRef = React.useRef<HTMLInputElement>(null);
  const latestLoadRef = React.useRef(0);
  const [viewer3D, setViewer3D] = React.useState<Viewer3D | null>(null);
  const [loadedFileName, setLoadedFileName] = React.useState("");
  const [timeline, setTimeline] = React.useState<Timeline | null>(null);
  const [timePercent, setTimePercent] = React.useState(0);

  const pgmBuffer = React.useMemo(async () => {
    return new Uint8Array(await (await fetch(pgmUri)).arrayBuffer());
  }, [pgmUri]);

  React.useEffect(() => {
    let _viewer3D: Viewer3D | null = null;
    if (divRef.current) {
      _viewer3D = new Viewer3D(divRef.current);
      setViewer3D(_viewer3D);
    }

    return () => {
      _viewer3D?.destroy();
      _viewer3D = null;
      setViewer3D(null);
    };
  }, [divRef]);

  const loadAcmi = React.useCallback(
    async (source: AcmiInput | Promise<AcmiInput>, fileName: string) => {
      if (!viewer3D) return;

      const loadId = ++latestLoadRef.current;
      const [file, pgm] = await Promise.all([source, pgmBuffer]);
      const parser = new AcmiParser(pgm);
      const data = await parser.parse(file, { excludedTypes });

      if (loadId !== latestLoadRef.current) return;

      viewer3D.loadAcmiData(data);
      viewer3D.flyToEntities();
      setLoadedFileName(fileName);
      setTimeline({
        start: data.timeSpan.start,
        duration: data.timeSpan.duration(),
      });
      setTimePercent(0);
    },
    [pgmBuffer, viewer3D],
  );

  React.useEffect(() => {
    if (!viewer3D) return;

    const sample = fetch(sampleUri).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load ${defaultFileName}: ${response.status}`);
      }
      return response.blob();
    });

    void loadAcmi(sample, defaultFileName).catch(console.error);

    return () => {
      latestLoadRef.current += 1;
    };
  }, [loadAcmi, viewer3D]);

  const handleAcmiFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const { files } = event.target;
    if (files && files.length === 1) {
      const file = files[0];
      await loadAcmi(file, file.name);
      event.target.value = "";
    }
  };

  const handleLoadAcmi = () => {
    acmiInputRef.current?.click();
  };

  const handleSliderChange = (_event: Event, newValue: number | number[]) => {
    const nextTimePercent = newValue as number;
    setTimePercent(nextTimePercent);
    viewer3D?.setTime(nextTimePercent);
  };

  const currentTime = timeline
    ? timeline.start
        .add(timeline.duration * timePercent, "seconds")
        .format("HH:mm:ss.SSS")
    : "";

  return (
    <React.Fragment>
      <div className={styles.container} ref={divRef} />
      {loadedFileName && currentTime && (
        <Box className={styles.status}>
          <Button
            className={styles.statusItem}
            variant="contained"
            component="span"
            title={loadedFileName}
          >
            {loadedFileName}
          </Button>
          <Button
            className={styles.statusItem}
            variant="contained"
            component="span"
          >
            {currentTime}
          </Button>
        </Box>
      )}
      <Box className={styles.load}>
        <input
          ref={acmiInputRef}
          type="file"
          onChange={handleAcmiFileSelect}
          accept=".acmi"
          style={{ display: "none" }}
        />
        <Button variant="contained" onClick={handleLoadAcmi}>
          Load ACMI
        </Button>
      </Box>
      <Box className={styles.home}>
        <Button variant="contained" onClick={() => viewer3D?.home()}>
          Home
        </Button>
      </Box>
      <Box className={styles.slider}>
        <Slider
          min={0}
          max={1}
          step={0.0001}
          value={timePercent}
          onChange={handleSliderChange}
          aria-label="Recording time"
        />
      </Box>
    </React.Fragment>
  );
};

export default App;
