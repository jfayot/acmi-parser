import React from "react";
import Slider from "@mui/material/Slider";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Viewer3D from "./viewer3D";
import styles from "./App.module.css";
import pgmUri from "./resources/egm2008-5.pgm?url";
import AcmiParser from "acmi-parser";

const App: React.FC = () => {
  const divRef = React.useRef<HTMLDivElement>(null);
  const acmiInputRef = React.useRef<HTMLInputElement>(null);
  const [viewer3D, setViewer3D] = React.useState<Viewer3D | null>(null);

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

  const handleAcmiFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = event.target;
    if (files && files.length === 1) {
      const file = files[0];
      const acmi = new Uint8Array(await file.arrayBuffer());
      const pgm = await pgmBuffer;

      const parser = new AcmiParser(pgm);
      const data = await parser.parse(acmi, {
        filter: ["Weapon", "Untyped", "Navaid", "Misc", "Projectile", "Parachutist"],
      });
      viewer3D?.loadAcmiData(data);
      viewer3D?.flyToEntities();
    }
  };

  const handleLoadAcmi = () => {
    acmiInputRef.current?.click();
  };

  const handleSliderChange = (_event: Event, newValue: number | number[]) => {
    viewer3D?.setTime(newValue as number);
  };

  return (
    <React.Fragment>
      <div className={styles.container} ref={divRef} />
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
      <Box className={styles.slider}>
        <Slider min={0} max={1} step={0.0001} onChange={handleSliderChange} />
      </Box>
    </React.Fragment>
  );
};

export default App;
