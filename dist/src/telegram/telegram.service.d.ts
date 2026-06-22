import { OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiService } from "../ai/ai.service";
export declare class TelegramService implements OnModuleInit {
    private configService;
    private aiService;
    private client;
    private me;
    private readonly logger;
    private readonly MAX_HISTORY;
    private pendingMessages;
    private readonly DEBOUNCE_TIME;
    private botSentMessageIds;
    constructor(configService: ConfigService, aiService: AiService);
    onModuleInit(): Promise<void>;
    private findPendingKeyByPeer;
    private listenForRawEvents;
    private listenForMessages;
    private ensureUserExists;
    private processGroupedMessages;
    private sleep;
}
