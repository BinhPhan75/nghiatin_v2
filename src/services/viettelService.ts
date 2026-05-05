import axios from 'axios';
import { supabase } from '../lib/supabase';

/**
 * Service for interacting with Viettel vInvoice (SInvoice) API.
 */

interface ViettelConfig {
  username?: string;
  password?: string;
  tax_code?: string;
  template_code?: string;
  invoice_series?: string;
  api_url?: string;
  is_sandbox?: boolean;
}

const getViettelConfig = async (): Promise<ViettelConfig | null> => {
  const { data, error } = await supabase.from('viettel_config').select('*').limit(1).single();
  if (error || !data) return null;
  return data;
};

const getBaseUrl = (config: ViettelConfig) => {
  let url = '';
  if (config.api_url && config.api_url.trim()) {
    url = config.api_url.trim().replace(/\/$/, '');
  } else {
    // Correct defaults according to Viettel Technical documentation
    url = config.is_sandbox 
      ? 'https://demo-sinvoice.viettel.vn:8443'
      : 'https://api-sinvoice.viettel.vn:443';
  }
  
  // Strip common suffixes to avoid double segments in endpoint construction
  url = url.replace(/\/InvoiceAPI$/, '');
  url = url.replace(/\/InvoiceWS$/, '');
  
  return url;
};

/**
 * Login to get Session/Token (if using Session-based API)
 */
export const loginViettel = async (config: ViettelConfig) => {
  const endpoint = `${getBaseUrl(config)}/InvoiceAPI/InvoiceWS/login`;
  try {
    const response = await axios.post('/api/viettel-proxy', {
      endpoint,
      method: 'POST',
      payload: {
        username: config.username,
        password: config.password
      },
      config: {
        username: config.username,
        password: config.password
      }
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
  if (!config || !config.username || !config.password) {
    throw new Error('Chưa cấu hình thông tin Viettel vInvoice trong hệ thống.');
  }

  if (!config.tax_code) {
    throw new Error('Thiếu Mã số thuế (Tax Code) trong cấu hình Viettel.');
  }

  // 1. Fetch transaction details
  const { data: tx, error: txError } = await supabase
    .from('transactions')
    .select('*, customer_bank:banks(*)')
    .eq('id', transactionId)
    .single();

  if (txError || !tx) throw new Error('Không tìm thấy thông tin giao dịch.');

  // 2. Prepare Payload based on Viettel SInvoice PDF
  const payload = {
    generalInvoiceInfo: {
      invoiceType: '01GTKT', // Hóa đơn GTGT
      templateCode: config.template_code || '01GTKT0/001',
      invoiceSeries: config.invoice_series || 'AB/22E',
      invoiceIssuedDate: Date.now(),
      currencyCode: 'VND',
      adjustmentType: '1', // 1: Gốc
      paymentStatus: true,
      cusGetInvoiceRight: true,
      taxCode: config.tax_code,
    },
    buyerInfo: {
      buyerName: tx.customer_name,
      buyerTaxCode: '', 
      buyerAddressLine: tx.dia_chi || '',
      buyerIdNo: tx.customer_cccd,
      buyerIdType: '1', // 1: CCCD/Passport
    },
    itemInfo: [
      {
        lineNumber: 1,
        itemCode: tx.product_id?.substring(0, 50) || 'GOLD',
        itemName: tx.product_name,
        unitName: tx.unit,
        quantity: tx.quantity,
        unitPrice: tx.price_per_unit,
        itemTotalAmountWithoutTax: tx.total_amount,
        taxPercentage: 0, 
        taxAmount: 0,
        itemTotalAmountWithTax: tx.total_amount,
      }
    ],
    payments: [
      {
        paymentMethodName: tx.tien_mat > 0 ? 'TM' : 'CK'
      }
    ],
    summarizeInfo: {
      sumOfTotalLineAmountWithoutTax: tx.total_amount,
      totalAmountWithoutTax: tx.total_amount,
      totalTaxAmount: 0,
      totalAmountWithTax: tx.total_amount,
      totalAmountWithTaxInWords: '', 
      taxPercentage: 0
    }
  };

  try {
    // 3. Call Viettel API via Proxy
    const endpoint = `${getBaseUrl(config)}/InvoiceAPI/InvoiceWS/createInvoice/${config.tax_code}`;
    
    const response = await axios.post('/api/viettel-proxy', {
      endpoint,
      method: 'POST',
      payload,
      config: {
        username: config.username,
        password: config.password
      }
    });

    if (response.data && (response.data.invoiceNo || response.data.result?.invoiceNo)) {
      const data = response.data.result || response.data;
      // 4. Update transaction with invoice info
      await supabase.from('transactions').update({
        invoice_no: data.invoiceNo,
        reservation_code: data.reservationCode,
        invoice_status: 'ISSUED'
      }).eq('id', transactionId);

      return data;
    } else {
      throw new Error(response.data.description || response.data.details || 'Lỗi phát hành hóa đơn từ Viettel.');
    }
  } catch (error: any) {
    const errorMsg = error.response?.data?.details || error.response?.data?.description || error.message;
    console.error('Invoice Creation Failed:', error);
    
    await supabase.from('transactions').update({
      invoice_status: 'FAILED',
      invoice_error: errorMsg
    }).eq('id', transactionId);
    
    throw new Error(`Lỗi kết nối Viettel: ${errorMsg}`);
  }
};
