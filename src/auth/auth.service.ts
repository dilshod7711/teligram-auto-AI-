import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram';
import { PrismaClient } from '@prisma/client';
import { TelegramService } from '../telegram/telegram.service';

const prisma = new PrismaClient();

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  
  // Store temporary clients during the login flow
  private pendingClients = new Map<string, TelegramClient>();

  constructor(
    private configService: ConfigService,
    private telegramService: TelegramService
  ) {}

  async sendCode(phoneNumber: string): Promise<{ phoneCodeHash: string }> {
    const apiId = Number(this.configService.get("TELEGRAM_API_ID"));
    const apiHash = this.configService.get<string>("TELEGRAM_API_HASH");

    if (!apiId || !apiHash) {
      throw new Error('TELEGRAM_API_ID or TELEGRAM_API_HASH is not configured.');
    }

    const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
      connectionRetries: 5,
    });

    await client.connect();

    try {
      const result = await client.sendCode(
        {
          apiId,
          apiHash,
        },
        phoneNumber
      );

      this.pendingClients.set(phoneNumber, client);

      // Clean up if they don't complete login within 5 minutes
      setTimeout(() => {
        if (this.pendingClients.has(phoneNumber)) {
          const c = this.pendingClients.get(phoneNumber);
          c?.disconnect();
          this.pendingClients.delete(phoneNumber);
        }
      }, 5 * 60 * 1000);

      return { phoneCodeHash: result.phoneCodeHash };
    } catch (error: any) {
      this.logger.error(`Failed to send code to ${phoneNumber}:`, error);
      await client.disconnect();
      throw new BadRequestException(error.message || 'Failed to send code');
    }
  }

  async login(
    phoneNumber: string, 
    phoneCodeHash: string, 
    code: string,
    firstName: string,
    lastName: string,
    knowledge: string
  ): Promise<{ success: boolean; botAccountId: number }> {
    const client = this.pendingClients.get(phoneNumber);
    if (!client) {
      throw new BadRequestException('Session expired or code not requested. Please request code again.');
    }

    try {
      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber,
          phoneCodeHash,
          phoneCode: code,
        })
      );

      const sessionString = (client.session as StringSession).save();

      // Ensure we don't leak temporary clients
      this.pendingClients.delete(phoneNumber);
      await client.disconnect();

      // Save to DB
      const botAccount = await prisma.botAccount.upsert({
        where: { phoneNumber },
        update: { sessionString, firstName, lastName, knowledge },
        create: { phoneNumber, sessionString, firstName, lastName, knowledge },
      });

      // Start the bot dynamically
      await this.telegramService.startClientForAccount(botAccount);

      return { success: true, botAccountId: botAccount.id };
    } catch (error: any) {
      this.logger.error(`Failed to login for ${phoneNumber}:`, error);
      throw new BadRequestException(error.message || 'Failed to verify code');
    }
  }
}
