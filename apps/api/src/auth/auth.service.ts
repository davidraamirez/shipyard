import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import { LoginDto } from './dto/login.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(data: RegisterDto) {
    const passwordHash = await hash(data.password, 12);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: data.email,
          name: data.name,
          passwordHash,
        },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
        },
      });

      return user;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya existe un usuario con ese email',
        );
      }

      throw error;
    }
  }
  
  async login(data: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const passwordMatches = await compare(
      data.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });

    return {
      access_token: accessToken,
    };
  }
}