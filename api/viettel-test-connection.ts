import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

/**
 * Vercel Serverless Function: POST /api/viettel/test-connection
 * Kiểm tra kết nối đến Viettel vInvoice API bằng Basic Authentication.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { serviceUrl, taxCode, username, password, dbConfig } = req.body || {};

  const finalUsername = (dbConfig?.username || username || '').trim();
  const finalPassword = dbConfig?.password || password || '';
  const finalTaxCode = (dbConfig?.tax_code || taxCode || '').trim();

  const getOrigin = (url: string): string => {
    try {
      const u = (url || '').trim().replace(/\/+$/, '');
      const full = u.startsWith('http') ? u : `https://${u}`;
      return new URL(full).origin;
    } catch {
      return 'https://api-vinvoice.viettel.vn';
    }
  };

  const origin = getOrigin(dbConfig?.api_url || serviceUrl || 'https://api-vinvoice.viettel.vn');

  if (!finalUsername || !finalPassword || !finalTaxCode) {
    return res.status(400).json({
      success: false,
      message: 'Thiếu thông tin: username, password hoặc mã số thuế.',
    });
  }

  const base64Auth = Buffer.from(`${finalUsername}:${finalPassword}`).toString('base64');

  // getInvoiceTemplates theo tài liệu Viettel vInvoice dùng GET
  // Thử nhiều path và cả GET + POST để tương thích
  const endpointsToTry: { url: string; method: 'GET' | 'POST' }[] = [
    { url: `${origin}/services/einvoiceapplication/api/InvoiceWS/getInvoiceTemplates/${finalTaxCode}`, method: 'GET' },
    { url: `${origin}/InvoiceWS/getInvoiceTemplates/${finalTaxCode}`, method: 'GET' },
    { url: `${origin}/services/einvoiceapplication/api/InvoiceWS/getInvoiceTemplates/${finalTaxCode}`, method: 'POST' },
    { url: `${origin}/InvoiceWS/getInvoiceTemplates/${finalTaxCode}`, method: 'POST' },
  ];

  console.log(`[TestConnection] taxCode=${finalTaxCode}, origin=${origin}`);

  let lastError: any = null;
  let lastStatus: number = 0;

  for (const { url: ep, method } of endpointsToTry) {
    try {
      console.log(`[TestConnection] ${method} ${ep}`);
      const response = await axios({
        method,
        url: ep,
        ...(method === 'POST' ? { data: {} } : {}),
        headers: {
          'Authorization': `Basic ${base64Auth}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 15000,
        validateStatus: () => true,
      });

      console.log(`[TestConnection] ${ep} → HTTP ${response.status}`);
      lastStatus = response.status;

      if (response.status === 401 || response.status === 403) {
        return res.json({
          success: false,
          message: 'Xác thực thất bại! Sai tên đăng nhập (Mã số thuế) hoặc mật khẩu hóa đơn.',
        });
      }

      // 405 = method sai, thử method kế tiếp
      if (response.status === 405) {
        lastError = new Error(`405 Method Not Allowed tại ${ep}`);
        continue;
      }

      if (response.status === 404) {
        lastError = new Error(`404 Not Found tại ${ep}`);
        continue;
      }

      if (response.status >= 200 && response.status < 300) {
        const data = response.data;
        const isSuccess = !data?.errorCode || data.errorCode === '' || data.errorCode === '0' || data.errorCode === 'SUCCESS';
        if (isSuccess) {
          return res.json({
            success: true,
            message: `Kết nối và xác thực Viettel vInvoice THÀNH CÔNG!`,
            templates: data,
          });
        }
        const errMsg = data.description || `Mã lỗi: ${data.errorCode}`;
        return res.json({
          success: false,
          message: `Kết nối được nhưng Viettel từ chối: ${errMsg}`,
        });
      }

      lastError = new Error(`HTTP ${response.status} từ ${ep}`);
    } catch (err: any) {
      console.warn(`[TestConnection] Lỗi ${ep}:`, err.message);
      lastError = err;
    }
  }

  return res.json({
    success: false,
    message: `Không thể kết nối đến máy chủ Viettel vInvoice. Chi tiết: ${lastError?.message || 'Không có phản hồi'}`,
  });
}
