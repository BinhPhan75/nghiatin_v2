import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import axios from 'axios';
import xml2js from 'xml2js';
const { parseStringPromise } = xml2js;
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

console.log('[Server] Starting initialization...');

async function startServer() {
  console.log('[Server] Initializing Express...');
  const app = express();
  const PORT = 3000;

  // Logging middleware
  app.use((req, res, next) => {
    console.log(`[Server] ${req.method} ${req.url}`);
    next();
  });

  app.use(express.json({ limit: '20mb' }));

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      env: {
        hasGeminiKey: !!process.env.GEMINI_API_KEY,
        hasSupabaseUrl: !!process.env.VITE_SUPABASE_URL
      }
    });
  });

  // API Route to analyze CCCD via Gemini (Server-side to protect API Key)
  app.post('/api/ai/analyze-cccd', async (req, res) => {
    const { base64Image } = req.body;
    if (!base64Image) return res.status(400).json({ error: 'Missing image data' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on server' });
    }

    try {
      const ggenai = await import("@google/generative-ai") as any;
      const GoogleGenAI = ggenai.GoogleGenAI;
      const genAI = new GoogleGenAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: {
          responseMimeType: "application/json"
        }
      });

      const prompt = `You are an expert OCR system for Vietnamese ID Cards (CCCD and older CMND). 
                      Extract the following information from the provided IMAGE of the FRONT side of the card:
                      - id: The 9 or 12 digit number (Số/No.)
                      - name: The full name (Họ và tên) in ALL CAPS.
                      - dob: The date of birth (Ngày sinh) in DD/MM/YYYY format.
                      - address: The place of residence (Nơi thường trú). 
                      - cardType: 'OLD' if 9-digit CMND, 'NEW' if 12-digit without chip, 'ELECTRONIC' if with chip.
                      - side: Should be 'FRONT'.
                      
                      Rules:
                      1. If information is not clearly visible, leave as empty string.
                      2. Return ONLY a valid JSON object matching the requested fields.`;

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Image.includes(',') ? base64Image.split(',')[1] : base64Image
          }
        }
      ]);

      const text = result.response.text();
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error('Gemini Server Error:', error);
      res.status(500).json({ error: 'AI Analysis Failed', details: error.message });
    }
  });

  // API Route to fetch SJC prices
  app.get('/api/gold-prices/sjc', async (req, res) => {
    try {
      // Primary source: SJC XML (Trying alternative paths)
      const urls = [
        'https://sjc.com.vn/xml/tygiavang.xml',
        'http://sjc.com.vn/xml/tygiavang.xml',
        'https://www.sjc.com.vn/xml/tygiavang.xml'
      ];
      
      let data: any = null;
      for (const url of urls) {
        try {
          const response = await axios.get(url, {
            timeout: 2000, // Reduced from 5000 to improve responsiveness
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              'Referer': 'https://sjc.com.vn/'
            }
          });
          if (response.data) {
            const parsedData = await parseStringPromise(response.data);
            const cities = parsedData.ratelist.city;
            const hcmCity = cities.find((c: any) => c.$.name === 'Hồ Chí Minh') || cities[0];
            data = {
              updatedAt: parsedData.ratelist.updated,
              items: hcmCity.item.map((i: any) => ({
                type: i.$.type,
                buy: i.$.buy,
                sell: i.$.sell
              }))
            };
            break;
          }
        } catch (e) {
          console.warn(`Failed to fetch from ${url}, trying next...`);
        }
      }

      // Final fallback: Scrape webgia.com if XML fails
      if (!data) {
        console.log('Falling back to webgia.com scraping...');
        const response = await axios.get('https://webgia.com/gia-vang/sjc/', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        const $ = cheerio.load(response.data);
        const items: any[] = [];
        
        // Find the main pricing table
        $('table tr').each((i, el) => {
          const cells = $(el).find('td');
          if (cells.length >= 3) {
            const type = $(cells[0]).text().trim();
            const buy = $(cells[1]).text().trim();
            const sell = $(cells[2]).text().trim();
            // Basic filter to ensure we are getting price rows
            if (buy.includes(',') || !isNaN(parseFloat(buy.replace(/\./g, '')))) {
               items.push({ type, buy, sell });
            }
          }
        });

        if (items.length > 0) {
          data = {
            updatedAt: 'Cập nhật từ webgia.com',
            items: items.slice(0, 15) // Limit to avoid noise
          };
        }
      }

      if (data) {
        res.json(data);
      } else {
        throw new Error('All gold price sources failed');
      }
    } catch (error) {
      console.error('Error fetching SJC prices:', error);
      res.status(500).json({ error: 'Failed to fetch SJC gold prices' });
    }
  });

  // Flexible Viettel Proxy Route
  app.post('/api/viettel-proxy', async (req, res) => {
    console.log('[Proxy] Incoming request to /api/viettel-proxy');
    const { endpoint, method, payload, headers } = req.body;

    if (!endpoint) {
      console.warn('[Proxy] Missing endpoint in request body');
      return res.status(400).json({ error: 'Thiếu endpoint' });
    }

    try {
      console.log(`[Proxy] Forwarding ${method || 'POST'} to ${endpoint}`);
      
      const response = await axios({
        url: endpoint,
        method: method || 'POST',
        data: payload,
        headers: headers || {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 60000 
      });

      console.log(`[Proxy] Success from Viettel: ${endpoint}`);
      res.json(response.data);
    } catch (error: any) {
      const status = error.response?.status || 500;
      const errorData = error.response?.data || error.message;
      console.error(`[Proxy Error] ${endpoint} (${status}):`, errorData);
      
      res.status(status).json({
        error: 'Proxy Error',
        message: error.message,
        details: errorData
      });
    }
  });

  // Helper to normalize URLs
  const normalizeAuthUrl = (urlInput: string): string => {
    let url = (urlInput || '').trim();
    if (!url) {
      return 'https://api-vinvoice.viettel.vn/auth/login';
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    url = url.replace(/\/+$/, '');
    try {
      const parsed = new URL(url);
      const origin = parsed.origin;
      const path = parsed.pathname;
      if (path === '/' || path === '') {
        return `${origin}/auth/login`;
      }
      if (path.endsWith('/auth/login')) {
        return url;
      }
      if (!path.includes('/auth/')) {
        if (path.includes('/services/')) {
          return `${origin}/auth/login`;
        }
        return `${url}/auth/login`;
      }
      return url;
    } catch (e) {
      if (!url.includes('/auth/login')) {
        return `${url}/auth/login`;
      }
      return url;
    }
  };

  const normalizeServiceUrl = (urlInput: string): string => {
    let url = (urlInput || '').trim();
    if (!url) {
      return 'https://api-vinvoice.viettel.vn/services/einvoiceapplication/api';
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    url = url.replace(/\/+$/, '');
    try {
      const parsed = new URL(url);
      const origin = parsed.origin;
      const path = parsed.pathname;
      if (path === '/' || path === '') {
        return `${origin}/services/einvoiceapplication/api`;
      }
      if (path.includes('/services/einvoiceapplication/api')) {
        return url;
      }
      if (path.includes('/auth/')) {
        return `${origin}/services/einvoiceapplication/api`;
      }
      return `${url}/services/einvoiceapplication/api`;
    } catch (e) {
      if (!url.includes('/services/einvoiceapplication/api')) {
        return `${url}/services/einvoiceapplication/api`;
      }
      return url;
    }
  };

  // Dedicated Viettel Token Route updated for v2.49 (JSON login)
  app.post('/api/viettel/token', async (req, res) => {
    const { username, password, authUrl } = req.body;
    
    // Normalize user entered login API path
    const primaryUrl = normalizeAuthUrl(authUrl);
    let urlsToTry = [primaryUrl];
    
    try {
      const parsed = new URL(primaryUrl);
      const origin = parsed.origin;
      const var1 = `${origin}/auth/login`;
      const var2 = `${origin}/services/einvoiceapplication/api/auth/login`;
      
      if (!urlsToTry.includes(var1)) urlsToTry.push(var1);
      if (!urlsToTry.includes(var2)) urlsToTry.push(var2);
    } catch (e) {
      // ignore
    }

    let lastResponse: any = null;

    for (const url of urlsToTry) {
        console.log(`[Viettel Token] Trying normalized endpoint: ${url}`);
        try {
            const response = await axios.post(url, {
                username,
                password
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 30000,
                validateStatus: () => true
            });
            
            console.log(`[Viettel Token Output] URL: ${url}, Status: ${response.status}`);
            lastResponse = response;

            if (response.status >= 200 && response.status < 300) {
                console.log(`[Viettel Token Success] Access Token obtained via URL: ${url}`);
                return res.json(response.data);
            }
            
            // If Credentials are flat empty or wrong (401 or 403), stop attempting other gateways
            if (response.status === 401 || response.status === 403) {
                console.log(`[Viettel Token Credentials Issue] Auth failure (${response.status}) at ${url}`);
                break;
            }
        } catch (error: any) {
            console.error(`[Viettel Token Exception] URL: ${url}, Error: ${error.message}`);
        }
    }

    if (lastResponse) {
        return res.status(lastResponse.status).json({
            error: 'Viettel Auth Error',
            status: lastResponse.status,
            details: lastResponse.data
        });
    }

    res.status(500).json({ error: 'Viettel Auth Error', message: 'All login endpoints failed or timed out' });
  });

  // Dedicated Viettel Create Invoice Route updated for v2.49 (Basic auth)
  app.post('/api/viettel/create-invoice', async (req, res) => {
    const { serviceUrl, taxCode, token, payload } = req.body;
    
    // Normalize service url safely
    const normalizedSvc = normalizeServiceUrl(serviceUrl);
    let invoiceUrl = '';
    const cleanSvcStr = normalizedSvc.replace(/\/+$/, '');
    
    if (cleanSvcStr.includes('/InvoiceAPI/InvoiceWS/createInvoice')) {
      const baseUrlPart = cleanSvcStr.split('/InvoiceAPI/')[0];
      invoiceUrl = `${baseUrlPart}/InvoiceAPI/InvoiceWS/createInvoice/${taxCode}`;
    } else {
      invoiceUrl = `${cleanSvcStr}/InvoiceAPI/InvoiceWS/createInvoice/${taxCode}`;
    }

    console.log(`[Viettel Invoice] Creating invoice at: ${invoiceUrl}`);
    console.log(`[Viettel Invoice Header]: Authorization: Basic ${token ? token.substring(0, 10) + '...' : 'MISSING'}`);
    
    try {
      const response = await axios.post(invoiceUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Basic ${token}`
        },
        timeout: 60000,
        validateStatus: () => true
      });
      
      console.log(`[Viettel Invoice] URL: ${invoiceUrl}, Status: ${response.status}`);
      console.log(`[Viettel Invoice Response Body]:`, JSON.stringify(response.data));
      
      if (response.status >= 200 && response.status < 300) {
        res.json(response.data);
      } else {
        res.status(response.status).json({
          error: 'Viettel Creation Error',
          status: response.status,
          details: response.data
        });
      }
    } catch (error: any) {
      console.error(`[Viettel Invoice Exception]:`, error.message);
      res.status(500).json({
        error: 'Viettel Server Exception',
        message: error.message
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
