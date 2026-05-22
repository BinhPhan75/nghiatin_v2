import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

/**
 * Vercel Serverless Function: POST /api/viettel/create-invoice
 * Tạo hóa đơn nháp trên Viettel vInvoice (importInvoice - Thông tư 78).
 */

function generateUUIDv4(): string {
  if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
    return (crypto as any).randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const numberToVietnameseWords = (amount: number): string => {
  if (amount === 0) return 'Không đồng';
  const units = ['', 'nghìn', 'triệu', 'tỷ'];
  const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

  const readThree = (n: number): string => {
    const hundreds = Math.floor(n / 100);
    const tens = Math.floor((n % 100) / 10);
    const ones = n % 10;
    let result = '';
    if (hundreds > 0) result += digits[hundreds] + ' trăm ';
    if (tens > 1) {
      result += digits[tens] + ' mươi ';
      if (ones > 0) result += (ones === 5 ? 'lăm' : digits[ones]) + ' ';
    } else if (tens === 1) {
      result += 'mười ';
      if (ones > 0) result += (ones === 5 ? 'lăm' : digits[ones]) + ' ';
    } else if (ones > 0 && hundreds > 0) {
      result += 'lẻ ' + digits[ones] + ' ';
    } else if (ones > 0) {
      result += digits[ones] + ' ';
    }
    return result.trim();
  };

  let n = Math.round(amount);
  const parts: string[] = [];
  let unitIndex = 0;
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk > 0) parts.unshift(readThree(chunk) + (units[unitIndex] ? ' ' + units[unitIndex] : ''));
    n = Math.floor(n / 1000);
    unitIndex++;
  }
  const result = parts.join(' ').trim();
  return result.charAt(0).toUpperCase() + result.slice(1) + ' đồng';
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { serviceUrl, taxCode, token, payload, dbConfig } = req.body || {};

  // Lấy credentials từ dbConfig hoặc token
  const finalTaxCode = (dbConfig?.tax_code || taxCode || '').trim();
  let finalUsername = (dbConfig?.username || finalTaxCode).trim();
  let finalPassword = dbConfig?.password || '';

  // Giải mã token Basic Auth nếu có
  if (token && !finalPassword) {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf8');
      if (decoded.includes(':')) {
        const parts = decoded.split(':');
        finalUsername = parts[0];
        finalPassword = parts.slice(1).join(':');
      }
    } catch {
      finalPassword = token;
    }
  }

  if (!finalUsername || !finalPassword || !finalTaxCode) {
    return res.status(400).json({
      errorCode: 'MISSING_CONFIG',
      description: 'Thiếu thông tin cấu hình: username, password hoặc mã số thuế.',
    });
  }

  // Xác định base origin
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
  const base64Auth = Buffer.from(`${finalUsername}:${finalPassword}`).toString('base64');

  // Chuẩn bị payload đầy đủ
  const transactionUuid = generateUUIDv4();
  const templateCode = (dbConfig?.template_code || payload?.generalInvoiceInfo?.templateCode || '').trim();
  const invoiceSeries = (dbConfig?.invoice_series || payload?.generalInvoiceInfo?.invoiceSeries || '').trim();

  const { generalInvoiceInfo, itemInfo = [], summarizeInfo = {}, buyerInfo = {}, payments = [] } = payload || {};

  // Tính taxBreakdowns (bắt buộc theo DTO Viettel)
  const taxBreakdowns = [
    {
      taxPercentage: 0,
      taxableAmount: summarizeInfo.totalAmountWithoutTax || 0,
      taxAmount: 0,
    },
  ];

  // Số tiền bằng chữ
  const totalWords = numberToVietnameseWords(summarizeInfo.totalAmountWithTax || 0);

  const finalPayload = {
    generalInvoiceInfo: {
      invoiceType: generalInvoiceInfo?.invoiceType || '1',
      templateCode,
      invoiceSeries,
      invoiceIssuedDate: generalInvoiceInfo?.invoiceIssuedDate || Date.now(),
      currencyCode: 'VND',
      adjustmentType: '1',
      paymentStatus: true,
      cusGetInvoiceRight: true,
      transactionUuid,
    },
    buyerInfo: {
      buyerName: buyerInfo.buyerName || '',
      buyerIdNo: buyerInfo.buyerIdNo || '',
      buyerIdType: buyerInfo.buyerIdType || '1',
      buyerAddressLine: buyerInfo.buyerAddressLine || '',
      buyerNotGetInvoice: buyerInfo.buyerNotGetInvoice ?? 1,
    },
    sellerInfo: {
      sellerTaxCode: finalTaxCode,
    },
    payments: payments.length > 0 ? payments : [{ paymentMethodName: 'TM/CK' }],
    itemInfo: itemInfo.map((item: any, idx: number) => ({
      lineNumber: idx + 1,
      itemCode: item.itemCode || 'GOLD',
      itemName: item.itemName || '',
      unitName: item.unitName || 'Món',
      unitPrice: item.unitPrice || 0,
      quantity: item.quantity || 1,
      itemTotalAmountWithoutTax: item.itemTotalAmountWithoutTax || 0,
      taxPercentage: item.taxPercentage ?? 0,
      taxAmount: item.taxAmount ?? 0,
      itemTotalAmountWithTax: item.itemTotalAmountWithTax || 0,
      discount: item.discount ?? 0,
      itemDiscount: item.itemDiscount ?? 0,
      selection: item.selection ?? 1,
    })),
    summarizeInfo: {
      sumOfTotalLineAmountWithoutTax: summarizeInfo.sumOfTotalLineAmountWithoutTax || summarizeInfo.totalAmountWithoutTax || 0,
      totalAmountWithoutTax: summarizeInfo.totalAmountWithoutTax || 0,
      totalTaxAmount: summarizeInfo.totalTaxAmount ?? 0,
      totalAmountWithTax: summarizeInfo.totalAmountWithTax || 0,
      totalAmountWithTaxInWords: totalWords,
      discountAmount: summarizeInfo.discountAmount ?? 0,
    },
    taxBreakdowns,
  };

  // Endpoints theo thứ tự ưu tiên (Thông tư 78 - không dùng /InvoiceAPI)
  const endpoints = [
    `${origin}/services/einvoiceapplication/api/InvoiceWS/importInvoice/${finalTaxCode}`,
    `${origin}/InvoiceWS/importInvoice/${finalTaxCode}`,
  ];

  console.log(`[CreateInvoice] taxCode=${finalTaxCode}, uuid=${transactionUuid}`);
  console.log(`[CreateInvoice] templateCode=${templateCode}, series=${invoiceSeries}`);

  let lastError: any = null;

  for (const ep of endpoints) {
    try {
      console.log(`[CreateInvoice] POST → ${ep}`);
      const response = await axios.post(ep, finalPayload, {
        headers: {
          'Authorization': `Basic ${base64Auth}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 75000,
        validateStatus: () => true,
      });

      console.log(`[CreateInvoice] ${ep} → HTTP ${response.status}`);

      if (response.status === 404) {
        lastError = new Error(`404 tại ${ep}`);
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        return res.status(401).json({
          errorCode: 'AUTH_FAILED',
          description: 'Xác thực thất bại! Sai tên đăng nhập hoặc mật khẩu Viettel vInvoice.',
        });
      }

      const data = response.data;
      console.log(`[CreateInvoice] Response:`, JSON.stringify(data).substring(0, 500));

      if (response.status >= 200 && response.status < 300) {
        const isSuccess =
          !data.errorCode ||
          data.errorCode === '' ||
          data.errorCode === '0' ||
          data.errorCode === 'SUCCESS';

        if (isSuccess && data.result) {
          const invoiceNo = data.result.invoiceNo || `NHAP-${data.result.transactionID || transactionUuid.substring(0, 8)}`;
          console.log(`[CreateInvoice] THÀNH CÔNG! invoiceNo=${invoiceNo}`);
          return res.json({
            errorCode: null,
            description: 'Tạo hóa đơn nháp thành công',
            result: { ...data.result, invoiceNo },
          });
        }

        // Viettel trả về lỗi nghiệp vụ
        const errCode = data.errorCode || 'BUSINESS_ERROR';
        const errDesc = data.description || 'Viettel từ chối yêu cầu';
        console.error(`[CreateInvoice] Lỗi nghiệp vụ: ${errCode} - ${errDesc}`);
        return res.status(422).json({ errorCode: errCode, description: errDesc, raw: data });
      }

      // HTTP lỗi khác
      lastError = new Error(`HTTP ${response.status}: ${JSON.stringify(data).substring(0, 200)}`);
      return res.status(response.status).json({
        errorCode: `HTTP_${response.status}`,
        description: `Lỗi từ máy chủ Viettel: ${JSON.stringify(data)}`,
      });

    } catch (err: any) {
      console.warn(`[CreateInvoice] Lỗi kết nối ${ep}:`, err.message);
      lastError = err;
    }
  }

  return res.status(500).json({
    errorCode: 'CONNECTION_FAILED',
    description: `Không thể kết nối đến Viettel vInvoice. Lỗi cuối: ${lastError?.message || 'Không có phản hồi'}`,
  });
}
