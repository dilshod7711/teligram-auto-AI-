import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { AiService, MessagePart } from "../ai/ai.service";
import { PrismaClient, BotAccount } from "@prisma/client";
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const prisma = new PrismaClient();

@Injectable()
export class TelegramService implements OnModuleInit {
  private clients = new Map<number, TelegramClient>();
  private readonly logger = new Logger(TelegramService.name);

  private readonly MAX_HISTORY = 40;
  private readonly DEBOUNCE_TIME = 5000;

  // We need to partition pending messages by botAccountId as well
  private pendingMessages = new Map<string, { 
    parts: MessagePart[], 
    timer: NodeJS.Timeout, 
    firstName: string | undefined, 
    peer: any,
    lastMessageId: number,
    isContact: boolean,
    isGroup: boolean
  }>();
  
  private botSentMessageIds = new Set<string>();
  
  // Track the last time the user was active on Telegram
  private userActiveTimes = new Map<number, number>();

  constructor(
    private configService: ConfigService,
    private aiService: AiService,
  ) {}

  async onModuleInit() {
    const accounts = await prisma.botAccount.findMany();
    this.logger.log(`Found ${accounts.length} bot accounts in database.`);
    
    for (const account of accounts) {
      await this.startClientForAccount(account);
    }
  }

  async startClientForAccount(account: BotAccount) {
    if (this.clients.has(account.id)) {
      this.logger.warn(`Client for account ${account.phoneNumber} already running.`);
      return;
    }

    const apiId = Number(this.configService.get("TELEGRAM_API_ID"));
    const apiHash = this.configService.get<string>("TELEGRAM_API_HASH");

    if (!apiId || !apiHash) {
      this.logger.error("TELEGRAM_API_ID or TELEGRAM_API_HASH missing in .env");
      return;
    }

    const client = new TelegramClient(
      new StringSession(account.sessionString),
      apiId,
      apiHash,
      { connectionRetries: 5 }
    );

    try {
      await client.connect();
      const me = await client.getMe();
      this.clients.set(account.id, client);
      this.logger.log(`Telegram userbot ulandi ✅ (App: ${account.firstName}, TG User: ${(me as any).firstName})`);

      this.listenForRawEvents(client, account.id, me);
      this.listenForMessages(client, account, me);
    } catch (e: any) {
      this.logger.error(`Failed to start client for ${account.phoneNumber}: ${e.message}`);
    }
  }

  private findPendingKeyByPeer(accountId: number, peerId: string): string | undefined {
    const prefix = `${accountId}_`;
    for (const [key, pending] of this.pendingMessages.entries()) {
      if (!key.startsWith(prefix)) continue;
      if (key.includes(`_${peerId}`) || pending.peer?.id?.toString() === peerId) {
        return key;
      }
    }
    return undefined;
  }

  private listenForRawEvents(client: TelegramClient, accountId: number, me: any) {
    client.addEventHandler((update: any) => {
      if (!update) return;

      // Track global user online activity
      if (
        update.className === 'UpdateUserStatus' && 
        update.userId?.toString() === me.id.toString() &&
        update.status?.className === 'UserStatusOnline'
      ) {
        this.userActiveTimes.set(accountId, Date.now());
      }

      if (update.className === 'UpdateReadHistoryInbox' || update.className === 'UpdateReadChannelInbox' || update.className === 'UpdateUserTyping') {
        
        // Agar o'zi xabar o'qiyotgan yoki yozayotgan bo'lsa, uni aktiv deb belgilaymiz
        this.userActiveTimes.set(accountId, Date.now());

        const peerId = update.peer?.userId?.toString() || update.peer?.channelId?.toString() || update.peer?.chatId?.toString();
        if (peerId) {
          const chatKey = this.findPendingKeyByPeer(accountId, peerId);
          if (chatKey && this.pendingMessages.has(chatKey)) {
            clearTimeout(this.pendingMessages.get(chatKey)!.timer);
            this.pendingMessages.delete(chatKey);
            this.logger.log(`📱 Siz chatga kirdingiz yoki yozdingiz. Chat: ${peerId} uchun AI javobi to'xtatildi. (Account: ${accountId})`);
          }
        }
      }
    });
  }

  private listenForMessages(client: TelegramClient, account: BotAccount, me: any) {
    client.addEventHandler(
      async (event: NewMessageEvent) => {
        const message = event.message;

        // Global unique ID for tracking sent messages
        const globalMsgId = `${account.id}_${message.id}`;

        if (message.out) {
           if (this.botSentMessageIds.has(globalMsgId)) {
               this.botSentMessageIds.delete(globalMsgId);
           } else {
               // User actively sent a message, mark as active globally
               this.userActiveTimes.set(account.id, Date.now());

               const peerId = (message.peerId as any)?.userId?.toString() || (message.peerId as any)?.channelId?.toString() || (message.peerId as any)?.chatId?.toString();
               if (peerId) {
                   const chatKey = this.findPendingKeyByPeer(account.id, peerId);
                   if (chatKey && this.pendingMessages.has(chatKey)) {
                       clearTimeout(this.pendingMessages.get(chatKey)!.timer);
                       this.pendingMessages.delete(chatKey);
                       this.logger.log(`📱 Siz qo'lda xabar yozdingiz. AI to'xtatildi. (Account: ${account.id})`);
                   }
               }
           }
           return;
        }

        // Agar foydalanuvchi oxirgi 2 minut ichida Telegramda aktiv bo'lgan bo'lsa (online bo'lsa), AI mutlaqo javob bermaydi
        const lastActive = this.userActiveTimes.get(account.id) || 0;
        const isUserOnlineGlobally = Date.now() - lastActive < 2 * 60 * 1000;

        if (isUserOnlineGlobally) {
            return;
        }

        let shouldReply = false;
        
        if (message.isPrivate) {
          shouldReply = true;
        } else {
          // Guruh xabarlari
          if (message.mentioned) {
             shouldReply = true;
          } else if (message.replyTo) {
             try {
                const repliedMsg = await message.getReplyMessage() as any;
                if (repliedMsg && repliedMsg.senderId?.toString() === me.id.toString()) {
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

        // Make chatKey unique per bot account
        const peerIdentifier = message.isPrivate ? senderId : `${peer.id.toString()}_${senderId}`;
        const chatKey = `${account.id}_${peerIdentifier}`;

        if (this.pendingMessages.has(chatKey)) {
          const pending = this.pendingMessages.get(chatKey)!;
          pending.parts.push(...newParts);
          pending.lastMessageId = message.id;
          clearTimeout(pending.timer);
          pending.timer = setTimeout(() => this.processGroupedMessages(client, account, chatKey, senderId), this.DEBOUNCE_TIME);
        } else {
          await this.ensureUserExists(senderId, firstName);

          this.pendingMessages.set(chatKey, {
            parts: [...newParts],
            firstName,
            peer,
            lastMessageId: message.id,
            isContact,
            isGroup,
            timer: setTimeout(() => this.processGroupedMessages(client, account, chatKey, senderId), this.DEBOUNCE_TIME)
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

  private async processGroupedMessages(client: TelegramClient, account: BotAccount, chatKey: string, senderId: string) {
    const pending = this.pendingMessages.get(chatKey);
    if (!pending) return;
    this.pendingMessages.delete(chatKey);

    // Xabarlar o'qilgan qilib belgilanmasligi (unread counter qolishi) uchun o'chirib qo'yildi
    /*
    if (pending.peer) {
      try {
        await client.invoke(new (require("telegram/tl").Api.messages.ReadHistory)({
          peer: pending.peer,
          maxId: pending.lastMessageId,
        }));
      } catch (e) {}
    }
    */

    await this.sleep(1000);

    const dbMessages = await prisma.message.findMany({
      where: { userId: senderId, botAccountId: account.id },
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
        botAccountId: account.id,
        role: 'user',
        content: textOnly
      }
    });

    this.logger.log(`📩 Xabar [Acct: ${account.id}]: ${pending.firstName ?? senderId} → "${textOnly.slice(0, 50)}"`);

    try {
      let isTyping = true;
      const typingInterval = setInterval(async () => {
        if (!isTyping) return;
        await client.invoke(new (require("telegram/tl").Api.messages.SetTyping)({
          peer: pending.peer,
          action: new (require("telegram/tl").Api.SendMessageTypingAction)(),
        })).catch(() => {});
      }, 4000);

      const isFirstTime = dbMessages.length === 0;

      // Pass account context to AI
      const aiResponse = await this.aiService.generateReply(
        userHistory, 
        pending.parts, 
        pending.firstName, 
        { firstName: account.firstName, knowledge: account.knowledge },
        { isContact: pending.isContact, isGroup: pending.isGroup, isFirstTime }
      );

      isTyping = false;
      clearInterval(typingInterval);

      if (aiResponse.reactionEmoji) {
        try {
          await client.invoke(new (require("telegram/tl").Api.messages.SendReaction)({
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
            await client.sendMessage(pending.peer, { message: aiResponse.scheduleInfo!.text });
            this.logger.log(`⏰ Eslatma yuborildi: ${aiResponse.scheduleInfo!.text}`);
         }, ms);
      }

      if (aiResponse.text || aiResponse.audioBuffer) {
        
        await prisma.message.create({
          data: {
             userId: senderId,
             botAccountId: account.id,
             role: 'model',
             content: aiResponse.text || '[Audio Javob]'
          }
        });

        const typeDelay = Math.min((aiResponse.text.length) * 30, 6000);
        
        const typingAction = aiResponse.audioBuffer 
          ? new (require("telegram/tl").Api.SendMessageRecordAudioAction)()
          : new (require("telegram/tl").Api.SendMessageTypingAction)();

        await client.invoke(new (require("telegram/tl").Api.messages.SetTyping)({
          peer: pending.peer,
          action: typingAction,
        })).catch(() => {});
        
        await this.sleep(typeDelay);

        if (aiResponse.audioBuffer) {
           const tempFile = path.join(os.tmpdir(), `tts_${Date.now()}.mp3`);
           fs.writeFileSync(tempFile, aiResponse.audioBuffer);
           const sent = await client.sendMessage(pending.peer, { file: tempFile, voiceNote: true } as any);
           this.botSentMessageIds.add(`${account.id}_${sent.id}`);
        } else {
           const finalText = isFirstTime 
             ? aiResponse.text + `\n\n— 🤖 ${account.firstName}ning AI yordamchisi`
             : aiResponse.text;
           const sent = await client.sendMessage(pending.peer, { message: finalText });
           this.botSentMessageIds.add(`${account.id}_${sent.id}`);
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