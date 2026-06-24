#!/usr/bin/env bun
/*
Kitchen-sink argsbarg consumer reference.

  cd examples/consumer-app && bun install && bun run schemagen
  CONSUMER_APP_API_TOKEN=dev bun run start status --json
  CONSUMER_APP_API_TOKEN=dev bun run start config get
  CONSUMER_APP_API_TOKEN=dev bun run start docs readme
*/

import { Cli } from "argsbarg";
import { program } from "./program.ts";

const cli = new Cli(program);
await cli.run();
