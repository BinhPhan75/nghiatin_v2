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

  // Xác định base origin từ serviceUrl
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

  const endpointsToTry = [
    `${origin}/services/einvoiceapplication/api/InvoiceWS/getInvoiceTemplates/${finalTaxCode}`,
    `${origin}/InvoiceWS/getInvoiceTemplates/${finalTaxCode}`,
  ];

  console.log(`[TestConnection] taxCode=${finalTaxCode}, origin=${origin}`);

  let lastError: any = null;

  for (const ep of endpointsToTry) {
    try {
      console.log(`[TestConnection] Thử endpoint: ${ep}`);
      const response = await axios.post(ep, {}, {
        headers: {
          'Authorization': `Basic ${base64Auth}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 15000,
        validateStatus: () => true,
      });

      console.log(`[TestConnection] ${ep} → HTTP ${response.status}`);

      if (response.status === 401 || response.status === 403) {
        return res.json({
          success: false,
          message: 'Xác thực thất bại! Sai tên đăng nhập (Mã số thuế) hoặc mật khẩu hóa đơn.',
        });
      }

      if (response.status === 404) {
        lastError = new Error(`404 tại ${ep}`);
        continue;
      }

      if (response.status >= 200 && response.status < 300) {
        const data = response.data;
        // errorCode rỗng hoặc không có = thành công
        if (!data?.errorCode || data.errorCode === '' || data.errorCode === '0' || data.errorCode === 'SUCCESS') {
          return res.json({
            success: true,
            message: `Kết nối và xác thực Viettel vInvoice THÀNH CÔNG! (${ep})`,
            templates: data,
          });
        }

        const errMsg = data.description || `Mã lỗi: ${data.errorCode}`;
        return res.json({
          success: false,
          message: `Kết nối được nhưng Viettel từ chối: ${errMsg}`,
        });
      }

      // 5xx hoặc khác
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
