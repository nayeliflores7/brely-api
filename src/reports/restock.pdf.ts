import PDFDocument from 'pdfkit';
import { type RestockList, type RestockRow, type RestockStatus } from './restock.js';

export interface RestockPdfData {
  tenantName: string;
  timeZone: string;
  now: Date;
  list: RestockList;
}

// Carta, que es lo que se imprime en México
const PAGE = { width: 612, height: 792 };
const MARGIN = 40;
const WIDTH = PAGE.width - MARGIN * 2;
const FOOTER_AT = PAGE.height - 30;
const BOTTOM = PAGE.height - 50;

const COLORS = {
  heading: '#0f172a',
  text: '#334155',
  muted: '#64748b',
  line: '#cbd5e1',
  zebra: '#f8fafc',
  alert: '#b91c1c',
  soon: '#b45309',
  category: '#e2e8f0',
};

// check | producto | existencia | mínimo | vende al día | sugerido | comprar
const COLUMNS = {
  check: { x: MARGIN, width: 22 },
  name: { x: MARGIN + 26, width: 176 },
  stock: { x: MARGIN + 206, width: 58 },
  min: { x: MARGIN + 268, width: 40 },
  perDay: { x: MARGIN + 312, width: 54 },
  suggested: { x: MARGIN + 370, width: 62 },
  buy: { x: MARGIN + 440, width: WIDTH - 440 },
} as const;

const SECTIONS: Record<RestockStatus, { title: string; color: string }> = {
  alert: { title: 'En alerta: la existencia ya llegó al mínimo o está por debajo', color: COLORS.alert },
  soon: { title: 'Por agotarse: están cerca de llegar al mínimo', color: COLORS.soon },
};

const quantity = (n: number) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 3 }).format(n);
const rate = (n: number) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(n);

/**
 * Las fuentes estándar de un PDF cubren el latín (acentos, ñ, ¿, ¡) pero no emojis ni símbolos raros:
 * un nombre con alguno saldría con un cuadro. Se cambia por "?" para que el resto se lea.
 */
export function printable(text: string): string {
  return text.normalize('NFC').replace(/[^ -~¡-ÿ–—‘’“”•€]/g, '?');
}

/** El PDF de la lista de resurtido, para imprimir o ver en el celular al ir a surtir. */
export function renderRestockPdf(data: RestockPdfData): Promise<Buffer> {
  const { list } = data;
  const doc = new PDFDocument({
    size: [PAGE.width, PAGE.height],
    margin: MARGIN,
    bufferPages: true,
    info: { Title: 'Lista de resurtido', Author: 'Brely', Subject: printable(data.tenantName) },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  /** Una sola línea: lo que no cabe se corta con "…", en lugar de partirse y encimarse con lo de abajo. */
  const fit = (value: string, width: number) => {
    if (doc.widthOfString(value) <= width) return value;
    let cut = value;
    while (cut.length > 1 && doc.widthOfString(`${cut}…`) > width) cut = cut.slice(0, -1);
    return `${cut.trimEnd()}…`;
  };

  const text = (value: string, x: number, y: number, width: number, options: { align?: 'left' | 'right' | 'center'; bold?: boolean; size?: number; color?: string } = {}) => {
    doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.size ?? 9).fillColor(options.color ?? COLORS.text);
    doc.text(fit(value, width), x, y, { width, align: options.align ?? 'left', lineBreak: false });
  };

  // ── Encabezado
  const date = new Intl.DateTimeFormat('es-MX', { timeZone: data.timeZone, dateStyle: 'full', timeStyle: 'short' }).format(data.now);
  text(printable(data.tenantName), MARGIN, MARGIN, WIDTH, { bold: true, size: 11, color: COLORS.muted });
  text('Lista de resurtido', MARGIN, MARGIN + 16, WIDTH, { bold: true, size: 22, color: COLORS.heading });
  text(`Generada el ${date}`, MARGIN, MARGIN + 46, WIDTH, { size: 9, color: COLORS.muted });

  const total = list.rows.length;
  const summary =
    total === 0
      ? 'No hay productos por resurtir.'
      : `${total} ${total === 1 ? 'producto' : 'productos'}: ${list.counts.alert} en alerta` +
        (list.margin > 0 ? ` y ${list.counts.soon} por agotarse` : '') +
        '.';
  text(summary, MARGIN, MARGIN + 62, WIDTH, { bold: true, size: 11, color: COLORS.heading });
  let legend = MARGIN + 78;
  /** Una nota con las líneas que necesite: nunca se corta con "…", diga lo que diga. */
  const note = (value: string) => {
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted);
    doc.text(value, MARGIN, legend, { width: WIDTH });
    legend += doc.heightOfString(value, { width: WIDTH }) + 3;
  };
  if (list.margin > 0) {
    note(`"Por agotarse" son los que están hasta ${Math.round(list.margin * 100)} % por encima del mínimo.`);
  }
  if (total > 0) {
    note(
      `Sugerido: lo que alcanza para ${list.coverDays} días de ventas (según lo vendido en los últimos ${list.windowDays} días), más el mínimo. ` +
        'Los que no han tenido ventas recientes sugieren llegar al doble del mínimo.',
    );
  }

  let y = legend + 12;

  if (total === 0) {
    text('Todo está por encima del mínimo. No hace falta surtir nada por ahora.', MARGIN, y + 10, WIDTH, { size: 11 });
  }

  const columnHeaders = () => {
    doc.rect(MARGIN, y, WIDTH, 18).fill('#f1f5f9');
    const top = y + 5;
    text('Producto', COLUMNS.name.x, top, COLUMNS.name.width, { bold: true, size: 8 });
    text('Existencia', COLUMNS.stock.x, top, COLUMNS.stock.width, { bold: true, size: 8, align: 'right' });
    text('Mínimo', COLUMNS.min.x, top, COLUMNS.min.width, { bold: true, size: 8, align: 'right' });
    text('Vende/día', COLUMNS.perDay.x, top, COLUMNS.perDay.width, { bold: true, size: 8, align: 'right' });
    text('Sugerido', COLUMNS.suggested.x, top, COLUMNS.suggested.width, { bold: true, size: 8, align: 'right' });
    text('Comprar', COLUMNS.buy.x, top, COLUMNS.buy.width, { bold: true, size: 8, align: 'center' });
    y += 18;
  };

  const newPage = () => {
    doc.addPage();
    y = MARGIN;
  };

  const sectionBand = (status: RestockStatus, continued: boolean) => {
    const { title, color } = SECTIONS[status];
    doc.rect(MARGIN, y, WIDTH, 22).fill(color);
    text(continued ? `${title} (continuación)` : title, MARGIN + 8, y + 6, WIDTH - 16, { bold: true, size: 10, color: '#ffffff' });
    y += 22;
    columnHeaders();
  };

  const categoryRow = (name: string) => {
    doc.rect(MARGIN, y, WIDTH, 16).fill(COLORS.category);
    text(printable(name).toUpperCase(), MARGIN + 8, y + 4, WIDTH - 16, { bold: true, size: 8, color: COLORS.heading });
    y += 16;
  };

  const ROW = 26;
  const productRow = (row: RestockRow, index: number) => {
    if (index % 2) doc.rect(MARGIN, y, WIDTH, ROW).fill(COLORS.zebra);
    // Casilla para ir marcando lo que ya se compró
    doc.lineWidth(1).strokeColor(COLORS.muted).rect(COLUMNS.check.x + 4, y + 7, 12, 12).stroke();
    text(printable(row.name), COLUMNS.name.x, y + 5, COLUMNS.name.width, { bold: true, size: 9, color: COLORS.heading });
    text(printable(row.barcode), COLUMNS.name.x, y + 16, COLUMNS.name.width, { size: 7, color: COLORS.muted });
    const color = SECTIONS[row.status].color;
    text(`${quantity(row.stock)} ${printable(row.unit)}`, COLUMNS.stock.x, y + 9, COLUMNS.stock.width, { bold: true, size: 9, align: 'right', color });
    text(quantity(row.minStock), COLUMNS.min.x, y + 9, COLUMNS.min.width, { size: 9, align: 'right' });
    text(row.perDay > 0 ? rate(row.perDay) : '—', COLUMNS.perDay.x, y + 9, COLUMNS.perDay.width, { size: 9, align: 'right' });
    // Lo que se propone comprar: lo más importante de la fila
    text(row.suggested > 0 ? `${quantity(row.suggested)} ${printable(row.unit)}` : '—', COLUMNS.suggested.x, y + 8, COLUMNS.suggested.width, { bold: true, size: 10, align: 'right', color: COLORS.heading });
    // La cantidad a comprar se escribe a mano
    doc.lineWidth(0.7).strokeColor(COLORS.line).moveTo(COLUMNS.buy.x + 6, y + ROW - 6).lineTo(COLUMNS.buy.x + COLUMNS.buy.width - 6, y + ROW - 6).stroke();
    doc.lineWidth(0.5).strokeColor(COLORS.line).moveTo(MARGIN, y + ROW).lineTo(MARGIN + WIDTH, y + ROW).stroke();
    y += ROW;
  };

  for (const status of ['alert', 'soon'] as const) {
    const rows = list.rows.filter((r) => r.status === status);
    if (rows.length === 0) continue;

    // No empezar una sección al fondo de la página: banda, encabezado y al menos una categoría con un producto
    if (y + 22 + 18 + 16 + ROW > BOTTOM) newPage();
    sectionBand(status, false);

    let category = '';
    rows.forEach((row, index) => {
      const newCategory = row.category !== category;
      // Una categoría no se queda sola al final de la página
      const needed = ROW + (newCategory ? 16 : 0);
      if (y + needed > BOTTOM) {
        newPage();
        sectionBand(status, true);
        category = '';
      }
      if (row.category !== category) {
        category = row.category;
        categoryRow(category);
      }
      productRow(row, index);
    });
    y += 14;
  }

  // ── Pie con el número de página, ya con el total
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    // Fuera del margen inferior: si no, escribir ahí agregaría otra página
    doc.page.margins.bottom = 0;
    text(`Brely · Página ${i + 1} de ${pages.count}`, MARGIN, FOOTER_AT, WIDTH, { size: 8, align: 'center', color: COLORS.muted });
  }

  doc.end();
  return finished;
}
