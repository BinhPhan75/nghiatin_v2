import express from 'express';
import { createServer as createViteServer } from 'vite';
import axios from 'axios';
import xml2js from 'xml2js';
const { parseStringPromise } = xml2js;
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import * as cheerio from 'cheerio';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
            timeout: 5000,
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
