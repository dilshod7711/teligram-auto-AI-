import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import * as readline from "readline";
import * as dotenv from "dotenv";

dotenv.config();

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH as string;

function question(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

(async () => {
  if (!apiId || !apiHash) {
    console.error("❌ TELEGRAM_API_ID yoki TELEGRAM_API_HASH .env da topilmadi!");
    process.exit(1);
  }

  const client = new TelegramClient(
    new StringSession(""),
    apiId,
    apiHash,
    { connectionRetries: 5 }
  );

  await client.start({
    phoneNumber: async () => await question("Telefon raqam (+998...): "),
    password: async () => await question("2FA parol (yo'q bo'lsa Enter bosing): "),
    phoneCode: async () => await question("SMS kod: "),
    onError: (err) => console.log("Xato:", err),
  });

  console.log("\n✅ Session muvaffaqiyatli olindi!");
  console.log("\nSESSION STRING — kopyalab .env ga joylashtiring:");
  console.log("=".repeat(60));
  console.log(client.session.save());
  console.log("=".repeat(60));

  await client.disconnect();
  process.exit(0);
})();
