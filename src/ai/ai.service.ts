import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import * as googleTTS from 'google-tts-api';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

export type MessagePart = 
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private gemini: GoogleGenAI;

  constructor(private configService: ConfigService) {
    const geminiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!geminiKey) {
      this.logger.warn('⚠️ GEMINI_API_KEY .env da topilmadi!');
    }
    this.gemini = new GoogleGenAI({ apiKey: geminiKey || '' });
  }

  private getSystemPrompt(options?: { isContact: boolean; isGroup: boolean; isFirstTime: boolean }): string {
    let knowledge = '';
    try {
      const p = path.join(process.cwd(), 'knowledge.txt');
      if (fs.existsSync(p)) {
        knowledge = fs.readFileSync(p, 'utf-8');
      }
    } catch (e) {
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

  async generateReply(
    history: { role: 'user' | 'model', content: string }[], 
    currentParts: MessagePart[],
    userName?: string,
    options?: { isContact: boolean; isGroup: boolean; isFirstTime: boolean }
  ): Promise<{ text: string; audioBuffer?: Buffer; scheduleInfo?: { minutes: number; text: string }; reactionEmoji?: string }> {
    
    const formattedHistory = history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.content }]
    }));

    let userContext = '';
    if (userName) userContext += `Xabar yuboruvchi: ${userName}\n`;

    const finalParts: any[] = [];
    if (userContext) finalParts.push({ text: userContext });
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
      let audioBuffer: Buffer | undefined = undefined;
      let scheduleInfo: { minutes: number; text: string } | undefined = undefined;
      let reactionEmoji: string | undefined = undefined;

      // Reaksiya buyrug'ini qidirish
      const reactMatch = text.match(/\\[REACT:(.*?)\\]/);
      if (reactMatch) {
        reactionEmoji = reactMatch[1].trim();
        text = text.replace(reactMatch[0], '').trim();
        this.logger.log(`👍 Reaksiya aniqlandi: ${reactionEmoji}`);
      }

      // Jadval buyrug'ini qidirish
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
           const audioRes = await axios.get(url, { responseType: 'arraybuffer' });
           audioBuffer = Buffer.from(audioRes.data, 'binary');
        } catch (e) {
           this.logger.error("TTS xatosi", e);
        }
      }

      return { text, audioBuffer, scheduleInfo, reactionEmoji };

    } catch (error: any) {
      this.logger.warn(`⚠️ [gemini] Xato: ${error?.message?.slice(0, 80)}`);
    }

    return { text: userName ? `${userName}, hozir biroz bandman` : 'Hozir bandman' };
  }
}
