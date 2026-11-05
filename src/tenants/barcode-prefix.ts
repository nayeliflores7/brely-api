/** El prefijo de los códigos internos de un negocio que no tiene uno guardado: las 3 primeras letras de su nombre. */
export function prefixFromName(name: string): string {
  const letters = (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  return letters.slice(0, 3) || 'PRD';
}

/** El que usan las terminales y el panel: el guardado o, si nunca se configuró, el del nombre. */
export function barcodePrefixOf(tenant: { name: string; settings?: { barcodePrefix?: string } | null }): string {
  return tenant.settings?.barcodePrefix || prefixFromName(tenant.name);
}
