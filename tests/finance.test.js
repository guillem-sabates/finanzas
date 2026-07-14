// Vitest (o Jest). Ejecutar en CI: npx vitest run
// Casos de RESULTADO CONOCIDO de las fórmulas de backtest.
import { describe, it, expect } from 'vitest';
// finance.js es un archivo dual (global FIN en navegador / module.exports en Node).
// Importamos el objeto por defecto: son EXACTAMENTE las funciones que ejecuta index.html.
import FIN from '../js/finance.js';
const { metrics, maxDD, portfolioValue, yearly, currencyCheck, weightsValid, corr, fxConvert, convertSeries } = FIN;

describe('métricas conocidas', () => {
  it('activo con crecimiento constante 1%/dia', () => {
    const pv = []; let v = 100; for (let i = 0; i <= 252; i++) { pv.push(v); v *= 1.01; }
    const m = metrics(pv, 1);
    expect(m.totalRet).toBeCloseTo(Math.pow(1.01, 252) - 1, 6);
    expect(m.mdd).toBeCloseTo(0, 10);          // nunca cae
    expect(m.vol).toBeCloseTo(0, 8);           // sin variación de retorno
  });

  it('caída exacta del 50% -> maxDD = -0.5', () => {
    expect(maxDD([100, 120, 60, 80])).toBeCloseTo(-0.5, 10);
  });

  it('serie constante -> total 0, vol 0, sin NaN/Infinity', () => {
    const m = metrics(new Array(100).fill(50), 1);
    expect(m.totalRet).toBe(0);
    expect(m.vol).toBe(0);
    expect(Number.isFinite(m.sharpe)).toBe(true); // 0, no Infinity
    expect(Number.isNaN(m.sharpe)).toBe(false);
  });

  it('cartera 50/50 buy&hold: los pesos derivan (no rebalancea)', () => {
    // A duplica, B se mantiene. Valor final = 0.5*200 + 0.5*100 = 150 -> +50%
    const prices = { A: [100, 200], B: [100, 100] };
    const pv = portfolioValue(prices, { A: 50, B: 50 }, 0, 1);
    expect(pv[1] / pv[0] - 1).toBeCloseTo(0.5, 10);
  });

  it('mejor/peor año desde la serie de la cartera', () => {
    // años 2021(+20%), 2022(-50%), 2023(+10%) sobre la serie
    const pv = [100, 120, 60, 66];
    const years = [2020, 2021, 2022, 2023];
    const y = yearly(pv, years);
    expect(y.best.y).toBe(2021); expect(y.best.r).toBeCloseTo(0.2, 6);
    expect(y.worst.y).toBe(2022); expect(y.worst.r).toBeCloseTo(-0.5, 6);
  });

  it('correlación perfecta +1 y -1', () => {
    expect(corr([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10);
    expect(corr([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 10);
  });
});

describe('validaciones', () => {
  it('divisas incompatibles se detectan', () => {
    const c = currencyCheck({ A: 'EUR', B: 'USD' }, ['A', 'B']);
    expect(c.mixed).toBe(true); expect(c.symbol).toBe(null);
  });
  it('divisa única', () => {
    expect(currencyCheck({ A: 'EUR', B: 'EUR' }, ['A', 'B']).mixed).toBe(false);
  });
  it('pesos que no suman 100 se rechazan', () => {
    expect(weightsValid({ A: 60, B: 30 }).ok).toBe(false);
  });
  it('pesos negativos se rechazan', () => {
    expect(weightsValid({ A: 120, B: -20 }).ok).toBe(false);
  });
  it('pesos válidos = 100', () => {
    expect(weightsValid({ A: 60, B: 40 }).ok).toBe(true);
  });
});

describe('§3 series constantes y entradas inválidas (nunca NaN/Infinity)', () => {
  it('dos series constantes -> correlación null (no 0)', () => {
    expect(corr([5, 5, 5, 5], [3, 3, 3, 3])).toBe(null);
  });
  it('una serie constante y otra variable -> null', () => {
    expect(corr([5, 5, 5, 5], [1, 2, 3, 4])).toBe(null);
  });
  it('menos de 2 puntos -> null', () => {
    expect(corr([1], [1])).toBe(null);
  });
  it('cartera sin volatilidad -> sharpe/sortino 0, no Infinity', () => {
    const m = metrics([100, 100, 100, 100], 1);
    expect(m.vol).toBe(0);
    expect(Number.isFinite(m.sharpe)).toBe(true);
    expect(Number.isFinite(m.sortino)).toBe(true);
  });
  it('serie vacía -> métricas neutras', () => {
    const m = metrics([], 1);
    for (const v of Object.values(m)) expect(Number.isFinite(v)).toBe(true);
  });
  it('serie de un punto -> métricas neutras', () => {
    const m = metrics([100], 1);
    for (const v of Object.values(m)) { expect(Number.isNaN(v)).toBe(false); expect(v).not.toBe(Infinity); }
  });
  it('years <= 0 -> sin Infinity', () => {
    const m = metrics([100, 200], 0);
    for (const v of Object.values(m)) expect(Number.isFinite(v)).toBe(true);
  });
  it('maxDD y pstd con array vacío -> 0', () => {
    expect(maxDD([])).toBe(0);
  });
});

describe('conversión de divisas EUR/USD (fecha a fecha)', () => {
  it('USD -> EUR: precio / EURUSD', () => {
    expect(fxConvert(100, 'USD', 'EUR', 1.20)).toBeCloseTo(83.3333, 3);
    expect(fxConvert(120, 'USD', 'EUR', 1.20)).toBeCloseTo(100, 6);
  });
  it('EUR -> USD: precio * EURUSD', () => {
    expect(fxConvert(100, 'EUR', 'USD', 1.20)).toBeCloseTo(120, 6);
  });
  it('misma divisa -> sin cambio', () => {
    expect(fxConvert(100, 'USD', 'USD', 1.20)).toBe(100);
    expect(fxConvert(100, 'EUR', 'EUR', null)).toBe(100);
  });
  it('tasa inválida o ausente -> null (nunca NaN/Infinity)', () => {
    expect(fxConvert(100, 'USD', 'EUR', 0)).toBe(null);
    expect(fxConvert(100, 'USD', 'EUR', null)).toBe(null);
    expect(fxConvert(100, 'USD', 'EUR', -1)).toBe(null);
    expect(fxConvert(null, 'USD', 'EUR', 1.1)).toBe(null);
  });
  it('par no soportado (GBP) -> null, no se inventa', () => {
    expect(fxConvert(100, 'GBP', 'EUR', 1.15)).toBe(null);
    expect(fxConvert(100, 'USD', 'JPY', 150)).toBe(null);
  });
  it('EJEMPLO NUMÉRICO: activo USD constante 100, EURUSD 1.00->1.20 => en EUR 100 -> 83.333', () => {
    const prices = [100, 100];          // activo USD constante
    const fx = [1.00, 1.20];            // EURUSD sube
    const eur = convertSeries(prices, 'USD', 'EUR', fx, 0, 1);
    expect(eur[0]).toBeCloseTo(100, 6);
    expect(eur[1]).toBeCloseTo(83.3333, 3);
  });
  it('ambos EUR con base EUR: la serie no cambia', () => {
    const s = convertSeries([100, 110, 120], 'EUR', 'EUR', null, 0, 2);
    expect(s).toEqual([100, 110, 120]);
  });
  it('ambos USD con base USD: la serie no cambia', () => {
    const s = convertSeries([50, 55], 'USD', 'USD', [1.1, 1.2], 0, 1);
    expect(s).toEqual([50, 55]);
  });
  it('portfolioValue sobre serie convertida: efecto divisa refleja la rentabilidad esperada', () => {
    // activo USD constante en 100; EURUSD 1.00 -> 1.25 => en EUR cae -20% (100 -> 80)
    const eur = convertSeries([100, 100], 'USD', 'EUR', [1.00, 1.25], 0, 1);
    const pv = portfolioValue({ A: eur }, { A: 100 }, 0, 1, 10000);
    expect(pv[1] / pv[0] - 1).toBeCloseTo(-0.2, 6);
    for (const v of pv) { expect(Number.isFinite(v)).toBe(true); }
  });
});
