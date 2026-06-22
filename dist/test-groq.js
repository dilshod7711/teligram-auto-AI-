"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const groq_sdk_1 = __importDefault(require("groq-sdk"));
async function run() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        console.log('No api key, attempting to load from .env');
        require('dotenv').config();
    }
    const groq = new groq_sdk_1.default({ apiKey: process.env.GROQ_API_KEY });
    console.log("Testing Groq...");
    const models = await groq.models.list();
    console.log(models.data.map(m => m.id).filter(id => id.includes('whisper') || id.includes('vision')));
}
run().catch(console.error);
//# sourceMappingURL=test-groq.js.map