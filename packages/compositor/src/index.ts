export { renderCards, cardCacheKey, closeCompositor } from './render.js';
export type {
  BoundingRect,
  CardSpec,
  CompareChromeProps,
  ComparePaneChrome,
  ConsoleLevel,
  ConsoleToastProps,
  DeltaCaptionProps,
  FreezeBannerProps,
  OutcomePairProps,
  RenderResult,
  RoiMagnifierProps,
  SlateMode,
  SlateProps,
  ViewportSpec,
  VitalsHudProps,
} from './types.js';

export * from './scene-render.js';

export * from './scene-compare.js';

export { headlessShellPath } from './browser-path.js';
