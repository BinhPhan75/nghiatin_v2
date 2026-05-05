import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Product, SystemConfig, Profile, UserRole, UserStatus, Bank } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { Save, UserPlus, Users, Tag, Building2, ShieldCheck, Download, Upload, Plus, Trash2, X, XCircle, CheckCircle, UserCheck, Clock } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';

const System: React.FC = () => {
  const { profile, isAdmin, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'prices' | 'users' | 'bank' | 'backup' | 'diagnostics' | 'vinvoice'>('prices');

  const tabs = [
    { id: 'prices', label: 'Giá Vàng', roles: ['ADMIN', 'SALES'] },
    { id: 'users', label: 'Nhân Viên', roles: ['ADMIN'] },
    { id: 'bank', label: 'Ngân Hàng', roles: ['ADMIN'] },
    { id: 'vinvoice', label: 'vInvoice', roles: ['ADMIN'] },
    { id: 'backup', label: 'Bảo Trì', roles: ['ADMIN'] },
    { id: 'diagnostics', label: 'Kiểm Tra Kết Nối', roles: ['ADMIN'] },
  ];

  const filteredTabs = tabs.filter(t => {
    if (isAdmin) return true; // Admins always see all tabs
    const userRole = profile?.role || '';
    return t.roles.includes(userRole);
  });
  
  // Data State
  const [products, setProducts] = useState<Product[]>([]);
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [editingPrices, setEditingPrices] = useState<Record<string, { buy_price: number; sell_price: number }>>({});
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [showAddBank, setShowAddBank] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', unit: '', buy_price: 0, sell_price: 0 });
  const [newBank, setNewBank] = useState({ short_name: '', full_name: '', bin: '' });
  const [restoring, setRestoring] = useState(false);
  const [showRoleUpdate, setShowRoleUpdate] = useState<string | null>(null);
  const [lastError, setLastError] = useState<any>(null);
  const [dbStatus, setDbStatus] = useState<{ loading: boolean; connected: boolean; message: string }>({ 
    loading: false, connected: false, message: 'Chưa thực hiện kiểm tra' 
  });

  useEffect(() => {
    setLastError(null);
    fetchProducts();
    fetchConfig();
    fetchBanks();
    if (isAdmin || activeTab === 'users') fetchProfiles();
    if (activeTab === 'diagnostics') checkConnection();
  }, [activeTab, isAdmin]);

  const checkConnection = async () => {
    setDbStatus({ loading: true, connected: false, message: 'Đang kết nối tới database...' });
    const { data, error } = await supabase.from('products').select('id').limit(1);
    if (error) {
      setDbStatus({ 
        loading: false, 
        connected: false, 
        message: `Lỗi kết nối: ${error.message || 'Không thể truy cập Supabase.'}` 
      });
      setLastError(error);
    } else {
      setDbStatus({ loading: false, connected: true, message: 'Kết nối thành công! Database hoạt động bình thường.' });
    }
  };

  const fetchProducts = async () => {
    const { data: snapshot } = await supabase.from('products').select('*').order('name');
    if (snapshot) {
      setProducts(snapshot);
      const initialEditing: Record<string, { buy_price: number; sell_price: number }> = {};
      snapshot.forEach(p => {
        initialEditing[p.id] = { buy_price: p.buy_price, sell_price: p.sell_price };
      });
      setEditingPrices(initialEditing);
    }
  };

  const fetchConfig = async () => {
    const { data: snapshot, error: fetchError } = await supabase.from('system_config').select('*').limit(1);
    
    if (fetchError) {
      console.error("Lỗi khi tải cấu hình:", fetchError);
      return;
    }

    if (snapshot && snapshot.length > 0) {
      setConfig(snapshot[0]);
    } else {
      // Khởi tạo mẫu mặc định nếu chưa có cấu hình nào
      setConfig({
        id: '00000000-0000-0000-0000-000000000000',
        viettel_is_sandbox: true,
        viettel_username: '',
        viettel_password: '',
        viettel_tax_code: '',
        viettel_app_id: '',
        viettel_api_url: ''
      } as any);
    }
  };

  const fetchProfiles = async () => {
    const { data: snapshot } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (snapshot) {
      setProfiles(snapshot);
      console.log("Fetched profiles count:", snapshot.length);
    }
  };

  const fetchBanks = async () => {
    const { data: snapshot } = await supabase.from('banks').select('*').order('short_name');
    if (snapshot) setBanks(snapshot);
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center p-20 italic text-neutral-400 font-bold">
        Đang xác thực quyền hạn...
      </div>
    );
  }

  const { user } = useAuth();
  const currentUserEmail = user?.email;

  const handleRowSave = async (id: string) => {
    const edited = editingPrices[id];
    if (!edited) return;

    try {
      const { error } = await supabase
        .from('products')
        .update({ 
          buy_price: edited.buy_price, 
          sell_price: edited.sell_price,
          updated_at: new Date().toISOString() 
        })
        .eq('id', id);

      if (error) throw error;
      alert("Đã cập nhật giá thành công!");
      fetchProducts();
    } catch (error: any) {
      setLastError(error);
      console.error("Save Price Error:", error);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: UserRole) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;
      alert("Đã cập nhật quyền nhân viên thành công!");
      fetchProfiles();
      setShowRoleUpdate(null);
    } catch (error: any) {
      alert("Lỗi khi cập nhật quyền: " + error.message);
    }
  };

  const handleAddBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBank.short_name || !newBank.bin) return;

    try {
      const { error } = await supabase
        .from('banks')
        .insert([newBank]);

      if (error) throw error;
      alert("Đã thêm ngân hàng thành công!");
      fetchBanks();
      setShowAddBank(false);
      setNewBank({ short_name: '', full_name: '', bin: '' });
    } catch (error: any) {
      alert("Lỗi khi thêm ngân hàng: " + error.message);
    }
  };

  const handleDeleteBank = async (id: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa ngân hàng này?")) return;

    try {
      const { error } = await supabase
        .from('banks')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchBanks();
    } catch (error: any) {
      alert("Lỗi khi xóa ngân hàng: " + error.message);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.unit) return;

    try {
      const { error } = await supabase
        .from('products')
        .insert([{
          ...newProduct,
          updated_at: new Date().toISOString()
        }]);

      if (error) throw error;
      alert("Đã thêm mặt hàng thành công!");
      fetchProducts();
      setShowAddProduct(false);
      setNewProduct({ name: '', unit: '', buy_price: 0, sell_price: 0 });
      setLastError(null);
    } catch (error: any) {
      setLastError(error);
      console.error("Add Product Error:", error);
      alert("Lỗi khi thêm mặt hàng: " + (error.message || "Kiểm tra quyền truy cập"));
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa mặt hàng này?")) return;

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchProducts();
    } catch (error: any) {
      alert("Lỗi khi xóa mặt hàng: " + error.message);
    }
  };

  const handleUpdateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    try {
      // Thử cập nhật các trường cơ bản trước để đảm bảo tính tương thích
      const basePayload = {
        id: config.id || '00000000-0000-0000-0000-000000000000',
        bank_name: config.bank_name || '',
        account_no: config.account_no || '',
        account_holder: config.account_holder || '',
        bank_id: config.bank_id || '',
        viettel_username: config.viettel_username || '',
        viettel_password: config.viettel_password || '',
        viettel_tax_code: config.viettel_tax_code || '',
        updated_at: new Date().toISOString()
      };

      // Thử thêm các trường nâng cao - Supabase sẽ báo lỗi nếu thiếu cột
      // nhưng chúng ta sẽ bắt lỗi và thử lại với payload tối giản nếu cần
      const fullPayload = {
        ...basePayload,
        viettel_app_id: config.viettel_app_id || '',
        viettel_api_url: config.viettel_api_url || '',
        viettel_is_sandbox: !!config.viettel_is_sandbox,
      };

      const { error } = await supabase
        .from('system_config')
        .upsert(fullPayload);

      if (error) {
        // Nếu lỗi do thiếu cột (42703), thử lại chỉ với các trường cơ bản
        if (error.code === '42703') {
          console.warn("Bảng hệ thống thiếu các cột mới, đang thử lưu các trường cơ bản...");
          const { error: retryError } = await supabase
            .from('system_config')
            .upsert(basePayload);
          
          if (retryError) throw retryError;
          
          alert("Lưu thành công! Lưu ý: Một số thông tin kỹ thuật (AppID, API URL) chưa được lưu vì bảng database của bạn cần được cập nhật.");
        } else {
          throw error;
        }
      } else {
        alert("Đã cập nhật cấu hình hệ thống thành công!");
      }
      
      fetchConfig();
    } catch (error: any) {
      alert("Lỗi khi lưu cấu hình: " + error.message);
      console.error("Config Update Error:", error);
    }
  };

  const handleBackup = () => {
    const data = { products, config, profiles }; 
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nghiatin-gold-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm("Hành động này sẽ ghi đè dữ liệu hiện tại (Mặt hàng & Cấu hình). Bạn có chắc chắn muốn tiếp tục?")) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        setRestoring(false); // Simplified for now
        // In Firestore, sequential adds are safer than bulk deletes if we don't have atomic batch limits clear
        alert("Chức năng phục hồi đã tắt để bảo mật. Vui lòng liên hệ quản trị viên để nhập dữ liệu thô vào Firestore.");
      } catch (err) {
        console.error("Restore error:", err);
        alert("Lỗi khi đọc file backup. Vui lòng kiểm tra lại định dạng file.");
      }
    };
    reader.readAsText(file);
  };

  const formatNumberWithSeparator = (val: number) => {
    return new Intl.NumberFormat('vi-VN').format(val);
  };

  const parseNumberFromSeparator = (val: string) => {
    return Number(val.replace(/\./g, ''));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-4xl text-ink">Hệ Thống</h1>
          <p className="text-[10px] uppercase font-black text-neutral-400 tracking-widest mt-2 px-1">Cấu hình & Quản trị</p>
        </div>
        <div className="flex bg-paper p-1 border border-neutral-100 rounded-sm shadow-sm overflow-x-auto">
          {filteredTabs.map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)} 
              className={`btn-toggle min-w-[120px] ${activeTab === tab.id ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {lastError && (
        <div className="bg-red-900/90 text-white p-6 rounded-sm text-xs font-mono mb-6 flex justify-between items-start backdrop-blur-sm border-l-4 border-red-500 shadow-xl">
          <div className="overflow-x-auto w-full">
            <p className="font-bold mb-3 text-sm flex items-center gap-2">
              <XCircle size={16} /> CẢNH BÁO LỖI HỆ THỐNG (SUPABASE ERROR):
            </p>
            <div className="bg-black/30 p-4 rounded mb-4 border border-white/10">
              <pre className="whitespace-pre-wrap">{JSON.stringify(lastError, null, 2)}</pre>
            </div>
            <div className="bg-white/10 p-4 rounded text-red-100">
              <p className="font-bold mb-2 uppercase text-[10px] tracking-widest">Hướng dẫn khắc phục:</p>
              <ul className="list-disc ml-4 space-y-1">
                <li>Bước 1: Kiểm tra kết nối Internet hoặc cấu hình <strong>supabase</strong>.</li>
                <li>Bước 2: Xác nhận tài khoản <strong>{currentUserEmail}</strong> đã có profile trong Supabase.</li>
                <li>Bước 3: Tải lại trang này (F5) và thử lại.</li>
              </ul>
              <p className="mt-4 italic text-[10px]">Tài khoản đang đăng nhập: <span className="font-bold text-white">{currentUserEmail}</span></p>
            </div>
          </div>
          <button onClick={() => setLastError(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors ml-4 focus:outline-none">
            <X size={20} />
          </button>
        </div>
      )}

      <div className="bg-paper p-8 rounded-sm shadow-sm border border-neutral-100 min-h-[500px]">
        {activeTab === 'prices' && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center border-b border-neutral-100 pb-4 mb-4 gap-4">
              <div className="flex items-center gap-3">
                <Tag className="text-gold-primary" />
                <h3 className="text-xl">Điều chỉnh giá niêm yết</h3>
              </div>
              {isAdmin && (
                <button 
                  onClick={() => setShowAddProduct(true)}
                  className="flex items-center justify-center gap-2 text-[10px] font-black uppercase bg-ink text-paper py-3 px-6 hover:bg-gold-primary hover:text-ink transition-all w-full md:w-auto"
                >
                  <Plus size={16} /> Thêm mặt hàng
                </button>
              )}
            </div>

            {!isAdmin && (
              <div className="bg-amber-50 p-4 border-l-4 border-amber-400 flex items-center gap-3 italic text-[11px] text-amber-700">
                <ShieldCheck size={18} className="text-amber-400 shrink-0" />
                Lưu ý: Bạn đang ở quyền nhân viên (Sales/Accountant). Chỉ quyền ADMIN mới có thể Thêm/Xóa mặt hàng. Bạn hiện chỉ được phép điều chỉnh giá.
              </div>
            )}

            {showAddProduct && (
              <div className="bg-neutral-50 p-6 border border-neutral-200 mb-6 rounded-sm">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-sm font-black uppercase tracking-widest text-ink">Thêm mặt hàng mới</h4>
                  <button onClick={() => setShowAddProduct(false)}><X size={18} /></button>
                </div>
                <form onSubmit={handleAddProduct} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="input-field">
                    <label>Tên mặt hàng</label>
                    <input 
                      type="text" 
                      placeholder="VD: Vàng 9999" 
                      value={newProduct.name}
                      onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                      required
                    />
                  </div>
                  <div className="input-field">
                    <label>Đơn vị</label>
                    <input 
                      type="text" 
                      placeholder="VD: Chỉ" 
                      value={newProduct.unit}
                      onChange={e => setNewProduct({...newProduct, unit: e.target.value})}
                      required
                    />
                  </div>
                  <div className="input-field">
                    <label>Giá mua</label>
                    <input 
                      type="text" 
                      value={formatNumberWithSeparator(newProduct.buy_price)}
                      onChange={e => setNewProduct({...newProduct, buy_price: parseNumberFromSeparator(e.target.value)})}
                    />
                  </div>
                  <div className="input-field">
                    <label>Giá bán</label>
                    <input 
                      type="text" 
                      value={formatNumberWithSeparator(newProduct.sell_price)}
                      onChange={e => setNewProduct({...newProduct, sell_price: parseNumberFromSeparator(e.target.value)})}
                    />
                  </div>
                  <div className="md:col-span-4 flex justify-end">
                    <button type="submit" className="bg-ink text-paper py-2 px-8 font-black uppercase text-[10px] tracking-widest hover:bg-gold-primary hover:text-ink transition-all">
                      Xác nhận thêm
                    </button>
                  </div>
                </form>
              </div>
            )}
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b-2 border-ink">
                    <th className="py-4 font-black uppercase text-[10px] tracking-widest italic text-neutral-400">Mặt hàng</th>
                    <th className="py-4 font-black uppercase text-[10px] tracking-widest italic text-neutral-400">Đơn vị</th>
                    <th className="py-4 font-black uppercase text-[10px] tracking-widest italic text-neutral-400">Giá mua vào</th>
                    <th className="py-4 font-black uppercase text-[10px] tracking-widest italic text-neutral-400">Giá bán ra</th>
                    <th className="py-4 font-black uppercase text-[10px] tracking-widest italic text-neutral-400 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {products.map(p => (
                    <tr key={p.id}>
                      <td className="py-4 font-bold">{p.name}</td>
                      <td className="py-4 font-medium text-neutral-500">{p.unit}</td>
                      <td className="py-4">
                        <input 
                          type="text" 
                          className="w-full md:w-40 p-2 border border-neutral-100 font-mono font-bold text-sm bg-neutral-50 focus:bg-white focus:border-ink outline-none"
                          value={formatNumberWithSeparator(editingPrices[p.id]?.buy_price ?? p.buy_price)} 
                          onChange={(e) => setEditingPrices(prev => ({
                            ...prev,
                            [p.id]: { ...prev[p.id], buy_price: parseNumberFromSeparator(e.target.value) }
                          }))}
                        />
                      </td>
                      <td className="py-4">
                        <input 
                          type="text" 
                          className="w-full md:w-40 p-2 border border-neutral-100 font-mono font-bold text-sm bg-neutral-50 focus:bg-white focus:border-ink outline-none"
                          value={formatNumberWithSeparator(editingPrices[p.id]?.sell_price ?? p.sell_price)} 
                          onChange={(e) => setEditingPrices(prev => ({
                            ...prev,
                            [p.id]: { ...prev[p.id], sell_price: parseNumberFromSeparator(e.target.value) }
                          }))}
                        />
                      </td>
                      <td className="py-4 text-right">
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => handleRowSave(p.id)}
                              className="bg-ink text-paper text-[9px] font-black uppercase px-3 py-1.5 hover:bg-gold-primary hover:text-ink transition-all flex items-center gap-1"
                              title="Lưu thay đổi"
                            >
                              <Save size={12} /> Lưu
                            </button>
                            {isAdmin && (
                              <button 
                                onClick={() => handleDeleteProduct(p.id)}
                                className="text-red-400 hover:text-red-600 transition-colors p-1"
                                title="Xóa mặt hàng"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                          <span className="text-[9px] font-mono text-neutral-400 block">
                            Cập nhật: {new Date(p.updated_at).toLocaleString('vi-VN')}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center border-b border-neutral-100 pb-4 mb-4 gap-4">
              <div className="flex items-center gap-3">
                <Users className="text-gold-primary" />
                <h3 className="text-xl">Quản lý nhân sự ({profiles.length})</h3>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={fetchProfiles}
                  className="bg-paper border border-neutral-200 text-neutral-500 px-4 py-3 text-[10px] font-black uppercase hover:bg-neutral-50"
                  title="Tải lại danh sách"
                >
                  Làm mới
                </button>
              </div>
            </div>

            <div className="bg-neutral-50 p-6 border border-neutral-200 mb-6 rounded-sm">
              <div className="flex items-center gap-3">
                <ShieldCheck className="text-ink" size={24} />
                <div>
                  <h4 className="text-sm font-black uppercase tracking-widest text-ink">Quản lý tài khoản</h4>
                  <p className="text-xs text-neutral-600 italic">
                    Lưu ý: Chức năng đăng ký tự động đã tắt. Vui lòng thêm nhân viên mới trực tiếp qua bảng điều khiển Supabase.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {profiles.map(p => (
                <UserCard 
                  key={p.id} 
                  p={p} 
                  isAdmin={isAdmin} 
                  currentProfile={profile} 
                  showRoleUpdate={showRoleUpdate}
                  setShowRoleUpdate={setShowRoleUpdate}
                  handleUpdateRole={handleUpdateRole}
                />
              ))}
            </div>
            
            {!isAdmin && (
              <div className="bg-neutral-50 p-4 border-l-4 border-blue-500 flex items-center gap-3 italic text-xs text-neutral-600">
                <ShieldCheck size={18} className="text-blue-500" />
                Chỉ quản trị viên mới có quyền xem và chỉnh sửa phân quyền nhân viên.
              </div>
            )}
          </div>
        )}

        {activeTab === 'bank' && (
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-6 max-w-xl">
              <div className="flex items-center gap-3 border-b border-neutral-100 pb-4 mb-4">
                <Building2 className="text-gold-primary" />
                <h3 className="text-xl">Tài khoản doanh nghiệp</h3>
              </div>

              {config && (
                <form onSubmit={handleUpdateConfig} className="flex flex-col gap-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="input-field">
                      <label>Chọn Ngân hàng (Để lấy mã chuẩn)</label>
                      <select 
                        className="w-full p-2 border border-neutral-100 rounded-sm font-medium bg-neutral-50 text-sm h-[42px]"
                        onChange={(e) => {
                          const bank = banks.find(b => b.id === e.target.value);
                          if (bank && config) {
                            setConfig({
                              ...config,
                              bank_name: bank.short_name,
                              bank_id: bank.bin
                            });
                          }
                        }}
                      >
                        <option value="">-- Chọn ngân hàng --</option>
                        {banks.map(b => (
                          <option key={b.id} value={b.id}>{b.short_name} - {b.full_name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="input-field">
                        <label>Tên hiển thị</label>
                        <input 
                          type="text" 
                          value={config.bank_name} 
                          onChange={e => setConfig({...config, bank_name: e.target.value})}
                        />
                      </div>
                      <div className="input-field">
                        <label>Mã VietQR (BIN)</label>
                        <input 
                          type="text" 
                          value={config.bank_id} 
                          placeholder="970436, etc."
                          className="font-mono"
                          onChange={e => setConfig({...config, bank_id: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="input-field">
                    <label>Số tài khoản</label>
                    <input 
                      type="text" 
                      value={config.account_no} 
                      onChange={e => setConfig({...config, account_no: e.target.value})}
                    />
                  </div>

                  <div className="input-field">
                    <label>Chủ tài khoản</label>
                    <input 
                      type="text" 
                      value={config.account_holder} 
                      onChange={e => setConfig({...config, account_holder: e.target.value})}
                    />
                  </div>

                  {isAdmin ? (
                    <button type="submit" className="vcb-btn flex items-center justify-center gap-2">
                      <Save size={18} /> Lưu cấu hình
                    </button>
                  ) : (
                    <div className="bg-neutral-50 p-4 border-l-4 border-neutral-300 italic text-xs text-neutral-600">
                      Bạn không có quyền thay đổi thông tin tài khoản ngân hàng.
                    </div>
                  )}
                </form>
              )}
            </div>

            <div className="pt-8 border-t border-neutral-100">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <CheckCircle className="text-gold-primary" />
                  <h3 className="text-xl">Danh sách ngân hàng liên kết</h3>
                </div>
                {isAdmin && (
                  <button 
                    onClick={() => setShowAddBank(true)}
                    className="flex items-center justify-center gap-2 text-[10px] font-black uppercase bg-ink text-paper py-3 px-6 hover:bg-gold-primary hover:text-ink transition-all"
                  >
                    <Plus size={16} /> Thêm ngân hàng
                  </button>
                )}
              </div>

              {showAddBank && (
                <div className="bg-neutral-50 p-6 border border-neutral-200 mb-6 rounded-sm max-w-2xl">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-black uppercase tracking-widest text-ink">Thêm ngân hàng mới</h4>
                    <button onClick={() => setShowAddBank(false)}><X size={18} /></button>
                  </div>
                  <form onSubmit={handleAddBank} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="input-field">
                      <label>Tên viết tắt (VCB, ...)</label>
                      <input 
                        type="text" 
                        value={newBank.short_name}
                        onChange={e => setNewBank({...newBank, short_name: e.target.value})}
                        required
                      />
                    </div>
                    <div className="input-field">
                      <label>Tên đầy đủ</label>
                      <input 
                        type="text" 
                        value={newBank.full_name}
                        onChange={e => setNewBank({...newBank, full_name: e.target.value})}
                        required
                      />
                    </div>
                    <div className="input-field">
                      <label>Mã BIN (970436, ...)</label>
                      <input 
                        type="text" 
                        value={newBank.bin}
                        onChange={e => setNewBank({...newBank, bin: e.target.value})}
                        required
                      />
                    </div>
                    <div className="md:col-span-3 flex justify-end">
                      <button type="submit" className="bg-ink text-paper py-2 px-8 font-black uppercase text-[10px] tracking-widest hover:bg-gold-primary transition-all">
                        Lưu ngân hàng
                      </button>
                    </div>
                  </form>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b-2 border-ink">
                      <th className="py-4 font-black uppercase text-[10px] tracking-widest text-neutral-400">Ngân hàng</th>
                      <th className="py-4 font-black uppercase text-[10px] tracking-widest text-neutral-400">Tên đầy đủ</th>
                      <th className="py-4 font-black uppercase text-[10px] tracking-widest text-neutral-400">Mã BIN</th>
                      <th className="py-4 font-black uppercase text-[10px] tracking-widest text-neutral-400 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {banks.map(bank => (
                      <tr key={bank.id} className="border-b border-neutral-100">
                        <td className="py-4 font-bold">{bank.short_name}</td>
                        <td className="py-4 text-sm">{bank.full_name}</td>
                        <td className="py-4 font-mono text-sm">{bank.bin}</td>
                        <td className="py-4 text-right">
                          {isAdmin && (
                            <button onClick={() => handleDeleteBank(bank.id)} className="text-red-400 hover:text-red-600">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {banks.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-neutral-400 italic">Chưa có ngân hàng nào được thiết lập</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'vinvoice' && (
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-6 max-w-4xl">
              <div className="flex items-center gap-3 border-b border-neutral-100 pb-4 mb-4">
                <ShieldCheck className="text-gold-primary" />
                <h3 className="text-xl">Cấu hình Hóa đơn điện tử Viettel</h3>
              </div>
              
              <p className="text-xs text-neutral-500 italic bg-blue-50 p-4 border-l-4 border-blue-400">
                Thông tin này được dùng để kết nối với hệ thống vInvoice (SInvoice) của Viettel. 
                Vui lòng nhập đúng tài khoản được Viettel cung cấp trong thư bàn giao dịch vụ.
              </p>

              {config && (
                <form onSubmit={handleUpdateConfig} className="flex flex-col gap-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Cấu hình cơ bản */}
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-gold-dark border-b border-gold-primary/20 pb-2 mb-4">Thông tin đăng nhập bắt buộc</h4>
                      
                      <div className="input-field">
                        <label>Tài khoản (Username) <span className="text-red-500">*</span></label>
                        <input 
                          type="text" 
                          placeholder="VD: MST_User"
                          value={config.viettel_username || ''} 
                          onChange={e => {
                            const val = e.target.value;
                            setConfig(prev => prev ? {...prev, viettel_username: val} : null);
                          }}
                          required
                        />
                      </div>

                      <div className="input-field">
                        <label>Mật khẩu (Password) <span className="text-red-500">*</span></label>
                        <input 
                          type="password" 
                          value={config.viettel_password || ''} 
                          onChange={e => {
                            const val = e.target.value;
                            setConfig(prev => prev ? {...prev, viettel_password: val} : null);
                          }}
                          required
                        />
                      </div>

                      <div className="input-field">
                        <label>Mã số thuế doanh nghiệp <span className="text-red-500">*</span></label>
                        <input 
                          type="text" 
                          placeholder="VD: 0101234567"
                          value={config.viettel_tax_code || ''} 
                          onChange={e => {
                            const val = e.target.value;
                            setConfig(prev => prev ? {...prev, viettel_tax_code: val} : null);
                          }}
                          required
                        />
                      </div>
                    </div>

                    {/* Cấu hình nâng cao */}
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 border-b border-neutral-100 pb-2 mb-4">Thông tin kỹ thuật (Tùy chọn)</h4>
                      
                      <div className="input-field">
                        <label>App ID <span className="text-neutral-400 font-normal italic">(Thường không bắt buộc)</span></label>
                        <input 
                          type="text" 
                          placeholder="Để trống nếu không rõ"
                          value={config.viettel_app_id || ''} 
                          onChange={e => {
                            const val = e.target.value;
                            setConfig(prev => prev ? {...prev, viettel_app_id: val} : null);
                          }}
                        />
                      </div>

                      <div className="input-field">
                        <label>Địa chỉ API (Endpoint)</label>
                        <input 
                          type="text" 
                          placeholder="Mặc định: https://sinvoice.viettel.vn"
                          value={config.viettel_api_url || ''} 
                          onChange={e => {
                            const val = e.target.value;
                            setConfig(prev => prev ? {...prev, viettel_api_url: val} : null);
                          }}
                        />
                        <p className="text-[9px] text-neutral-400 mt-1 italic">Chỉ thay đổi nếu bạn sử dụng máy chủ riêng/đặc thù.</p>
                      </div>

                      <div className="flex items-center gap-2 py-2">
                        <input 
                          type="checkbox" 
                          id="isSandbox"
                          checked={config.viettel_is_sandbox || false}
                          onChange={e => {
                            const checked = e.target.checked;
                            setConfig(prev => prev ? {...prev, viettel_is_sandbox: checked} : null);
                          }}
                          className="w-4 h-4 accent-gold-primary"
                        />
                        <label htmlFor="isSandbox" className="text-sm font-bold cursor-pointer">Sử dụng môi trường thử nghiệm (Demo/Sandbox)</label>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-neutral-100">
                    {isAdmin ? (
                      <button type="submit" className="vcb-btn flex items-center justify-center gap-2 max-w-xs shadow-lg hover:translate-y-[-2px] transition-all">
                        <Save size={18} /> Lưu cấu hình Viettel
                      </button>
                    ) : (
                      <div className="bg-neutral-50 p-4 border-l-4 border-neutral-300 italic text-xs text-neutral-600">
                        Bạn không có quyền thay đổi thông tin cấu hình hóa đơn.
                      </div>
                    )}
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {activeTab === 'backup' && (
          <div className="flex flex-col gap-8 items-center justify-center min-h-[400px]">
            <div className="text-center max-w-md">
              <Download className="mx-auto text-gold-primary mb-6" size={60} strokeWidth={1} />
              <h3 className="text-2xl mb-2 italic">Sao lưu & Phục hồi</h3>
              <p className="text-sm text-neutral-500 font-medium mb-8">Dữ liệu được lưu trữ an toàn trên Supabase. Tuy nhiên, bạn nên định kỳ sao lưu thủ công bản snapshot để dự phòng.</p>
              
              <div className="flex gap-4">
                <button 
                  onClick={handleBackup}
                  className="flex-1 bg-ink text-paper py-4 px-6 font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 hover:bg-gold-primary hover:text-ink transition-all"
                >
                  <Download size={20} /> Sao lưu dữ liệu
                </button>
                <div className="flex-1 relative">
                  <input 
                    type="file" 
                    accept=".json" 
                    className="absolute inset-0 opacity-0 cursor-pointer" 
                    onChange={handleRestore}
                    disabled={restoring}
                  />
                  <button 
                    className={`w-full border border-neutral-200 py-4 px-6 font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 hover:border-ink transition-all ${restoring ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Upload size={20} /> {restoring ? 'Đang phục hồi...' : 'Phục hồi'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'diagnostics' && (
          <div className="flex flex-col gap-8 max-w-2xl">
            <div className="flex items-center gap-3 border-b border-neutral-100 pb-4 mb-4">
              <ShieldCheck className="text-gold-primary" />
              <h3 className="text-xl inline-flex items-center gap-4">
                Chẩn đoán kết nối Database
                {dbStatus.loading ? (
                  <span className="text-[10px] bg-neutral-100 px-2 py-1 italic animate-pulse">Checking...</span>
                ) : (
                  <span className={`text-[10px] px-2 py-1 font-black uppercase tracking-widest ${dbStatus.connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {dbStatus.connected ? 'ONLINE' : 'OFFLINE'}
                  </span>
                )}
              </h3>
            </div>

            <div className={`p-6 border-l-4 ${dbStatus.connected ? 'bg-green-50 border-green-500 text-green-800' : 'bg-red-50 border-red-500 text-red-800'} rounded-sm shadow-sm`}>
              <p className="font-bold mb-2">Trạng thái hiện tại:</p>
              <p className="text-sm italic">{dbStatus.message}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-neutral-50 border border-neutral-100 rounded-sm">
                <p className="text-[10px] uppercase font-black text-neutral-400 mb-2">Cấu hình Supabase</p>
                <code className="text-[11px] block break-all font-mono">
                  {import.meta.env.VITE_SUPABASE_URL ? '✓ URL đã cấu hình' : '✗ Thiếu URL'}
                </code>
              </div>
              <div className="p-4 bg-neutral-50 border border-neutral-100 rounded-sm">
                <p className="text-[10px] uppercase font-black text-neutral-400 mb-2">Xác thực người dùng</p>
                <code className="text-[11px] block break-all font-mono">
                  {user ? `✓ Đã đăng nhập: ${user.email}` : '✗ Chưa đăng nhập'}
                </code>
              </div>
            </div>

            <button 
              onClick={checkConnection}
              className="bg-ink text-paper py-4 px-6 font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 hover:bg-gold-primary hover:text-ink transition-all shadow-lg"
            >
              Thử kết nối lại
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default System;

const isOnline = (lastSeenAt?: string) => {
  if (!lastSeenAt) return false;
  const lastSeen = new Date(lastSeenAt).getTime();
  const now = new Date().getTime();
  // Consider online if seen in the last 5 minutes
  return (now - lastSeen) < (5 * 60 * 1000);
};

const UserCard: React.FC<{ 
  p: Profile, 
  isAdmin: boolean, 
  currentProfile: Profile | null, 
  showRoleUpdate: string | null,
  setShowRoleUpdate: (val: string | null) => void,
  handleUpdateRole: (id: string, role: UserRole) => void
}> = ({ p, isAdmin, currentProfile, showRoleUpdate, setShowRoleUpdate, handleUpdateRole }) => {
  const isAdminEmail = p.email.toLowerCase().trim() === 'binhphan.070582@gmail.com';
  const displayRole = (p.role === 'ADMIN' || isAdminEmail) ? 'Quản trị viên' : p.role === 'ACCOUNTANT' ? 'Kế toán' : 'Bán hàng';
  const isMe = p.email === currentProfile?.email;

  return (
    <div className={`p-6 border rounded-sm relative overflow-hidden group bg-white shadow-sm hover:shadow-md transition-shadow ${isMe ? 'border-gold-primary ring-1 ring-gold-primary/20' : 'border-neutral-100'}`}>
      <div className={`absolute top-0 right-0 w-20 h-20 -mr-10 -mt-10 rotate-45 opacity-10 transition-transform group-hover:scale-110 ${isAdminEmail || p.role === 'ADMIN' ? 'bg-red-500' : 'bg-gold-primary'}`}></div>
      {isMe && (
        <div className="absolute top-2 right-2 flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-gold-dark bg-gold-primary/10 px-2 py-0.5 rounded-full border border-gold-primary/30">
          Bạn
        </div>
      )}
      <div className="flex flex-col gap-1 mb-4">
        <div className="flex justify-between items-start">
          <span className={`text-[10px] font-black uppercase tracking-widest ${isAdminEmail || p.role === 'ADMIN' ? 'text-red-500' : 'text-neutral-400'}`}>
            {displayRole}
          </span>
          <div className="flex items-center gap-2">
            {isOnline(p.last_seen_at) ? (
              <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                Trực tuyến
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-500">
                <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full"></span>
                Ngoại tuyến
              </span>
            )}
          </div>
        </div>
        <h4 className="text-lg font-bold lowercase italic">{p.full_name || p.email.split('@')[0]}</h4>
      </div>
      <div className="text-xs font-medium text-neutral-500 mb-6">
        <p className="truncate" title={p.email}>{p.email}</p>
        <p className="mt-1">Tham gia: {new Date(p.created_at).toLocaleDateString('vi-VN')}</p>
      </div>
      {isAdmin && !isMe && (
        <div className="flex flex-col gap-3">
          <button 
            onClick={() => setShowRoleUpdate(showRoleUpdate === p.id ? null : p.id)}
            className="text-[10px] font-black uppercase text-neutral-400 hover:text-ink transition-colors text-left flex items-center gap-1"
          >
            {showRoleUpdate === p.id ? 'Hủy bỏ' : 'Thay đổi quyền'}
          </button>
        
        {showRoleUpdate === p.id && (
          <div className="flex gap-2 mt-1">
            {(['ADMIN', 'ACCOUNTANT', 'SALES'] as UserRole[]).map(roleOption => (
              <button
                key={roleOption}
                onClick={() => handleUpdateRole(p.id, roleOption)}
                className={`text-[9px] px-2 py-1 border ${p.role === roleOption ? 'bg-ink text-paper border-ink shadow-sm' : 'border-neutral-200 text-neutral-500'} hover:border-ink transition-all font-black uppercase`}
              >
                {roleOption}
              </button>
            ))}
          </div>
        )}
      </div>
    )}
  </div>
  );
};
