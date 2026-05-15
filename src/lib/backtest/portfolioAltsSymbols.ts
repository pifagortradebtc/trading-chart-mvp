/**
 * Top CMC альты (rank ~2–100), без BTC, стейблкоинов и золотых токенов.
 * Пары Binance Spot USDT; отсутствующие на бирже помечаются как skipped в прогоне.
 */

export interface PortfolioAltsSymbol {
  /** Binance symbol, e.g. ETHUSDT */
  symbol: string;
  /** Короткое имя для таблицы */
  label: string;
}

/** Стейблкоины и привязанные к USD/золоту — не торгуем в ALTS-стратегии. */
const STABLE_OR_EXCLUDED = new Set([
  "USDT",
  "USDC",
  "DAI",
  "PYUSD",
  "USDG",
  "XAUt",
  "PAXG",
  "RLUSD",
  "USDD",
  "USDE",
  "USD1",
  "EURC",
  "FDUSD",
  "TUSD",
  "U",
]);

/** Порядок как на скриншотах CMC (rank 2–100, без #1 BTC). */
const RAW_TICKERS: string[] = [
  "ETH",
  "BNB",
  "XRP",
  "SOL",
  "TRX",
  "DOGE",
  "HYPE",
  "ADA",
  "LEO",
  "ZEC",
  "BCH",
  "LINK",
  "XMR",
  "CC",
  "TON",
  "XLM",
  "LTC",
  "SUI",
  "M",
  "AVAX",
  "HBAR",
  "SHIB",
  "CRO",
  "TAO",
  "UNI",
  "DOT",
  "MNT",
  "WLFI",
  "NEAR",
  "ONDO",
  "OKB",
  "PI",
  "ASTER",
  "SKY",
  "PEPE",
  "ICP",
  "AAVE",
  "BGB",
  "ETC",
  "KCS",
  "DEXE",
  "ENA",
  "ALGO",
  "ATOM",
  "KAS",
  "POL",
  "RENDER",
  "QNT",
  "MORPHO",
  "WLD",
  "STABLE",
  "GT",
  "APT",
  "FLR",
  "FIL",
  "JST",
  "ARB",
  "XDC",
  "JUP",
  "PUMP",
  "H",
  "VVV",
  "VET",
  "NEXO",
  "BONK",
  "DASH",
  "PENGU",
  "NIGHT",
  "TRUMP",
  "VIRTUAL",
  "INJ",
  "CAKE",
  "FET",
  "STX",
  "CHZ",
  "SEI",
  "B",
  "EDGE",
  "ZRO",
  "LUNC",
  "AERO",
  "XTZ",
  "TIA",
];

export const PORTFOLIO_ALTS_SYMBOLS: PortfolioAltsSymbol[] = RAW_TICKERS.filter(
  (t) => !STABLE_OR_EXCLUDED.has(t.toUpperCase()),
).map((t) => ({
  symbol: `${t.toUpperCase()}USDT`,
  label: t.toUpperCase(),
}));

export const PORTFOLIO_ALTS_SYMBOL_COUNT = PORTFOLIO_ALTS_SYMBOLS.length;
