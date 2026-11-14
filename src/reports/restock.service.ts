import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category, CategoryDocument } from '../categories/schemas/category.schema.js';
import { Product, ProductDocument } from '../products/schemas/product.schema.js';
import { Sale, SaleDocument } from '../sales/schemas/sale.schema.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { Unit, UnitDocument } from '../units/schemas/unit.schema.js';
import { buildRestock, DEFAULT_COVER_DAYS, restockLimit, type RestockDemand, type RestockProduct } from './restock.js';
import { renderRestockPdf } from './restock.pdf.js';
import { ReportsService } from './reports.service.js';

/** Hasta dónde se mira por encima del mínimo si no se pide otra cosa. */
export const DEFAULT_RESTOCK_MARGIN = 0.25;

const DAY_MS = 86_400_000;
// Cuántos días de ventas se miran para saber cuánto se vende de cada producto
const MAX_WINDOW_DAYS = 30;
// Con menos días de historia no se puede saber el ritmo: una venta suelta no es una tendencia
const MIN_WINDOW_DAYS = 7;

/** Los días que abarcan las ventas: hasta 30, pero sin contar días anteriores a la primera venta del negocio. */
export function salesWindowDays(firstSale: Date | null, now: Date): number {
  if (!firstSale) return MAX_WINDOW_DAYS;
  const days = Math.ceil((now.getTime() - firstSale.getTime()) / DAY_MS);
  return Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, days));
}

@Injectable()
export class RestockService {
  constructor(
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
    @InjectModel(Category.name) private readonly categories: Model<CategoryDocument>,
    @InjectModel(Sale.name) private readonly sales: Model<SaleDocument>,
    @InjectModel(Unit.name) private readonly units: Model<UnitDocument>,
    private readonly tenants: TenantsService,
    private readonly reports: ReportsService,
  ) {}

  async list(tenantId: string, margin = DEFAULT_RESTOCK_MARGIN, coverDays = DEFAULT_COVER_DAYS, now = new Date()) {
    // El filtro grueso lo hace la base; la regla fina (alerta o por entrar) vive en buildRestock
    const [products, categories, units, firstSale] = await Promise.all([
      this.products
        .find({
          tenantId,
          active: true,
          trackStock: true,
          deletedAt: null,
          $expr: { $lte: ['$stock', { $multiply: ['$minStock', 1 + margin] }] },
        })
        .select('name barcode categoryId unit stock minStock')
        .lean<RestockProduct[]>(),
      this.categories.find({ tenantId, deletedAt: null }).select('name').lean<{ _id: string; name: string }[]>(),
      this.units
        .find({ $or: [{ tenantId: null }, { tenantId }], deletedAt: null })
        .select('code allowsDecimals tenantId')
        .lean<{ code: string; allowsDecimals: boolean; tenantId: string | null }[]>(),
      this.sales
        .findOne({ tenantId, status: 'completed', deletedAt: null })
        .sort({ soldAt: 1 })
        .select('soldAt')
        .lean<{ soldAt: Date }>(),
    ]);
    // Por si la base y la regla de buildRestock llegaran a diferir en un redondeo
    const inList = products.filter((p) => p.stock <= restockLimit(p.minStock, margin));

    const windowDays = salesWindowDays(firstSale?.soldAt ?? null, now);
    const sold = await this.soldUnits(tenantId, inList.map((p) => p._id), new Date(now.getTime() - windowDays * DAY_MS));

    // La unidad propia del negocio manda sobre la global del mismo código
    const decimalUnits = new Set<string>();
    for (const unit of [...units].sort((a, b) => Number(a.tenantId !== null) - Number(b.tenantId !== null))) {
      if (unit.allowsDecimals) decimalUnits.add(unit.code);
      else decimalUnits.delete(unit.code);
    }

    const demand: RestockDemand = { sold, windowDays, coverDays, decimalUnits };
    return buildRestock(inList, new Map(categories.map((c) => [c._id, c.name])), margin, demand);
  }

  /** Unidades vendidas de cada producto desde esa fecha. Las ventas canceladas no cuentan. */
  private async soldUnits(tenantId: string, productIds: string[], since: Date): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();
    const rows = await this.sales.aggregate<{ _id: string; quantity: number }>([
      { $match: { tenantId, status: 'completed', deletedAt: null, soldAt: { $gte: since }, 'items.productId': { $in: productIds } } },
      { $unwind: '$items' },
      { $match: { 'items.productId': { $in: productIds } } },
      { $group: { _id: '$items.productId', quantity: { $sum: '$items.quantity' } } },
    ]);
    return new Map(rows.map((row) => [row._id, row.quantity]));
  }

  async pdf(tenantId: string, margin = DEFAULT_RESTOCK_MARGIN, coverDays = DEFAULT_COVER_DAYS, tz?: string): Promise<Buffer> {
    const now = new Date();
    const [list, tenant] = await Promise.all([this.list(tenantId, margin, coverDays, now), this.tenants.findOne(tenantId)]);
    return renderRestockPdf({ tenantName: tenant.name, timeZone: this.reports.timeZone(tz), now, list });
  }
}
