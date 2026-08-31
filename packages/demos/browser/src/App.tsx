import React from "react";
import Slider from "@mui/material/Slider";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
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
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

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
      setIsLoading(true);
      try {
        const [file, pgm] = await Promise.all([source, pgmBuffer]);
        const parser = new AcmiParser(pgm);
        const data = await parser.parse(file, { excludedTypes });

        if (loadId !== latestLoadRef.current) return;

        viewer3D.loadAcmiData(data);
        viewer3D.flyToEntities();
        setIsPlaying(false);
        setLoadedFileName(fileName);
        setTimeline({
          start: data.timeSpan.start,
          duration: data.timeSpan.duration(),
        });
        setTimePercent(0);
      } finally {
        if (loadId === latestLoadRef.current) {
          setIsLoading(false);
        }
      }
    },
    [pgmBuffer, viewer3D],
  );

  React.useEffect(() => {
    if (!viewer3D) return;

    const sample = fetch(sampleUri).then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `Failed to load ${defaultFileName}: ${response.status}`,
        );
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

  const handlePlaybackToggle = () => {
    if (!viewer3D || !timeline) return;

    const shouldPlay = !isPlaying;
    if (shouldPlay && viewer3D.getTimePercent() >= 1) {
      viewer3D.setTime(0);
      setTimePercent(0);
    }
    viewer3D.setPlaying(shouldPlay);
    setIsPlaying(shouldPlay);
  };

  React.useEffect(() => {
    if (!viewer3D || !isPlaying) return;

    let animationFrame = 0;
    const updateTimeline = () => {
      const nextTimePercent = viewer3D.getTimePercent();
      setTimePercent(nextTimePercent);

      if (nextTimePercent >= 1) {
        viewer3D.setPlaying(false);
        setIsPlaying(false);
        return;
      }
      animationFrame = requestAnimationFrame(updateTimeline);
    };

    animationFrame = requestAnimationFrame(updateTimeline);
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, viewer3D]);

  const currentTime = timeline
    ? timeline.start
        .add(timeline.duration * timePercent, "seconds")
        .format("HH:mm:ss.SSS")
    : "";

  return (
    <React.Fragment>
      <div className={styles.container} ref={divRef} />
      {isLoading && (
        <Box className={styles.loading} role="status" aria-live="polite">
          <CircularProgress size={32} />
          <span>Loading ACMI data...</span>
        </Box>
      )}
      <Box className={styles.controls}>
        <Box className={styles.loadRow}>
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
          {loadedFileName && (
            <Button
              className={styles.fileName}
              variant="contained"
              component="span"
              title={loadedFileName}
            >
              {loadedFileName}
            </Button>
          )}
        </Box>
        <Button variant="contained" onClick={() => viewer3D?.home()}>
          Fly To
        </Button>
      </Box>
      <Box className={styles.timeline}>
        {currentTime && (
          <Button
            className={styles.timeLabel}
            variant="contained"
            component="span"
          >
            {currentTime}
          </Button>
        )}
        <Box className={styles.playbackControls}>
          <IconButton
            className={styles.playPause}
            onClick={handlePlaybackToggle}
            disabled={!timeline}
            aria-label={isPlaying ? "Pause replay" : "Play replay"}
            title={isPlaying ? "Pause replay" : "Play replay"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d={isPlaying ? "M6 5h4v14H6zm8 0h4v14h-4z" : "M8 5v14l11-7z"}
              />
            </svg>
          </IconButton>
          <Slider
            min={0}
            max={1}
            step={0.0001}
            value={timePercent}
            onChange={handleSliderChange}
            disabled={!timeline}
            aria-label="Recording time"
          />
        </Box>
      </Box>
    </React.Fragment>
  );
};

export default App;
