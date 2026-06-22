import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TelegramModule } from "./telegram/telegram.module";
import { KeepAliveModule } from "./keep-alive/keep-alive.module";

import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TelegramModule,
    KeepAliveModule,
  ],
})
export class AppModule {}