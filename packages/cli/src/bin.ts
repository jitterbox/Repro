#!/usr/bin/env node
import { pipelineProblem } from '@jitterbox/repro-pipeline';
import { runCli } from './index.js';
try {
  await runCli();
} catch (error) {
  console.error(JSON.stringify(pipelineProblem(error), null, 2));
  process.exitCode = 1;
}
