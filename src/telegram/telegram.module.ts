import { Module } from "@nestjs/common";
import { TelegramService } from "./telegram.service";
import { AiModule } from "../ai/ai.module";

@Module({
  imports: [AiModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}