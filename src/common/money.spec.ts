import { netOfPrice, priceLine } from './money.js';

describe('priceLine: el precio ya incluye IVA', () => {
  it('el cliente paga exactamente precio por cantidad', () => {
    for (const quantity of [1, 2, 3, 7, 10, 24]) {
      expect(priceLine(60, quantity, 0, 0.16).total).toBe(60 * quantity);
    }
  });

  it('desglosa el IVA hacia adentro', () => {
    expect(priceLine(60, 1, 0, 0.16)).toEqual({ total: 60, net: 51.72, tax: 8.28, grossNet: 51.72, discountNet: 0 });
  });

  it('subtotal e IVA siempre suman el total', () => {
    for (const rate of [0.16, 0.08]) {
      for (let price = 1; price <= 300; price += 7) {
        const { total, net, tax } = priceLine(price + 0.5, 3, 1, rate);
        expect(Math.round((net + tax) * 100) / 100).toBe(total);
      }
    }
  });

  it('el descuento se resta del total y se reporta sin IVA', () => {
    const line = priceLine(60, 3, 60, 0.16); // 3x2

    expect(line.total).toBe(120);
    expect(line.net).toBe(103.45);
    expect(line.tax).toBe(16.55);
    expect(line.discountNet).toBe(51.72);
  });

  it('exento: precio y subtotal son iguales', () => {
    expect(priceLine(60, 2, 10, 0)).toEqual({ total: 110, net: 110, tax: 0, grossNet: 120, discountNet: 10 });
  });

  it('un producto por peso', () => {
    expect(priceLine(100, 0.75, 0, 0.16).total).toBe(75);
  });
});

describe('netOfPrice', () => {
  it('saca el subtotal del precio con IVA', () => {
    expect(netOfPrice(60, 0.16)).toBe(51.72);
    expect(netOfPrice(50, 0.16)).toBe(43.1);
    expect(netOfPrice(60, 0)).toBe(60);
  });
});
