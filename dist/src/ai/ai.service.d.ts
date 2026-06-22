import { ConfigService } from '@nestjs/config';
export type MessagePart = {
    text: string;
} | {
    inlineData: {
        mimeType: string;
        data: string;
    };
};
export declare class AiService {
    private configService;
    private readonly logger;
    private gemini;
    constructor(configService: ConfigService);
    private getSystemPrompt;
    generateReply(history: {
        role: 'user' | 'model';
        content: string;
    }[], currentParts: MessagePart[], userName?: string, options?: {
        isContact: boolean;
        isGroup: boolean;
        isFirstTime: boolean;
    }): Promise<{
        text: string;
        audioBuffer?: Buffer;
        scheduleInfo?: {
            minutes: number;
            text: string;
        };
        reactionEmoji?: string;
    }>;
}
