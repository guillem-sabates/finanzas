# Mercados & Carteras · Prototipo (Guillem S.)

Panel de mercado y backtester de carteras (ETFs y fondos) con **datos reales** de
Yahoo Finance. Prototipo.

## Ver la plataforma

- **En la web:** el enlace de GitHub Pages de este repositorio
  (Settings → Pages). Siempre con los datos del día.
- **En local:** doble clic en `index.html`. Necesita internet para las gráficas.

## Cómo se actualizan los datos

- **Automático (en la web):** el workflow `.github/workflows/actualizar-datos.yml`
  ejecuta `fetch_datos.py` cada día laborable y actualiza `datos.js` solo.
- **Manual (en tu PC):** `python fetch_datos.py` (solo Python, sin instalar nada más).

## Añadir fondos

En `fetch_datos.py`, lista `FONDOS`: añade `("símbolo_yahoo", "Nombre", "GRUPO")`.
Busca el símbolo en https://finance.yahoo.com (los fondos suelen ser `0P00...`).
Si el fondo no está en Yahoo, en la pestaña "Backtest fondos" puedes pegar/subir su
histórico de valor liquidativo (CSV).

---
Herramienta educativa, no es asesoramiento de inversión.
