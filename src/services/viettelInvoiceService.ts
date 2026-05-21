import axios from 'axios';
import { supabase } from '../lib/supabase';
import { Transaction } from '../types';

export interface ViettelConfig {
  viettelAuthUrl: string;
  viettelServiceUrl: string;
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
 * Helper to query Supabase with a fast-failing timeout
 */
async function querySupabaseWithTimeout<T = any>(
  queryPromise: any,
  timeoutMs = 3000
): Promise<T> {
  let timeoutId: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Hết hạn kết nối tới cơ sở dữ liệu Supabase (timeout)'));
    }, timeoutMs);
  });
  try {
    const res = await Promise.race([Promise.resolve(queryPromise), timeoutPromise]);
    clearTimeout(timeoutId);
    return res as T;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Get Viettel configuration from system_config (with viettel_config table sync)
 */
export async function getViettelConfig(): Promise<ViettelConfig | null> {
  try {
    // 1. Thử tải cấu hình từ bảng viettel_config trực tiếp với timeout 3 giây
    const query = supabase
      .from('viettel_config')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1);
      
    const { data, error } = await querySupabaseWithTimeout(query, 3000);

    if (!error && data && data.length > 0) {
      const active = data[0];
      const result = {
        viettelAuthUrl: active.api_url || 'https://api-vinvoice.viettel.vn',
        viettelServiceUrl: active.api_url || 'https://api-vinvoice.viettel.vn',
        viettelUsername: active.username || '',
        viettelPassword: active.password || '',
        viettelSupplierTaxCode: active.tax_code || '',
        viettelTemplateCode: active.template_code || '',
        viettelInvoiceSeries: active.invoice_series || '',
        viettelEnabled: true
      };
      try {
        localStorage.setItem('cached_viettel_config', JSON.stringify(result));
      } catch (e) {}
      return result;
    }
  } catch (err) {
    console.warn('[Service] Lỗi khi nạp từ viettel_config (hoặc timeout), thử fallback sang system_config:', err);
  }

  // 2. Chế độ dự phòng: Tải từ system_config với timeout 3 giây
  try {
    const query = supabase
      .from('system_config')
      .select('*')
      .limit(1)
      .single();
      
    const { data, error } = await querySupabaseWithTimeout(query, 3000);

    if (!error && data && data.viettel_einvoice_config) {
      try {
        localStorage.setItem('cached_viettel_config', JSON.stringify(data.viettel_einvoice_config));
      } catch (e) {}
      return data.viettel_einvoice_config as ViettelConfig;
    }
  } catch (err) {
    console.warn('[Service] Lỗi khi nạp từ system_config (hoặc timeout):', err);
  }

  // 3. Khôi phục từ Cache Local Storage
  try {
    const cached = localStorage.getItem('cached_viettel_config');
    if (cached) {
      console.log('[Service] Đã kích hoạt khôi phục cấu hình Viettel từ Cache cục bộ thành công.');
      return JSON.parse(cached);
    }
  } catch (e) {
    console.warn('[Service] Không thể đọc cache:', e);
  }

  return null;
}

/**
 * 2.1 Get Access Token using Viettel v2.49 login (JSON)
 */
export async function getViettelAccessToken(config: ViettelConfig): Promise<string> {
  const authUrl = config.viettelAuthUrl || 'https://api-vinvoice.viettel.vn/auth/login';
  
  // Use dedicated server-side token endpoint for robust authentication
  try {
    console.log(`[Service] Requesting token via server-side endpoint for ${authUrl}`);
    
    const response = await axios.post('/api/viettel/token', {
      username: config.viettelUsername,
      password: config.viettelPassword,
      authUrl: authUrl,
      taxCode: config.viettelSupplierTaxCode
    });

    if (response.data && typeof response.data === 'string' && (response.data.includes('<!DOCTYPE html>') || response.data.includes('<html'))) {
      throw new Error('Môi trường tĩnh (Vercel) không hỗ trợ chạy Backend Express Proxy Server. Bạn phải mở và chạy ứng dụng thông qua đường dẫn AI Studio Cloud Run (hoặc máy chủ Node.js có tích hợp server.ts) để chạy các API hóa đơn điện tử.');
    }

    if (response.data && response.data.access_token) {
      return response.data.access_token;
    }
  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error('Đường dẫn API backend /api/viettel/token không tồn tại (Lỗi 404). Các tính năng kết nối Viettel yêu cầu máy chủ Express backend hoạt động. Nếu đang chạy trên Vercel tĩnh, vui lòng chuyển sang đường dẫn AI Studio Cloud Run.');
    }
    const errorData = error.response?.data;
    const errorMsg = errorData?.details || errorData?.message || errorData?.error || error.message;
    console.error(`[Service] Server-side token fetch failed:`, errorMsg);
    throw new Error('Lỗi xác thực Viettel: ' + (typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg));
  }

  throw new Error('Lỗi xác thực Viettel: Không nhận được access_token');
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

    const serviceUrl = config.viettelServiceUrl || 'https://api-vinvoice.viettel.vn/services/einvoiceapplication/api';
    console.log(`[Service] Creating invoice via server proxy at serviceUrl: ${serviceUrl}`);

    // Nạp thô cấu hình cơ sở dữ liệu từ bảng viettel_config để đồng bộ hóa cho backend xử lý
    let rawDbConfig: any = null;
    try {
      const query = supabase
        .from('viettel_config')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1);
      const { data } = await querySupabaseWithTimeout(query, 2500);
      if (data && data.length > 0) {
        rawDbConfig = data[0];
      }
    } catch (dbErr) {
      console.warn('[Service] Không thể tải cấu hình thô từ viettel_config cho backend (sử dụng cấu hình mặc định):', dbErr);
    }

    const response = await axios.post('/api/viettel/create-invoice', {
      serviceUrl: serviceUrl,
      taxCode: config.viettelSupplierTaxCode,
      token: token,
      payload: payload,
      dbConfig: rawDbConfig // Truyền config DB thô trực tiếp xuống server
    });

    const data = response.data;
    // Viettel result structure can vary; checking common success markers
    const isSuccess = data.errorCode === "0" || !data.errorCode || data.result === "SUCCESS" || (data.result && !data.errorCode);

    if (isSuccess && (data.invoiceNo || data.result?.invoiceNo)) {
      return {
        success: true,
        invoiceNo: data.invoiceNo || data.result.invoiceNo,
        message: "Khởi tạo hóa đơn nháp thành công"
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
    const details = error.response?.data?.description || error.response?.data?.details || error.message;
    return {
      success: false,
      invoiceNo: "",
      message: "Lỗi kết nối Viettel: " + details
    };
  }
}

/**
 * Test Viettel Connection using dedicated backend service validation
 */
export async function testViettelConnectionAPI(
  config: ViettelConfig
): Promise<{ success: boolean; message: string; details?: any; token?: string }> {
  try {
    const serviceUrl = config.viettelServiceUrl || 'https://api-vinvoice.viettel.vn';
    
    // Fetch raw config from Supabase to match backend expectation
    let rawDbConfig: any = null;
    try {
      const query = supabase
        .from('viettel_config')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1);
      const { data } = await querySupabaseWithTimeout(query, 2500);
      if (data && data.length > 0) {
        rawDbConfig = data[0];
      }
    } catch (err) {
      console.warn('[Service] fallback dbConfig (timeout or offline):', err);
    }

    const response = await axios.post('/api/viettel/test-connection', {
      serviceUrl: serviceUrl,
      taxCode: config.viettelSupplierTaxCode,
      username: config.viettelUsername,
      password: config.viettelPassword,
      dbConfig: rawDbConfig
    });

    if (response.data && response.data.success) {
      return {
        success: true,
        message: response.data.message || 'Kết nối mạng và xác thực tài khoản Viettel S-Invoice THÀNH CÔNG!',
        token: response.data.templates ? JSON.stringify(response.data.templates).substring(0, 500) : undefined
      };
    } else {
      return {
        success: false,
        message: response.data?.message || 'Không có tín hiệu phản hồi hợp lệ từ cổng dịch vụ Viettel.',
        details: response.data
      };
    }
  } catch (error: any) {
    console.error('[Service] testViettelConnectionAPI error:', error);
    const details = error.response?.data?.details || error.response?.data?.message || error.message;
    return {
      success: false,
      message: "Không thể gọi api kiểm tra kết nối: " + (typeof details === 'object' ? JSON.stringify(details) : details)
    };
  }
}

