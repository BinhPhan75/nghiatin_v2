-- SQL Setup for Nghia Tin Gold (Supabase Revert)

-- 1. Profiles (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'SALES', -- 'ADMIN', 'ACCOUNTANT', 'SALES'
  status TEXT DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'BLOCKED'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Products (Gold Types)
CREATE TABLE IF NOT EXISTS public.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  buy_price NUMERIC DEFAULT 0,
  sell_price NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Banks List
CREATE TABLE IF NOT EXISTS public.banks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  short_name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  bin TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Vietnamese Banks
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
('LPB', 'LienVietPostBank', '970449'),
('ABB', 'ABBank', '970425'),
('VAB', 'VietA Bank', '970427'),
('BAB', 'Bac A Bank', '970409'),
('OCB', 'OCB', '970448'),
('PGB', 'PG Bank', '970430'),
('PVB', 'PVcomBank', '970412'),
('SCB', 'SCB', '970429'),
('SEAB', 'SeABank', '970440'),
('SGB', 'Saigonbank', '970400'),
('VNCB', 'CB Bank', '970444'),
('OCEANBANK', 'OceanBank', '970408'),
('GPB', 'GPBank', '970428'),
('NASB', 'Bac A Bank', '970409'),
('BVB', 'BaoViet Bank', '970438'),
('KLB', 'Kienlongbank', '970452'),
('VIETBANK', 'VietBank', '970433'),
('NAMABANK', 'Nam A Bank', '970428'),
('NCB', 'NCB', '970419'),
('IVB', 'Indovina Bank', '970434'),
('VRB', 'Vietnam - Russia Bank', '970421'),
('WOORI', 'Woori Bank Vietnam', '970457'),
('SHVN', 'Shinhan Bank Vietnam', '970424'),
('HSBC', 'HSBC Vietnam', '970445'),
('SCVN', 'Standard Chartered Vietnam', '970410'),
('UOB', 'UOB Vietnam', '970458'),
('HLBVN', 'Hong Leong Bank Vietnam', '970442'),
('CIMB', 'CIMB Vietnam', '970459'),
('KBank', 'KBank HCM Branch', '970460')
ON CONFLICT DO NOTHING;

-- 4. Transactions
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL, -- 'BUY', 'SELL'
  product_id UUID REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  price_per_unit NUMERIC NOT NULL,
  total_amount NUMERIC NOT NULL,
  customer_name TEXT NOT NULL,
  customer_cccd TEXT NOT NULL,
  dia_chi TEXT,
  customer_bank_id UUID REFERENCES banks(id),
  customer_account_no TEXT,
  tien_mat NUMERIC DEFAULT 0,
  chuyen_khoan NUMERIC DEFAULT 0,
  chiet_khau NUMERIC DEFAULT 0,
  cong_them NUMERIC DEFAULT 0, -- Cộng thêm (thường dùng khi MUA)
  giam_tru NUMERIC DEFAULT 0, -- Giảm trừ (thường dùng khi MUA)
  other_deduction NUMERIC DEFAULT 0, -- Tương đương giam_tru, giữ để tương thích
  deduction_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- 5. System Config
CREATE TABLE IF NOT EXISTS public.system_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bank_name TEXT,
  account_no TEXT,
  account_holder TEXT,
  bank_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Logic
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

-- Basic Policies (Modify for production)
CREATE POLICY "Public read profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Public read products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Public read banks" ON public.banks FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create transactions" ON public.transactions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can read transactions" ON public.transactions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Public read system_config" ON public.system_config FOR SELECT USING (true);
