import { ConfigModule } from '@nestjs/config';
import Groq from 'groq-sdk';
import * as fs from 'fs';

async function run() {
  const apiKey = process.env.GROQ_API_KEY; // I need to get it from .env
  if (!apiKey) {
      console.log('No api key, attempting to load from .env');
      require('dotenv').config();
  }
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  console.log("Testing Groq...");
  // Test Models
  const models = await groq.models.list();
  console.log(models.data.map(m => m.id).filter(id => id.includes('whisper') || id.includes('vision')));
}
run().catch(console.error);
