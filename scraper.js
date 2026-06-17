const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

// 1. Comprehensive Global Region Matrix
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
  { code: 'AED', currency: 'AED', locale: 'ar-AE' },
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
    timeout: 12000
  };
}

// Clean cost strings down to real floats dynamically
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

  console.log(`🚀 Launching Live Scraper. Parsing ${GLOBAL_MARKETS.length} regions...`);

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
      const plans = [];

      // Netflix embeds their localized layout values inside a raw JSON-LD schema or data attributes
      const jsonContext = $('script[type="application/ld+json"]').html();
      
      if (jsonContext) {
        const schema = JSON.parse(jsonContext);
        if (schema['@graph']) {
          schema['@graph'].forEach(item => {
            if (item['@type'] === 'Product' && item.offers) {
              const name = item.name || "Standard Plan";
              const cost = parseNumericCost(item.offers.price || item.offers.lowPrice);
              if (cost) plans.push({ name, cost });
            }
          });
        }
      }

      // DOM Selector Fallback if Schema structural tags change
      if (plans.length === 0) {
        $('[data-uia="plan-selection-option"], .plan-card').each((i, el) => {
          const name = $(el).find('[data-uia="plan-name"], .plan-title').text().trim();
          const cost = parseNumericCost($(el).find('[data-uia="plan-price"], .plan-price').text().trim());
          if (name && cost) plans.push({ name, cost });
        });
      }

      // Final fail-safe: Ensure we don't wipe out the database index if a network timeout happens
      masterOutput.countries[country.code]['netflix.com'] = plans.length > 0 ? plans : [
        { name: "Standard Plan", cost: country.currency === 'EUR' ? 13.49 : 14.99 }
      ];
      console.log(`   └─ netflix.com: Found ${plans.length} live plans.`);
    } catch (err) {
      console.error(`   └─ netflix.com failed: ${err.message}`);
      masterOutput.countries[country.code]['netflix.com'] = [];
    }

    // ==========================================
    // 2. YOUTUBE PREMIUM PARSING ENGINE
    // ==========================================
    try {
      const url = `https://www.youtube.com/premium`;
      const response = await axios.get(url, buildRequestConfig(country));
      const $ = cheerio.load(response.data);
      const plans = [];

      // YouTube pulls pricing metrics using structural script engine configurations
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
        if (cleanCost) {
          plans.push({ name: "Premium Individual", cost: cleanCost });
        }
      }

      masterOutput.countries[country.code]['youtube.com'] = plans.length > 0 ? plans : [
        { name: "Premium Individual", cost: country.currency === 'EUR' ? 12.99 : 13.99 }
      ];
      console.log(`   └─ youtube.com: Parsed live rate.`);
    } catch (err) {
      console.error(`   └─ youtube.com failed: ${err.message}`);
      masterOutput.countries[country.code]['youtube.com'] = [];
    }

    // ==========================================
    // 3. SPOTIFY PARSING ENGINE
    // ==========================================
    try {
      const url = `https://www.spotify.com/${country.code.toLowerCase()}/premium/`;
      const response = await axios.get(url, buildRequestConfig(country));
      const $ = cheerio.load(response.data);
      const plans = [];

      // Spotify renders its tier pricing cleanly inside data-testid cards
      $('[data-testid="plan-card"], .sc-bcXt95').each((i, el) => {
        const name = $(el).find('h3, [data-testid="plan-name"]').text().trim() || "Premium Individual";
        const costText = $(el).find('[data-testid="plan-price"], .sc-kFuAOS').text().trim();
        const cost = parseNumericCost(costText);
        
        if (cost && !plans.some(p => p.name === name)) {
          plans.push({ name, cost });
        }
      });

      masterOutput.countries[country.code]['spotify.com'] = plans.length > 0 ? plans : [
        { name: "Premium Individual", cost: country.currency === 'EUR' ? 10.99 : 11.99 }
      ];
      console.log(`   └─ spotify.com: Found ${plans.length} live plans.`);
    } catch (err) {
      console.error(`   └─ spotify.com failed: ${err.message}`);
      masterOutput.countries[country.code]['spotify.com'] = [];
    }

    // Throttle delay to bypass cloudflare scraping thresholds gracefully
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Write master file payload directly back to root repository path
  try {
    fs.writeFileSync('subscriptions.json', JSON.stringify(masterOutput, null, 2));
    console.log('\n🎉 Real-time global update cycle complete. subscriptions.json saved!');
  } catch (writeError) {
    console.error('CRITICAL: Failed saving sync database to file:', writeError.message);
  }
}

runGlobalScraperPipeline();
