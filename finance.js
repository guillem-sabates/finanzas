/* Funciones financieras puras — ÚNICA FUENTE DE VERDAD del motor de backtest.
   Las usa index.html (como global `FIN`) y las prueba Vitest (import por defecto).
   Convenciones: buy&hold sin rebalanceo; rf=0 en Sharpe/Sortino; 252 sesiones/año.
   Archivo dual: se carga como <script> clásico en el navegador (define window.FIN)
   y como módulo en Node/Vitest (module.exports). NO usa `export` para poder
   cargarse como script clásico sin romper la CSP con type=module. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // Vitest / Node
  root.FIN = api;                                                            // navegador
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var mean = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; };

  // Desviación típica poblacional. Serie vacía -> 0 (nunca NaN).
  function pstd(a) {
    if (!a.length) return 0;
    var m = mean(a);
    return Math.sqrt(a.reduce(function (x, y) { return x + (y - m) * (y - m); }, 0) / a.length);
  }

  // Máxima caída pico-a-valle. Serie vacía -> 0.
  function maxDD(v) {
    if (!v.length) return 0;
    var pk = v[0], mx = 0;
    for (var i = 0; i < v.length; i++) { var x = v[i]; if (x > pk) pk = x; var dd = x / pk - 1; if (dd < mx) mx = dd; }
    return mx;
  }

  // Correlación de Pearson. Indefinida (varianza cero o <2 puntos) -> null, NO 0.
  function corr(a, b) {
    if (a.length < 2) return null;
    var ma = mean(a), mb = mean(b), n = 0, da = 0, db = 0;
    for (var i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) * (a[i] - ma); db += (b[i] - mb) * (b[i] - mb); }
    if (da === 0 || db === 0) return null;
    return n / Math.sqrt(da * db);
  }

  // Serie de valor buy&hold: pv[t] = Σ w_k · base · P_k[t]/P_k[s]. Pesos se normalizan por su suma.
  function portfolioValue(prices, weights, s, e, base) {
    base = base || 10000;
    var keys = Object.keys(weights);
    var tot = keys.reduce(function (a, k) { return a + weights[k]; }, 0) || 1;
    var w = {}; keys.forEach(function (k) { w[k] = weights[k] / tot; });
    var pv = [];
    for (var t = s; t <= e; t++) { var v = 0; for (var i = 0; i < keys.length; i++) { var k = keys[i]; v += w[k] * base * (prices[k][t] / prices[k][s]); } pv.push(v); }
    return pv;
  }

  // Métricas de una serie de valor (periods = sesiones/año para anualizar).
  // Series vacías / de un punto / years<=0 / precio inicial<=0 -> métricas neutras (nunca NaN/Infinity).
  function metrics(pv, years, periods) {
    periods = periods || 252;
    if (!Array.isArray(pv) || pv.length < 2 || !(years > 0) || pv[0] <= 0)
      return { totalRet: 0, cagr: 0, vol: 0, mdd: 0, sharpe: 0, sortino: 0 };
    var dr = []; for (var i = 1; i < pv.length; i++) dr.push(pv[i] / pv[i - 1] - 1);
    var last = pv[pv.length - 1];
    var totalRet = last / pv[0] - 1;
    var cagr = Math.pow(last / pv[0], 1 / years) - 1;
    var vol = pstd(dr) * Math.sqrt(periods);
    var sharpe = vol > 0 ? (mean(dr) * periods) / vol : 0;          // vol 0 -> 0, no Infinity
    var down = Math.sqrt(dr.reduce(function (a, x) { return a + (x < 0 ? x * x : 0); }, 0) / dr.length) * Math.sqrt(periods);
    var sortino = down > 0 ? (mean(dr) * periods) / down : 0;        // downside 0 -> 0
    return { totalRet: totalRet, cagr: cagr, vol: vol, mdd: maxDD(pv), sharpe: sharpe, sortino: sortino };
  }

  // Mejor/peor año NATURAL desde la serie pv (no re-aplica pesos).
  // years[t] = año de calendario del índice t; months[t] = mes 0..11 (para detectar año cerrado en diciembre).
  function yearly(pv, years, months) {
    var byY = {};
    for (var t = 1; t < pv.length; t++) { var y = years[t]; (byY[y] = byY[y] || { s: t - 1 }).e = t; }
    var list = Object.keys(byY).map(function (yk) {
      var yn = +yk, o = byY[yk];
      var decEnd = months ? months[o.e] === 11 : years[o.e] === yn;
      var full = years[o.s] === yn - 1 && (byY[yn + 1] || decEnd);   // año completo: arranca en dic. previo y cierra
      return { y: yn, r: pv[o.e] / pv[o.s] - 1, full: full };
    });
    var full = list.filter(function (o) { return o.full; });
    var pool = full.length ? full : list;
    if (!pool.length) return { best: { y: null, r: 0 }, worst: { y: null, r: 0 }, list: list };
    return {
      best: pool.reduce(function (a, b) { return b.r > a.r ? b : a; }, pool[0]),
      worst: pool.reduce(function (a, b) { return b.r < a.r ? b : a; }, pool[0]),
      list: list
    };
  }

  // Última fecha REAL común (índice) entre activos (no extiende con forward-fill).
  function commonLastReal(lastReal, keys) { return Math.min.apply(null, keys.map(function (k) { return lastReal[k]; })); }

  // Divisas: conjunto de monedas y si son incompatibles (mezcla).
  function currencyCheck(cur, keys) {
    var set = keys.map(function (k) { return cur[k]; }).filter(Boolean);
    set = set.filter(function (v, i) { return set.indexOf(v) === i; });
    return { currencies: set, mixed: set.length > 1, symbol: set.length === 1 ? set[0] : null };
  }

  /* Conversión de divisa FECHA A FECHA. rate = EURUSD = USD por EUR.
     USD->EUR: precio / rate ; EUR->USD: precio * rate ; misma divisa: sin cambio.
     Devuelve null si no hay precio, la tasa no es válida, o el par no está soportado
     (solo EUR/USD). NUNCA NaN/Infinity. No modifica las fórmulas ya validadas. */
  function fxConvert(price, cur, base, rate) {
    if (price == null || !isFinite(price)) return null;
    if (cur === base) return price;
    if (rate == null || !(rate > 0) || !isFinite(rate)) return null;
    if (cur === 'USD' && base === 'EUR') return price / rate;
    if (cur === 'EUR' && base === 'USD') return price * rate;
    return null; // par no soportado (GBP/CHF/JPY/...): no se inventa conversión
  }

  /* Convierte una serie [s..e] a la moneda base con tasas alineadas por fecha.
     fxAligned[t] = EURUSD en la fecha t (o null). Fuera de rango o par no soportado -> null. */
  function convertSeries(prices, cur, base, fxAligned, s, e) {
    var out = [];
    for (var t = s; t <= e; t++) {
      out.push(cur === base ? (prices[t] == null ? null : prices[t])
                            : fxConvert(prices[t], cur, base, fxAligned ? fxAligned[t] : null));
    }
    return out;
  }

  // Pesos: deben sumar ~100 y ser no negativos.
  function weightsValid(weights) {
    var vals = Object.keys(weights).map(function (k) { return weights[k]; });
    if (vals.some(function (v) { return v < 0; })) return { ok: false, reason: 'negativo' };
    var s = vals.reduce(function (a, b) { return a + b; }, 0);
    var ok = Math.abs(s - 100) <= 0.5;
    return { ok: ok, sum: s, reason: ok ? null : 'suma!=100' };
  }

  return {
    mean: mean, pstd: pstd, maxDD: maxDD, corr: corr, portfolioValue: portfolioValue,
    metrics: metrics, yearly: yearly, commonLastReal: commonLastReal,
    currencyCheck: currencyCheck, weightsValid: weightsValid,
    fxConvert: fxConvert, convertSeries: convertSeries
  };
});
