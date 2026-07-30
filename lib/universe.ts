/**
 * Curated scan universes — a hand-picked starting list of widely-followed,
 * quality-tilted businesses per market, so the "Upgrade ideas" scanner has a
 * sensible pond to fish in without any paid screener API.
 *
 * IMPORTANT: these are NOT recommendations. They are candidates; the same
 * scorecard that judges your holdings judges them, live, from Yahoo data.
 * Edit freely — anything with a Yahoo symbol works.
 */

export interface CandidateStock {
  symbol: string; // Yahoo symbol
  name: string;
  sector: string; // display hint only; live sector comes from Yahoo
}

export type UniverseCountry = "India" | "Canada" | "United States";

export const UNIVERSES: Record<UniverseCountry, CandidateStock[]> = {
  India: [
    { symbol: "ASIANPAINT.NS", name: "Asian Paints", sector: "Consumer / Paints" },
    { symbol: "PIDILITIND.NS", name: "Pidilite Industries", sector: "Adhesives / Chemicals" },
    { symbol: "NESTLEIND.NS", name: "Nestlé India", sector: "Consumer Defensive" },
    { symbol: "HINDUNILVR.NS", name: "Hindustan Unilever", sector: "Consumer Defensive" },
    { symbol: "BRITANNIA.NS", name: "Britannia Industries", sector: "Consumer Defensive" },
    { symbol: "MARICO.NS", name: "Marico", sector: "Consumer Defensive" },
    { symbol: "DABUR.NS", name: "Dabur India", sector: "Consumer Defensive" },
    { symbol: "TATACONSUM.NS", name: "Tata Consumer Products", sector: "Consumer Defensive" },
    { symbol: "COLPAL.NS", name: "Colgate-Palmolive India", sector: "Consumer Defensive" },
    { symbol: "ITC.NS", name: "ITC", sector: "Consumer Defensive" },
    { symbol: "TITAN.NS", name: "Titan Company", sector: "Consumer / Jewellery" },
    { symbol: "DMART.NS", name: "Avenue Supermarts (DMart)", sector: "Retail" },
    { symbol: "HDFCBANK.NS", name: "HDFC Bank", sector: "Financials" },
    { symbol: "ICICIBANK.NS", name: "ICICI Bank", sector: "Financials" },
    { symbol: "KOTAKBANK.NS", name: "Kotak Mahindra Bank", sector: "Financials" },
    { symbol: "BAJFINANCE.NS", name: "Bajaj Finance", sector: "Financials / NBFC" },
    { symbol: "CHOLAFIN.NS", name: "Cholamandalam Finance", sector: "Financials / NBFC" },
    { symbol: "HDFCAMC.NS", name: "HDFC AMC", sector: "Financials / Asset Mgmt" },
    { symbol: "HDFCLIFE.NS", name: "HDFC Life Insurance", sector: "Financials / Insurance" },
    { symbol: "TCS.NS", name: "Tata Consultancy Services", sector: "IT Services" },
    { symbol: "INFY.NS", name: "Infosys", sector: "IT Services" },
    { symbol: "HCLTECH.NS", name: "HCL Technologies", sector: "IT Services" },
    { symbol: "LTIM.NS", name: "LTIMindtree", sector: "IT Services" },
    { symbol: "DIVISLAB.NS", name: "Divi's Laboratories", sector: "Pharma" },
    { symbol: "SUNPHARMA.NS", name: "Sun Pharmaceutical", sector: "Pharma" },
    { symbol: "CIPLA.NS", name: "Cipla", sector: "Pharma" },
    { symbol: "TORNTPHARM.NS", name: "Torrent Pharma", sector: "Pharma" },
    { symbol: "APOLLOHOSP.NS", name: "Apollo Hospitals", sector: "Healthcare" },
    { symbol: "MARUTI.NS", name: "Maruti Suzuki", sector: "Autos" },
    { symbol: "EICHERMOT.NS", name: "Eicher Motors", sector: "Autos" },
    { symbol: "TVSMOTOR.NS", name: "TVS Motor", sector: "Autos" },
    { symbol: "BAJAJ-AUTO.NS", name: "Bajaj Auto", sector: "Autos" },
    { symbol: "ULTRACEMCO.NS", name: "UltraTech Cement", sector: "Materials" },
    { symbol: "LT.NS", name: "Larsen & Toubro", sector: "Industrials" },
    { symbol: "HAVELLS.NS", name: "Havells India", sector: "Electricals" },
    { symbol: "POLYCAB.NS", name: "Polycab India", sector: "Electricals" },
  ],
  Canada: [
    { symbol: "CSU.TO", name: "Constellation Software", sector: "Software" },
    { symbol: "TOI.V", name: "Topicus.com", sector: "Software" },
    { symbol: "SHOP.TO", name: "Shopify", sector: "Software" },
    { symbol: "OTEX.TO", name: "OpenText", sector: "Software" },
    { symbol: "GIB-A.TO", name: "CGI Inc", sector: "IT Services" },
    { symbol: "ATD.TO", name: "Alimentation Couche-Tard", sector: "Consumer / Retail" },
    { symbol: "DOL.TO", name: "Dollarama", sector: "Consumer / Retail" },
    { symbol: "L.TO", name: "Loblaw Companies", sector: "Consumer / Grocery" },
    { symbol: "MRU.TO", name: "Metro Inc", sector: "Consumer / Grocery" },
    { symbol: "CNR.TO", name: "Canadian National Railway", sector: "Rails" },
    { symbol: "CP.TO", name: "Canadian Pacific Kansas City", sector: "Rails" },
    { symbol: "WCN.TO", name: "Waste Connections", sector: "Waste / Industrials" },
    { symbol: "TFII.TO", name: "TFI International", sector: "Trucking" },
    { symbol: "TIH.TO", name: "Toromont Industries", sector: "Industrials" },
    { symbol: "WSP.TO", name: "WSP Global", sector: "Engineering" },
    { symbol: "STN.TO", name: "Stantec", sector: "Engineering" },
    { symbol: "RY.TO", name: "Royal Bank of Canada", sector: "Financials" },
    { symbol: "TD.TO", name: "TD Bank", sector: "Financials" },
    { symbol: "NA.TO", name: "National Bank of Canada", sector: "Financials" },
    { symbol: "BMO.TO", name: "Bank of Montreal", sector: "Financials" },
    { symbol: "IFC.TO", name: "Intact Financial", sector: "Insurance" },
    { symbol: "FFH.TO", name: "Fairfax Financial", sector: "Insurance" },
    { symbol: "SLF.TO", name: "Sun Life Financial", sector: "Insurance" },
    { symbol: "MFC.TO", name: "Manulife", sector: "Insurance" },
    { symbol: "TRI.TO", name: "Thomson Reuters", sector: "Info Services" },
    { symbol: "BN.TO", name: "Brookfield Corp", sector: "Alt. Assets" },
    { symbol: "BAM.TO", name: "Brookfield Asset Mgmt", sector: "Alt. Assets" },
    { symbol: "ENB.TO", name: "Enbridge", sector: "Midstream Energy" },
    { symbol: "TRP.TO", name: "TC Energy", sector: "Midstream Energy" },
    { symbol: "FTS.TO", name: "Fortis", sector: "Utilities" },
    { symbol: "EMA.TO", name: "Emera", sector: "Utilities" },
    { symbol: "H.TO", name: "Hydro One", sector: "Utilities" },
  ],
  "United States": [
    { symbol: "AAPL", name: "Apple", sector: "Technology" },
    { symbol: "MSFT", name: "Microsoft", sector: "Technology" },
    { symbol: "GOOGL", name: "Alphabet", sector: "Communication" },
    { symbol: "AMZN", name: "Amazon", sector: "Consumer / Cloud" },
    { symbol: "META", name: "Meta Platforms", sector: "Communication" },
    { symbol: "NVDA", name: "NVIDIA", sector: "Semiconductors" },
    { symbol: "AVGO", name: "Broadcom", sector: "Semiconductors" },
    { symbol: "TXN", name: "Texas Instruments", sector: "Semiconductors" },
    { symbol: "ADBE", name: "Adobe", sector: "Software" },
    { symbol: "CRM", name: "Salesforce", sector: "Software" },
    { symbol: "ORCL", name: "Oracle", sector: "Software" },
    { symbol: "INTU", name: "Intuit", sector: "Software" },
    { symbol: "NOW", name: "ServiceNow", sector: "Software" },
    { symbol: "ACN", name: "Accenture", sector: "IT Services" },
    { symbol: "V", name: "Visa", sector: "Payments" },
    { symbol: "MA", name: "Mastercard", sector: "Payments" },
    { symbol: "SPGI", name: "S&P Global", sector: "Info Services" },
    { symbol: "MCO", name: "Moody's", sector: "Info Services" },
    { symbol: "ICE", name: "Intercontinental Exchange", sector: "Exchanges" },
    { symbol: "CME", name: "CME Group", sector: "Exchanges" },
    { symbol: "ADP", name: "ADP", sector: "Business Services" },
    { symbol: "BRK-B", name: "Berkshire Hathaway", sector: "Conglomerate" },
    { symbol: "JPM", name: "JPMorgan Chase", sector: "Financials" },
    { symbol: "BLK", name: "BlackRock", sector: "Asset Mgmt" },
    { symbol: "COST", name: "Costco", sector: "Retail" },
    { symbol: "WMT", name: "Walmart", sector: "Retail" },
    { symbol: "HD", name: "Home Depot", sector: "Retail" },
    { symbol: "MCD", name: "McDonald's", sector: "Restaurants" },
    { symbol: "NKE", name: "Nike", sector: "Consumer" },
    { symbol: "PG", name: "Procter & Gamble", sector: "Consumer Defensive" },
    { symbol: "KO", name: "Coca-Cola", sector: "Consumer Defensive" },
    { symbol: "PEP", name: "PepsiCo", sector: "Consumer Defensive" },
    { symbol: "JNJ", name: "Johnson & Johnson", sector: "Healthcare" },
    { symbol: "LLY", name: "Eli Lilly", sector: "Pharma" },
    { symbol: "ABBV", name: "AbbVie", sector: "Pharma" },
    { symbol: "TMO", name: "Thermo Fisher", sector: "Life Sciences" },
    { symbol: "DHR", name: "Danaher", sector: "Life Sciences" },
    { symbol: "ABT", name: "Abbott Laboratories", sector: "Med Devices" },
    { symbol: "ISRG", name: "Intuitive Surgical", sector: "Med Devices" },
    { symbol: "LIN", name: "Linde", sector: "Industrial Gases" },
    { symbol: "UNP", name: "Union Pacific", sector: "Rails" },
    { symbol: "CAT", name: "Caterpillar", sector: "Machinery" },
    { symbol: "DE", name: "Deere & Co", sector: "Machinery" },
  ],
};

export const UNIVERSE_COUNTRIES: UniverseCountry[] = ["India", "Canada", "United States"];

/** Candidates for a country, excluding symbols already held (case-insensitive). */
export function candidatesFor(country: UniverseCountry, heldSymbols: Iterable<string>): CandidateStock[] {
  const held = new Set([...heldSymbols].map((s) => s.toUpperCase().trim()));
  return UNIVERSES[country].filter((c) => !held.has(c.symbol.toUpperCase()));
}
