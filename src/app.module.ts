import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TelegramModule } from "./telegram/telegram.module";
import { KeepAliveModule } from "./keep-alive/keep-alive.module";
import { AppController } from "./app.controller";
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TelegramModule,
    KeepAliveModule,
  ],
  controllers: [AppController],
})
export class AppModule {}