import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession } from 'mongoose';
import { Model } from 'mongoose';
import { Category, CategoryDocument } from '../categories/schemas/category.schema.js';
import { Product, ProductDocument } from '../products/schemas/product.schema.js';
import { SyncService } from '../sync/sync.service.js';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/promotion.dto.js';
import { Promotion, PromotionDocument } from './schemas/promotion.schema.js';

type Fields = CreatePromotionDto;

const positive = (value: unknown) => typeof value === 'number' && value > 0;
const wholeFrom = (value: unknown, min: number) => Number.isInteger(value) && (value as number) >= min;

/** Las mismas reglas que el POS. Deja en null lo que no corresponde al tipo elegido. */
export function normalizePromotion(input: Fields) {
  if (!!input.productId === !!input.categoryId) {
    throw new BadRequestException('Choose either a product or a category');
  }
  const rule = { buyQty: null, payQty: null, bundleQty: null, bundlePrice: null, percent: null, amount: null } as Record<
    'buyQty' | 'payQty' | 'bundleQty' | 'bundlePrice' | 'percent' | 'amount',
    number | null
  >;
  let valid = false;
  switch (input.type) {
    case 'buy_x_pay_y':
      valid = wholeFrom(input.buyQty, 2) && wholeFrom(input.payQty, 1) && input.payQty! < input.buyQty!;
      rule.buyQty = input.buyQty ?? null;
      rule.payQty = input.payQty ?? null;
      break;
    case 'bundle_price':
      valid = wholeFrom(input.bundleQty, 2) && positive(input.bundlePrice);
      rule.bundleQty = input.bundleQty ?? null;
      rule.bundlePrice = input.bundlePrice ?? null;
      break;
    case 'percent':
      valid = positive(input.percent) && input.percent! <= 1;
      rule.percent = input.percent ?? null;
      break;
    case 'amount':
      valid = positive(input.amount);
      rule.amount = input.amount ?? null;
      break;
  }
  if (!valid) throw new BadRequestException('Invalid promotion values');

  const startsAt = input.startsAt ? new Date(input.startsAt) : null;
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (startsAt && endsAt && endsAt < startsAt) {
    throw new BadRequestException('The end date cannot be before the start date');
  }

  const days = [...new Set(input.weekdays ?? [])].sort((a, b) => a - b);
  return {
    name: input.name.trim(),
    type: input.type,
    productId: input.productId || null,
    categoryId: input.categoryId || null,
    ...rule,
    startsAt,
    endsAt,
    weekdays: days.length > 0 && days.length < 7 ? days : null, // los 7 días es lo mismo que sin límite
    active: input.active !== false,
  };
}

/** Un descuento por pieza no puede superar el precio, ni un paquete costar lo mismo o más que sus piezas. */
export function exceedsPrice(
  rule: { amount: number | null; bundleQty: number | null; bundlePrice: number | null },
  price: number,
): boolean {
  if (rule.amount !== null && rule.amount > price) return true;
  return rule.bundlePrice !== null && rule.bundlePrice >= (rule.bundleQty ?? 0) * price;
}

@Injectable()
export class PromotionsService implements OnModuleInit {
  constructor(
    @InjectModel(Promotion.name) private readonly model: Model<PromotionDocument>,
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
    @InjectModel(Category.name) private readonly categories: Model<CategoryDocument>,
    private readonly sync: SyncService,
  ) {}

  onModuleInit() {
    this.sync.registerPull('promotions', {
      model: this.model,
      filter: (c) => ({ tenantId: c.tenantId }),
      map: (d) => ({
        id: d._id,
        name: d.name,
        type: d.type,
        productId: d.productId,
        categoryId: d.categoryId,
        buyQty: d.buyQty,
        payQty: d.payQty,
        bundleQty: d.bundleQty,
        bundlePrice: d.bundlePrice,
        percent: d.percent,
        amount: d.amount,
        startsAt: d.startsAt,
        endsAt: d.endsAt,
        weekdays: d.weekdays,
        active: d.active,
        updatedAt: d.updatedAt,
        deletedAt: d.deletedAt,
      }),
    });
  }

  async findAll(tenantId: string) {
    const items = await this.model.find({ tenantId, deletedAt: null }).sort({ active: -1, name: 1 }).lean();
    const ids = (key: 'productId' | 'categoryId') =>
      items.map((item) => item[key]).filter((id): id is string => !!id);
    // Incluye los borrados: una promoción puede seguir apuntando a uno, y debe verse a cuál
    const [products, categories] = await Promise.all([
      this.products.find({ _id: { $in: ids('productId') } }).select('name deletedAt').lean(),
      this.categories.find({ _id: { $in: ids('categoryId') } }).select('name deletedAt').lean(),
    ]);
    const targets = new Map([...products, ...categories].map((target) => [target._id, target]));
    return items.map((item) => {
      const target = targets.get((item.productId ?? item.categoryId) as string);
      return { ...item, targetName: target?.name ?? '', targetDeleted: !target || !!target.deletedAt };
    });
  }

  async create(tenantId: string, dto: CreatePromotionDto, opts: { id?: string; session?: ClientSession } = {}) {
    const fields = normalizePromotion(dto);
    await this.assertTarget(tenantId, fields, opts.session);
    await this.assertFitsPrice(tenantId, fields, opts.session);
    const [doc] = await this.model.create(
      [{ ...fields, tenantId, ...(opts.id ? { _id: opts.id } : {}) }],
      { session: opts.session },
    );
    return doc.toObject();
  }

  async update(tenantId: string, id: string, dto: UpdatePromotionDto, session?: ClientSession) {
    const current = await this.model.findOne({ _id: id, tenantId, deletedAt: null }).session(session ?? null).lean();
    if (!current) throw new NotFoundException(`Promotion ${id} not found`);

    const fields = normalizePromotion({
      name: dto.name ?? current.name,
      type: dto.type ?? current.type,
      productId: dto.productId !== undefined ? dto.productId : current.productId,
      categoryId: dto.categoryId !== undefined ? dto.categoryId : current.categoryId,
      buyQty: dto.buyQty !== undefined ? dto.buyQty : current.buyQty,
      payQty: dto.payQty !== undefined ? dto.payQty : current.payQty,
      bundleQty: dto.bundleQty !== undefined ? dto.bundleQty : current.bundleQty,
      bundlePrice: dto.bundlePrice !== undefined ? dto.bundlePrice : current.bundlePrice,
      percent: dto.percent !== undefined ? dto.percent : current.percent,
      amount: dto.amount !== undefined ? dto.amount : current.amount,
      startsAt: dto.startsAt !== undefined ? dto.startsAt : current.startsAt?.toISOString(),
      endsAt: dto.endsAt !== undefined ? dto.endsAt : current.endsAt?.toISOString(),
      weekdays: dto.weekdays !== undefined ? dto.weekdays : current.weekdays,
      active: dto.active ?? current.active,
    });
    // Solo si cambió: pausar una promoción no debe fallar porque ya borraron su producto o bajó su precio
    const targetChanged = fields.productId !== current.productId || fields.categoryId !== current.categoryId;
    if (targetChanged) await this.assertTarget(tenantId, fields, session);
    const ruleChanged =
      fields.amount !== current.amount ||
      fields.bundleQty !== current.bundleQty ||
      fields.bundlePrice !== current.bundlePrice;
    if (targetChanged || ruleChanged) await this.assertFitsPrice(tenantId, fields, session);
    return this.model.findOneAndUpdate({ _id: id, tenantId, deletedAt: null }, fields, { new: true, session }).lean();
  }

  async remove(tenantId: string, id: string, session?: ClientSession) {
    const removed = await this.model.findOneAndUpdate(
      { _id: id, tenantId, deletedAt: null },
      { deletedAt: new Date(), active: false },
      { session },
    );
    if (!removed) throw new NotFoundException(`Promotion ${id} not found`);
  }

  // Para el push del POS: incluye borradas y de otros tenants
  findAnyById(id: string, session?: ClientSession) {
    return this.model.findById(id).session(session ?? null).lean();
  }

  // En una categoría se revisan todos sus productos activos
  private async assertFitsPrice(
    tenantId: string,
    fields: ReturnType<typeof normalizePromotion>,
    session?: ClientSession,
  ) {
    if (fields.amount === null && fields.bundlePrice === null) return;
    const filter = fields.productId
      ? { _id: fields.productId }
      : { categoryId: fields.categoryId, active: true };
    const products = await this.products
      .find({ ...filter, tenantId, deletedAt: null })
      .select('name price')
      .session(session ?? null)
      .lean();
    const product = products.find((p) => exceedsPrice(fields, p.price));
    if (product) throw new BadRequestException(`Promotion exceeds the price of ${product.name}`);
  }

  private async assertTarget(
    tenantId: string,
    target: { productId: string | null; categoryId: string | null },
    session?: ClientSession,
  ) {
    const found = target.productId
      ? await this.products.exists({ _id: target.productId, tenantId, deletedAt: null }).session(session ?? null)
      : await this.categories.exists({ _id: target.categoryId, tenantId, deletedAt: null }).session(session ?? null);
    if (!found) throw new BadRequestException('The product or category does not exist');
  }
}
