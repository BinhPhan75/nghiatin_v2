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
      authUrl: authUrl
    });

    if (response.data && response.data.access_token) {
      return response.data.access_token;
    }
  } catch (error: any) {
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

    const response = await axios.post('/api/viettel/create-invoice', {
      serviceUrl: serviceUrl,
      taxCode: config.viettelSupplierTaxCode,
      token: token,
      payload: payload
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
