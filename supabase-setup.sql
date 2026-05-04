-- SQL Setup for NGHIA TIN GOLD (V2)
-- Create tables and setup security for Supabase
-- This script assumes a clean state.

-- ==========================================
-- 1. PROFILES (User Management)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'SALES', -- 'ADMIN', 'ACCOUNTANT', 'SALES'
  status TEXT DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'BLOCKED'
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 2. PRODUCTS (Gold Types & Prices)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'Chỉ', -- Chỉ, Lượng, Gram...
  buy_price NUMERIC DEFAULT 0,
  sell_price NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 3. BANKS (Comprehensive VN Bank List)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.banks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  short_name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  bin TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Comprehensive Vietnamese Banks (Fixed Duplicates)
INSERT INTO public.banks (short_name, full_name, bin) VALUES
('VCB', 'Vietcombank', '970436'),
('BIDV', 'BIDV', '970418'),
('VBA', 'Agribank', '970405'),
('CTG', 'VietinBank', '970415'),
('MB', 'MBBank', '970422'),
('TCB', 'Techcombank', '970407'),
('ACB', 'ACB', '970416'),
('VPB', 'VPBank', '970432'),
('TPB', 'TPBank', '970423'),
('STB', 'Sacombank', '970403'),
('HDB', 'HDBank', '970437'),
('VIB', 'VIB', '970441'),
('SHB', 'SHB', '970443'),
('EIB', 'Eximbank', '970431'),
('MSB', 'MSB', '970426'),
('LPB', 'LPBank', '970449'),
('ABB', 'ABBank', '970425'),
('VAB', 'VietA Bank', '970427'),
('BAB', 'Bac A Bank', '970409'),
('OCB', 'OCB', '970448'),
('PGB', 'PGBank', '970430'),
('PVB', 'PVcomBank', '970412'),
('SCB', 'SCB', '970429'),
('SEAB', 'SeABank', '970440'),
('SGB', 'Saigonbank', '970400'),
('VIETBANK', 'VietBank', '970433'),
('NAMABANK', 'Nam A Bank', '970428'),
('NCB', 'NCB', '970419'),
('BVB', 'BaoViet Bank', '970438'),
('KLB', 'Kienlongbank', '970452'),
('DAB', 'DongA Bank', '970406'),
('GPB', 'GPBank', '970408'), -- FIXED BIN
('OCEANBANK', 'OceanBank', '970414'), -- FIXED BIN (from 970408)
('CB', 'CB Bank', '970444'),
('IVB', 'Indovina Bank', '970434'),
('VRB', 'Vietnam-Russia Bank', '970421'),
('WVB', 'Woori Bank', '970457'),
('SHVN', 'Shinhan Bank', '970424'),
('HSBC', 'HSBC Vietnam', '970445'),
('SCVN', 'Standard Chartered Bank', '970410'),
('UOB', 'UOB Vietnam', '970458'),
('HLBVN', 'Hong Leong Bank', '970442'),
('CIMB', 'CIMB Vietnam', '970459'),
('KBANK', 'KBank HCM Branch', '970460'),
('PBVN', 'Public Bank Vietnam', '970439'),
('VCCB', 'Viet Capital Bank', '970454'),
('VBSP', 'VBSP', '970446'), -- FIXED BIN (from 970400)
('VDB', 'Ngân hàng Phát triển Việt Nam', '970455'),
('CAKE', 'Cake by VPBank', '546034'),
('UBANK', 'Ubank by VPBank', '546035'),
('TIMO', 'Timo by Ban Viet Bank', '963388'),
('COOPBANK', 'Co-op Bank', '970447') -- FIXED BIN (from 970446)
ON CONFLICT (bin) DO UPDATE SET 
  short_name = EXCLUDED.short_name,
  full_name = EXCLUDED.full_name;

-- ==========================================
-- 4. TRANSACTIONS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
  product_id UUID REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  price_per_unit NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  customer_name TEXT NOT NULL,
  customer_cccd TEXT NOT NULL,
  dia_chi TEXT,
  customer_bank_id UUID REFERENCES public.banks(id),
  customer_account_no TEXT,
  tien_mat NUMERIC DEFAULT 0,
  chuyen_khoan NUMERIC DEFAULT 0,
  chiet_khau NUMERIC DEFAULT 0,
  cong_them NUMERIC DEFAULT 0,
  giam_tru NUMERIC DEFAULT 0,
  other_deduction NUMERIC DEFAULT 0,
  deduction_note TEXT,
  
  -- E-Invoice Fields
  invoice_no TEXT, -- Số hóa đơn
  invoice_status TEXT DEFAULT 'NOT_ISSUED', -- NOT_ISSUED, PENDING, ISSUED, FAILED
  invoice_error TEXT,
  reservation_code TEXT, -- Mã tra cứu hóa đơn
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- ==========================================
-- 5. SYSTEM CONFIG (Shop & E-Invoice)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.system_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bank_name TEXT,
  account_no TEXT,
  account_holder TEXT,
  bank_id TEXT, -- Short name/ID code for VietQR (e.g. VCB)
  
  -- Viettel vInvoice Config
  viettel_username TEXT,
  viettel_password TEXT,
  viettel_tax_code TEXT,
  viettel_app_id TEXT,
  viettel_is_sandbox BOOLEAN DEFAULT false,
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 6. SECURITY (Row Level Security)
-- ==========================================

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can update any profile" ON public.profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN')
);

-- Banks Policies
CREATE POLICY "Banks are viewable by everyone" ON public.banks FOR SELECT USING (true);

-- Products Policies
CREATE POLICY "Products are viewable by everyone" ON public.products FOR SELECT USING (true);
CREATE POLICY "Admins can manage products" ON public.products FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN')
);

-- Transactions Policies
CREATE POLICY "Users can view transactions if approved" ON public.transactions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'APPROVED')
);
CREATE POLICY "Sales can create transactions" ON public.transactions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'SALES') AND status = 'APPROVED')
);

-- System Config Policies
CREATE POLICY "System config viewable by everyone" ON public.system_config FOR SELECT USING (true);
CREATE POLICY "Admins can update system config" ON public.system_config FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN')
);

-- ==========================================
-- 7. FUNCTIONS (Auto-update updated_at)
-- ==========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_modtime BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_products_modtime BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_system_config_modtime BEFORE UPDATE ON public.system_config FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
