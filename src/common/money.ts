export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** El precio de venta ya incluye IVA: el subtotal se saca de él, nunca se suma encima. */
export const netOfPrice = (price: number, taxRate: number) => round2(price / (1 + taxRate));

/** Una línea de venta. El total es exacto: precio x cantidad - descuento. De ahí sale el IVA. */
export function priceLine(unitPrice: number, quantity: number, discount: number, taxRate: number) {
  const gross = round2(unitPrice * quantity);
  const total = round2(gross - discount);
  const net = netOfPrice(total, taxRate);
  const grossNet = netOfPrice(gross, taxRate);
  return { total, net, tax: round2(total - net), grossNet, discountNet: round2(grossNet - net) };
}
