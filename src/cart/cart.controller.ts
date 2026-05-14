import { Controller, Get, Post, Patch, Delete, Body, Query, Headers, HttpException, HttpStatus } from '@nestjs/common';
import { CartService } from './cart.service';
import { AuthService } from '../auth/auth.service';

@Controller('cart')
export class CartController {
  constructor(
    private readonly cartService: CartService,
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
  async getCart(@Headers('authorization') authHeader: string) {
    const auth = this.getAuth(authHeader);
    return this.cartService.getCartItems(auth.sub);
  }

  @Post()
  async addToCart(@Headers('authorization') authHeader: string, @Body() body: any) {
    const auth = this.getAuth(authHeader);
    return this.cartService.addItem(auth.sub, body);
  }

  @Patch()
  async updateQuantity(@Headers('authorization') authHeader: string, @Body() body: any) {
    const auth = this.getAuth(authHeader);
    return this.cartService.updateQuantity(auth.sub, body.slug, body.quantity);
  }

  @Delete()
  async removeItem(@Headers('authorization') authHeader: string, @Query('slug') slug?: string) {
    const auth = this.getAuth(authHeader);
    return this.cartService.removeItem(auth.sub, slug);
  }
}
