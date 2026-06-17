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
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    },
    timeout: 10000
  };
}

function parseNumericCost(text) {
  if (!text) return null;
  const match = text.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

async function runScraper() {
  const masterOutput = { meta: { lastUpdated: new Date().toISOString(), status: "active" }, countries: {} };

  for (const country of GLOBAL_MARKETS) {
    masterOutput.countries[country.code] = { currency: country.currency };
    console.log(`Processing: ${country.code}`);

    // Netflix
    try {
      const resp = await axios.get(`https://www.netflix.com/${country.code.toLowerCase()}/`, buildRequestConfig(country));
      const $ = cheerio.load(resp.data);
      const plans = [];
      $('[data-uia="plan-selection-option"]').each((i, el) => {
        const cost = parseNumericCost($(el).text());
        if (cost) plans.push({ name: "Plan", cost });
      });
      masterOutput.countries[country.code]['netflix.com'] = plans;
    } catch (e) {
      masterOutput.countries[country.code]['netflix.com'] = [];
    }

    // YouTube
    try {
      const resp = await axios.get(`https://www.youtube.com/premium?gl=${country.code}`, buildRequestConfig(country));
      const match = resp.data.match(/"text":"([\d.]+).*?\/mo"/);
      masterOutput.countries[country.code]['youtube.com'] = match ? [{ name: "Premium", cost: parseFloat(match[1]) }] : [];
    } catch (e) {
      masterOutput.countries[country.code]['youtube.com'] = [];
    }

    // Spotify
    try {
      const resp = await axios.get(`https://www.spotify.com/${country.code.toLowerCase()}/premium/`, buildRequestConfig(country));
      const $ = cheerio.load(resp.data);
      const plans = [];
      $('.price').each((i, el) => {
        const cost = parseNumericCost($(el).text());
        if (cost) plans.push({ name: "Premium", cost });
      });
      masterOutput.countries[country.code]['spotify.com'] = plans;
    } catch (e) {
      masterOutput.countries[country.code]['spotify.com'] = [];
    }

    await new Promise(r => setTimeout(r, 2000));
  }
  fs.writeFileSync('subscriptions.json', JSON.stringify(masterOutput, null, 2));
}

runScraper();
