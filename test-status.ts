import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH!;
  const sessionString = process.env.TELEGRAM_STRING_SESSION!;

  const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, { connectionRetries: 1 });
  await client.connect();

  const me: any = await client.getEntity("me");
  console.log("My status:", me.status.className);

  process.exit(0);
}
run();
