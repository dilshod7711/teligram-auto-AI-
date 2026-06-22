import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TelegramModule } from "./telegram/telegram.module";
import { KeepAliveModule } from "./keep-alive/keep-alive.module";
import { AuthModule } from "./auth/auth.module";
import { AppController } from "./app.controller";
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'public'),
    }),
    ScheduleModule.forRoot(),
    TelegramModule,
    AuthModule,
    KeepAliveModule,
  ],
  controllers: [AppController],
})
export class AppModule {}