#!/usr/bin/env bun
/*
Multi-file consumer example for program.appConfig.

Files:
  types.ts   — AppConfig interface (Config schema JSDoc marker for schemagen)
  schema.ts  — APP_CONFIG_JSON_SCHEMA (inline; production apps generate this)
  program.ts — CliProgram with appConfig block and commands using ctx.appConfig

Try:
  CONFIG_APP_API_TOKEN=dev bun ./examples/config-app/main.ts show --json
  CONFIG_APP_API_TOKEN=dev bun ./examples/config-app/main.ts config get
  CONFIG_APP_API_TOKEN=dev bun ./examples/config-app/main.ts ping
*/

import { Cli } from "../../src/index.ts";
import { program } from "./program.ts";

const cli = new Cli(program);
await cli.run();
