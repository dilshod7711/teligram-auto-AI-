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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AiService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const genai_1 = require("@google/genai");
const googleTTS = __importStar(require("google-tts-api"));
const axios_1 = __importDefault(require("axios"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let AiService = AiService_1 = class AiService {
    configService;
    logger = new common_1.Logger(AiService_1.name);
    gemini;
    constructor(configService) {
        this.configService = configService;
        const geminiKey = this.configService.get('GEMINI_API_KEY');
        if (!geminiKey) {
            this.logger.warn('⚠️ GEMINI_API_KEY .env da topilmadi!');
        }
        this.gemini = new genai_1.GoogleGenAI({ apiKey: geminiKey || '' });
    }
    getSystemPrompt(options) {
        let knowledge = '';
        try {
            const p = path.join(process.cwd(), 'knowledge.txt');
            if (fs.existsSync(p)) {
                knowledge = fs.readFileSync(p, 'utf-8');
            }
        }
        catch (e) {
            this.logger.warn('knowledge.txt oqishda xatolik');
        }
        return `
Sen "D" — Dilshodning shaxsiy AI yordamchisisisan. Lekin o'zingni Dilshoddek tutasan!
Sening YAGONA vazifang: Xabarlarga xuddi TIRIK INSON kabi, tabiiy javob berish. AI ekanligingni bildirma.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧍 DILSHOD HAQIDA BAZA (SHU YERDAN O'QIB JAVOB BER)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${knowledge}

${options?.isFirstTime && (!options?.isContact || options?.isGroup) ? `
⚠️ DIQQAT: YORDAMCHI REJIMI!
Bu odam yuboruvchilar ro'yxatida yo'q (tanish emas) va senga birinchi marta yozyapti. Yoki bu guruhda senga birinchi marta murojaat qilinmoqda.
Bunday holatda DILSHODDEK EMAS, balki uning RASMIY YORDAMCHISIDEK javob berishing SHART!
Javob namunasi: "Assalomu alaykum. Dilshodbek hozir band edilar, men u kishining yordamchilariman. Uzr, kim deb qo'yay? Nima masala edi?"
Ushbu qoidani BIZBUZMASDAN bajaring! (Faqat shu xabarga).
` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗣️ YOZISH USLUBI — ENG MUHIM QOIDA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Adabiy tildan mutlaqo foydalanma. Xalqchil, oddiy, shevada yoz.
- Qisqa javob ber (1-3 jumla).
- O'zbek shevasi, xato imlo va slenglarni to'g'ri tushun.

🎙️ AUDIO VA RASMLAR (MULTIMODAL):
- RASM yuborilsa: Uni yaxshilab ko'rib, rasm haqida odamdek qiziqarli gapir.
- OVOZLI xabar yuborilsa: Ohangiga e'tibor ber. Eshitgan narsangga javob qaytar.
- OVOZLI JAVOB QAYTARISH: Agar javobni ovozli xabar shaklida jo'natmoqchi bo'lsang, xabar boshida [VOICE] deb yoz.

⏰ ESLATMALAR VA REJALAR (SCHEDULER):
- Agar kimdir "Ertaga soat 9 da eslat", "1 soatdan keyin falon narsani yozvor" deb so'rasa, maxsus buyruq ishlata olasan.
- Buyruq formati: [SCHEDULE:MINUTES,Xabar matni] (masalan: [SCHEDULE:60,Brat qayerdasiz ko'rishaylik])
- "Ertaga" kabi narsalarni minutga o'girib yoz. (Masalan, hozir tunda "Ertaga ertalab" desa ~ 600 minut (10 soat)).
- Agar ushbu tag ishlatsang, oddiy matnda: "Xo'p, vaqti kelganda eslatib qo'yaman" deb javob ber va eng oxirida shu tagni qoldir.

🔥 SO'KINISH QOIDASI:
- Agar u to'g'ridan-to'g'ri haqorat qilsa ("jalla", "dalbayob"), DARHOL qaytarib so'k!

👍 REAKSIYALAR (Reactions):
- Agar suhbatdoshingiz kulgili yoki qiziq narsa yozsa, yozma javob bermasdan shunchaki reaksiya bosishni xohlasangiz: [REACT:❤️] yoki [REACT:👍] yoki [REACT:😂] yoki [REACT:🔥] deb yozing.
- Bunday holda sizning matningiz yuborilmaydi, faqat o'sha xabarga reaksiya bosiladi.

✅ MAQSAD:
AI liging bilinmasin.
    `;
    }
    async generateReply(history, currentParts, userName, options) {
        const formattedHistory = history.map(msg => ({
            role: msg.role,
            parts: [{ text: msg.content }]
        }));
        let userContext = '';
        if (userName)
            userContext += `Xabar yuboruvchi: ${userName}\n`;
        const finalParts = [];
        if (userContext)
            finalParts.push({ text: userContext });
        finalParts.push(...currentParts);
        formattedHistory.push({
            role: 'user',
            parts: finalParts
        });
        try {
            const response = await this.gemini.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: formattedHistory,
                config: {
                    systemInstruction: this.getSystemPrompt(options),
                    temperature: 0.8,
                    maxOutputTokens: 300,
                }
            });
            let text = response.text?.trim() || '';
            let audioBuffer = undefined;
            let scheduleInfo = undefined;
            let reactionEmoji = undefined;
            const reactMatch = text.match(/\\[REACT:(.*?)\\]/);
            if (reactMatch) {
                reactionEmoji = reactMatch[1].trim();
                text = text.replace(reactMatch[0], '').trim();
                this.logger.log(`👍 Reaksiya aniqlandi: ${reactionEmoji}`);
            }
            const scheduleMatch = text.match(/\\[SCHEDULE:(\\d+),(.*?)\\]/);
            if (scheduleMatch) {
                scheduleInfo = {
                    minutes: parseInt(scheduleMatch[1], 10),
                    text: scheduleMatch[2].trim()
                };
                text = text.replace(scheduleMatch[0], '').trim();
                this.logger.log(`⏰ Scheduler aniqlandi: ${scheduleInfo.minutes} minutdan keyin -> ${scheduleInfo.text}`);
            }
            if (text.startsWith('[VOICE]')) {
                text = text.replace('[VOICE]', '').trim();
                try {
                    const url = googleTTS.getAudioUrl(text.slice(0, 200), {
                        lang: 'uz',
                        slow: false,
                        host: 'https://translate.google.com',
                    });
                    const audioRes = await axios_1.default.get(url, { responseType: 'arraybuffer' });
                    audioBuffer = Buffer.from(audioRes.data, 'binary');
                }
                catch (e) {
                    this.logger.error("TTS xatosi", e);
                }
            }
            return { text, audioBuffer, scheduleInfo, reactionEmoji };
        }
        catch (error) {
            this.logger.warn(`⚠️ [gemini] Xato: ${error?.message?.slice(0, 80)}`);
        }
        return { text: userName ? `${userName}, hozir biroz bandman` : 'Hozir bandman' };
    }
};
exports.AiService = AiService;
exports.AiService = AiService = AiService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AiService);
//# sourceMappingURL=ai.service.js.map