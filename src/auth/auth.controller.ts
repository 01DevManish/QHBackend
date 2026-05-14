// @ts-nocheck
import { Controller, Post, Get, Body, Req, Res, Headers } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { DatabaseService } from '../database/database.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly db: DatabaseService
  ) {}

  @Post('send-otp')
  async sendOtp(@Body() body: { phone: string }, @Headers('user-agent') userAgent: string, @Res() res: Response) {
    try {
      const phone = this.authService.normalizePhone(String(body.phone ?? ''));
      if (!/^\+[1-9]\d{9,14}$/.test(phone)) {
        return res.status(400).json({ error: 'Enter a valid phone number with country code.' });
      }

      const otp = String(Math.floor(Math.random() * (999999 - 100000 + 1)) + 100000);
      const otpHash = this.authService.hashOtp(phone, otp);

      await this.db.query(
        `insert into auth_otp_requests (phone_e164, otp_hash, expires_at, user_agent)
         values ($1, $2, now() + interval '10 minutes', $3)`,
        [phone, otpHash, userAgent || null]
      );

      return res.json({
        ok: true,
        phone,
        devOtp: process.env.NODE_ENV === 'production' ? undefined : otp,
      });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Could not send OTP.' });
    }
  }

  @Post('verify-otp')
  async verifyOtp(@Body() body: { phone: string, otp: string }, @Res() res: Response) {
    try {
      const phone = this.authService.normalizePhone(String(body.phone ?? ''));
      const otp = String(body.otp ?? '').replace(/\D/g, '');

      if (!/^\+[1-9]\d{9,14}$/.test(phone) || otp.length !== 6) {
        return res.status(400).json({ error: 'Enter a valid phone number and 6-digit OTP.' });
      }

      const otpResult = await this.db.query(
        `select id, otp_hash, attempts, max_attempts
         from auth_otp_requests
         where phone_e164 = $1
           and purpose = 'login'
           and is_verified = false
           and consumed_at is null
           and expires_at > now()
         order by created_at desc
         limit 1`,
        [phone]
      );

      const otpRow = otpResult.rows[0];
      if (!otpRow) {
        return res.status(400).json({ error: 'OTP expired. Please request a new OTP.' });
      }

      if (otpRow.attempts >= otpRow.max_attempts) {
        return res.status(429).json({ error: 'Too many attempts. Please request a new OTP.' });
      }

      if (otpRow.otp_hash !== this.authService.hashOtp(phone, otp)) {
        await this.db.query('update auth_otp_requests set attempts = attempts + 1 where id = $1', [otpRow.id]);
        return res.status(400).json({ error: 'Incorrect OTP.' });
      }

      await this.db.query(
        'update auth_otp_requests set is_verified = true, consumed_at = now(), attempts = attempts + 1 where id = $1',
        [otpRow.id]
      );

      const userResult = await this.db.query(
        `insert into users (phone_e164, last_login_at)
         values ($1, now())
         on conflict (phone_e164) do update
         set last_login_at = now(), updated_at = now()
         returning id, phone_e164, full_name, email`,
        [phone]
      );

      const user = userResult.rows[0];

      const token = this.authService.signToken({
        sub: user.id,
        role: 'customer',
        phone: user.phone_e164,
      }, 60 * 60 * 24 * 30);

      res.cookie('qh_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 30 * 1000,
        path: '/',
      });

      return res.json({
        ok: true,
        authenticated: true,
        user: {
          id: user.id,
          phone: user.phone_e164,
          name: user.full_name,
          email: user.email,
          role: 'customer',
        },
        token,
      });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Could not verify OTP.' });
    }
  }

  @Get('me')
  async me(@Req() req: Request, @Res() res: Response) {
    const token = req.cookies?.qh_token;
    if (!token) return res.status(401).json({ authenticated: false, error: 'Not authenticated' });

    const payload = this.authService.verifyToken(token);
    if (!payload) return res.status(401).json({ authenticated: false, error: 'Invalid token' });

    if (payload.sub === 'static-admin-id') {
      return res.json({
        authenticated: true,
        user: {
          id: 'static-admin-id',
          email: process.env.ADMIN_EMAIL || 'admin@quirkyhome.in',
          name: 'System Admin',
          role: 'admin'
        }
      });
    }

    if (payload.role === 'customer') {
      const result = await this.db.query('select id, phone_e164, full_name, email from users where id = $1', [payload.sub]);
      if (!result.rows[0]) return res.status(404).json({ authenticated: false, error: 'User not found' });
      return res.json({
        authenticated: true,
        user: {
          id: result.rows[0].id,
          phone: result.rows[0].phone_e164,
          name: result.rows[0].full_name,
          email: result.rows[0].email,
          role: 'customer'
        }
      });
    }

    if (payload.role === 'team' || payload.role === 'admin') {
      const result = await this.db.query('select id, email, full_name, role from team_users where id = $1', [payload.sub]);
      if (!result.rows[0]) return res.status(404).json({ authenticated: false, error: 'Team member not found' });
      return res.json({
        authenticated: true,
        user: {
          id: result.rows[0].id,
          email: result.rows[0].email,
          name: result.rows[0].full_name,
          role: result.rows[0].role
        }
      });
    }

    return res.status(401).json({ authenticated: false, error: 'Invalid role' });
  }

  @Post('logout')
  async logout(@Res() res: Response) {
    res.cookie('qh_token', '', { maxAge: 0, path: '/' });
    return res.json({ ok: true });
  }

  @Post('team-login')
  async teamLogin(@Body() body: any, @Res() res: Response) {
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const staticEmail = (process.env.ADMIN_EMAIL || 'admin@quirkyhome.in').toLowerCase();
    const staticPassword = process.env.ADMIN_PASSWORD || 'admin123';

    if (email === staticEmail && password === staticPassword) {
      const token = this.authService.signToken({
        sub: 'static-admin-id',
        role: 'admin',
        email: staticEmail,
      });

      res.cookie('qh_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 7 * 1000,
        path: '/',
      });

      return res.json({ ok: true, authenticated: true, user: { id: 'static-admin-id', email: staticEmail, role: 'admin' }, token });
    }

    const result = await this.db.query('select id, email, role, password_hash, is_active from team_users where email = $1', [email]);
    const user = result.rows[0];

    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    if (!user.is_active) return res.status(403).json({ error: 'Account disabled.' });
    
    if (!this.authService.verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    await this.db.query('update team_users set last_login_at = now() where id = $1', [user.id]);

    const token = this.authService.signToken({
      sub: user.id,
      role: user.role as 'team' | 'admin',
      email: user.email,
    });

    res.cookie('qh_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7 * 1000,
      path: '/',
    });

    return res.json({ ok: true, authenticated: true, user: { id: user.id, email: user.email, role: user.role }, token });
  }
}
