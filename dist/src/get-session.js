"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const telegram_1 = require("telegram");
const index_js_1 = require("telegram/sessions/index.js");
const readline = __importStar(require("readline"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
function question(prompt) {
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
    const client = new telegram_1.TelegramClient(new index_js_1.StringSession(""), apiId, apiHash, { connectionRetries: 5 });
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
//# sourceMappingURL=get-session.js.map