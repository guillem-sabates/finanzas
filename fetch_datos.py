#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_datos.py  ·  Descarga datos REALES de Yahoo Finance y genera 'datos.js'
================================================================================
Qué hace:
  - Baja el histórico diario de cierres AJUSTADOS (rentabilidad total, con
    dividendos reinvertidos) de todos los ETFs, el índice mundial y una
    selección de fondos famosos.
  - Escribe 'datos.js' junto a este script.
  - Cuando 'datos.js' está en la misma carpeta que 'plataforma-finanzas.html',
    la web usa AUTOMÁTICAMENTE estos datos reales en vez de los de ejemplo.

NOVEDAD IMPORTANTE:
  Ya NO hace falta instalar nada (ni 'pip install yfinance').
  Usa solo Python estándar. Basta con:

        python fetch_datos.py           (en Windows)
        python3 fetch_datos.py          (en Mac, si 'python' no funciona)

Coste: 0 €. Usa el endpoint público de Yahoo Finance. Sin clave.

Para añadir tus propios fondos de CaixaBank u otros:
  1) Busca su símbolo de Yahoo en https://finance.yahoo.com (por ISIN o nombre).
     Los fondos suelen tener símbolos tipo 0P0001XXXX.F  (.F = EUR/Frankfurt).
  2) Añádelo a la lista FONDOS de abajo:  (símbolo, "Nombre bonito", "GRUPO").
  3) Vuelve a ejecutar el script.
  Si tu fondo NO está en Yahoo, no pasa nada: en la pestaña "Backtest fondos"
  de la web puedes pegar/subir su histórico de valor liquidativo en CSV.
"""

import json
import sys
import time
import datetime as dt
import urllib.request
import urllib.parse

UA = {"User-Agent": "Mozilla/5.0"}
PERIOD1 = 1104537600      # 2005-01-01
CHART = ("https://query1.finance.yahoo.com/v8/finance/chart/{sym}"
         "?period1={p1}&period2=9999999999&interval=1d&events=div%2Csplit")

# ---- Universo de ETFs (los mismos que la plataforma) + índice mundial -------
ETFS = [
    # Índice mundial (comparar "contra las acciones del mundo")
    "ACWI", "VT",
    # Core · índices y renta fija
    "SPY", "QQQ", "IWM", "DIA", "VTI", "EFA", "EEM", "VGK", "EWJ", "FXI", "INDA", "EWZ",
    "AGG", "SHY", "IEF", "TLT", "LQD", "HYG", "TIP", "BNDX", "EMB",
    # Satélite · sectores y temáticos
    "XLK", "XLF", "XLV", "XLE", "XLI", "XLY", "XLP", "XLU", "XLB", "XLC", "XLRE",
    "SMH", "KRE", "XBI", "XOP", "XHB", "ITA", "ARKK", "BOTZ", "ICLN", "TAN", "LIT",
    "CIBR", "URA", "SKYY", "FINX", "GDX", "JETS", "DRIV", "BLOK", "WCLD", "IGV",
    "COPX", "REMX", "XME", "NLR",
    # Activos reales · materias primas, inmobiliario y cripto
    "GLD", "SLV", "DBC", "USO", "UNG", "DBA", "DBB", "VNQ", "IBIT", "ETHA",
]

# ---- Fondos famosos: (símbolo Yahoo, nombre, grupo) -------------------------
# El GRUPO controla dónde aparece en el catálogo de la pestaña "Backtest fondos".
# Grupos válidos (respeta el texto para que agrupe bien):
#   ACTIVA · VALUE / ACTIVA · GROWTH / ACTIVA · MIXTOS Y FLEXIBLES /
#   ACTIVA · RENTA FIJA / ACTIVA · ALTERNATIVOS Y RETORNO ABSOLUTO /
#   PASIVA · INDEXADOS
FONDOS = [
    ("0P0001DFE8.F", "Horos Value Internacional",   "ACTIVA · VALUE"),
    ("0P00019W2R.F", "Cobas Internacional",          "ACTIVA · VALUE"),
    ("0P00016YQ5.F", "azValor Internacional",        "ACTIVA · VALUE"),
    ("0P00000P2M.F", "Bestinver Internacional",      "ACTIVA · VALUE"),
    ("0P0001572W.F", "Magallanes European Equity",   "ACTIVA · VALUE"),
    ("0P00011MD7.F", "True Value",                    "ACTIVA · VALUE"),

    ("0P0000RU7W.L", "Fundsmith Equity (GBP)",       "ACTIVA · GROWTH"),
    ("0P0001IBYW.L", "Seilern World Growth (GBP)",   "ACTIVA · GROWTH"),

    ("0P0000SBZI.F", "Renta 4 Nexus",                "ACTIVA · MIXTOS Y FLEXIBLES"),
    ("0P00000TJ8.F", "Cartesio X",                    "ACTIVA · MIXTOS Y FLEXIBLES"),
    ("0P00000TIV.F", "Cartesio Y",                    "ACTIVA · MIXTOS Y FLEXIBLES"),
    ("0P00016DRZ.F", "Renta 4 Global",               "ACTIVA · MIXTOS Y FLEXIBLES"),
    ("0P00000EUQ.F", "Sextant Grand Large",          "ACTIVA · MIXTOS Y FLEXIBLES"),

    ("0P000011Z2.F", "Renta 4 Renta Fija",           "ACTIVA · RENTA FIJA"),
    ("0P00015PFG.F", "PIMCO GIS Income",             "ACTIVA · RENTA FIJA"),

    ("0P00009093.F", "Renta 4 Pegasus",              "ACTIVA · ALTERNATIVOS Y RETORNO ABSOLUTO"),

    ("0P00000RQC.F", "Vanguard Global Stock Index",  "PASIVA · INDEXADOS"),
]


def descargar(simbolo):
    """Devuelve (fechas, precios) con cierres ajustados, o None si falla."""
    url = CHART.format(sym=urllib.parse.quote(simbolo), p1=PERIOD1)
    for intento in range(3):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.load(r)
            res = d["chart"]["result"][0]
            ts = res.get("timestamp")
            if not ts:
                return None
            ind = res["indicators"]
            serie = None
            if ind.get("adjclose") and ind["adjclose"][0].get("adjclose"):
                serie = ind["adjclose"][0]["adjclose"]
            else:
                serie = ind["quote"][0]["close"]
            fechas, precios = [], []
            for t, v in zip(ts, serie):
                if v is None:
                    continue
                fechas.append(dt.datetime.fromtimestamp(t, dt.timezone.utc).strftime("%Y-%m-%d"))
                precios.append(round(float(v), 4))
            if len(precios) < 30:
                return None
            return fechas, precios
        except Exception as e:
            print(f"   reintento {simbolo}: {e}")
            time.sleep(1.5)
    return None


def main():
    universo = list(dict.fromkeys(ETFS))  # sin duplicados, en orden
    tickers = {}
    fallidos = []
    total = len(universo) + len(FONDOS)
    i = 0

    for tk in universo:
        i += 1
        print(f"[{i}/{total}] {tk} ...", end=" ", flush=True)
        r = descargar(tk)
        if r:
            tickers[tk] = {"d": r[0], "p": r[1]}
            print(f"ok ({len(r[1])} dias)")
        else:
            fallidos.append(tk)
            print("SIN DATOS")
        time.sleep(0.25)

    for sim, nombre, grupo in FONDOS:
        i += 1
        print(f"[{i}/{total}] fondo {nombre} ({sim}) ...", end=" ", flush=True)
        r = descargar(sim)
        if r:
            tickers["FY_" + sim] = {"d": r[0], "p": r[1], "nombre": nombre,
                                    "fondo": True, "cat": grupo}
            print(f"ok ({len(r[1])} dias)")
        else:
            fallidos.append(sim)
            print("SIN DATOS")
        time.sleep(0.25)

    if not tickers:
        sys.exit("\nNo se descargo ningun dato. Revisa tu conexion a internet.")

    asof = max(v["d"][-1] for v in tickers.values())
    payload = {
        "asof": asof,
        "generado": dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "fuente": "Yahoo Finance · cierres ajustados (dividendos reinvertidos)",
        "tickers": tickers,
    }

    with open("datos.js", "w", encoding="utf-8") as f:
        f.write("window.DATOS = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";")

    print("\n" + "=" * 62)
    print(f"OK · datos.js generado · {len(tickers)} activos · datos a {asof}")
    if fallidos:
        print("Sin datos (Yahoo no los tenia):", ", ".join(fallidos))
    print("Abre plataforma-finanzas.html y veras el banner en verde.")
    print("=" * 62)


if __name__ == "__main__":
    main()
