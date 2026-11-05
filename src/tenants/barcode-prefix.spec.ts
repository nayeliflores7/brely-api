import { barcodePrefixOf, prefixFromName } from './barcode-prefix.js';

describe('prefixFromName', () => {
  it.each([
    ['Veniam Deserunt', 'VEN'],
    ['ñoño abarrotes', 'NON'],
    ['Él Águila', 'ELA'],
    ['7 Eleven', 'ELE'],
    ['La', 'LA'],
    ['123', 'PRD'],
  ])('%s → %s', (name, prefix) => {
    expect(prefixFromName(name)).toBe(prefix);
  });
});

describe('barcodePrefixOf', () => {
  it('usa el configurado y, si no hay, el del nombre', () => {
    expect(barcodePrefixOf({ name: 'Mi Tienda', settings: { barcodePrefix: 'MT1' } })).toBe('MT1');
    expect(barcodePrefixOf({ name: 'Mi Tienda', settings: {} })).toBe('MIT');
    expect(barcodePrefixOf({ name: 'Mi Tienda' })).toBe('MIT');
  });
});
