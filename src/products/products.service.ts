import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

type CatalogRow = {
  title: string;
  slug: string;
  category: string | null;
  sku: string | null;
  collection: string | null;
  stock: number | null;
  image: string | null;
  rating: string;
  reviews: number;
  price: string | null;
  mrp: string | null;
  badge: string | null;
  description: string | null;
};

@Injectable()
export class ProductsService {
  constructor(private readonly db: DatabaseService) {}

  async getCatalogProducts(siteId: string = 'quirkyhome') {
    const result = await this.db.query<CatalogRow>(
      `select
         p.title,
         p.slug,
         c.slug as category,
         pv.sku,
         coalesce(pv.attributes->>'collection', c.slug) as collection,
         ii.quantity_available as stock,
         pi.image_url as image,
         p.rating_avg::text as rating,
         p.rating_count as reviews,
         pv.sale_price::text as price,
         pv.mrp::text as mrp,
         case when ism.source_system = 'dynamodb' then 'Imported' else 'New' end as badge,
         coalesce(p.short_description, p.long_description) as description
       from products p
       left join product_variants pv on pv.product_id = p.id and pv.is_active = true
       left join inventory_items ii on ii.variant_id = pv.id
       left join product_images pi on pi.product_id = p.id and pi.sort_order = 0
       left join product_category_map pcm on pcm.product_id = p.id
       left join categories c on c.id = pcm.category_id
       left join inventory_source_mapping ism on ism.variant_id = pv.id
       where p.is_active = true and p.is_searchable = true
      order by p.created_at desc
      limit 100`,
    );

    return result.rows.map((row) => ({
      title: row.title,
      slug: row.slug,
      category: row.category ?? 'decor',
      sku: row.sku ?? undefined,
      collection: row.collection ?? undefined,
      stock: row.stock ?? undefined,
      image: row.image || 'https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=900&q=80',
      rating: Number(row.rating ?? 0),
      reviews: row.reviews ?? 0,
      price: Number(row.price ?? 0),
      mrp: Number(row.mrp ?? row.price ?? 0),
      badge: row.badge ?? 'New',
      description: row.description ?? `${row.title} from our store.`,
    }));
  }

  async getCatalogProduct(slug: string) {
    const products = await this.getCatalogProducts();
    return products.find((p) => p.slug === slug) || null;
  }
}
