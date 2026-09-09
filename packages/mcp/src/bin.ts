#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createReproMcpServer } from './index.js';
await createReproMcpServer().connect(new StdioServerTransport());
