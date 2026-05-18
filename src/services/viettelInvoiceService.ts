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
  // Requirement: {viettelApiUrl}/../../auth/oauth/token
  // Usually viettelApiUrl is like .../InvoiceAPI/InvoiceWS
  // We need to navigate up to auth/oauth/token
  
  let baseUrl = config.viettelApiUrl.trim().replace(/\/$/, '');
  const urlParts = baseUrl.split('/');
  // Remove last two segments (InvoiceAPI/InvoiceWS) to get to service root
  const oauthUrl = urlParts.slice(0, -2).join('/') + '/auth/oauth/token';

  try {
    const params = new URLSearchParams();
    params.append('username', config.viettelUsername);
    params.append('password', config.viettelPassword || '');
    params.append('grant_type', 'password');

    // Call via proxy
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
    
    throw new Error(response.data.error_description || 'Không lấy được access token');
  } catch (error: any) {
    console.error('getViettelAccessToken Error:', error.response?.data || error.message);
    throw new Error('Lỗi xác thực Viettel: ' + (error.response?.data?.details || error.message));
  }
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
          unitName: "Món",
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

    const endpoint = `${config.viettelApiUrl.trim().replace(/\/$/, '')}/createInvoice/${config.viettelSupplierTaxCode}`;

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

    // Handle response
    // Viettel usually returns result: { errorCode, description, invoiceNo }
    const data = response.data;
    const isSuccess = data.errorCode === "0" || !data.errorCode;

    if (isSuccess && data.invoiceNo) {
      return {
        success: true,
        invoiceNo: data.invoiceNo,
        message: "Xuất hóa đơn thành công"
      };
    } else {
      return {
        success: false,
        invoiceNo: "",
        message: data.description || "Lỗi không xác định từ Viettel"
      };
    }
  } catch (error: any) {
    console.error('createInvoice Error:', error);
    return {
      success: false,
      invoiceNo: "",
      message: error.message || "Lỗi kết nối API Viettel"
    };
  }
}
