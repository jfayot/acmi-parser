# acmi-parser

## 1.2.1

### Patch Changes

- Include the repository README verbatim in the published npm package.

  Upgrade the browser demo with an automatically loaded sample, filename and
  timeline controls, double-click aircraft tracking, an inertial chase camera,
  and a Home overview action.

## 1.2.0

### Minor Changes

- Modernize the parser API with text, binary, and Blob inputs; named and one-shot
  parser exports; AbortSignal cancellation; typed archive errors; clearer
  filtering; and modern trajectory type names. Preserve the existing default
  export and legacy aliases.

  Fix unterminated final lines, single-snapshot recordings, and invalid trajectory
  sample rates. Add comprehensive API documentation and TSDoc, a Vitest suite,
  GitHub CI and trusted releases, a GitHub Pages browser demo, and current
  dependencies throughout the workspace.

## 1.1.0

### Minor Changes

- Got rid of cesium dependency
