import express from 'express';
import { createServer as createViteServer } from 'vite';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import * as cheerio from 'cheerio';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

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

  // Viettel Proxy Route
  app.post('/api/viettel-proxy', async (req, res) => {
    const { endpoint, method, payload, config } = req.body;

    if (!config || !config.username || !config.password) {
      return res.status(400).json({ error: 'Thiếu cấu hình Viettel' });
    }

    try {
      const authHeader = Buffer.from(`${config.username}:${config.password}`).toString('base64');
      
      const response = await axios({
        url: endpoint,
        method: method || 'POST',
        data: payload,
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 90000 // Viettel recommends 60-90s timeout
      });

      res.json(response.data);
    } catch (error: any) {
      console.error('Viettel Proxy Error:', error.response?.data || error.message);
      res.status(error.response?.status || 500).json({
        error: 'Lỗi kết nối Viettel qua Proxy',
        details: error.response?.data || error.message
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
