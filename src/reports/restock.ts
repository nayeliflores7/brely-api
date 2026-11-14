const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export interface RestockProduct {
  _id: string;
  name: string;
  barcode: string;
  categoryId: string | null;
  unit: string;
  stock: number;
  minStock: number;
}

export type RestockStatus = 'alert' | 'soon';

export interface RestockRow {
  productId: string;
  name: string;
  barcode: string;
  category: string;
  unit: string;
  stock: number;
  minStock: number;
  /** Lo que falta para llegar al mínimo; 0 si todavía está por encima. */
  shortfall: number;
  /** alert: en el mínimo o por debajo. soon: aún por encima, pero a punto de llegar. */
  status: RestockStatus;
  /** Cuánto se vende al día, según las ventas recientes. 0 si no se ha vendido. */
  perDay: number;
  /** Cuánto conviene comprar. 0 si con lo que hay alcanza. */
  suggested: number;
}

/** Lo que se sabe de las ventas, para sugerir cuánto comprar. */
export interface RestockDemand {
  /** Unidades vendidas por producto en la ventana de ventas. */
  sold: Map<string, number>;
  /** Cuántos días abarcan esas ventas. */
  windowDays: number;
  /** Para cuántos días de ventas debe alcanzar lo que se compre. */
  coverDays: number;
  /** Unidades que se venden con decimales (kg, litros): el resto se compra en piezas enteras. */
  decimalUnits: Set<string>;
}

export const DEFAULT_COVER_DAYS = 14;

/**
 * Cuánto comprar: lo que falta para llegar a "ventas de N días más el mínimo". El mínimo queda como reserva.
 * Un producto sin ventas recientes no permite calcular nada: se sugiere llegar al doble del mínimo.
 * Un producto en alerta siempre sugiere algo, aunque la cuenta diera cero. Las piezas se compran enteras;
 * lo que se vende por peso o medida, con un decimal.
 */
export function suggestPurchase(input: {
  stock: number;
  minStock: number;
  perDay: number;
  coverDays: number;
  status: RestockStatus;
  decimals: boolean;
}): number {
  const target = input.perDay > 0 ? input.perDay * input.coverDays + input.minStock : input.minStock * 2;
  let missing = target - input.stock;
  if (input.status === 'alert') missing = Math.max(missing, 1);
  if (missing <= 0) return 0;
  // El -1e-9 evita que un 6.0000000001 de punto flotante suba un entero de más
  return input.decimals ? Math.ceil(missing * 10 - 1e-9) / 10 : Math.ceil(missing - 1e-9);
}

export const NO_CATEGORY = 'Sin categoría';

/** Hasta qué existencia entra un producto a la lista: el mínimo más el margen. Con margen 0, solo los de alerta. */
export const restockLimit = (minStock: number, margin: number) => minStock * (1 + margin);

/**
 * Los productos que hay que resurtir: los que ya están en alerta (la misma regla del POS: existencia igual o
 * menor al mínimo) y los que están por entrar, es decir, hasta `margin` por encima del mínimo.
 * Primero los de alerta; dentro de cada grupo, por categoría y nombre, que es como se recorre la tienda.
 */
export function buildRestock(
  products: RestockProduct[],
  categories: Map<string, string>,
  margin: number,
  demand: RestockDemand = { sold: new Map(), windowDays: 30, coverDays: DEFAULT_COVER_DAYS, decimalUnits: new Set() },
) {
  const rows: RestockRow[] = products
    .filter((p) => p.stock <= restockLimit(p.minStock, margin))
    .map((p) => {
      const status: RestockStatus = p.stock <= p.minStock ? 'alert' : 'soon';
      const perDay = round3((demand.sold.get(p._id) ?? 0) / demand.windowDays);
      return {
        productId: p._id,
        name: p.name,
        barcode: p.barcode,
        category: (p.categoryId && categories.get(p.categoryId)) || NO_CATEGORY,
        unit: p.unit,
        stock: round3(p.stock),
        minStock: round3(p.minStock),
        shortfall: round3(Math.max(0, p.minStock - p.stock)),
        status,
        perDay,
        suggested: round3(
          suggestPurchase({
            stock: p.stock,
            minStock: p.minStock,
            perDay,
            coverDays: demand.coverDays,
            status,
            decimals: demand.decimalUnits.has(p.unit),
          }),
        ),
      };
    });

  const collator = new Intl.Collator('es', { sensitivity: 'base' });
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'alert' ? -1 : 1;
    // Sin categoría al final de su grupo
    if (a.category !== b.category) {
      if (a.category === NO_CATEGORY) return 1;
      if (b.category === NO_CATEGORY) return -1;
      return collator.compare(a.category, b.category);
    }
    return collator.compare(a.name, b.name);
  });

  return {
    margin,
    coverDays: demand.coverDays,
    windowDays: demand.windowDays,
    counts: {
      alert: rows.filter((r) => r.status === 'alert').length,
      soon: rows.filter((r) => r.status === 'soon').length,
    },
    rows,
  };
}

export type RestockList = ReturnType<typeof buildRestock>;
