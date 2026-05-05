export type UserRole = 'ADMIN' | 'ACCOUNTANT' | 'SALES';
export type UserStatus = 'PENDING' | 'APPROVED' | 'BLOCKED';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  status: UserStatus;
  last_seen_at?: string;
  created_at: string;
}

export interface Bank {
  id: string;
  short_name: string; // e.g., VCB
  full_name: string; // e.g., Vietcombank
  bin: string; // e.g., 970436
}

export interface Product {
  id: string;
  name: string;
  unit: string; // e.g., Chỉ, Lượng, Gram
  buy_price: number;
  sell_price: number;
  updated_at: string;
}

export interface Transaction {
  id: string;
  type: 'BUY' | 'SELL';
  customer_name: string;
  customer_cccd: string;
  dia_chi?: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit: string;
  price_per_unit: number;
  total_amount: number;
  tien_mat: number;
  chuyen_khoan: number;
  chiet_khau: number;
  cong_them?: number;
  giam_tru?: number;
  other_deduction?: number;
  deduction_note?: string;
  customer_bank_id?: string;
  customer_account_no?: string;
  
  // E-Invoice
  invoice_no?: string;
  invoice_status?: 'NOT_ISSUED' | 'PENDING' | 'ISSUED' | 'FAILED';
  invoice_error?: string;
  reservation_code?: string;
  
  created_at: string;
  created_by: string;
  salesperson?: {
    email: string;
    full_name: string;
  };
}

export interface SystemConfig {
  id: string;
  bank_name: string;
  account_no: string;
  account_holder: string;
  bank_id: string; // e.g., ICB for VietinBank, VCB for Vietcombank
}

export interface ViettelConfig {
  id: string;
  username?: string;
  password?: string;
  tax_code?: string;
  app_id?: string;
  api_url?: string;
  is_sandbox?: boolean;
}
