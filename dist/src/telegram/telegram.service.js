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
var TelegramService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const telegram_1 = require("telegram");
const sessions_1 = require("telegram/sessions");
const events_1 = require("telegram/events");
const ai_service_1 = require("../ai/ai.service");
const client_1 = require("@prisma/client");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const prisma = new client_1.PrismaClient();
let TelegramService = TelegramService_1 = class TelegramService {
    configService;
    aiService;
    client;
    me;
    logger = new common_1.Logger(TelegramService_1.name);
    MAX_HISTORY = 40;
    pendingMessages = new Map();
    DEBOUNCE_TIME = 5000;
    botSentMessageIds = new Set();
    constructor(configService, aiService) {
        this.configService = configService;
        this.aiService = aiService;
    }
    async onModuleInit() {
        const apiId = Number(this.configService.get("TELEGRAM_API_ID"));
        const apiHash = this.configService.get("TELEGRAM_API_HASH");
        const sessionString = this.configService.get("TELEGRAM_STRING_SESSION");
        this.client = new telegram_1.TelegramClient(new sessions_1.StringSession(sessionString), apiId, apiHash, { connectionRetries: 5 });
        await this.client.connect();
        this.me = await this.client.getMe();
        this.logger.log(`Telegram userbot ulandi ✅ (User: ${this.me.firstName})`);
        this.listenForRawEvents();
        this.listenForMessages();
    }
    findPendingKeyByPeer(peerId) {
        for (const [key, pending] of this.pendingMessages.entries()) {
            if (key.includes(peerId) || pending.peer?.id?.toString() === peerId) {
                return key;
            }
        }
        return undefined;
    }
    listenForRawEvents() {
        this.client.addEventHandler((update) => {
            if (!update)
                return;
            if (update.className === 'UpdateReadHistoryInbox' || update.className === 'UpdateReadChannelInbox' || update.className === 'UpdateUserTyping') {
                const peerId = update.peer?.userId?.toString() || update.peer?.channelId?.toString() || update.peer?.chatId?.toString();
                if (peerId) {
                    const chatKey = this.findPendingKeyByPeer(peerId);
                    if (chatKey && this.pendingMessages.has(chatKey)) {
                        clearTimeout(this.pendingMessages.get(chatKey).timer);
                        this.pendingMessages.delete(chatKey);
                        this.logger.log(`📱 Siz chatga kirdingiz yoki yozdingiz. Chat: ${peerId} uchun AI javobi to'xtatildi.`);
                    }
                }
            }
        });
    }
    listenForMessages() {
        this.client.addEventHandler(async (event) => {
            const message = event.message;
            if (message.out) {
                if (this.botSentMessageIds.has(message.id)) {
                    this.botSentMessageIds.delete(message.id);
                }
                else {
                    const peerId = message.peerId?.userId?.toString() || message.peerId?.channelId?.toString() || message.peerId?.chatId?.toString();
                    if (peerId) {
                        const chatKey = this.findPendingKeyByPeer(peerId);
                        if (chatKey && this.pendingMessages.has(chatKey)) {
                            clearTimeout(this.pendingMessages.get(chatKey).timer);
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
            }
            else {
                if (message.mentioned) {
                    shouldReply = true;
                }
                else if (message.replyTo) {
                    try {
                        const repliedMsg = await message.getReplyMessage();
                        if (repliedMsg && repliedMsg.senderId?.toString() === this.me.id.toString()) {
                            shouldReply = true;
                        }
                    }
                    catch (e) { }
                }
            }
            if (!shouldReply)
                return;
            const sender = await message.getSender();
            if (sender?.bot === true)
                return;
            const isContact = sender?.contact === true;
            const isGroup = !message.isPrivate;
            const senderId = sender?.id?.toString() || message.peerId?.userId?.toString();
            if (!senderId)
                return;
            const firstName = sender?.firstName;
            let textPart = message.text || '';
            const newParts = [];
            if (textPart.trim()) {
                newParts.push({ text: textPart });
            }
            if (message.photo || message.voice || message.videoNote) {
                try {
                    const buffer = await message.downloadMedia();
                    if (buffer) {
                        const base64 = buffer.toString('base64');
                        let mimeType = 'application/octet-stream';
                        if (message.photo)
                            mimeType = 'image/jpeg';
                        if (message.voice)
                            mimeType = 'audio/ogg';
                        if (message.videoNote)
                            mimeType = 'video/mp4';
                        newParts.push({ inlineData: { data: base64, mimeType } });
                    }
                }
                catch (err) {
                    this.logger.warn("Media yuklashda xatolik");
                }
            }
            if (newParts.length === 0)
                return;
            const peer = await message.getChat();
            if (!peer)
                return;
            const chatKey = message.isPrivate ? senderId : `${peer.id.toString()}_${senderId}`;
            if (this.pendingMessages.has(chatKey)) {
                const pending = this.pendingMessages.get(chatKey);
                pending.parts.push(...newParts);
                pending.lastMessageId = message.id;
                clearTimeout(pending.timer);
                pending.timer = setTimeout(() => this.processGroupedMessages(chatKey, senderId), this.DEBOUNCE_TIME);
            }
            else {
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
        }, new events_1.NewMessage({}));
    }
    async ensureUserExists(userId, firstName) {
        try {
            await prisma.user.upsert({
                where: { id: userId },
                update: { firstName },
                create: { id: userId, firstName }
            });
        }
        catch (e) { }
    }
    async processGroupedMessages(chatKey, senderId) {
        const pending = this.pendingMessages.get(chatKey);
        if (!pending)
            return;
        this.pendingMessages.delete(chatKey);
        if (pending.peer) {
            try {
                await this.client.invoke(new (require("telegram/tl").Api.messages.ReadHistory)({
                    peer: pending.peer,
                    maxId: pending.lastMessageId,
                }));
            }
            catch (e) { }
        }
        await this.sleep(1000);
        const dbMessages = await prisma.message.findMany({
            where: { userId: senderId },
            orderBy: { createdAt: 'asc' },
            take: this.MAX_HISTORY
        });
        const userHistory = dbMessages.map(m => ({ role: m.role, content: m.content }));
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
                if (!isTyping)
                    return;
                await this.client.invoke(new (require("telegram/tl").Api.messages.SetTyping)({
                    peer: pending.peer,
                    action: new (require("telegram/tl").Api.SendMessageTypingAction)(),
                })).catch(() => { });
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
                }
                catch (e) {
                    this.logger.warn("Reaksiya bosishda xato");
                }
            }
            if (aiResponse.scheduleInfo) {
                const ms = aiResponse.scheduleInfo.minutes * 60 * 1000;
                setTimeout(async () => {
                    await this.client.sendMessage(pending.peer, { message: aiResponse.scheduleInfo.text });
                    this.logger.log(`⏰ Eslatma yuborildi: ${aiResponse.scheduleInfo.text}`);
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
                const typingAction = aiResponse.audioBuffer
                    ? new (require("telegram/tl").Api.SendMessageRecordAudioAction)()
                    : new (require("telegram/tl").Api.SendMessageTypingAction)();
                await this.client.invoke(new (require("telegram/tl").Api.messages.SetTyping)({
                    peer: pending.peer,
                    action: typingAction,
                })).catch(() => { });
                await this.sleep(typeDelay);
                if (aiResponse.audioBuffer) {
                    const tempFile = path.join(os.tmpdir(), `tts_${Date.now()}.mp3`);
                    fs.writeFileSync(tempFile, aiResponse.audioBuffer);
                    const sent = await this.client.sendMessage(pending.peer, { file: tempFile, voiceNote: true });
                    this.botSentMessageIds.add(sent.id);
                }
                else {
                    const finalText = isFirstTime
                        ? aiResponse.text + "\n\n— 🤖 Dilshodning AI yordamchisi"
                        : aiResponse.text;
                    const sent = await this.client.sendMessage(pending.peer, { message: finalText });
                    this.botSentMessageIds.add(sent.id);
                }
                this.logger.log(`✅ Javob yuborildi → ${pending.firstName ?? senderId}`);
            }
        }
        catch (error) {
            this.logger.error("Javob berishda xato:", error);
        }
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
};
exports.TelegramService = TelegramService;
exports.TelegramService = TelegramService = TelegramService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        ai_service_1.AiService])
], TelegramService);
//# sourceMappingURL=telegram.service.js.map