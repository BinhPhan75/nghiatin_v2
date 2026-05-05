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
-- 5. SYSTEM CONFIG (Basics)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.system_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bank_name TEXT,
  account_no TEXT,
  account_holder TEXT,
  bank_id TEXT, -- Short name/ID code for VietQR (e.g. VCB)
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 6. VIETTEL CONFIG (Dedicated)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.viettel_config (
  id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000000',
  username TEXT DEFAULT '',
  password TEXT DEFAULT '',
  tax_code TEXT DEFAULT '',
  app_id TEXT DEFAULT '',
  api_url TEXT DEFAULT '',
  template_code TEXT DEFAULT '',
  invoice_series TEXT DEFAULT '',
  is_sandbox BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 7. SECURITY (Row Level Security)
-- ==========================================

-- Helper function to check if user is admin (avoids recursion)
-- SECURITY DEFINER makes it run as the function creator (bypassing RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- Ultimate owner fallback (bypasses profile table lookup)
  IF (auth.jwt() ->> 'email' = 'binhphan.070582@gmail.com') THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE id = auth.uid() AND role = 'ADMIN'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viettel_config ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage profiles" ON public.profiles;

CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles 
FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles 
FOR UPDATE USING (auth.uid() = id);

-- Use the helper function but also add a direct JWT check to be absolutely safe against recursion
CREATE POLICY "Admins can manage profiles" ON public.profiles 
FOR ALL USING (
  (auth.jwt() ->> 'email' = 'binhphan.070582@gmail.com') OR public.is_admin()
);

-- Banks Policies
DROP POLICY IF EXISTS "Banks are viewable by everyone" ON public.banks;
CREATE POLICY "Banks are viewable by everyone" ON public.banks FOR SELECT USING (true);

-- Products Policies
DROP POLICY IF EXISTS "Products are viewable by everyone" ON public.products;
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
CREATE POLICY "Products are viewable by everyone" ON public.products FOR SELECT USING (true);
CREATE POLICY "Admins can manage products" ON public.products FOR ALL USING (public.is_admin());

-- Transactions Policies
DROP POLICY IF EXISTS "Users can view transactions if approved" ON public.transactions;
DROP POLICY IF EXISTS "Sales can create transactions" ON public.transactions;
CREATE POLICY "Users can view transactions if approved" ON public.transactions FOR SELECT USING (
  (auth.jwt() ->> 'email' = 'binhphan.070582@gmail.com') OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'APPROVED')
);
CREATE POLICY "Sales can create transactions" ON public.transactions FOR INSERT WITH CHECK (
  (auth.jwt() ->> 'email' = 'binhphan.070582@gmail.com') OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'SALES') AND status = 'APPROVED')
);

-- System Config Policies
DROP POLICY IF EXISTS "System config viewable by everyone" ON public.system_config;
DROP POLICY IF EXISTS "Admins can update system config" ON public.system_config;
CREATE POLICY "System config viewable by everyone" ON public.system_config FOR SELECT USING (true);
CREATE POLICY "Admins can manage system config" ON public.system_config FOR ALL USING (public.is_admin());

-- Viettel Config Policies
DROP POLICY IF EXISTS "Viettel config viewable by everyone" ON public.viettel_config;
DROP POLICY IF EXISTS "Admins can manage viettel config" ON public.viettel_config;
CREATE POLICY "Viettel config viewable by everyone" ON public.viettel_config FOR SELECT USING (true);
CREATE POLICY "Admins can manage viettel config" ON public.viettel_config FOR ALL USING (public.is_admin());

-- ==========================================
-- 7. TRIGGERS & FUNCTIONS
-- ==========================================

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    CASE WHEN NEW.email = 'binhphan.070582@gmail.com' THEN 'ADMIN' ELSE 'SALES' END,
    CASE WHEN NEW.email = 'binhphan.070582@gmail.com' THEN 'APPROVED' ELSE 'PENDING' END
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    role = CASE WHEN EXCLUDED.email = 'binhphan.070582@gmail.com' THEN 'ADMIN' ELSE public.profiles.role END,
    status = CASE WHEN EXCLUDED.email = 'binhphan.070582@gmail.com' THEN 'APPROVED' ELSE public.profiles.status END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Sync existing users to profiles
DO $$
BEGIN
  INSERT INTO public.profiles (id, email, role, status)
  SELECT 
    id, 
    email, 
    CASE WHEN email = 'binhphan.070582@gmail.com' THEN 'ADMIN' ELSE 'SALES' END,
    CASE WHEN email = 'binhphan.070582@gmail.com' THEN 'APPROVED' ELSE 'PENDING' END
  FROM auth.users
  ON CONFLICT (id) DO UPDATE SET
    role = CASE WHEN public.profiles.email = 'binhphan.070582@gmail.com' THEN 'ADMIN' ELSE public.profiles.role END,
    status = CASE WHEN public.profiles.email = 'binhphan.070582@gmail.com' THEN 'APPROVED' ELSE public.profiles.status END;
END $$;

-- ==========================================
-- 8. AUTO-UPDATE TIMESTAMPS
-- ==========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_profiles_modtime ON public.profiles;
CREATE TRIGGER update_profiles_modtime BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_products_modtime ON public.products;
CREATE TRIGGER update_products_modtime BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_system_config_modtime ON public.system_config;
CREATE TRIGGER update_system_config_modtime BEFORE UPDATE ON public.system_config FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
