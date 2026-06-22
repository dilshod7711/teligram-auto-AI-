import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { AiService, MessagePart } from "../ai/ai.service";
import { PrismaClient } from "@prisma/client";
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const prisma = new PrismaClient();

@Injectable()
export class TelegramService implements OnModuleInit {
  private client: TelegramClient;
  private me: any;
  private readonly logger = new Logger(TelegramService.name);

  private readonly MAX_HISTORY = 40;

  private pendingMessages = new Map<string, { 
    parts: MessagePart[], 
    timer: NodeJS.Timeout, 
    firstName: string | undefined, 
    peer: any,
    lastMessageId: number,
    isContact: boolean,
    isGroup: boolean
  }>();
  private readonly DEBOUNCE_TIME = 5000;
  private botSentMessageIds = new Set<number>();

  constructor(
    private configService: ConfigService,
    private aiService: AiService,
  ) {}

  async onModuleInit() {
    const apiId = Number(this.configService.get("TELEGRAM_API_ID"));
    const apiHash = this.configService.get<string>("TELEGRAM_API_HASH");
    const sessionString = this.configService.get<string>("TELEGRAM_STRING_SESSION");

    this.client = new TelegramClient(
      new StringSession(sessionString),
      apiId,
      apiHash!,
      { connectionRetries: 5 }
    );

    await this.client.connect();
    this.me = await this.client.getMe();
    this.logger.log(`Telegram userbot ulandi ✅ (User: ${this.me.firstName})`);

    this.listenForRawEvents();
    this.listenForMessages();
  }

  private findPendingKeyByPeer(peerId: string): string | undefined {
    for (const [key, pending] of this.pendingMessages.entries()) {
      if (key.includes(peerId) || pending.peer?.id?.toString() === peerId) {
        return key;
      }
    }
    return undefined;
  }

  private listenForRawEvents() {
    this.client.addEventHandler((update: any) => {
      if (!update) return;
      if (update.className === 'UpdateReadHistoryInbox' || update.className === 'UpdateReadChannelInbox' || update.className === 'UpdateUserTyping') {
        const peerId = update.peer?.userId?.toString() || update.peer?.channelId?.toString() || update.peer?.chatId?.toString();
        if (peerId) {
          const chatKey = this.findPendingKeyByPeer(peerId);
          if (chatKey && this.pendingMessages.has(chatKey)) {
            clearTimeout(this.pendingMessages.get(chatKey)!.timer);
            this.pendingMessages.delete(chatKey);
            this.logger.log(`📱 Siz chatga kirdingiz yoki yozdingiz. Chat: ${peerId} uchun AI javobi to'xtatildi.`);
          }
        }
      }
    });
  }

  private listenForMessages() {
    this.client.addEventHandler(
      async (event: NewMessageEvent) => {
        const message = event.message;

        if (message.out) {
           if (this.botSentMessageIds.has(message.id)) {
               this.botSentMessageIds.delete(message.id);
           } else {
               const peerId = (message.peerId as any)?.userId?.toString() || (message.peerId as any)?.channelId?.toString() || (message.peerId as any)?.chatId?.toString();
               if (peerId) {
                   const chatKey = this.findPendingKeyByPeer(peerId);
                   if (chatKey && this.pendingMessages.has(chatKey)) {
                       clearTimeout(this.pendingMessages.get(chatKey)!.timer);
                       this.pendingMessages.delete(chatKey);
                       this.logger.log(`📱 Siz qo'lda xabar yozdingiz. AI to'xtatildi.`);
                   }
               }
           }
           return;
        }

        let shouldReply = false;
        
        if (message.isPrivate) {
          shouldReply = true;
        } else {
          // Guruh xabarlari: agar sizga reply qilsa yoki @mension qilsa
          if (message.mentioned) {
             shouldReply = true;
          } else if (message.replyTo) {
             try {
                const repliedMsg = await message.getReplyMessage() as any;
                if (repliedMsg && repliedMsg.senderId?.toString() === this.me.id.toString()) {
                  shouldReply = true;
                }
             } catch (e) {}
          }
        }

        if (!shouldReply) return;

        const sender = await message.getSender() as any;
        if (sender?.bot === true) return;

        const isContact = sender?.contact === true;
        const isGroup = !message.isPrivate;

        const senderId = sender?.id?.toString() || (message.peerId as any)?.userId?.toString();
        if (!senderId) return;

        const firstName = sender?.firstName as string | undefined;
        let textPart = message.text || '';
        
        const newParts: MessagePart[] = [];

        if (textPart.trim()) {
           newParts.push({ text: textPart });
        }

        if (message.photo || message.voice || message.videoNote) {
            try {
              const buffer = await message.downloadMedia();
              if (buffer) {
                const base64 = (buffer as Buffer).toString('base64');
                let mimeType = 'application/octet-stream';
                if (message.photo) mimeType = 'image/jpeg';
                if (message.voice) mimeType = 'audio/ogg';
                if (message.videoNote) mimeType = 'video/mp4';

                newParts.push({ inlineData: { data: base64, mimeType } });
              }
            } catch (err) {
              this.logger.warn("Media yuklashda xatolik");
            }
        }

        if (newParts.length === 0) return; 

        const peer = await message.getChat();
        if (!peer) return;



        const chatKey = message.isPrivate ? senderId : `${peer.id.toString()}_${senderId}`;

        if (this.pendingMessages.has(chatKey)) {
          const pending = this.pendingMessages.get(chatKey)!;
          pending.parts.push(...newParts);
          pending.lastMessageId = message.id;
          clearTimeout(pending.timer);
          pending.timer = setTimeout(() => this.processGroupedMessages(chatKey, senderId), this.DEBOUNCE_TIME);
        } else {
          await this.ensureUserExists(senderId, firstName);

          this.pendingMessages.set(chatKey, {
            parts: [...newParts],
            firstName,
            peer,
            lastMessageId: message.id,
            isContact,
            isGroup,
            timer: setTimeout(() => this.processGroupedMessages(chatKey, senderId), this.DEBOUNCE_TIME)
          });
        }
      },
      new NewMessage({})
    );
  }

  private async ensureUserExists(userId: string, firstName?: string) {
    try {
      await prisma.user.upsert({
        where: { id: userId },
        update: { firstName },
        create: { id: userId, firstName }
      });
    } catch(e) {}
  }

  private async processGroupedMessages(chatKey: string, senderId: string) {
    const pending = this.pendingMessages.get(chatKey);
    if (!pending) return;
    this.pendingMessages.delete(chatKey);

    // Xabarni o'qilgan qilish (ReadHistory)
    if (pending.peer) {
      try {
        await this.client.invoke(new (require("telegram/tl").Api.messages.ReadHistory)({
          peer: pending.peer,
          maxId: pending.lastMessageId,
        }));
      } catch (e) {}
    }

    // O'qigandan so'ng xuddi odamdek ozgina o'ylab turish (1 soniya)
    await this.sleep(1000);

    const dbMessages = await prisma.message.findMany({
      where: { userId: senderId },
      orderBy: { createdAt: 'asc' },
      take: this.MAX_HISTORY
    });

    const userHistory = dbMessages.map(m => ({ role: m.role as 'user' | 'model', content: m.content }));

    const textOnly = pending.parts
       .map(p => 'text' in p ? p.text : (p.inlineData.mimeType.startsWith('image') ? '[Rasm]' : '[Audio/Video]'))
       .join('\n');

    await prisma.message.create({
      data: {
        userId: senderId,
        role: 'user',
        content: textOnly
      }
    });

    this.logger.log(`📩 Xabar: ${pending.firstName ?? senderId} → "${textOnly.slice(0, 50)}"`);

    try {
      let isTyping = true;
      const typingInterval = setInterval(async () => {
        if (!isTyping) return;
        await this.client.invoke(new (require("telegram/tl").Api.messages.SetTyping)({
          peer: pending.peer,
          action: new (require("telegram/tl").Api.SendMessageTypingAction)(),
        })).catch(() => {});
      }, 4000);

      const isFirstTime = dbMessages.length === 0;

      const aiResponse = await this.aiService.generateReply(userHistory, pending.parts, pending.firstName, {
        isContact: pending.isContact,
        isGroup: pending.isGroup,
        isFirstTime
      });

      isTyping = false;
      clearInterval(typingInterval);

      if (aiResponse.reactionEmoji) {
        try {
          await this.client.invoke(new (require("telegram/tl").Api.messages.SendReaction)({
            peer: pending.peer,
            msgId: pending.lastMessageId,
            reaction: [new (require("telegram/tl").Api.ReactionEmoji)({ emoticon: aiResponse.reactionEmoji })]
          }));
          this.logger.log(`👍 Reaksiya bosildi: ${aiResponse.reactionEmoji}`);
        } catch (e) {
          this.logger.warn("Reaksiya bosishda xato");
        }
      }

      if (aiResponse.scheduleInfo) {
         const ms = aiResponse.scheduleInfo.minutes * 60 * 1000;
         setTimeout(async () => {
            await this.client.sendMessage(pending.peer, { message: aiResponse.scheduleInfo!.text });
            this.logger.log(`⏰ Eslatma yuborildi: ${aiResponse.scheduleInfo!.text}`);
         }, ms);
      }

      if (aiResponse.text || aiResponse.audioBuffer) {
        
        await prisma.message.create({
          data: {
             userId: senderId,
             role: 'model',
             content: aiResponse.text || '[Audio Javob]'
          }
        });

        const typeDelay = Math.min((aiResponse.text.length) * 30, 6000);
        
        // Smart Typing: Ovoz yoki Matn ekanligiga qarab harakat
        const typingAction = aiResponse.audioBuffer 
          ? new (require("telegram/tl").Api.SendMessageRecordAudioAction)()
          : new (require("telegram/tl").Api.SendMessageTypingAction)();

        await this.client.invoke(new (require("telegram/tl").Api.messages.SetTyping)({
          peer: pending.peer,
          action: typingAction,
        })).catch(() => {});
        
        await this.sleep(typeDelay);

        if (aiResponse.audioBuffer) {
           const tempFile = path.join(os.tmpdir(), `tts_${Date.now()}.mp3`);
           fs.writeFileSync(tempFile, aiResponse.audioBuffer);
           const sent = await this.client.sendMessage(pending.peer, { file: tempFile, voiceNote: true } as any);
           this.botSentMessageIds.add(sent.id);
        } else {
           const finalText = isFirstTime 
             ? aiResponse.text + "\n\n— 🤖 Dilshodning AI yordamchisi"
             : aiResponse.text;
           const sent = await this.client.sendMessage(pending.peer, { message: finalText });
           this.botSentMessageIds.add(sent.id);
        }
        
        this.logger.log(`✅ Javob yuborildi → ${pending.firstName ?? senderId}`);
      }
    } catch (error) {
       this.logger.error("Javob berishda xato:", error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}