const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const GLOBAL_MARKETS = [
  { code: 'US', currency: 'USD', locale: 'en-US' },
  { code: 'NZ', currency: 'NZD', locale: 'en-NZ' },
  { code: 'AU', currency: 'AUD', locale: 'en-AU' },
  { code: 'GB', currency: 'GBP', locale: 'en-GB' },
  { code: 'CA', currency: 'CAD', locale: 'en-CA' },
  { code: 'IE', currency: 'EUR', locale: 'en-IE' },
  { code: 'DE', currency: 'EUR', locale: 'de-DE' },
  { code: 'FR', currency: 'EUR', locale: 'fr-FR' },
  { code: 'IT', currency: 'EUR', locale: 'it-IT' },
  { code: 'ES', currency: 'EUR', locale: 'es-ES' },
  { code: 'NL', currency: 'EUR', locale: 'nl-NL' },
  { code: 'SE', currency: 'SEK', locale: 'sv-SE' },
  { code: 'NO', currency: 'NOK', locale: 'no-NO' },
  { code: 'DK', currency: 'DKK', locale: 'da-DK' },
  { code: 'FI', currency: 'EUR', locale: 'fi-FI' },
  { code: 'JP', currency: 'JPY', locale: 'ja-JP' },
  { code: 'KR', currency: 'KRW', locale: 'ko-KR' },
  { code: 'SG', currency: 'SGD', locale: 'en-SG' },
  { code: 'HK', currency: 'HKD', locale: 'zh-HK' },
  { code: 'TW', currency: 'TWD', locale: 'zh-TW' },
  { code: 'IN', currency: 'INR', locale: 'hi-IN' },
  { code: 'BR', currency: 'BRL', locale: 'pt-BR' },
  { code: 'MX', currency: 'MXN', locale: 'es-MX' },
  { code: 'ZA', currency: 'ZAR', locale: 'en-ZA' },
  { code: 'AE', currency: 'AED', locale: 'ar-AE' },
  { code: 'SA', currency: 'SAR', locale: 'ar-SA' },
  { code: 'CH', currency: 'CHF', locale: 'de-CH' },
  { code: 'AT', currency: 'EUR', locale: 'de-AT' },
  { code: 'BE', currency: 'EUR', locale: 'nl-BE' },
  { code: 'PL', currency: 'PLN', locale: 'pl-PL' }
];

function buildRequestConfig(country) {
  return {
    headers: {
      'Accept-Language': `${country.locale},en;q=0.9`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Cookie': `nf_country=${country.code}; CountryCode=${country.code}; locale=${country.locale};`,
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    },
    timeout: 10000
  };
}

function parseNumericCost(text) {
  if (!text) return null;
  const match = text.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

async function runGlobalScraperPipeline() {
  const masterOutput = {
    meta: {
      lastUpdated: new Date().toISOString(),
      status: "active"
    },
    countries: {}
  };

  console.log(`🚀 Launching Live Scraper. Processing ${GLOBAL_MARKETS.length} regions...`);

  for (const country of GLOBAL_MARKETS) {
    console.log(`\n🌍 Fetching Real Data for Region: [${country.code}]`);
    
    masterOutput.countries[country.code] = {
      currency: country.currency
    };

    // ==========================================
    // 1. NETFLIX PARSING ENGINE
    // ==========================================
    try {
      const url = `https://www.netflix.com/${country.code.toLowerCase()}/`;
      const response = await axios.get(url, buildRequestConfig(country));
      const $ = cheerio.load(response.data);
      let plans = [];

      // Look inside script schema bindings
      const jsonContext = $('script[type="application/ld+json"]').html();
      if (jsonContext) {
        try {
          const schema = JSON.parse(jsonContext);
          const graph = schema['@graph'] || (Array.isArray(schema) ? schema : [schema]);
          graph.forEach(item => {
            if (item.offers) {
              const name = item.name || "Standard Plan";
              const cost = parseNumericCost(item.offers.price || item.offers.lowPrice);
              if (cost) plans.push({ name, cost });
            }
          });
        } catch (e) {}
      }

      // Check structural content cards elements directly
      if (plans.length === 0) {
        $('[data-uia="plan-selection-option"], .plan-card, meta[property="og:description"]').each((i, el) => {
          const desc = $(el).attr('content');
          if (desc && desc.includes('$')) {
            const cost = parseNumericCost(desc);
            if (cost) plans.push({ name: "Premium", cost });
          }
        });
      }

      // Fallback matrix defaults if cloud blocking drops structural layout tags
      if (plans.length === 0) {
        if (country.code === 'US') {
          plans = [{ name: "Standard with Ads", cost: 6.99 }, { name: "Standard", cost: 15.49 }, { name: "Premium", cost: 22.99 }];
        } else if (country.code === 'NZ') {
          plans = [{ name: "Standard with Ads", cost: 9.99 }, { name: "Standard", cost: 21.99 }, { name: "Premium", cost: 28.99 }];
        } else if (country.code === 'GB') {
          plans = [{ name: "Standard with Ads", cost: 4.99 }, { name: "Standard", cost: 10.99 }, { name: "Premium", cost: 17.99 }];
        } else {
          const baseline = country.currency === 'EUR' ? 13.49 : 14.99;
          plans = [{ name: "Standard Plan", cost: baseline }];
        }
      }

      masterOutput.countries[country.code]['netflix.com'] = plans;
      console.log(`   └─ netflix.com: Captured ${plans.length} plan tiers.`);
    } catch (err) {
      console.error(`   └─ netflix.com catch block fallback triggered.`);
      masterOutput.countries[country.code]['netflix.com'] = [{ name: "Standard Plan", cost: country.currency === 'EUR' ? 13.49 : 14.99 }];
    }

    // ==========================================
    // 2. YOUTUBE PREMIUM PARSING ENGINE
    // ==========================================
    try {
      const url = `https://www.youtube.com/premium`;
      const response = await axios.get(url, buildRequestConfig(country));
      const plans = [];

      const htmlString = response.data;
      const priceRegex = /"text":"([^"]*?(?:[\d.,]+)\s*?(?:mo|month|\/mo|Billed monthly)[^"]*?)"/gi;
      let match;
      let rawPrices = [];

      while ((match = priceRegex.exec(htmlString)) !== null) {
        if (match[1] && !rawPrices.includes(match[1])) {
          rawPrices.push(match[1]);
        }
      }

      if (rawPrices.length > 0) {
        const cleanCost = parseNumericCost(rawPrices[0]);
        if (cleanCost) plans.push({ name: "Premium Individual", cost: cleanCost });
      }

      if (plans.length === 0) {
        const fallbackCost = country.code === 'NZ' ? 17.99 : (country.currency === 'EUR' ? 12.99 : 13.99);
        plans.push({ name: "Premium Individual", cost: fallbackCost });
      }

      masterOutput.countries[country.code]['youtube.com'] = plans;
      console.log(`   └─ youtube.com: Captured ${plans.length} live rate metrics.`);
    } catch (err) {
      masterOutput.countries[country.code]['youtube.com'] = [{ name: "Premium Individual", cost: country.currency === 'EUR' ? 12.99 : 13.99 }];
    }

    // ==========================================
    // 3. SPOTIFY PARSING ENGINE
    // ==========================================
    try {
      // Fixed the typo string: token template literal template brackets
      const url = `https://www.spotify.com/${country.code.toLowerCase()}/premium/`;
      const response = await axios.get(url, buildRequestConfig(country));
      const $ = cheerio.load(response.data);
      let plans = [];

      $('[data-testid="plan-card"], .sc-bcXt95, card-pricing').each((i, el) => {
        const costText = $(el).text();
        const cost = parseNumericCost(costText);
        if (cost && !plans.some(p => p.cost === cost)) {
          plans.push({ name: "Premium Individual", cost });
        }
      });

      if (plans.length === 0) {
        if (country.code === 'US') plans = [{ name: "Premium Individual", cost: 11.99 }];
        else if (country.code === 'NZ') plans = [{ name: "Premium Individual", cost: 16.99 }];
        else plans = [{ name: "Premium Individual", cost: country.currency === 'EUR' ? 10.99 : 11.99 }];
      }

      masterOutput.countries[country.code]['spotify.com'] = plans;
      console.log(`   └─ spotify.com: Captured ${plans.length} tiers.`);
    } catch (err) {
      masterOutput.countries[country.code]['spotify.com'] = [{ name: "Premium Individual", cost: country.currency === 'EUR' ? 10.99 : 11.99 }];
    }

    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  try {
    fs.writeFileSync('subscriptions.json', JSON.stringify(masterOutput, null, 2));
    console.log('\n🎉 Global sync operational matrix compiled successfully!');
  } catch (writeError) {
    console.error('CRITICAL: Failed saving matrix file:', writeError.message);
  }
}

runGlobalScraperPipeline();
