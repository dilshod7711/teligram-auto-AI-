import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('send-code')
  async sendCode(@Body('phoneNumber') phoneNumber: string) {
    return this.authService.sendCode(phoneNumber);
  }

  @Post('login')
  async login(
    @Body('phoneNumber') phoneNumber: string,
    @Body('phoneCodeHash') phoneCodeHash: string,
    @Body('code') code: string,
    @Body('firstName') firstName: string,
    @Body('lastName') lastName: string,
    @Body('knowledge') knowledge: string,
  ) {
    return this.authService.login(phoneNumber, phoneCodeHash, code, firstName, lastName, knowledge);
  }
}
