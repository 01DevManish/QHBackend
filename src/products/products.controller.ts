import { Controller, Get, Query } from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async getProducts(@Query('site_id') siteId?: string) {
    return this.productsService.getCatalogProducts(siteId || 'quirkyhome');
  }

  @Get('single')
  async getProduct(@Query('slug') slug: string) {
    return this.productsService.getCatalogProduct(slug);
  }
}
