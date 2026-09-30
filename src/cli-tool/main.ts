#!/usr/bin/env node
/** Argsbarg package CLI (`bun x argsbarg`) — bootstrap and tooling; library API is `import from "argsbarg"`. */

import { app } from "./app.ts";

await app.run();
