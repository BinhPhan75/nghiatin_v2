import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { supabase } from '../../lib/supabase';
import { Transaction, Product } from '../../types';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { TrendingUp, TrendingDown, Scale, ShoppingBag, Clock } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import { motion } from 'motion/react';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    buyTotal: 0,
    sellTotal: 0,
    buyCount: 0,
    sellCount: 0,
  });
  const [buyPieData, setBuyPieData] = useState<any[]>([]);
  const [sellPieData, setSellPieData] = useState<any[]>([]);
  const [hourlyData, setHourlyData] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sjcPrices, setSjcPrices] = useState<any[]>([]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([
        fetchDashboardData(),
        fetchSJCPrices()
      ]);
      setLoading(false);
    };
    init();
  }, []);

  const fetchSJCPrices = async () => {
    try {
      const response = await axios.get('/api/gold-prices/sjc');
      if (response.data && response.data.items) {
        setSjcPrices(response.data.items);
      }
    } catch (error: any) {
      console.error('Error fetching SJC prices in dashboard:', error.message);
      // If server is not ready, we just show listed prices fallback (handled in rendering)
    }
  };

  const fetchDashboardData = async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .gte('created_at', `${today}T00:00:00`);

    if (transactions) {
      const buyTransactions = transactions.filter(t => t.type === 'BUY');
      const sellTransactions = transactions.filter(t => t.type === 'SELL');

      // Helper to count orders (grouped transactions)
      const countOrders = (data: any[]) => {
        const grouped: any[] = [];
        const sorted = [...data].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        sorted.forEach(t => {
          const tDate = new Date(t.created_at);
          const existingGroup = grouped.find(g => 
            g.customer_cccd === t.customer_cccd && 
            g.type === t.type &&
            Math.abs(new Date(g.created_at).getTime() - tDate.getTime()) < 60000
          );
          if (!existingGroup) grouped.push(t);
        });
        return grouped.length;
      };

      setStats({
        buyTotal: buyTransactions.reduce((s, t) => s + t.total_amount, 0),
        sellTotal: sellTransactions.reduce((s, t) => s + t.total_amount, 0),
        buyCount: countOrders(buyTransactions),
        sellCount: countOrders(sellTransactions),
      });

      // Pie data: weight by product for BUY
      const buyMap: Record<string, number> = {};
      buyTransactions.forEach(t => {
        buyMap[t.product_name] = (buyMap[t.product_name] || 0) + t.total_amount;
      });
      setBuyPieData(Object.entries(buyMap).map(([name, value]) => ({ name, value })));

      // Pie data: weight by product for SELL
      const sellMap: Record<string, number> = {};
      sellTransactions.forEach(t => {
        sellMap[t.product_name] = (sellMap[t.product_name] || 0) + t.total_amount;
      });
      setSellPieData(Object.entries(sellMap).map(([name, value]) => ({ name, value })));

      // Bar data: by hour
      const hourlyMap: Record<number, { hour: string, buy: number, sell: number }> = {};
      for (let i = 8; i <= 20; i++) {
        hourlyMap[i] = { hour: `${i}h`, buy: 0, sell: 0 };
      }
      transactions.forEach(t => {
        const h = new Date(t.created_at).getHours();
        if (hourlyMap[h]) {
          if (t.type === 'BUY') hourlyMap[h].buy += t.total_amount;
          else hourlyMap[h].sell += t.total_amount;
        }
      });
      setHourlyData(Object.values(hourlyMap));
    }

    const { data: pData } = await supabase.from('products').select('*');
    if (pData) setProducts(pData);
  };

  const COLORS = ['#D4AF37', '#141414', '#996515', '#006738', '#4b5563'];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-gold-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-black uppercase tracking-widest text-neutral-400 italic">Đang tải dữ liệu cơ sở dữ liệu...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="flex flex-col md:flex-row md:items-end gap-6 w-full">
          <div>
            <h1 className="text-4xl text-ink">Tổng Quan</h1>
            <p className="text-[10px] uppercase font-black text-neutral-400 tracking-widest mt-2 px-1">Số liệu trực tiếp ngày hôm nay</p>
          </div>
          
          <div className="flex gap-2 w-full md:w-auto">
            <button 
              onClick={() => navigate('/transactions?type=BUY')}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white border border-neutral-200 py-2.5 px-6 font-black uppercase text-[10px] tracking-widest hover:bg-gold-primary hover:border-gold-primary hover:text-ink transition-all shadow-sm"
            >
              <TrendingDown size={14} className="text-red-500" /> Mua vào
            </button>
            <button 
              onClick={() => navigate('/transactions?type=SELL')}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-gold-primary text-ink py-2.5 px-6 font-black uppercase text-[10px] tracking-widest hover:bg-ink hover:text-white transition-all shadow-md"
            >
              <TrendingUp size={14} /> Bán ra
            </button>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 bg-paper px-4 py-2 rounded-sm border border-neutral-100 shadow-sm shrink-0">
          <Clock className="text-gold-primary" size={16} />
          <span className="text-xs font-bold text-neutral-500">{new Date().toLocaleDateString('vi-VN')}</span>
        </div>
      </div>

      {/* Price Ticker Tape */}
      <div className="bg-ink overflow-hidden py-3 border-y border-gold-primary/20 relative shadow-inner">
        <div className="flex whitespace-nowrap animate-ticker">
          <div className="flex gap-20 px-4">
            {sjcPrices.length > 0 ? (
              // Double the array to ensure continuous scrolling
              [...sjcPrices, ...sjcPrices, ...sjcPrices].map((p, idx) => (
                <div key={`${p.type}-${idx}`} className="flex items-center gap-4">
                  <span className="text-gold-primary font-black uppercase text-[10px] tracking-widest italic">{p.type}</span>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-paper/50 font-bold uppercase">Mua:</span>
                      <span className="text-sm font-mono font-bold text-paper">{p.buy}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-paper/50 font-bold uppercase">Bán:</span>
                      <span className="text-sm font-mono font-bold text-gold-primary">{p.sell}</span>
                    </div>
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full bg-gold-primary/30 mx-4" />
                </div>
              ))
            ) : products.length > 0 ? (
              [...products, ...products, ...products].map((p, idx) => (
                <div key={`${p.id}-${idx}`} className="flex items-center gap-4">
                  <span className="text-gold-primary font-black uppercase text-[10px] tracking-widest italic">{p.name}</span>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-paper/50 font-bold uppercase">Mua:</span>
                      <span className="text-sm font-mono font-bold text-paper">{p.buy_price.toLocaleString()}đ</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-paper/50 font-bold uppercase">Bán:</span>
                      <span className="text-sm font-mono font-bold text-gold-primary">{p.sell_price.toLocaleString()}đ</span>
                    </div>
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full bg-gold-primary/30 mx-4" />
                </div>
              ))
            ) : (
              <span className="text-paper/40 text-[10px] uppercase font-black tracking-widest">Đang cập nhật bảng giá niêm yết SJC...</span>
            )}
          </div>
        </div>
        <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-ink to-transparent z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-ink to-transparent z-10" />
      </div>

      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker {
          display: flex;
          width: fit-content;
          animation: ticker 60s linear infinite;
        }
        .animate-ticker:hover {
          animation-play-state: paused;
        }
      `}</style>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          label="Tổng thu bán ra" 
          value={formatCurrency(stats.sellTotal)} 
          count={stats.sellCount} 
          icon={TrendingUp} 
          color="text-vcb-blue" 
          borderColor="border-vcb-blue/20"
        />
        <StatCard 
          label="Tổng chi mua vào" 
          value={formatCurrency(stats.buyTotal)} 
          count={stats.buyCount} 
          icon={TrendingDown} 
          color="text-red-600" 
          borderColor="border-red-600/20"
        />
        <StatCard 
          label="Chênh lệch dòng tiền" 
          value={formatCurrency(stats.sellTotal - stats.buyTotal)} 
          icon={Scale} 
          color={stats.sellTotal - stats.buyTotal >= 0 ? "text-vcb-blue" : "text-red-600"} 
        />
        <StatCard 
          label="Số lượng giao dịch" 
          value={(stats.buyCount + stats.sellCount).toString()} 
          icon={ShoppingBag} 
          color="text-ink" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-paper p-6 rounded-sm shadow-sm border border-neutral-100">
          <h3 className="mb-4 italic text-[11px] font-black uppercase text-red-600 flex items-center gap-2">
            <TrendingDown size={14} /> Tỷ trọng mặt hàng MUA VÀO
          </h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={buyPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {buyPieData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend verticalAlign="bottom" height={36} iconType="rect" wrapperStyle={{fontSize: '9px', fontWeight: 800, textTransform: 'uppercase'}} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-paper p-6 rounded-sm shadow-sm border border-neutral-100">
          <h3 className="mb-4 italic text-[11px] font-black uppercase text-vcb-blue flex items-center gap-2">
            <TrendingUp size={14} /> Tỷ trọng mặt hàng BÁN RA
          </h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sellPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {sellPieData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend verticalAlign="bottom" height={36} iconType="rect" wrapperStyle={{fontSize: '9px', fontWeight: 800, textTransform: 'uppercase'}} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-paper p-6 rounded-sm shadow-sm border border-neutral-100 lg:col-span-1">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl">Bảng giá niêm yết</h3>
            <span className="text-[8px] font-black uppercase text-gold-primary border border-gold-primary px-2 py-0.5">Live</span>
          </div>
          <div className="flex flex-col gap-4">
            {products.map(p => (
              <div key={p.id} className="price-card group">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col">
                    <span>{p.name} ({p.unit})</span>
                    <div className="flex gap-4 mt-2">
                      <div className="flex flex-col">
                        <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-tighter">Mua</p>
                        <p className="font-mono font-black text-sm">{p.buy_price.toLocaleString()}</p>
                      </div>
                      <div className="flex flex-col">
                        <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-tighter">Bán</p>
                        <p className="font-mono font-black text-sm text-gold-dark">{p.sell_price.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Charts */}
        <div className="lg:col-span-2 grid grid-cols-1 gap-8">
          {/* Main Sales Chart */}
          <div className="bg-paper p-6 rounded-sm shadow-sm border border-neutral-100">
            <h3 className="mb-8 italic text-xs font-black uppercase text-neutral-400">Biểu đồ dòng tiền theo giờ</h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700}} />
                  <YAxis hide />
                  <Tooltip 
                    contentStyle={{ borderRadius: '0', border: '1px solid #000', fontWeight: 'bold' }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Bar dataKey="sell" name="Bán ra" fill="#006738" />
                  <Bar dataKey="buy" name="Mua vào" fill="#dc2626" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string, value: string, count?: number, icon: any, color: string, borderColor?: string }> = ({ label, value, count, icon: Icon, color, borderColor }) => (
  <motion.div 
    whileHover={{ y: -5 }}
    className={`bg-paper p-6 rounded-sm shadow-sm border ${borderColor || 'border-neutral-100'} group`}
  >
    <div className="flex justify-between items-start mb-4">
      <span className="text-[10px] uppercase font-black text-neutral-400 tracking-widest leading-tight">{label}</span>
      <Icon className={`${color} opacity-40 group-hover:opacity-100 transition-opacity`} size={20} />
    </div>
    <div className="flex flex-col">
      <h3 className={`text-2xl ${color} whitespace-nowrap overflow-hidden text-ellipsis`}>{value}</h3>
      {count !== undefined && (
        <span className="text-[10px] font-bold text-neutral-400 mt-1">{count} lượt giao dịch</span>
      )}
    </div>
  </motion.div>
);

export default Dashboard;
