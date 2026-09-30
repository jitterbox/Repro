# Repro branding

<img src="../assets/branding/repro-logo.png" alt="Repro — replay bug logo" width="480">

The canonical package and project logo is [`assets/branding/repro-logo.png`](../assets/branding/repro-logo.png): a coral bug whose body forms the replay arrow, paired with the lowercase charcoal **repro** wordmark. It is the approved second concept, preserved without alteration as a transparent PNG.

Use the complete horizontal lockup for project documentation and package branding. Preserve its aspect ratio, colors, wordmark and generous clear space. Place it on a light, neutral surface so the charcoal lettering remains legible. This is a raster asset, not an SVG master.

The repository README and documentation index use the canonical asset directly. Release preparation adds it to the CLI package under `assets/branding/repro-logo.png`, keeping the installed documentation image available offline. Generated npm package READMEs reference that versioned public npm asset through jsDelivr, so the image is available independently of GitHub repository access without being duplicated across every dependency package.

The numbered concept files in `assets/branding/` are design history; use the unversioned canonical filename in new material. Branding does not change the semantic colors of evidence overlays or add watermarks to recordings.
