/**
 * Semilla de DEMOSTRACIÓN — datos ficticios sobre el backend real.
 *
 * Para qué: enseñar el sistema en una entrevista o tomar capturas del
 * portafolio. Siembra tres boticas inventadas, un catálogo de farmacia y un mes
 * de movimiento, de modo que al abrirlo el dashboard y Finanzas se vean con
 * vida en lugar de en cero — que es justo donde están las pantallas que más
 * cuesta hacer bien.
 *
 * NO es un backend simulado: las ventas, los lotes, el kardex y las cajas se
 * escriben en las mismas tablas que usa la operación real. Lo único inventado
 * son los datos.
 *
 *   docker compose exec api npm run db:seed:demo
 *
 * ⚠️ Solo para bases de demostración. Detecta si ya hay ventas y aborta, para
 *    no ensuciar una instalación con datos reales.
 */
import { PrismaClient, Prisma, Rol, Sucursal, Usuario, Presentacion } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/** Clave de los usuarios de demostración. Se imprime al terminar. */
const CLAVE_DEMO = process.env.DEMO_PASSWORD ?? 'Demo2026!';
const DIAS_HISTORIA = 30;

// ─────────────────────────── utilidades ───────────────────────────

/** Aleatorio con semilla fija: la demo se ve igual en cada equipo. */
let semilla = 20260810;
function aleatorio(): number {
  semilla = (semilla * 1664525 + 1013904223) % 4294967296;
  return semilla / 4294967296;
}
const entre = (min: number, max: number) => Math.floor(aleatorio() * (max - min + 1)) + min;
const alguno = <T>(xs: T[]): T => xs[Math.floor(aleatorio() * xs.length)];
const dec = (n: number) => new Prisma.Decimal(n.toFixed(2));

/**
 * Fecha a N días atrás, a una hora concreta **de Perú** (UTC−5).
 *
 * OJO: el contenedor corre en UTC. Con `d.setHours(8, 30)` la venta quedaba a
 * las 8:30 UTC, que en Lima son las 3:30 de la madrugada — los turnos de caja
 * salían "03:30 → 15:15" y el gráfico de ventas por hora mostraba movimiento a
 * las 4 de la mañana. Se construye en UTC sumando el desfase para que la hora
 * LOCAL sea la buscada.
 */
const OFFSET_PERU = 5; // Perú = UTC−5, todo el año (no hay horario de verano)

function hace(dias: number, hora: number, minuto = 0): Date {
  const hoy = new Date();
  const d = new Date(
    Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate(), 12, 0, 0),
  );
  d.setUTCDate(d.getUTCDate() - dias);
  d.setUTCHours(hora + OFFSET_PERU, minuto, 0, 0);
  return d;
}

// ─────────────────────────── catálogo ───────────────────────────

interface ProductoDemo {
  codigo: string;
  nombre: string;
  principioActivo: string;
  concentracion: string;
  categoria: string;
  forma: string;
  receta?: boolean;
  /** Precio de la unidad base. El costo se calcula como el 62 %. */
  precio: number;
  /** Unidades por caja. 0 = solo se vende por unidad. */
  porCaja: number;
  precioCaja?: number;
  /**
   * Unidades por blíster. Se deduce sola (ver `blisterDe`); esto es solo para
   * los casos que se salen de la norma —una azitromicina viene de 3, no de 10—.
   * 0 fuerza que el producto NO tenga blíster.
   */
  porBlister?: number;
}

/**
 * Unidades por blíster de un producto.
 *
 * El seed solo creaba "Unidad" y "Caja", y así se veía en el POS: al elegir
 * presentación salían dos opciones donde una botica peruana tiene tres. El
 * blíster es de hecho la que más se vende — nadie compra 100 paracetamoles ni
 * pastilla suelta para tres días.
 *
 * Solo lo llevan las formas que físicamente vienen en blíster: tabletas y
 * cápsulas. Un jarabe, una crema o una ampolla, no. Y hace falta que la caja
 * sea múltiplo, o el blíster no encajaría dentro de ella.
 */
function blisterDe(p: ProductoDemo): number {
  if (p.porBlister !== undefined) return p.porBlister;
  if (p.forma !== 'TABLETA' && p.forma !== 'CAPSULA') return 0;
  if (p.porCaja < 20 || p.porCaja % 10 !== 0) return 0;
  return 10;
}

const CATALOGO: ProductoDemo[] = [
  { codigo: 'PARA500', nombre: 'Paracetamol 500mg', principioActivo: 'Paracetamol', concentracion: '500mg', categoria: 'Analgésicos', forma: 'TABLETA', precio: 0.3, porCaja: 100, precioCaja: 25 },
  { codigo: 'IBU400', nombre: 'Ibuprofeno 400mg', principioActivo: 'Ibuprofeno', concentracion: '400mg', categoria: 'Antiinflamatorios', forma: 'TABLETA', precio: 0.35, porCaja: 100, precioCaja: 30 },
  { codigo: 'AMOX500', nombre: 'Amoxicilina 500mg', principioActivo: 'Amoxicilina', concentracion: '500mg', categoria: 'Antibióticos', forma: 'CAPSULA', receta: true, precio: 0.9, porCaja: 100, precioCaja: 78 },
  { codigo: 'AZI500', nombre: 'Azitromicina 500mg', principioActivo: 'Azitromicina', concentracion: '500mg', categoria: 'Antibióticos', forma: 'TABLETA', receta: true, precio: 3.5, porCaja: 30, precioCaja: 95 },
  { codigo: 'CETI10', nombre: 'Cetirizina 10mg', principioActivo: 'Cetirizina', concentracion: '10mg', categoria: 'Antialérgicos', forma: 'TABLETA', precio: 0.5, porCaja: 100, precioCaja: 42 },
  { codigo: 'LORA10', nombre: 'Loratadina 10mg', principioActivo: 'Loratadina', concentracion: '10mg', categoria: 'Antialérgicos', forma: 'TABLETA', precio: 0.45, porCaja: 100, precioCaja: 38 },
  { codigo: 'OME20', nombre: 'Omeprazol 20mg', principioActivo: 'Omeprazol', concentracion: '20mg', categoria: 'Gastrointestinales', forma: 'CAPSULA', precio: 0.6, porCaja: 60, precioCaja: 32 },
  { codigo: 'METF850', nombre: 'Metformina 850mg', principioActivo: 'Metformina', concentracion: '850mg', categoria: 'Antidiabéticos', forma: 'TABLETA', receta: true, precio: 0.4, porCaja: 60, precioCaja: 21 },
  { codigo: 'LOSA50', nombre: 'Losartán 50mg', principioActivo: 'Losartán', concentracion: '50mg', categoria: 'Cardiovasculares', forma: 'TABLETA', receta: true, precio: 0.55, porCaja: 60, precioCaja: 30 },
  { codigo: 'ATOR20', nombre: 'Atorvastatina 20mg', principioActivo: 'Atorvastatina', concentracion: '20mg', categoria: 'Cardiovasculares', forma: 'TABLETA', receta: true, precio: 0.85, porCaja: 30, precioCaja: 23 },
  { codigo: 'SALB100', nombre: 'Salbutamol inhalador', principioActivo: 'Salbutamol', concentracion: '100mcg', categoria: 'Respiratorios', forma: 'SPRAY', receta: true, precio: 18, porCaja: 0 },
  { codigo: 'JARAB120', nombre: 'Paracetamol jarabe 120mg/5mL', principioActivo: 'Paracetamol', concentracion: '120mg/5mL', categoria: 'Pediátricos', forma: 'JARABE', precio: 9.5, porCaja: 0 },
  { codigo: 'AMBRO', nombre: 'Ambroxol jarabe adulto', principioActivo: 'Ambroxol', concentracion: '30mg/5mL', categoria: 'Respiratorios', forma: 'JARABE', precio: 12, porCaja: 0 },
  { codigo: 'DEXA4', nombre: 'Dexametasona 4mg/mL', principioActivo: 'Dexametasona', concentracion: '4mg/mL', categoria: 'Corticoides', forma: 'AMPOLLA', receta: true, precio: 1.6, porCaja: 25, precioCaja: 34 },
  { codigo: 'DICLO', nombre: 'Diclofenaco gel 1%', principioActivo: 'Diclofenaco', concentracion: '1%', categoria: 'Antiinflamatorios', forma: 'CREMA', precio: 14, porCaja: 0 },
  { codigo: 'ALCO96', nombre: 'Alcohol medicinal 96° 250mL', principioActivo: 'Etanol', concentracion: '96°', categoria: 'Botiquín', forma: 'OTRO', precio: 6.5, porCaja: 0 },
  { codigo: 'GASA', nombre: 'Gasa estéril 10x10', principioActivo: '—', concentracion: '10x10', categoria: 'Botiquín', forma: 'OTRO', precio: 1.2, porCaja: 0 },
  { codigo: 'VITC1G', nombre: 'Vitamina C 1g efervescente', principioActivo: 'Ácido ascórbico', concentracion: '1g', categoria: 'Vitaminas', forma: 'TABLETA', precio: 1.5, porCaja: 10, precioCaja: 13 },
  { codigo: 'SUERO', nombre: 'Suero de rehidratación oral', principioActivo: 'Sales de rehidratación', concentracion: '—', categoria: 'Pediátricos', forma: 'POLVO', precio: 3.2, porCaja: 0 },
  { codigo: 'PROTE50', nombre: 'Protector solar FPS 50', principioActivo: '—', concentracion: 'FPS 50', categoria: 'Dermocosmética', forma: 'CREMA', precio: 45, porCaja: 0 },

  // ── Ampliación del catálogo ──────────────────────────────────────────
  // Con 20 productos las pantallas se veían escuálidas: el buscador del POS
  // cabía entero sin desplazar y "top productos" agotaba el catálogo. Una
  // botica de barrio maneja cientos; con ~50 la demo ya se comporta como tal.
  { codigo: 'NAPRO550', nombre: 'Naproxeno 550mg', principioActivo: 'Naproxeno', concentracion: '550mg', categoria: 'Antiinflamatorios', forma: 'TABLETA', precio: 0.8, porCaja: 100, precioCaja: 68 },
  { codigo: 'KETO10', nombre: 'Ketorolaco 10mg', principioActivo: 'Ketorolaco', concentracion: '10mg', categoria: 'Analgésicos', forma: 'TABLETA', receta: true, precio: 1.2, porCaja: 50, precioCaja: 52 },
  { codigo: 'TRAMA50', nombre: 'Tramadol 50mg', principioActivo: 'Tramadol', concentracion: '50mg', categoria: 'Analgésicos', forma: 'CAPSULA', receta: true, precio: 1.9, porCaja: 30, precioCaja: 51 },
  { codigo: 'CIPRO500', nombre: 'Ciprofloxacino 500mg', principioActivo: 'Ciprofloxacino', concentracion: '500mg', categoria: 'Antibióticos', forma: 'TABLETA', receta: true, precio: 1.4, porCaja: 100, precioCaja: 120 },
  { codigo: 'CEFA500', nombre: 'Cefalexina 500mg', principioActivo: 'Cefalexina', concentracion: '500mg', categoria: 'Antibióticos', forma: 'CAPSULA', receta: true, precio: 1.1, porCaja: 100, precioCaja: 95 },
  { codigo: 'CLINDA300', nombre: 'Clindamicina 300mg', principioActivo: 'Clindamicina', concentracion: '300mg', categoria: 'Antibióticos', forma: 'CAPSULA', receta: true, precio: 2.2, porCaja: 50, precioCaja: 96 },
  { codigo: 'RANI300', nombre: 'Ranitidina 300mg', principioActivo: 'Ranitidina', concentracion: '300mg', categoria: 'Gastrointestinales', forma: 'TABLETA', precio: 0.7, porCaja: 60, precioCaja: 36 },
  { codigo: 'DIMEN50', nombre: 'Dimenhidrinato 50mg', principioActivo: 'Dimenhidrinato', concentracion: '50mg', categoria: 'Gastrointestinales', forma: 'TABLETA', precio: 0.6, porCaja: 100, precioCaja: 50 },
  { codigo: 'LOPE2', nombre: 'Loperamida 2mg', principioActivo: 'Loperamida', concentracion: '2mg', categoria: 'Gastrointestinales', forma: 'CAPSULA', precio: 0.55, porCaja: 100, precioCaja: 46 },
  { codigo: 'SIMET', nombre: 'Simeticona 80mg masticable', principioActivo: 'Simeticona', concentracion: '80mg', categoria: 'Gastrointestinales', forma: 'TABLETA', precio: 0.5, porCaja: 100, precioCaja: 42 },
  { codigo: 'ENAL10', nombre: 'Enalapril 10mg', principioActivo: 'Enalapril', concentracion: '10mg', categoria: 'Cardiovasculares', forma: 'TABLETA', receta: true, precio: 0.35, porCaja: 60, precioCaja: 19 },
  { codigo: 'AMLO5', nombre: 'Amlodipino 5mg', principioActivo: 'Amlodipino', concentracion: '5mg', categoria: 'Cardiovasculares', forma: 'TABLETA', receta: true, precio: 0.4, porCaja: 60, precioCaja: 22 },
  { codigo: 'ASPI100', nombre: 'Aspirina 100mg', principioActivo: 'Ácido acetilsalicílico', concentracion: '100mg', categoria: 'Cardiovasculares', forma: 'TABLETA', precio: 0.25, porCaja: 100, precioCaja: 21 },
  { codigo: 'GLIB5', nombre: 'Glibenclamida 5mg', principioActivo: 'Glibenclamida', concentracion: '5mg', categoria: 'Antidiabéticos', forma: 'TABLETA', receta: true, precio: 0.3, porCaja: 100, precioCaja: 26 },
  { codigo: 'INSUL', nombre: 'Tiras reactivas glucosa x50', principioActivo: '—', concentracion: 'x50', categoria: 'Antidiabéticos', forma: 'OTRO', precio: 65, porCaja: 0 },
  { codigo: 'CLORFE', nombre: 'Clorfenamina 4mg', principioActivo: 'Clorfenamina', concentracion: '4mg', categoria: 'Antialérgicos', forma: 'TABLETA', precio: 0.2, porCaja: 100, precioCaja: 17 },
  { codigo: 'DESLO5', nombre: 'Desloratadina 5mg', principioActivo: 'Desloratadina', concentracion: '5mg', categoria: 'Antialérgicos', forma: 'TABLETA', precio: 1.1, porCaja: 30, precioCaja: 30 },
  { codigo: 'BROMHE', nombre: 'Bromhexina jarabe pediátrico', principioActivo: 'Bromhexina', concentracion: '4mg/5mL', categoria: 'Pediátricos', forma: 'JARABE', precio: 11, porCaja: 0 },
  { codigo: 'IBUJAR', nombre: 'Ibuprofeno jarabe 100mg/5mL', principioActivo: 'Ibuprofeno', concentracion: '100mg/5mL', categoria: 'Pediátricos', forma: 'JARABE', precio: 13.5, porCaja: 0 },
  { codigo: 'ZINC', nombre: 'Sulfato de zinc gotas', principioActivo: 'Sulfato de zinc', concentracion: '10mg/mL', categoria: 'Pediátricos', forma: 'GOTAS', precio: 16, porCaja: 0 },
  { codigo: 'PREDNI', nombre: 'Prednisona 20mg', principioActivo: 'Prednisona', concentracion: '20mg', categoria: 'Corticoides', forma: 'TABLETA', receta: true, precio: 0.9, porCaja: 30, precioCaja: 24 },
  { codigo: 'BETAME', nombre: 'Betametasona crema', principioActivo: 'Betametasona', concentracion: '0.05%', categoria: 'Corticoides', forma: 'CREMA', receta: true, precio: 16, porCaja: 0 },
  { codigo: 'ALBEN', nombre: 'Albendazol 400mg', principioActivo: 'Albendazol', concentracion: '400mg', categoria: 'Antiparasitarios', forma: 'TABLETA', precio: 2.5, porCaja: 0 },
  { codigo: 'IVERM', nombre: 'Ivermectina 6mg', principioActivo: 'Ivermectina', concentracion: '6mg', categoria: 'Antiparasitarios', forma: 'TABLETA', receta: true, precio: 4.5, porCaja: 0 },
  { codigo: 'CLOTRI', nombre: 'Clotrimazol crema 1%', principioActivo: 'Clotrimazol', concentracion: '1%', categoria: 'Antimicóticos', forma: 'CREMA', precio: 13, porCaja: 0 },
  { codigo: 'FLUCO150', nombre: 'Fluconazol 150mg', principioActivo: 'Fluconazol', concentracion: '150mg', categoria: 'Antimicóticos', forma: 'CAPSULA', receta: true, precio: 6.5, porCaja: 0 },
  { codigo: 'LAGRI', nombre: 'Lágrimas artificiales', principioActivo: 'Carboximetilcelulosa', concentracion: '0.5%', categoria: 'Oftálmicos', forma: 'GOTAS', precio: 22, porCaja: 0 },
  { codigo: 'GENTAOF', nombre: 'Gentamicina oftálmica', principioActivo: 'Gentamicina', concentracion: '0.3%', categoria: 'Oftálmicos', forma: 'GOTAS', receta: true, precio: 15, porCaja: 0 },
  { codigo: 'MULTIV', nombre: 'Multivitamínico adulto x30', principioActivo: '—', concentracion: 'x30', categoria: 'Vitaminas', forma: 'TABLETA', precio: 1.4, porCaja: 30, precioCaja: 38 },
  { codigo: 'CALCIO', nombre: 'Calcio + Vitamina D', principioActivo: 'Carbonato de calcio', concentracion: '600mg', categoria: 'Vitaminas', forma: 'TABLETA', precio: 0.9, porCaja: 60, precioCaja: 48 },
  { codigo: 'OMEGA3', nombre: 'Omega 3 1000mg', principioActivo: 'Aceite de pescado', concentracion: '1000mg', categoria: 'Vitaminas', forma: 'CAPSULA', precio: 1.3, porCaja: 60, precioCaja: 70 },
  { codigo: 'HIERRO', nombre: 'Sulfato ferroso gotas', principioActivo: 'Sulfato ferroso', concentracion: '25mg/mL', categoria: 'Vitaminas', forma: 'GOTAS', precio: 14, porCaja: 0 },
  { codigo: 'AGUAOX', nombre: 'Agua oxigenada 120mL', principioActivo: 'Peróxido de hidrógeno', concentracion: '10 vol', categoria: 'Botiquín', forma: 'OTRO', precio: 4.5, porCaja: 0 },
  { codigo: 'ESPARA', nombre: 'Esparadrapo 2.5cm', principioActivo: '—', concentracion: '2.5cm', categoria: 'Botiquín', forma: 'OTRO', precio: 3.5, porCaja: 0 },
  { codigo: 'VENDA', nombre: 'Venda elástica 4"', principioActivo: '—', concentracion: '4 pulg', categoria: 'Botiquín', forma: 'OTRO', precio: 8, porCaja: 0 },
  { codigo: 'TERMO', nombre: 'Termómetro digital', principioActivo: '—', concentracion: '—', categoria: 'Botiquín', forma: 'OTRO', precio: 25, porCaja: 0 },
  { codigo: 'MASCA', nombre: 'Mascarilla quirúrgica x50', principioActivo: '—', concentracion: 'x50', categoria: 'Higiene', forma: 'OTRO', precio: 0.5, porCaja: 50, precioCaja: 20 },
  { codigo: 'ALCOGEL', nombre: 'Alcohol en gel 250mL', principioActivo: 'Etanol', concentracion: '70%', categoria: 'Higiene', forma: 'OTRO', precio: 9, porCaja: 0 },
  { codigo: 'JABONA', nombre: 'Jabón antibacterial', principioActivo: '—', concentracion: '90g', categoria: 'Higiene', forma: 'OTRO', precio: 5.5, porCaja: 0 },
  { codigo: 'PANAL', nombre: 'Pañal talla M x30', principioActivo: '—', concentracion: 'Talla M', categoria: 'Materno-infantil', forma: 'OTRO', precio: 42, porCaja: 0 },
  { codigo: 'TOALLI', nombre: 'Toallitas húmedas x80', principioActivo: '—', concentracion: 'x80', categoria: 'Materno-infantil', forma: 'OTRO', precio: 12, porCaja: 0 },
  { codigo: 'FORMU1', nombre: 'Fórmula infantil etapa 1', principioActivo: '—', concentracion: '400g', categoria: 'Materno-infantil', forma: 'POLVO', precio: 68, porCaja: 0 },
  { codigo: 'CREMAF', nombre: 'Crema facial hidratante', principioActivo: '—', concentracion: '50mL', categoria: 'Dermocosmética', forma: 'CREMA', precio: 55, porCaja: 0 },
  { codigo: 'SHAMPA', nombre: 'Shampoo anticaspa', principioActivo: 'Ketoconazol', concentracion: '2%', categoria: 'Dermocosmética', forma: 'OTRO', precio: 38, porCaja: 0 },
  { codigo: 'REPELE', nombre: 'Repelente de insectos', principioActivo: 'DEET', concentracion: '15%', categoria: 'Dermocosmética', forma: 'SPRAY', precio: 28, porCaja: 0 },
  { codigo: 'CICATR', nombre: 'Crema cicatrizante', principioActivo: 'Centella asiática', concentracion: '30g', categoria: 'Dermocosmética', forma: 'CREMA', precio: 32, porCaja: 0 },
  { codigo: 'METAM', nombre: 'Metamizol 500mg', principioActivo: 'Metamizol sódico', concentracion: '500mg', categoria: 'Analgésicos', forma: 'TABLETA', precio: 0.4, porCaja: 100, precioCaja: 34 },
  { codigo: 'PARAFOR', nombre: 'Paracetamol 1g', principioActivo: 'Paracetamol', concentracion: '1g', categoria: 'Analgésicos', forma: 'TABLETA', precio: 0.5, porCaja: 100, precioCaja: 42 },
  { codigo: 'DICLOTAB', nombre: 'Diclofenaco 50mg', principioActivo: 'Diclofenaco', concentracion: '50mg', categoria: 'Antiinflamatorios', forma: 'TABLETA', precio: 0.3, porCaja: 100, precioCaja: 26 },
  { codigo: 'MELOX15', nombre: 'Meloxicam 15mg', principioActivo: 'Meloxicam', concentracion: '15mg', categoria: 'Antiinflamatorios', forma: 'TABLETA', receta: true, precio: 0.85, porCaja: 30, precioCaja: 23 },
  { codigo: 'DOXI100', nombre: 'Doxiciclina 100mg', principioActivo: 'Doxiciclina', concentracion: '100mg', categoria: 'Antibióticos', forma: 'CAPSULA', receta: true, precio: 0.8, porCaja: 50, precioCaja: 35 },
  { codigo: 'ERITRO', nombre: 'Eritromicina 500mg', principioActivo: 'Eritromicina', concentracion: '500mg', categoria: 'Antibióticos', forma: 'TABLETA', receta: true, precio: 1.3, porCaja: 50, precioCaja: 56 },
  { codigo: 'TRIMET', nombre: 'Trimetoprim/Sulfa 800mg', principioActivo: 'Cotrimoxazol', concentracion: '800/160mg', categoria: 'Antibióticos', forma: 'TABLETA', receta: true, precio: 0.6, porCaja: 100, precioCaja: 52 },
  { codigo: 'ESOME40', nombre: 'Esomeprazol 40mg', principioActivo: 'Esomeprazol', concentracion: '40mg', categoria: 'Gastrointestinales', forma: 'CAPSULA', precio: 1.6, porCaja: 30, precioCaja: 43 },
  { codigo: 'METOCLO', nombre: 'Metoclopramida 10mg', principioActivo: 'Metoclopramida', concentracion: '10mg', categoria: 'Gastrointestinales', forma: 'TABLETA', precio: 0.35, porCaja: 100, precioCaja: 30 },
  { codigo: 'HIDROX', nombre: 'Hidróxido de aluminio susp.', principioActivo: 'Hidróxido de aluminio', concentracion: '360mg/5mL', categoria: 'Gastrointestinales', forma: 'SUSPENSION', precio: 15, porCaja: 0 },
  { codigo: 'CARVE', nombre: 'Carvedilol 6.25mg', principioActivo: 'Carvedilol', concentracion: '6.25mg', categoria: 'Cardiovasculares', forma: 'TABLETA', receta: true, precio: 0.6, porCaja: 30, precioCaja: 16 },
  { codigo: 'FUROSE', nombre: 'Furosemida 40mg', principioActivo: 'Furosemida', concentracion: '40mg', categoria: 'Cardiovasculares', forma: 'TABLETA', receta: true, precio: 0.25, porCaja: 100, precioCaja: 21 },
  { codigo: 'SIMVA20', nombre: 'Simvastatina 20mg', principioActivo: 'Simvastatina', concentracion: '20mg', categoria: 'Cardiovasculares', forma: 'TABLETA', receta: true, precio: 0.5, porCaja: 30, precioCaja: 14 },
  { codigo: 'MONTE10', nombre: 'Montelukast 10mg', principioActivo: 'Montelukast', concentracion: '10mg', categoria: 'Respiratorios', forma: 'TABLETA', receta: true, precio: 1.8, porCaja: 30, precioCaja: 49 },
  { codigo: 'BUDESO', nombre: 'Budesonida inhalador', principioActivo: 'Budesonida', concentracion: '200mcg', categoria: 'Respiratorios', forma: 'SPRAY', receta: true, precio: 48, porCaja: 0 },
  { codigo: 'DEXTRO', nombre: 'Dextrometorfano jarabe', principioActivo: 'Dextrometorfano', concentracion: '15mg/5mL', categoria: 'Respiratorios', forma: 'JARABE', precio: 14, porCaja: 0 },
  { codigo: 'CETIJAR', nombre: 'Cetirizina jarabe pediátrico', principioActivo: 'Cetirizina', concentracion: '5mg/5mL', categoria: 'Pediátricos', forma: 'JARABE', precio: 12.5, porCaja: 0 },
  { codigo: 'PARAGOT', nombre: 'Paracetamol gotas lactante', principioActivo: 'Paracetamol', concentracion: '100mg/mL', categoria: 'Pediátricos', forma: 'GOTAS', precio: 10, porCaja: 0 },
  { codigo: 'VITD3', nombre: 'Vitamina D3 1000 UI', principioActivo: 'Colecalciferol', concentracion: '1000 UI', categoria: 'Vitaminas', forma: 'CAPSULA', precio: 0.8, porCaja: 60, precioCaja: 43 },
  { codigo: 'COMPLB', nombre: 'Complejo B', principioActivo: 'Vitaminas B', concentracion: '—', categoria: 'Vitaminas', forma: 'TABLETA', precio: 0.6, porCaja: 100, precioCaja: 52 },
  { codigo: 'COLAG', nombre: 'Colágeno hidrolizado', principioActivo: 'Colágeno', concentracion: '300g', categoria: 'Vitaminas', forma: 'POLVO', precio: 75, porCaja: 0 },
  { codigo: 'GUANTE', nombre: 'Guantes de látex x100', principioActivo: '—', concentracion: 'x100', categoria: 'Higiene', forma: 'OTRO', precio: 0.4, porCaja: 100, precioCaja: 35 },
  { codigo: 'ALGODON', nombre: 'Algodón hidrófilo 100g', principioActivo: '—', concentracion: '100g', categoria: 'Botiquín', forma: 'OTRO', precio: 5, porCaja: 0 },
  { codigo: 'JERINGA', nombre: 'Jeringa descartable 5mL', principioActivo: '—', concentracion: '5mL', categoria: 'Botiquín', forma: 'OTRO', precio: 0.8, porCaja: 100, precioCaja: 70 },
  { codigo: 'TENSIO', nombre: 'Tensiómetro digital', principioActivo: '—', concentracion: '—', categoria: 'Botiquín', forma: 'OTRO', precio: 145, porCaja: 0 },
  { codigo: 'PRESERV', nombre: 'Preservativos x3', principioActivo: '—', concentracion: 'x3', categoria: 'Higiene', forma: 'OTRO', precio: 9, porCaja: 0 },
  { codigo: 'TESTEMB', nombre: 'Test de embarazo', principioActivo: '—', concentracion: '—', categoria: 'Materno-infantil', forma: 'OTRO', precio: 15, porCaja: 0 },
  { codigo: 'ACIDOF', nombre: 'Ácido fólico 5mg', principioActivo: 'Ácido fólico', concentracion: '5mg', categoria: 'Materno-infantil', forma: 'TABLETA', precio: 0.2, porCaja: 100, precioCaja: 17 },
];

const SUCURSALES = [
  { nombre: 'Botica Central', distrito: 'Cercado de Lima', direccion: 'Av. Abancay 512', telefono: '013456789' },
  { nombre: 'Botica Norte', distrito: 'Los Olivos', direccion: 'Av. Antúnez de Mayolo 1840', telefono: '013456790' },
  { nombre: 'Botica Sur', distrito: 'Chorrillos', direccion: 'Av. Huaylas 2210', telefono: '013456791' },
];

const USUARIOS = [
  { nombres: 'Axel', apellidos: 'Huatuco Bravo', email: 'dueno@demo.pe', roles: [Rol.SUPER_ADMIN, Rol.ADMIN], sucursal: 0 },
  { nombres: 'Marco', apellidos: 'Ruiz', email: 'encargado@demo.pe', roles: [Rol.ADMIN], sucursal: 1 },
  { nombres: 'Lucía', apellidos: 'Ponce', email: 'cajera@demo.pe', roles: [Rol.VENDEDOR], sucursal: 0 },
  // Segunda cajera en Central: dos personas rotando en el mismo mostrador.
  // Sin esto todos los cierres salían a nombre de la misma persona y no se
  // apreciaba el relevo de turno ni la auditoría de "quién cerró".
  { nombres: 'Karina', apellidos: 'Mendoza', email: 'cajera2@demo.pe', roles: [Rol.VENDEDOR], sucursal: 0 },
  { nombres: 'Diego', apellidos: 'Salas', email: 'quimico@demo.pe', roles: [Rol.FARMACEUTICO], sucursal: 0 },
  { nombres: 'Rosa', apellidos: 'Ayala', email: 'almacen@demo.pe', roles: [Rol.ALMACENERO], sucursal: 2 },
];

// ─────────────────────────── siembra ───────────────────────────

async function main() {
  const ventasExistentes = await prisma.venta.count();
  if (ventasExistentes > 0 && process.env.DEMO_FORCE !== '1') {
    console.log(
      `\n⚠  La base ya tiene ${ventasExistentes} venta(s). El seed de demo se detiene\n` +
        '   para no mezclarse con datos reales.\n' +
        '   Si de verdad quieres continuar: DEMO_FORCE=1 npm run db:seed:demo\n',
    );
    return;
  }

  console.log('▸ Sembrando demostración…');
  const hash = await bcrypt.hash(CLAVE_DEMO, 10);

  // 1) Sucursales ────────────────────────────────────────────────
  const sucursales: Sucursal[] = [];
  for (let i = 0; i < SUCURSALES.length; i++) {
    const s = SUCURSALES[i];
    const existente = await prisma.sucursal.findFirst({ where: { nombre: s.nombre } });
    sucursales.push(
      existente ??
        (await prisma.sucursal.create({
          data: {
            ...s,
            serieBoleta: `B00${i + 1}`,
            serieFactura: `F00${i + 1}`,
            serieTicket: `T00${i + 1}`,
            metaVentaMensual: new Prisma.Decimal([48000, 32000, 27000][i]),
          },
        })),
    );
  }
  console.log(`  ✓ ${sucursales.length} sucursales`);

  // 2) Terminales ────────────────────────────────────────────────
  for (const s of sucursales) {
    for (const nombre of ['CAJA-01', 'CAJA-02']) {
      const ya = await prisma.terminal.findFirst({ where: { sucursalId: s.id, nombre } });
      if (!ya) await prisma.terminal.create({ data: { sucursalId: s.id, nombre } });
    }
  }

  // 3) Usuarios ──────────────────────────────────────────────────
  const usuarios: Usuario[] = [];
  for (const u of USUARIOS) {
    const ya = await prisma.usuario.findUnique({ where: { email: u.email } });
    usuarios.push(
      ya ??
        (await prisma.usuario.create({
          data: {
            nombres: u.nombres,
            apellidos: u.apellidos,
            email: u.email,
            passwordHash: hash,
            roles: u.roles,
            sucursalId: sucursales[u.sucursal].id,
            activo: true,
          },
        })),
    );
  }
  const [duena, encargado, cajera, cajera2, quimico, almacen] = usuarios;
  console.log(`  ✓ ${usuarios.length} usuarios`);

  // 4) Configuración de la empresa ficticia ──────────────────────
  await prisma.configuracion.upsert({
    where: { id: 'global' },
    update: {},
    create: {
      id: 'global',
      razonSocial: 'Boticas Demo S.A.C.',
      // RUC ficticio pero con dígito verificador VÁLIDO (módulo 11): el sistema
      // rechaza los RUC inventados al azar, así que este está calculado.
      ruc: '20100070971',
      direccionFiscal: 'Av. Abancay 512, Cercado de Lima',
      telefono: '013456789',
      pieTicket: '¡Gracias por su compra! Conserve su comprobante.',
      stockMinimoDefault: 20,
      alertaVencimientoDias: 60,
    },
  });

  // 5) Catálogo + stock + lotes ──────────────────────────────────
  const productos: {
    id: string; base: string; blister?: string; caja?: string;
    precio: number; costo: number;
    porBlister: number; precioBlister: number;
    porCaja: number;
  }[] = [];
  /** Stock sembrado por producto+sucursal, para cuadrar el kardex al final. */
  const stockFinal = new Map<string, number>();
  /** Unidades vendidas por producto+sucursal durante la simulación. */
  const vendido = new Map<string, number>();
  const clave = (productoId: string, sucursalId: string) => `${productoId}|${sucursalId}`;

  let indiceProducto = 0;
  for (const p of CATALOGO) {
    const ya = await prisma.producto.findUnique({
      where: { codigo: p.codigo },
      include: { presentaciones: true },
    });

    // Escalera de precios, como en el mostrador: cuanto más grande la
    // presentación, más barata sale la unidad. Suelta 0,30 → blíster 0,278 →
    // caja 0,25. Si el blíster no fuera más barato que la unidad suelta nadie
    // lo compraría; si fuera más barato que la caja, la caja sobraría.
    //
    // El blíster se coloca al 55 % del trecho que va del precio por unidad de
    // la caja al de la unidad suelta, en vez de con un descuento fijo. Con un
    // 93 % plano la simvastatina salía más barata por blíster que por caja,
    // porque su caja tiene un descuento mucho más flojo que la media: un
    // porcentaje fijo no puede saber eso, el punto medio sí.
    const porBlister = blisterDe(p);
    const precioCaja = p.porCaja > 0 ? (p.precioCaja ?? p.precio * p.porCaja * 0.85) : 0;
    const unidadEnCaja = p.porCaja > 0 ? precioCaja / p.porCaja : p.precio;
    const precioBlister = porBlister > 0
      ? Number((porBlister * (unidadEnCaja + (p.precio - unidadEnCaja) * 0.55)).toFixed(2))
      : 0;

    const presentaciones = [
      { nombre: 'Unidad', factor: 1, precioVenta: new Prisma.Decimal(p.precio), esBase: true },
      ...(porBlister > 0
        ? [{ nombre: `Blíster x ${porBlister}`, factor: porBlister, precioVenta: new Prisma.Decimal(precioBlister) }]
        : []),
      ...(p.porCaja > 0
        ? [{ nombre: `Caja x ${p.porCaja}`, factor: p.porCaja, precioVenta: new Prisma.Decimal(p.precioCaja ?? p.precio * p.porCaja * 0.85) }]
        : []),
    ];

    const producto =
      ya ??
      (await prisma.producto.create({
        data: {
          codigo: p.codigo,
          nombre: p.nombre,
          principioActivo: p.principioActivo,
          concentracion: p.concentracion,
          categoria: p.categoria,
          formaFarmaceutica: p.forma,
          requiereReceta: p.receta ?? false,
          esGenerico: true,
          afectacionIgv: 'GRAVADO',
          unidadBase: 'unidad',
          stockMinimo: 20,
          presentaciones: { create: presentaciones },
        },
        include: { presentaciones: true },
      }));

    // Por factor, no por "la que no es base": con tres presentaciones,
    // `find(x => !x.esBase)` devolvía el BLÍSTER creyendo que era la caja, y
    // las ventas por caja habrían descontado 10 unidades en vez de 100.
    const pres: Presentacion[] = producto.presentaciones;
    const base    = pres.find((x) => x.esBase) ?? pres[0];
    const blister = porBlister > 0 ? pres.find((x) => x.factor === porBlister) : undefined;
    const caja    = p.porCaja > 0 ? pres.find((x) => x.factor === p.porCaja) : undefined;
    // Margen variable por categoría, como en una botica real: los genéricos
    // dejan poco, la dermocosmética mucho. Con un 62 % fijo para todo, la
    // tabla de rentabilidad mostraba 26,8 % en TODAS las filas y parecía un
    // dato inventado — que es justo lo que era.
    const MARGEN: Record<string, number> = {
      'Antibióticos': 0.82,      // muy competido, margen bajo
      'Analgésicos': 0.75,
      'Antiinflamatorios': 0.72,
      'Cardiovasculares': 0.70,
      'Antidiabéticos': 0.70,
      'Gastrointestinales': 0.66,
      'Antialérgicos': 0.64,
      'Respiratorios': 0.60,
      'Corticoides': 0.60,
      'Pediátricos': 0.58,
      'Botiquín': 0.52,
      'Vitaminas': 0.48,
      'Antiparasitarios': 0.62,
      'Antimicóticos': 0.58,
      'Oftálmicos': 0.55,
      'Higiene': 0.55,
      'Materno-infantil': 0.72,  // marcas fuertes, poco margen
      'Dermocosmética': 0.42,    // el que más deja
    };
    const costo = Number((p.precio * (MARGEN[p.categoria] ?? 0.62)).toFixed(2));
    productos.push({
      id: producto.id, base: base.id, blister: blister?.id, caja: caja?.id,
      precio: p.precio, costo,
      porBlister, precioBlister,
      porCaja: p.porCaja,
    });

    // ── Estado de cada producto en cada botica ───────────────────────────
    //
    // Antes TODOS los productos recibían un lote corto, así que las 20 filas
    // salían "por vencer" y la alerta dejaba de significar nada. Una botica
    // real tiene la mayoría del catálogo sano y un puñado de casos que atender.
    //
    // El perfil se decide por índice —no al azar— para que la demo sea
    // reproducible, y se desplaza por sucursal para que cada botica tenga
    // problemas distintos y el ranking de alertas no sea idéntico.
    for (let i = 0; i < sucursales.length; i++) {
      const factorSede = [1, 0.65, 0.45][i];
      const idx = (indiceProducto + i * 7) % 20;

      const perfil: 'SIN_STOCK' | 'STOCK_BAJO' | 'VENCIDO' | 'POR_VENCER' | 'NORMAL' =
        idx === 3 ? 'SIN_STOCK'
        : idx === 7 || idx === 14 ? 'STOCK_BAJO'
        : idx === 5 || idx === 11 ? 'VENCIDO'
        : idx === 1 || idx === 9 || idx === 16 ? 'POR_VENCER'
        : 'NORMAL';

      const normal = Math.max(40, Math.round(entre(400, 1600) * factorSede));
      // El mínimo es ~15 % de lo que se suele tener: así "stock bajo" avisa
      // con margen para reponer, no cuando ya no queda nada.
      const minimo = Math.max(10, Math.round(normal * 0.15));

      const cantidad =
        perfil === 'SIN_STOCK' ? 0
        : perfil === 'STOCK_BAJO' ? Math.max(1, Math.round(minimo * 0.6))
        : normal;

      await prisma.stockSucursal.upsert({
        where: { productoId_sucursalId: { productoId: producto.id, sucursalId: sucursales[i].id } },
        update: {},
        create: {
          productoId: producto.id,
          sucursalId: sucursales[i].id,
          cantidadBase: cantidad,
          stockMinimo: minimo,
          costoPromedio: dec(costo),
        },
      });

      stockFinal.set(clave(producto.id, sucursales[i].id), cantidad);
      if (cantidad === 0) continue; // sin stock no hay lotes que crear

      const lotes: Array<{ lote: string; vencimiento: Date; cantidadBase: number }> = [];
      const lejos = () => {
        const v = new Date();
        v.setMonth(v.getMonth() + entre(10, 24));
        return v;
      };

      if (perfil === 'VENCIDO') {
        // Una parte pequeña ya vencida (lo que hay que dar de baja) y el resto sano.
        const vencido = new Date();
        vencido.setDate(vencido.getDate() - entre(5, 40));
        const enVencido = Math.max(1, Math.round(cantidad * 0.12));
        lotes.push({ lote: `${p.codigo}-V`, vencimiento: vencido, cantidadBase: enVencido });
        lotes.push({ lote: `${p.codigo}-A`, vencimiento: lejos(), cantidadBase: cantidad - enVencido });
      } else if (perfil === 'POR_VENCER') {
        // Dentro de la ventana de alerta configurada (60 días en la demo).
        const corto = new Date();
        corto.setDate(corto.getDate() + entre(8, 45));
        const enCorto = Math.max(1, Math.round(cantidad * 0.3));
        lotes.push({ lote: `${p.codigo}-B`, vencimiento: corto, cantidadBase: enCorto });
        lotes.push({ lote: `${p.codigo}-A`, vencimiento: lejos(), cantidadBase: cantidad - enCorto });
      } else {
        // Sano: uno o dos lotes, todos con vencimiento holgado.
        if (cantidad > 300) {
          const mitad = Math.round(cantidad / 2);
          lotes.push({ lote: `${p.codigo}-A`, vencimiento: lejos(), cantidadBase: mitad });
          lotes.push({ lote: `${p.codigo}-C`, vencimiento: lejos(), cantidadBase: cantidad - mitad });
        } else {
          lotes.push({ lote: `${p.codigo}-A`, vencimiento: lejos(), cantidadBase: cantidad });
        }
      }

      await prisma.lote.createMany({
        data: lotes.map((l) => ({
          productoId: producto.id,
          sucursalId: sucursales[i].id,
          ...l,
        })),
        skipDuplicates: true,
      });
    }
    indiceProducto++;
  }

  console.log(`  ✓ ${productos.length} productos con stock y lotes en 3 sucursales`);

  // 6) Un mes de ventas ──────────────────────────────────────────
  const metodos: Array<'EFECTIVO' | 'TARJETA' | 'YAPE_PLIN' | 'TRANSFERENCIA'> = [
    'EFECTIVO', 'EFECTIVO', 'EFECTIVO', 'YAPE_PLIN', 'YAPE_PLIN', 'TARJETA', 'TRANSFERENCIA',
  ];
  // Quién atiende cada botica. En Central rotan DOS cajeras: los cierres
  // alternan de persona y el relevo de turno se ve de verdad.
  const cajerosPorSede = [
    [cajera, cajera2],   // Central
    [quimico],           // Norte
    [encargado],         // Sur
  ];
  let correlativo = 1;
  let totalVentas = 0;

  for (let d = DIAS_HISTORIA; d >= 0; d--) {
    for (let s = 0; s < sucursales.length; s++) {
      const sucursal = sucursales[s];
      // Alterna por día: turno de mañana una, al día siguiente la otra.
      const equipo = cajerosPorSede[s];
      const cajero = equipo[d % equipo.length];

      // Una sesión de caja por sucursal y día.
      const apertura = hace(d, 8, 30);
      const sesion = await prisma.cajaSesion.create({
        data: {
          sucursalId: sucursal.id,
          cajeroId: cajero.id,
          terminal: 'CAJA-01',
          montoInicial: dec(150),
          aperturaEn: apertura,
          estado: d === 0 ? 'ABIERTA' : 'CERRADA',
          ...(d === 0 ? {} : { cerradaEn: hace(d, 20, 15), cerradaPorId: cajero.id }),
        },
      });

      // Menos movimiento los domingos y en las sedes chicas.
      const domingo = apertura.getDay() === 0;
      const base = [24, 16, 12][s];
      const nTickets = Math.max(2, Math.round(base * (domingo ? 0.5 : 1) * (0.7 + aleatorio() * 0.6)));
      let efectivoDia = 0;

      for (let t = 0; t < nTickets; t++) {
        const hora = entre(9, 19);
        const fecha = hace(d, hora, entre(0, 59));
        const nLineas = entre(1, 4);

        // Tipo estructural a propósito: el nombre del tipo generado por Prisma
        // para un createMany anidado cambia entre versiones y aquí solo sirve
        // para romper el seed sin motivo.
        const lineas: Array<{
          productoId: string;
          presentacionId?: string;
          cantidad: number;
          cantidadBase: number;
          precioUnitario: Prisma.Decimal;
          subtotal: Prisma.Decimal;
          costoUnitario: Prisma.Decimal;
        }> = [];
        let bruto = 0;

        for (let l = 0; l < nLineas; l++) {
          const prod = alguno(productos);

          // Reparto de mostrador. Antes solo había dos presentaciones y el
          // blíster —que es lo que más se despacha en una botica— ni existía:
          // el paciente que sale con tratamiento de una semana se lleva un
          // blíster, no diez pastillas sueltas ni una caja de cien.
          //
          //   caja     15 %  (el que se abastece para el mes)
          //   blíster  40 %  (el tratamiento corriente)
          //   unidad   resto (el que solo quiere para hoy)
          const dado = aleatorio();
          const vendeCaja    = prod.porCaja > 0 && dado < 0.15;
          const vendeBlister = !vendeCaja && prod.porBlister > 0 && dado < 0.55;

          const cantidad =
            vendeCaja ? entre(1, 2) : vendeBlister ? entre(1, 3) : entre(1, 12);

          const factor =
            vendeCaja ? prod.porCaja : vendeBlister ? prod.porBlister : 1;

          const precioUnit =
            vendeCaja    ? Number((prod.precio * prod.porCaja * 0.85).toFixed(2))
          : vendeBlister ? prod.precioBlister
          :                prod.precio;

          const subtotal = Number((precioUnit * cantidad).toFixed(2));
          bruto += subtotal;

          lineas.push({
            productoId: prod.id,
            presentacionId: vendeCaja ? prod.caja : vendeBlister ? prod.blister : prod.base,
            cantidad,
            cantidadBase: cantidad * factor,
            precioUnitario: dec(precioUnit),
            subtotal: dec(subtotal),
            costoUnitario: dec(prod.costo),
          });
        }

        // El precio ya incluye IGV: se separa, como hace el POS real.
        const total = Number(bruto.toFixed(2));
        const igv = Number((total - total / 1.18).toFixed(2));
        const subtotal = Number((total - igv).toFixed(2));
        const metodo = alguno(metodos);
        if (metodo === 'EFECTIVO') efectivoDia += total;

        const venta = await prisma.venta.create({
          data: {
            numeroComprobante: `${sucursal.serieBoleta}-${String(correlativo++).padStart(8, '0')}`,
            tipoComprobante: 'BOLETA',
            sucursalId: sucursal.id,
            cajeroId: cajero.id,
            cajaSesionId: sesion.id,
            subtotal: dec(subtotal),
            igv: dec(igv),
            total: dec(total),
            estado: 'COMPLETADA',
            fecha,
            items: { createMany: { data: lineas } },
            pagos: {
              create: {
                metodo,
                monto: dec(total),
                referencia:
                  metodo === 'TARJETA' ? `${entre(100000, 999999)} ****${entre(1000, 9999)}`
                  : metodo === 'YAPE_PLIN' ? `9${entre(10000000, 99999999)}`
                  : metodo === 'TRANSFERENCIA' ? `OP-${entre(100000, 999999)}`
                  : null,
              },
            },
          },
        });
        totalVentas++;

        // Kardex de la salida. Sin autor a propósito: en las ventas el cajero
        // se recupera por referenciaId → Venta.cajeroId (ver FLUJO-SISTEMA §5.2).
        await prisma.movimientoStock.createMany({
          data: lineas.map((l) => ({
            productoId: l.productoId,
            sucursalId: sucursal.id,
            tipo: 'VENTA' as const,
            cantidadBase: -l.cantidadBase,
            motivo: `Venta ${venta.numeroComprobante}`,
            referenciaId: venta.id,
            fecha,
          })),
        });
        for (const l of lineas) {
          const k = clave(l.productoId, sucursal.id);
          vendido.set(k, (vendido.get(k) ?? 0) + l.cantidadBase);
        }
      }

      // Cierre con un descuadre pequeño y realista.
      if (d > 0) {
        const esperado = 150 + efectivoDia;
        const contado = esperado + (aleatorio() < 0.25 ? entre(-4, 4) : 0);
        await prisma.cajaSesion.update({
          where: { id: sesion.id },
          data: {
            efectivoEsperado: dec(esperado),
            efectivoContado: dec(contado),
            diferencia: dec(contado - esperado),
          },
        });
      }
    }
  }
  console.log(`  ✓ ${totalVentas} ventas en ${DIAS_HISTORIA} días`);

  // ── Ingreso inicial: deja el kardex coherente ─────────────────────────
  //
  // Sin esto el kardex de cualquier producto arrancaba en cero y solo bajaba:
  // 30 días de salidas por venta y ningún ingreso previo. Al abrir la ficha se
  // veía "stock resultante: −450", que en un módulo de inventario es un cartel
  // de "esto no es de fiar".
  //
  // Se registra UNA compra por producto y sucursal, fechada antes de la
  // ventana simulada, por la cantidad que había al inicio: lo que queda hoy
  // más todo lo que se vendió. Así el saldo baja desde ahí hasta el stock real.
  const ingresos: Prisma.MovimientoStockCreateManyInput[] = [];
  for (const [k, queda] of stockFinal) {
    const [productoId, sucursalId] = k.split('|');
    const salido = vendido.get(k) ?? 0;
    const inicial = queda + salido;
    if (inicial <= 0) continue;
    ingresos.push({
      productoId,
      sucursalId,
      tipo: 'COMPRA',
      cantidadBase: inicial,
      motivo: 'Carga inicial de inventario',
      fecha: hace(DIAS_HISTORIA + 1, 9),
      registradoPor: almacen.id,
    });
  }
  await prisma.movimientoStock.createMany({ data: ingresos });
  console.log(`  ✓ ${ingresos.length} ingresos iniciales (kardex cuadrado)`);

  // 7) Mermas: dan contenido al P&L y a la pantalla de Mermas ────
  for (let i = 0; i < 6; i++) {
    const prod = alguno(productos);
    const sucursal = alguno(sucursales);
    const unidades = entre(5, 30);
    await prisma.movimientoStock.create({
      data: {
        productoId: prod.id,
        sucursalId: sucursal.id,
        tipo: i % 2 === 0 ? 'BAJA_VENCIMIENTO' : 'MERMA',
        cantidadBase: -unidades,
        motivo: i % 2 === 0 ? 'Vencido · retirado de estante' : 'Producto dañado en almacén',
        fecha: hace(entre(1, 25), 11),
        registradoPor: quimico.id,
      },
    });
  }

  // 8) Gastos y gastos fijos ─────────────────────────────────────
  for (const s of sucursales) {
    await prisma.gastoRecurrente.createMany({
      data: [
        { sucursalId: s.id, categoria: 'ALQUILER', descripcion: 'Alquiler del local', monto: dec(2800), diaDelMes: 5 },
        { sucursalId: s.id, categoria: 'SUELDOS', descripcion: 'Planilla del personal', monto: dec(4200), diaDelMes: 28 },
        { sucursalId: s.id, categoria: 'SERVICIOS', descripcion: 'Luz, agua e internet', monto: dec(520), diaDelMes: 15 },
      ],
      skipDuplicates: true,
    });

    // Repartidos por toda la ventana, INCLUIDOS los últimos días. Antes caían
    // todos hace 6–20 días: si el seed corría a principios de mes, ninguno
    // entraba en "Este mes" y Finanzas mostraba "Sin gastos en el período"
    // con la utilidad neta igual a la bruta, como si el negocio no gastara.
    const GASTOS_DEMO: Array<[number, 'SERVICIOS' | 'MANTENIMIENTO' | 'TRANSPORTE' | 'MARKETING', string, number]> = [
      [1, 'TRANSPORTE', 'Flete de reposición', 95],
      [2, 'SERVICIOS', 'Recarga de agua purificada', 60],
      [4, 'MARKETING', 'Volantes de campaña', 120],
      [7, 'SERVICIOS', 'Recarga de extintores', 180],
      [11, 'MANTENIMIENTO', 'Mantenimiento de vitrina refrigerada', 340],
      [16, 'TRANSPORTE', 'Movilidad de traslado entre sedes', 75],
      [23, 'SERVICIOS', 'Recarga de balón de oxígeno', 210],
    ];
    await prisma.gasto.createMany({
      data: GASTOS_DEMO.map(([dias, categoria, descripcion, monto]) => ({
        sucursalId: s.id,
        categoria,
        descripcion,
        monto: dec(monto),
        fecha: hace(dias, 12),
        registradoPor: duena.id,
      })),
    });
  }
  console.log('  ✓ mermas, gastos y gastos fijos');

  console.log(`
─────────────────────────────────────────────
  Demostración lista.

  Contraseña de todos los usuarios: ${CLAVE_DEMO}

    dueno@demo.pe       Dueña   · las 3 boticas, Finanzas, Configuración
    encargado@demo.pe   Encargado · solo su botica
    cajera@demo.pe      Cajera  · POS y caja, sin cifras financieras
    quimico@demo.pe     Q.F.    · inventario y mermas
    almacen@demo.pe     Almacén · reposición

  Guion sugerido en demo/README.md
─────────────────────────────────────────────
`);
}

main()
  .catch((e) => {
    console.error('✗ Falló el seed de demostración:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
