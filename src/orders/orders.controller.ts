import { Controller, Get, Post, Body, Headers, HttpException, HttpStatus } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { AuthService } from '../auth/auth.service';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly authService: AuthService,
  ) {}

  private getAuth(authHeader: string) {
    if (!authHeader) throw new HttpException('Not authenticated', HttpStatus.UNAUTHORIZED);
    const token = authHeader.replace('Bearer ', '');
    const auth = this.authService.verifyToken(token);
    if (!auth) throw new HttpException('Not authenticated', HttpStatus.UNAUTHORIZED);
    return auth;
  }

  @Get()
  async getOrders(@Headers('authorization') authHeader: string) {
    const auth = this.getAuth(authHeader);
    return this.ordersService.getUserOrders(auth.sub);
  }

  @Post()
  async placeOrder(@Headers('authorization') authHeader: string, @Body() body: any) {
    const auth = this.getAuth(authHeader);
    return this.ordersService.placeOrder(auth.sub, body);
  }
}
