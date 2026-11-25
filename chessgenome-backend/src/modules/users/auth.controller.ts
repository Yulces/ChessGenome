import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { UsersService } from './users.service';
import { JwtGuard, type AuthedRequest } from './jwt.guard';

class RegisterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  nick!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(120)
  password!: string;
}

class LoginDto {
  @IsString()
  @MinLength(1)
  nick!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly users: UsersService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.users.register(dto.nick, dto.password);
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.users.login(dto.nick, dto.password);
  }

  @Get('me')
  @UseGuards(JwtGuard)
  async me(@Req() req: AuthedRequest) {
    return this.users.me(req.user!.sub);
  }
}
