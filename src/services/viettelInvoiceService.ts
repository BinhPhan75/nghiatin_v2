import axios from 'axios';
import { supabase } from '../lib/supabase';
import { Transaction } from '../types';

export interface ViettelConfig {
  viettelApiUrl: string;
  viettelUsername: string;
  viettelPassword?: string;
  viettelSupplierTaxCode: string;
  viettelTemplateCode: string;
  viettelInvoiceSeries: string;
  viettelEnabled: boolean;
}

export interface InvoiceResult {
  success: boolean;
  invoiceNo: string;
  message: string;
}

/**
 * Get Viettel configuration from system_config
 */
export async function getViettelConfig(): Promise<ViettelConfig | null> {
  const { data, error } = await supabase
    .from('system_config')
    .select('*')
    .limit(1)
    .single();

  if (error || !data || !data.viettel_einvoice_config) return null;
  
  return data.viettel_einvoice_config as ViettelConfig;
}

/**
 * 2.1 Get Access Token using OAuth2 password grant
 */
export async function getViettelAccessToken(config: ViettelConfig): Promise<string> {
  if (!config.viettelApiUrl || !config.viettelApiUrl.startsWith('http')) {
    throw new Error('URL API Viettel không hợp lệ. Vui lòng kiểm tra cấu hình.');
  }

  let baseUrl = config.viettelApiUrl.trim().replace(/\/$/, '');
  const urlParts = baseUrl.split('/');
  
  // High-precision derivation of OAuth URL for Viettel SInvoice
  let oauthUrls = [];
  
  // 1. If it contains 'InvoiceAPI', try parallel levels
  if (baseUrl.includes('InvoiceAPI')) {
    const apiIndex = urlParts.indexOf('InvoiceAPI');
    if (apiIndex > 0) {
      oauthUrls.push(urlParts.slice(0, apiIndex).join('/') + '/auth/oauth/token');
    }
    // Standard structure: .../api/InvoiceAPI/InvoiceWS -> .../api/auth/oauth/token
    oauthUrls.push(urlParts.slice(0, -2).join('/') + '/auth/oauth/token');
  }
  
  // 2. Generic fallback: https://domain/auth/oauth/token
  oauthUrls.push(`${urlParts[0]}//${urlParts[2]}/auth/oauth/token`);
  
  // 3. Another variant: https://domain/services/einvoiceapplication/api/auth/oauth/token
  if (baseUrl.includes('services/einvoiceapplication')) {
     const svcIndex = baseUrl.indexOf('services/einvoiceapplication');
     const rootPart = baseUrl.substring(0, svcIndex + 'services/einvoiceapplication/api'.length);
     oauthUrls.push(rootPart + '/auth/oauth/token');
  }

  // Remove duplicates
  oauthUrls = Array.from(new Set(oauthUrls));

  let lastErr = null;
  for (const oauthUrl of oauthUrls) {
    try {
      const params = new URLSearchParams();
      params.append('username', config.viettelUsername);
      params.append('password', config.viettelPassword || '');
      params.append('grant_type', 'password');

      console.log(`[Service] Attempting Token from: ${oauthUrl}`);

      const response = await axios.post('/api/viettel-proxy', {
        endpoint: oauthUrl,
        method: 'POST',
        payload: params.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      });

      if (response.data && response.data.access_token) {
        return response.data.access_token;
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message;
      console.warn(`[Service] Failed token attempt at ${oauthUrl}:`, errorMsg);
      lastErr = error;
    }
  }

  const details = lastErr?.response?.data?.details || 
                  lastErr?.response?.data?.message || 
                  lastErr?.response?.data?.error_description || 
                  lastErr?.message || '';
  throw new Error('Lỗi xác thực Viettel: ' + details);
}

/**
 * 2.2 Create Invoice
 */
export async function createInvoice(
  config: ViettelConfig, 
  transaction: Transaction
): Promise<InvoiceResult> {
  try {
    // 1. Get token
    const token = await getViettelAccessToken(config);
    
    // 2. Prepare Payload
    const transactionUuid = crypto.randomUUID();
    
    const payload = {
      generalInvoiceInfo: {
        invoiceType: "1",
        templateCode: config.viettelTemplateCode,
        invoiceSeries: config.viettelInvoiceSeries,
        currencyCode: "VND",
        adjustmentType: "1",
        paymentStatus: true,
        transactionUuid: transactionUuid
      },
      buyerInfo: {
        buyerName: transaction.customer_name,
        buyerIdNo: transaction.customer_cccd,
        buyerIdType: "1",
        buyerAddressLine: transaction.dia_chi || "",
        buyerNotGetInvoice: 1
      },
      payments: [
        { "paymentMethodName": "TM/CK" }
      ],
      itemInfo: [
        {
          itemCode: transaction.product_id || "GOLD",
          itemName: transaction.product_name,
          unitName: transaction.unit || "Món",
          unitPrice: transaction.price_per_unit,
          quantity: transaction.quantity,
          itemTotalAmountWithoutTax: transaction.total_amount,
          taxPercentage: 0,
          taxAmount: 0,
          itemTotalAmountWithTax: transaction.total_amount,
          discount: 0,
          itemDiscount: 0,
          selection: 1
        }
      ],
      summarizeInfo: {
        discountAmount: 0,
        totalAmountWithoutTax: transaction.total_amount,
        totalTaxAmount: 0,
        totalAmountWithTax: transaction.total_amount,
        totalAmountAfterDiscount: transaction.total_amount
      }
    };

    // Clean up endpoint: remove InvoiceWS if present
    let apiRoot = config.viettelApiUrl.trim().replace(/\/$/, '');
    if (apiRoot.endsWith('InvoiceWS')) {
      apiRoot = apiRoot.replace(/\/InvoiceWS$/, '');
    }

    const endpoint = `${apiRoot}/createInvoice/${config.viettelSupplierTaxCode}`;

    console.log(`[Service] Creating invoice at: ${endpoint}`);

    const response = await axios.post('/api/viettel-proxy', {
      endpoint,
      method: 'POST',
      payload,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    const data = response.data;
    // Viettel result structure can vary; checking common success markers
    const isSuccess = data.errorCode === "0" || !data.errorCode || data.result === "SUCCESS";

    if (isSuccess && (data.invoiceNo || data.result?.invoiceNo)) {
      return {
        success: true,
        invoiceNo: data.invoiceNo || data.result.invoiceNo,
        message: "Xuất hóa đơn thành công"
      };
    } else {
      return {
        success: false,
        invoiceNo: "",
        message: data.description || data.message || "Lỗi từ Viettel"
      };
    }
  } catch (error: any) {
    console.error('createInvoice Error:', error);
    const details = error.response?.data?.details || error.message;
    return {
      success: false,
      invoiceNo: "",
      message: "Lỗi kết nối Viettel: " + details
    };
  }
}
