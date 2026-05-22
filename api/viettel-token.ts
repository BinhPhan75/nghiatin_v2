import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

/**
 * Vercel Serverless Function: POST /api/viettel/token
 * Xác thực tài khoản Viettel vInvoice, trả về access_token hoặc Basic Auth token.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { username, password, authUrl, taxCode } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Thiếu username hoặc password' });
  }

  // Chuẩn hóa auth URL
  const normalizeAuthUrl = (url: string): string => {
    let u = (url || '').trim().replace(/\/+$/, '');
    if (!u) return 'https://api-vinvoice.viettel.vn/auth/login';
    if (!u.startsWith('http://') && !u.startsWith('https://')) u = 'https://' + u;
    try {
      const parsed = new URL(u);
      const origin = parsed.origin;
      const p = parsed.pathname;
      if (p === '/' || p === '') return `${origin}/auth/login`;
      if (p.endsWith('/auth/login')) return u;
      if (!p.includes('/auth/')) return `${origin}/auth/login`;
      return u;
    } catch {
      return u.includes('/auth/login') ? u : `${u}/auth/login`;
    }
  };

  const primaryUrl = normalizeAuthUrl(authUrl);
  const originBase = (() => {
    try { return new URL(primaryUrl).origin; } catch { return 'https://api-vinvoice.viettel.vn'; }
  })();

  const urlsToTry = [
    primaryUrl,
    `${originBase}/auth/login`,
    `${originBase}/services/einvoiceapplication/api/auth/login`,
  ].filter((v, i, a) => a.indexOf(v) === i);

  let lastResponse: any = null;

  // Thử đăng nhập JSON (vInvoice v2.49+)
  for (const url of urlsToTry) {
    try {
      console.log(`[Token] Thử JSON login: ${url}`);
      const response = await axios.post(url, { username, password }, {
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        timeout: 8000,
        validateStatus: () => true,
      });

      console.log(`[Token] ${url} → HTTP ${response.status}`);
      lastResponse = response;

      if (response.status >= 200 && response.status < 300) {
        console.log(`[Token] Đăng nhập JSON thành công tại: ${url}`);
        return res.json(response.data);
      }

      if (response.status === 401 || response.status === 403) break;
    } catch (err: any) {
      console.warn(`[Token] Lỗi kết nối ${url}:`, err.message);
    }
  }

  // Fallback: Basic Authentication qua getInvoiceTemplates
  const targetTaxCode = (taxCode || username || '').trim();
  const isMissingOrNotFound =
    !lastResponse || [404, 502, 503, 504].includes(lastResponse?.status);

  if (isMissingOrNotFound && targetTaxCode) {
    try {
      const base64Auth = Buffer.from(`${username.trim()}:${password}`).toString('base64');
      const testEndpoints = [
        `${originBase}/services/einvoiceapplication/api/InvoiceWS/getInvoiceTemplates/${targetTaxCode}`,
        `${originBase}/InvoiceWS/getInvoiceTemplates/${targetTaxCode}`,
      ];

      for (const ep of testEndpoints) {
        try {
          console.log(`[Token Fallback] Basic Auth test: ${ep}`);
          const testRes = await axios.post(ep, {}, {
            headers: {
              'Authorization': `Basic ${base64Auth}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            timeout: 10000,
            validateStatus: () => true,
          });

          console.log(`[Token Fallback] ${ep} → HTTP ${testRes.status}`);

          // 401/403 = sai credentials, dừng luôn
          if (testRes.status === 401 || testRes.status === 403) {
            return res.status(401).json({
              error: 'Xác thực thất bại',
              details: 'Sai tên đăng nhập hoặc mật khẩu Viettel vInvoice.',
            });
          }

          // Bất kỳ status nào khác 401/403/502/504 = credentials OK
          if (![502, 504].includes(testRes.status)) {
            console.log(`[Token Fallback] Basic Auth thành công!`);
            return res.json({
              access_token: base64Auth,
              token_type: 'Basic',
              description: 'Xác thực Basic Authentication thành công',
            });
          }
        } catch (e: any) {
          console.warn(`[Token Fallback] Lỗi ${ep}:`, e.message);
        }
      }
    } catch (e: any) {
      console.error('[Token Fallback] Lỗi tổng:', e.message);
    }
  }

  // Trả về lỗi chi tiết
  if (lastResponse) {
    return res.status(lastResponse.status || 500).json({
      error: 'Viettel Auth Error',
      status: lastResponse.status,
      details: lastResponse.data,
    });
  }

  return res.status(500).json({
    error: 'Viettel Auth Error',
    message: 'Tất cả cổng kết nối Viettel đều thất bại hoặc không phản hồi.',
  });
}
