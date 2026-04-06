import 'dotenv/config';
import fs from 'fs';
import { Sandbox } from '@e2b/code-interpreter';
import Anthropic from '@anthropic-ai/sdk'

const sandbox = await Sandbox.create();

const flightData = fs.readFileSync('data/filtereddata/filtered_data.json', 'utf8');

const flightDataInSandbox = await sandbox.files.write('flight_data.json', flightData);

let prompt = []

const anthropic = new Anthropic()
