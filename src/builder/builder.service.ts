import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class BuilderService {
  constructor(private readonly db: DatabaseService) {}

  async getSchema(siteId: string) {
    try {
      const result = await this.db.query<{ schema_json: any }>(
        "select schema_json from builder_pages where id = 'main' and site_id = $1 limit 1",
        [siteId],
      );
      return { schema: result.rows[0]?.schema_json || null };
    } catch {
      return { schema: null };
    }
  }
}
