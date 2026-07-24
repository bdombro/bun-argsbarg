#!/usr/bin/env bun
/** Argsbarg package CLI (`bunx argsbarg`) — bootstrap and tooling; library API is `import from "argsbarg"`. */

import { Cli } from "~/index";
import { program } from "./program.ts";

const cli = new Cli(program);
await cli.run();
