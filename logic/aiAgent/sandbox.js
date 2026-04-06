import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Sandbox } from "@e2b/code-interpreter";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sandbox = await Sandbox.create();

const filteredDataPath = path.join(__dirname, "..", "..", "data", "filtereddata", "filtered_data.json");
const flightData = fs.readFileSync(filteredDataPath, "utf8");

const flightDataInSandbox = await sandbox.files.write("flight_data.json", flightData);

let prompt = [];

const anthropic = new Anthropic();
