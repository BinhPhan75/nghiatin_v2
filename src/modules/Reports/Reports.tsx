import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Transaction, Product, Profile } from '../../types';
import { Search, Filter, Download, ArrowUpCircle, ArrowDownCircle, X, ExternalLink, Printer, Trash2 } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

type GroupedTransaction = Transaction & { 
  salesperson?: Profile; 
  items: Transaction[] 
};

const Reports: React.FC = () => {
  const { profile, isAdmin, loading: authLoading } = useAuth();
  const [transactions, setTransactions] = useState<GroupedTransaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTransaction, setSelectedTransaction] = useState<GroupedTransaction | null>(null);
  const [lastError, setLastError] = useState<any>(null);
  const [dbStatus, setDbStatus] = useState<{ connected: boolean; message: string }>({ 
    connected: true, message: '' 
  });

  // Filter State - Use local date for better UX in Vietnam (UTC+7)
  const getLocalDate = () => {
    const now = new Date();
    const vnTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    return vnTime.toISOString().split('T')[0];
  };

  const localToday = getLocalDate();
  const [startDate, setStartDate] = useState(localToday);
  const [endDate, setEndDate] = useState(localToday);
  const [productId, setProductId] = useState('');
  const [customerCCCD, setCustomerCCCD] = useState('');

  useEffect(() => {
    fetchProducts();
    fetchBanks();
    fetchTransactions();
    checkConnection();
  }, []);

  const fetchBanks = async () => {
    const { data } = await supabase.from('banks').select('*');
    if (data) setBanks(data);
  };

  const handleDeleteTransaction = async (group: GroupedTransaction) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa toàn bộ giao dịch này (${group.items.length} mặt hàng)? Hành động này không thể hoàn tác.`)) {
      return;
    }

    try {
      const idsToDelete = group.items.map(i => i.id);
      const { error } = await supabase
        .from('transactions')
        .delete()
        .in('id', idsToDelete);

      if (error) throw error;
      
      alert("Đã xóa giao dịch thành công.");
      setSelectedTransaction(null);
      fetchTransactions(); // Refresh list
    } catch (err: any) {
      console.error("Delete Error:", err);
      alert("Lỗi khi xóa: " + err.message);
    }
  };

  const checkConnection = async () => {
    const { error } = await supabase.from('transactions').select('id', { count: 'exact', head: true });
    if (error) {
      setDbStatus({ connected: false, message: 'Không thể kết nối tới cơ sở dữ liệu Supabase.' });
      setLastError(error);
    } else {
      setDbStatus({ connected: true, message: '' });
    }
  };

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*');
    if (data) setProducts(data);
  };

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('transactions')
        .select('*')
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`)
        .order('created_at', { ascending: false });

      if (productId) {
        query = query.eq('product_id', productId);
      }

      if (customerCCCD) {
        query = query.ilike('customer_cccd', `%${customerCCCD}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      const rawData = data || [];

      // Fetch profiles for all unique created_by IDs to manually "join"
      const createdByShortList = [...new Set(rawData.map(t => t.created_by))].filter(Boolean);
      let profilesMap: Record<string, Profile> = {};

      if (createdByShortList.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('*')
          .in('id', createdByShortList);
        
        if (profilesData) {
          profilesData.forEach(p => {
            profilesMap[p.id] = p;
          });
        }
      }
      
      // Grouping logic: Transactions with the same customer within 1 minute of each other
      const grouped: GroupedTransaction[] = [];
      const sorted = [...rawData].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      sorted.forEach(t => {
        const tDate = new Date(t.created_at);
        const existingGroup = grouped.find(g => 
          g.customer_cccd === t.customer_cccd && 
          g.type === t.type &&
          Math.abs(new Date(g.created_at).getTime() - tDate.getTime()) < 60000 // 1 minute
        );
        
        const salesperson = profilesMap[t.created_by];

        if (existingGroup) {
          existingGroup.items.push(t);
          existingGroup.total_amount += t.total_amount;
          existingGroup.tien_mat += (t.tien_mat || 0);
          existingGroup.chuyen_khoan += (t.chuyen_khoan || 0);
          existingGroup.chiet_khau += (t.chiet_khau || 0);
          existingGroup.cong_them = (existingGroup.cong_them || 0) + (t.cong_them || 0);
          existingGroup.giam_tru = (existingGroup.giam_tru || 0) + (t.giam_tru || 0);
          existingGroup.other_deduction = (existingGroup.other_deduction || 0) + (t.other_deduction || 0);
        } else {
          grouped.push({
            ...t,
            salesperson,
            items: [t]
          });
        }
      });

      setTransactions(grouped);
      setLastError(null);
    } catch (err: any) {
      console.error("Fetch Transactions Error:", err);
      setLastError(err);
    } finally {
      setLoading(false);
    }
  };

  const totalBuy = transactions
    .filter(t => t.type === 'BUY')
    .reduce((sum, t) => sum + t.total_amount, 0);

  const totalSell = transactions
    .filter(t => t.type === 'SELL')
    .reduce((sum, t) => sum + t.total_amount, 0);

  const totalCashAcross = transactions.reduce((sum, t) => sum + (t.tien_mat || 0), 0);
  const totalTransferAcross = transactions.reduce((sum, t) => sum + (t.chuyen_khoan || 0), 0);

  const handleExport = () => {
    if (transactions.length === 0) {
      alert("Không có dữ liệu để xuất.");
      return;
    }

    const headers = [
      "Thời gian",
      "Loại GD",
      "Khách hàng",
      "CCCD",
      "Địa chỉ",
      "Mặt hàng",
      "Số lượng",
      "Đơn vị",
      "Đơn giá",
      "Tổng tiền",
      "Chiết khấu",
      "Cộng thêm",
      "Giảm trừ",
      "Ghi chú giảm",
      "Tiền mặt",
      "Chuyển khoản",
      "Nhân viên"
    ];

    const rows = transactions.flatMap(group => {
      return group.items.map(t => {
        // Backward compatibility logic for export
        const discountVal = t.type === 'SELL' ? (t.chiet_khau || 0) : 0;
        const premiumVal = t.type === 'BUY' ? (t.cong_them || t.chiet_khau || 0) : (t.cong_them || 0);
        const deductionVal = t.giam_tru || t.other_deduction || 0;

        return [
          new Date(t.created_at).toLocaleString('vi-VN'),
          t.type === 'BUY' ? "MUA VÀO" : "BÁN RA",
          t.customer_name,
          `'${t.customer_cccd}`, 
          t.dia_chi || "",
          t.product_name,
          t.quantity,
          t.unit,
          t.price_per_unit,
          t.total_amount,
          discountVal,
          premiumVal,
          deductionVal,
          t.deduction_note || "",
          t.tien_mat || 0,
          t.chuyen_khoan || 0,
          group.salesperson?.full_name || "Hệ thống"
        ];
      });
    });

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `bao_cao_giao_dich_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center p-20 italic text-neutral-400 font-bold">
        Đang xác thực quyền hạn...
      </div>
    );
  }

  const currentUserEmail = profile?.email;

  return (
    <div className="flex flex-col gap-6">
      {/* Error & Diagnostic Panel */}
      {lastError && (
        <div className="bg-red-50 border-l-4 border-red-500 p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <Filter className="text-red-500 shrink-0 mt-1" size={24} />
            <div className="flex-1">
              <h3 className="text-red-800 font-black uppercase text-xs tracking-widest mb-2">Lỗi truy xuất dữ liệu</h3>
              <p className="text-sm text-red-700 mb-4 font-medium">
                {lastError.message || 'Có lỗi xảy ra khi tải báo cáo.'}
              </p>
              
              <button 
                onClick={() => { setLastError(null); fetchTransactions(); }}
                className="text-[10px] font-black uppercase text-red-600 underline underline-offset-4"
              >
                Thử lại ngay
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-end mb-4">
        <div>
          <h1 className="text-4xl text-ink">Báo Cáo</h1>
          <p className="text-[10px] uppercase font-black text-neutral-400 tracking-widest mt-2 px-1">Truy xuất & Đối soát</p>
        </div>
        <button 
          onClick={fetchTransactions}
          className="bg-ink text-paper py-3 px-6 font-black uppercase text-xs tracking-widest flex items-center gap-2 hover:bg-gold-primary hover:text-ink transition-all shadow-lg"
        >
          <Search size={16} /> Lọc kết quả
        </button>
      </div>

      {/* Filters Pane */}
      <div className="bg-paper p-6 rounded-sm shadow-sm border border-neutral-100 grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="input-field">
          <label>Từ ngày</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="input-field">
          <label>Đến ngày</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <div className="input-field">
          <label>Loại vàng</label>
          <select value={productId} onChange={e => setProductId(e.target.value)}>
            <option value="">Tất cả mặt hàng</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="input-field">
          <label>Số CCCD khách hàng</label>
          <input 
            type="text" 
            placeholder="Tìm theo CCCD..." 
            value={customerCCCD}
            onChange={e => setCustomerCCCD(e.target.value)}
          />
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-paper p-4 border-l-4 border-red-500 shadow-sm">
          <p className="text-[10px] uppercase font-black text-neutral-400 mb-1 tracking-widest flex items-center gap-1">
            <ArrowDownCircle size={10} /> Chi mua vào
          </p>
          <h3 className="text-xl font-bold text-ink">{formatCurrency(totalBuy)}</h3>
        </div>
        <div className="bg-paper p-4 border-l-4 border-vcb-blue shadow-sm">
          <p className="text-[10px] uppercase font-black text-neutral-400 mb-1 tracking-widest flex items-center gap-1">
            <ArrowUpCircle size={10} /> Thu bán ra
          </p>
          <h3 className="text-xl font-bold text-ink">{formatCurrency(totalSell)}</h3>
        </div>
        <div className="bg-paper p-4 border-l-4 border-orange-500 shadow-sm">
          <p className="text-[10px] uppercase font-black text-neutral-400 mb-1 tracking-widest">Tổng tiền mặt</p>
          <h3 className="text-xl font-bold text-ink">{formatCurrency(totalCashAcross)}</h3>
        </div>
        <div className="bg-paper p-4 border-l-4 border-green-600 shadow-sm">
          <p className="text-[10px] uppercase font-black text-neutral-400 mb-1 tracking-widest">Tổng chuyển khoản</p>
          <h3 className="text-xl font-bold text-ink">{formatCurrency(totalTransferAcross)}</h3>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-paper rounded-sm shadow-sm border border-neutral-100 overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center bg-neutral-50 px-4 md:px-6">
          <span className="text-[10px] font-black uppercase text-neutral-400 italic">Dữ liệu chi tiết: {transactions.length} giao dịch</span>
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 text-[10px] font-black uppercase text-ink hover:text-gold-primary"
          >
            <Download size={14} /> <span className="hidden sm:inline">Xuất CSV</span>
          </button>
        </div>
        
        <div className="text-[10px] md:hidden px-4 py-2 bg-yellow-50 text-gold-dark border-b border-yellow-100 font-bold italic">
          &larr; Vuốt sang trái/phải để xem đầy đủ bảng &rarr;
        </div>

        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-ink text-paper">
                <th className="p-4 font-black uppercase text-[10px] tracking-widest text-center">Thời gian</th>
                <th className="p-4 font-black uppercase text-[10px] tracking-widest text-center">Loại GD</th>
                <th className="p-4 font-black uppercase text-[10px] tracking-widest">Khách hàng & Địa chỉ</th>
                <th className="p-4 font-black uppercase text-[10px] tracking-widest">Mặt hàng</th>
                <th className="p-4 font-black uppercase text-[10px] tracking-widest">Người thực hiện</th>
                <th className="p-4 font-black uppercase text-[10px] tracking-widest text-right">Thành tiền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center font-bold text-neutral-300 italic">Đang tải dữ liệu...</td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center font-bold text-neutral-300 italic">Không tìm thấy giao dịch nào</td>
                </tr>
              ) : (
                transactions.map(t => (
                  <tr 
                    key={t.id} 
                    className="hover:bg-neutral-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedTransaction(t)}
                  >
                    <td className="p-4 font-mono text-center">
                      <div className="font-bold text-ink text-[11px]">{new Date(t.created_at).toLocaleDateString('vi-VN')}</div>
                      <div className="text-neutral-400 text-[10px]">{new Date(t.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-sm ${t.type === 'BUY' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-vcb-blue'}`}>
                        {t.type === 'BUY' ? 'MUA VÀO' : 'BÁN RA'}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="text-[9px] text-neutral-400 font-black uppercase mb-1">
                        {t.type === 'BUY' ? 'Người bán (Khách)' : 'Người mua (Khách)'}
                      </div>
                      <div className="text-sm font-bold uppercase truncate max-w-[180px]">{t.customer_name}</div>
                      <div className="text-[10px] font-mono text-neutral-400 mb-1">{t.customer_cccd}</div>
                      {t.dia_chi && (
                        <div className="text-[9px] text-neutral-500 italic truncate max-w-[200px] leading-tight" title={t.dia_chi}>
                          Đ/C: {t.dia_chi}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        {t.items.slice(0, 2).map((item, idx) => (
                          <div key={item.id} className="font-bold italic text-ink text-sm">
                            {item.product_name} <span className="text-[10px] text-neutral-400 font-normal">x{item.quantity}</span>
                          </div>
                        ))}
                        {t.items.length > 2 && (
                          <div className="text-[9px] text-gold-dark font-black uppercase">
                            + {t.items.length - 2} mặt hàng khác...
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-xs font-bold text-ink">{t.salesperson?.full_name || 'Hệ thống'}</div>
                      <div className="text-[9px] text-neutral-400 truncate max-w-[120px]">{t.salesperson?.email || 'N/A'}</div>
                    </td>
                    <td className="p-4 font-mono font-black text-right text-sm">
                      <div className="text-[9px] text-neutral-400 mb-0.5">Đơn giá: {formatCurrency(t.price_per_unit)}</div>
                      <div className="text-ink">{formatCurrency(t.total_amount)}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {selectedTransaction && (
          <div className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-paper w-full max-w-2xl rounded-sm overflow-hidden shadow-2xl relative"
            >
              {/* Modal Header */}
              <div className="bg-ink text-paper p-6 flex justify-between items-center">
                <div className="flex flex-col gap-1">
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-sm inline-block w-fit ${selectedTransaction.type === 'BUY' ? 'bg-red-500 text-white' : 'bg-gold-primary text-ink'}`}>
                    {selectedTransaction.type === 'BUY' ? 'MUA VÀO' : 'BÁN RA'}
                  </span>
                  <h3 className="text-xl font-black uppercase italic tracking-tighter">Chi tiết giao dịch</h3>
                </div>
                <button 
                  onClick={() => setSelectedTransaction(null)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-8 max-h-[80vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  {/* Left Column: Customer & Transaction Meta */}
                  <div className="flex flex-col gap-8">
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-4 border-b border-neutral-100 pb-2">Thông tin khách hàng</h4>
                      <div className="flex flex-col gap-4">
                        <div>
                          <p className="text-[10px] text-neutral-400 font-bold uppercase mb-1">Họ tên</p>
                          <p className="text-lg font-bold text-ink uppercase tracking-tight">{selectedTransaction.customer_name}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-neutral-400 font-bold uppercase mb-1">CCCD</p>
                          <p className="text-sm font-mono font-medium text-ink">{selectedTransaction.customer_cccd}</p>
                        </div>
                        {selectedTransaction.dia_chi && (
                          <div>
                            <p className="text-[10px] text-neutral-400 font-bold uppercase mb-1">Địa chỉ</p>
                            <p className="text-xs text-neutral-600 italic leading-relaxed">{selectedTransaction.dia_chi}</p>
                          </div>
                        )}
                        {selectedTransaction.type === 'BUY' && selectedTransaction.customer_bank_id && (
                          <div className="bg-neutral-50 p-3 rounded border border-neutral-100">
                             <p className="text-[10px] text-neutral-400 font-bold uppercase mb-1">Thanh toán cho khách qua</p>
                             <p className="text-xs font-bold text-ink">
                               {banks.find(b => b.id === selectedTransaction.customer_bank_id)?.short_name || 'N/A'} - {selectedTransaction.customer_account_no}
                             </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-4 border-b border-neutral-100 pb-2">Người thực hiện</h4>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-neutral-100 rounded-full flex items-center justify-center font-black text-neutral-400">
                          {selectedTransaction.salesperson?.full_name?.charAt(0) || 'S'}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-ink">{selectedTransaction.salesperson?.full_name || 'Hệ thống'}</p>
                          <p className="text-[10px] text-neutral-400">{selectedTransaction.salesperson?.email || 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Order Details & Payment */}
                  <div className="flex flex-col gap-8">
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-4 border-b border-neutral-100 pb-2">Danh sách mặt hàng ({selectedTransaction.items.length})</h4>
                      <div className="flex flex-col gap-3">
                        {selectedTransaction.items.map((item, idx) => (
                          <div key={item.id} className="bg-neutral-50 p-4 rounded-sm border border-neutral-100">
                            <div className="flex justify-between items-start mb-4">
                              <div>
                                <p className="text-lg font-black text-ink italic">{item.product_name}</p>
                                <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">
                                  {item.quantity} {item.unit}
                                </p>
                              </div>
                              <p className="text-sm font-mono font-bold text-neutral-400">
                                #{idx + 1}
                              </p>
                            </div>
                            <div className="space-y-2 pt-4 border-t border-neutral-200/50">
                              <div className="flex justify-between text-xs">
                                <span className="text-neutral-500">Đơn giá:</span>
                                <span className="font-bold">{formatCurrency(item.price_per_unit)}</span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-neutral-500">Thành tiền:</span>
                                <span className="font-bold">{formatCurrency(item.price_per_unit * item.quantity)}</span>
                              </div>
                              {selectedTransaction.type === 'BUY' && (item.cong_them > 0 || (item.chiet_khau > 0)) && (
                                <div className="flex justify-between text-xs italic text-blue-500">
                                  <span>Tiền thêm (+):</span>
                                  <span className="font-bold">+{formatCurrency(item.cong_them || item.chiet_khau)}</span>
                                </div>
                              )}
                              {selectedTransaction.type === 'SELL' && item.chiet_khau > 0 && (
                                <div className="flex justify-between text-xs italic text-red-500">
                                  <span>Chiết khấu (-):</span>
                                  <span className="font-bold">-{formatCurrency(item.chiet_khau)}</span>
                                </div>
                              )}
                              {(selectedTransaction.type === 'BUY' || selectedTransaction.type === 'SELL') && (item.giam_tru > 0 || (item.other_deduction || 0) > 0) && (
                                <div className="flex justify-between text-xs text-red-500 italic pb-1">
                                  <div className="flex flex-col">
                                    <span>Giảm trừ khác (-):</span>
                                    {item.deduction_note && <span className="text-[8px] text-neutral-400 not-italic uppercase tracking-widest">{item.deduction_note}</span>}
                                  </div>
                                  <span className="font-bold">-{formatCurrency(item.giam_tru || item.other_deduction || 0)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-4 border-b border-neutral-100 pb-2">Thanh toán</h4>
                      <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-end border-b border-neutral-50 pb-2 mb-2">
                          <span className="text-[10px] font-black uppercase text-neutral-400">Tổng cộng</span>
                          <span className="text-2xl font-black text-ink">{formatCurrency(selectedTransaction.total_amount)}</span>
                        </div>
                        {selectedTransaction.type === 'BUY' && (selectedTransaction.other_deduction || 0) > 0 && (
                          <div className="flex justify-between items-center text-red-500 italic text-xs -mt-2 mb-2 ornament-border-l pl-2 border-l-2 border-red-100">
                             <span className="font-bold">Tổng giảm trừ:</span>
                             <span className="font-black">-{formatCurrency(selectedTransaction.other_deduction || 0)}</span>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-orange-50 p-3 border border-orange-100 rounded-sm">
                            <p className="text-[9px] font-black uppercase text-orange-400 mb-1">Tiền mặt</p>
                            <p className="text-sm font-bold text-orange-700">{formatCurrency(selectedTransaction.tien_mat || 0)}</p>
                          </div>
                          <div className="bg-green-50 p-3 border border-green-100 rounded-sm">
                            <p className="text-[9px] font-black uppercase text-green-500 mb-1">Chuyển khoản</p>
                            <p className="text-sm font-bold text-green-700">{formatCurrency(selectedTransaction.chuyen_khoan || 0)}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="text-[9px] text-neutral-400 italic">
                      <p>Ngày thực hiện: {new Date(selectedTransaction.created_at).toLocaleString('vi-VN')}</p>
                      <p>Mã chuẩn: {selectedTransaction.id}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="bg-neutral-50 p-6 border-t border-neutral-100 flex justify-end gap-4">
                {isAdmin && (
                  <button 
                    onClick={() => handleDeleteTransaction(selectedTransaction)}
                    className="px-6 py-2 border border-red-200 text-red-500 text-[10px] font-black uppercase hover:bg-red-500 hover:text-white transition-all flex items-center gap-2"
                  >
                    <Trash2 size={14} /> <span className="hidden sm:inline">Xóa toàn bộ giao dịch</span>
                    <span className="sm:hidden">Xóa tất cả</span>
                  </button>
                )}
                <button 
                  onClick={() => setSelectedTransaction(null)}
                  className="px-8 py-2 bg-ink text-paper text-[10px] font-black uppercase tracking-widest hover:bg-gold-primary hover:text-ink transition-all shadow-md"
                >
                  Đóng lại
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Reports;
