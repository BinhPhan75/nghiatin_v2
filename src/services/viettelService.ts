import axios from 'axios';
import { supabase } from '../lib/supabase';

/**
 * Service for interacting with Viettel vInvoice (SInvoice) API.
 */

interface ViettelConfig {
  viettel_username?: string;
  viettel_password?: string;
  viettel_tax_code?: string;
  viettel_is_sandbox?: boolean;
}

const getViettelConfig = async (): Promise<ViettelConfig | null> => {
  const { data, error } = await supabase.from('system_config').select('*').single();
  if (error || !data) return null;
  return data;
};

const getBaseUrl = (isSandbox: boolean) => {
  return isSandbox 
    ? 'https://sinvoice.viettel.vn/InvoiceAPI/InvoiceWS' // Sandbox/Trial
    : 'https://sinvoice.viettel.vn/InvoiceAPI/InvoiceWS'; // Production
};

/**
 * Login to get Session/Token (if required by the specific API version)
 */
export const loginViettel = async (config: ViettelConfig) => {
  const url = `${getBaseUrl(!!config.viettel_is_sandbox)}/login`;
  try {
    const response = await axios.post(url, {
      username: config.viettel_username,
      password: config.viettel_password
    });
    return response.data;
  } catch (error) {
    console.error('Viettel Login Error:', error);
    throw error;
  }
};

/**
 * Create a new invoice from transaction data
 */
export const createViettelInvoice = async (transactionId: string) => {
  const config = await getViettelConfig();
  if (!config || !config.viettel_username || !config.viettel_password) {
    throw new Error('Chưa cấu hình thông tin Viettel vInvoice trong hệ thống.');
  }

  // 1. Fetch transaction details
  const { data: tx, error: txError } = await supabase
    .from('transactions')
    .select('*, customer_bank:banks(*)')
    .eq('id', transactionId)
    .single();

  if (txError || !tx) throw new Error('Không tìm thấy thông tin giao dịch.');

  // 2. Prepare Payload (Simplified version based on common Viettel SInvoice schema)
  // Note: Actual payload depends on the template and serial configured at Viettel
  const payload = {
    generalInvoiceInfo: {
      invoiceType: '1', // Hóa đơn GTGT
      templateCode: '1/001', // Example
      invoiceSeries: 'C22TGG', // Example
      invoiceIssuedDate: Date.now(),
      currencyCode: 'VND',
      adjustmentType: '1', // 1: Gốc
      paymentStatus: '1', // 1: Đã thanh toán
      paymentMethodName: tx.tien_mat > 0 ? 'Tiền mặt' : 'Chuyển khoản',
      taxCode: config.viettel_tax_code,
    },
    buyerInfo: {
      buyerName: tx.customer_name,
      buyerTaxCode: '', // Fill if customer has tax code
      buyerAddressLine: tx.dia_chi || '',
      buyerIdNo: tx.customer_cccd,
      buyerIdType: '1', // 1: CCCD/Passport
    },
    itemInfo: [
      {
        lineNumber: 1,
        itemCode: tx.product_id,
        itemName: tx.product_name,
        unitName: tx.unit,
        quantity: tx.quantity,
        unitPrice: tx.price_per_unit,
        itemTotalAmountWithoutTax: tx.total_amount,
        taxPercentage: 0, // Jewelery often 0 or specific
        taxAmount: 0,
        discountAmount: tx.chiet_khau,
        itemTotalAmountWithTax: tx.total_amount,
      }
    ],
    summaryInfo: {
      totalAmountWithoutTax: tx.total_amount,
      totalTaxAmount: 0,
      totalAmountWithTax: tx.total_amount,
      totalAmountWithTaxInWords: '', // Convert amount to words here if needed
    }
  };

  try {
    // 3. Call Viettel API
    // This typically requires Authorization header with credentials or Token
    const url = `${getBaseUrl(!!config.viettel_is_sandbox)}/createInvoice/${config.viettel_tax_code}`;
    
    // Using basic auth or custom auth header as per Viettel requirement
    const response = await axios.post(url, payload, {
      auth: {
        username: config.viettel_username,
        password: config.viettel_password
      }
    });

    if (response.data && response.data.invoiceNo) {
      // 4. Update transaction with invoice info
      await supabase.from('transactions').update({
        invoice_no: response.data.invoiceNo,
        reservation_code: response.data.reservationCode,
        invoice_status: 'ISSUED'
      }).eq('id', transactionId);

      return response.data;
    } else {
      throw new Error(response.data.description || 'Lỗi phát hành hóa đơn từ Viettel.');
    }
  } catch (error: any) {
    const errorMsg = error.response?.data?.description || error.message;
    await supabase.from('transactions').update({
      invoice_status: 'FAILED',
      invoice_error: errorMsg
    }).eq('id', transactionId);
    
    throw new Error(`Lỗi kết nối Viettel: ${errorMsg}`);
  }
};
