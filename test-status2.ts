import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH!;
  const sessionString = process.env.TELEGRAM_STRING_SESSION!;

  const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, { connectionRetries: 1 });
  await client.connect();

  const users = await client.invoke(new Api.users.GetUsers({ id: ['me'] }));
  const me = users[0] as any;
  console.log("Fresh status:", me.status?.className);

  process.exit(0);
}
run();
