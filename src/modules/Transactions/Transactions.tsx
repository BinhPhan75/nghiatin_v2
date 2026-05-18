import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Product, Transaction, SystemConfig, Bank } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { Camera, QrCode, CreditCard, Send, CheckCircle2, Search, ArrowLeftRight, X, XCircle, UserPlus } from 'lucide-react';
import QRScanner from '../../components/QRScanner';
import { parseCCCD, getVietQRUrl, formatCurrency, removeVietnameseTones, parseVietQR, generateEMVCoQR, getRawQRUrl } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { getViettelConfig, createInvoice } from '../../services/viettelInvoiceService';
import { FileText, Loader2 } from 'lucide-react';

const Transactions: React.FC = () => {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') === 'BUY' ? 'BUY' : 'SELL';
  const [type, setType] = useState<'BUY' | 'SELL'>(initialType);
  const [products, setProducts] = useState<Product[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [config, setConfig] = useState<SystemConfig | null>(null);
  
  // Form State
  const [customerName, setCustomerName] = useState('');
  const [customerCCCD, setCustomerCCCD] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerBankId, setCustomerBankId] = useState('');
  const [customerAccountNo, setCustomerAccountNo] = useState('');
  const [detectedAccountName, setDetectedAccountName] = useState('');
  
  // Cart State
  interface CartItem {
    id: string;
    product: Product;
    quantity: number;
    pricePerUnit: number;
  }
  const [cart, setCart] = useState<CartItem[]>([]);
  
  const [quantity, setQuantity] = useState<number | string>(1);
  const [quantityInput, setQuantityInput] = useState('1');
  const [customPrice, setCustomPrice] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [premium, setPremium] = useState<number>(0);
  const [otherDeduction, setOtherDeduction] = useState<number>(0);
  const [deductionNote, setDeductionNote] = useState('');
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [transferAmount, setTransferAmount] = useState<number>(0);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerMode, setScannerMode] = useState<'ocr' | 'qr'>('ocr');
  const [scannerTarget, setScannerTarget] = useState<'cccd' | 'bank'>('cccd');
  const [showSuccess, setShowSuccess] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [lastError, setLastError] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [issuingInvoice, setIssuingInvoice] = useState(false);
  const [lastInsertedId, setLastInsertedId] = useState<string | null>(null);
  const [invoiceResult, setInvoiceResult] = useState<{ no: string; code: string } | null>(null);

  // Handheld Scanner Support
  const scanBuffer = React.useRef<string>('');
  const lastKeyTime = React.useRef<number>(0);
  const scanTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const [scannerStatus, setScannerStatus] = useState<'offline' | 'ready' | 'active'>('offline');

  useEffect(() => {
    const handleFocus = () => {
      // If we were active, stay active, otherwise we're ready
      setScannerStatus(prev => prev === 'active' ? 'active' : 'ready');
    };
    const handleBlur = () => {
      setScannerStatus('offline');
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    // Initial check
    if (document.hasFocus()) setScannerStatus('ready');

    const processScanData = (data: string) => {
      if (!data || data.length < 5) return;
      
      setScannerStatus('active');
      const info = parseCCCD(data);
      const bankInfo = parseVietQR(data);
      
      console.log("Processing Global Scan:", data.substring(0, 50));
      
      if (info) {
        setCustomerName(info.name);
        setCustomerCCCD(info.id);
        if (info.address) setCustomerAddress(info.address);
        
        // Success Feedback
        const notification = document.createElement('div');
        notification.className = 'fixed bottom-4 left-4 bg-ink text-gold-primary px-6 py-3 rounded-sm shadow-2xl z-50 font-black uppercase text-[10px] tracking-widest animate-in fade-in slide-in-from-bottom-4 flex items-center gap-3 border-l-4 border-gold-primary';
        notification.innerHTML = `<span class="bg-gold-primary text-ink rounded-full p-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span> Đã nhận dạng Căn cước thành công`;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
      } else if (bankInfo) {
        handleScan(data);
      } else if (scannerTarget === 'cccd' && /^\d{12}$/.test(data)) {
        setCustomerCCCD(data);
        const notification = document.createElement('div');
        notification.className = 'fixed bottom-4 left-4 bg-ink text-paper px-6 py-3 rounded-sm shadow-2xl z-50 font-black uppercase text-[10px] tracking-widest animate-in fade-in slide-in-from-bottom-4 border-l-4 border-blue-400';
        notification.innerText = 'Đã nhận nhanh Số thẻ / CCCD';
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 2500);
      }
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (showScanner || showSuccess || showQR) return;
      
      const now = Date.now();
      const isFast = (now - lastKeyTime.current < 100); // 100ms threshold for scanners
      lastKeyTime.current = now;

      // Handle scan timeout (for scanners that don't send Enter)
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
      
      if (e.key === 'Enter') {
        const data = scanBuffer.current.trim();
        if (data) {
          e.preventDefault();
          processScanData(data);
        }
        scanBuffer.current = '';
      } else if (e.key.length === 1) {
        // If it was slow (>100ms) and we already have some data, this is likely manual typing or a new scan
        if (!isFast && scanBuffer.current.length > 0) {
          // If we had a significant buffer, process it first if it hasn't been processed by Enter
          if (scanBuffer.current.length > 10) {
            processScanData(scanBuffer.current.trim());
          }
          scanBuffer.current = e.key;
        } else {
          scanBuffer.current += e.key;
        }
        
        // Auto-process after delay of inactivity
        scanTimeoutRef.current = setTimeout(() => {
          if (scanBuffer.current.length > 5) {
            processScanData(scanBuffer.current.trim());
            scanBuffer.current = '';
          }
        }, 300); // 300ms of silence means scan is done
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showScanner, showSuccess, showQR]);

  useEffect(() => {
    const searchType = searchParams.get('type');
    if (searchType === 'BUY' || searchType === 'SELL') {
      setType(searchType);
    }
  }, [searchParams]);

  useEffect(() => {
    fetchProducts();
    fetchConfig();
    fetchBanks();
  }, []);

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*');
    if (data) setProducts(data);
  };

  const fetchConfig = async () => {
    const { data } = await supabase.from('system_config').select('*').limit(1);
    if (data && data.length > 0) setConfig(data[0]);
  };

  const fetchBanks = async () => {
    const { data } = await supabase.from('banks').select('*').order('short_name');
    if (data) setBanks(data);
  };

  useEffect(() => {
    if (selectedProduct) {
      setCustomPrice(type === 'BUY' ? selectedProduct.buy_price : selectedProduct.sell_price);
    } else {
      setCustomPrice(0);
    }
  }, [selectedProduct, type]);

  useEffect(() => {
    setCustomerBankId('');
    setCustomerAccountNo('');
    setDetectedAccountName('');
  }, [type]);

  const currentPrice = customPrice;
  
  const cartSubtotal = cart.reduce((sum, item) => sum + (item.pricePerUnit * item.quantity), 0);
  const totalAmount = type === 'BUY' 
    ? Math.max(0, cartSubtotal + premium - otherDeduction) 
    : Math.max(0, cartSubtotal - discount);

  useEffect(() => {
    // Default: transferAmount = totalAmount - cashAmount
    setTransferAmount(Math.max(0, totalAmount - cashAmount));
  }, [totalAmount, cashAmount]);

  const addToCart = () => {
    const qNum = typeof quantity === 'string' ? parseFloat(quantity.replace(/,/g, '.')) : quantity;
    if (!selectedProduct || qNum <= 0 || customPrice <= 0) {
      alert("Vui lòng chọn loại vàng, số lượng và đơn giá hợp lệ");
      return;
    }
    const newItem: CartItem = {
      id: Math.random().toString(36).substr(2, 9),
      product: selectedProduct,
      quantity: qNum,
      pricePerUnit: customPrice
    };
    setCart([...cart, newItem]);
    // Reset item selection for next one
    setSelectedProduct(null);
    setQuantity(1);
    setQuantityInput('1');
    setCustomPrice(0);
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const handleCashChange = (val: number) => {
    setCashAmount(val);
    setTransferAmount(Math.max(0, totalAmount - val));
  };

  const handleTransferChange = (val: number) => {
    setTransferAmount(val);
    setCashAmount(Math.max(0, totalAmount - val));
  };

  const handleScan = (data: string | any, isManual: boolean = false) => {
    if (!data) return;
    
    console.log(`Dữ liệu quét (${isManual ? 'Thủ công' : 'Handheld'}):`, typeof data === 'string' ? data.substring(0, 30) : 'Object');
    
    // Case 1: Data is an object from AI analysis (Gemini OCR for CCCD)
    if (typeof data === 'object' && data.id && data.name) {
      if (isManual && scannerTarget !== 'cccd') {
        alert("AI nhận diện được thông tin Căn cước, nhưng bạn đang tìm Tài khoản Ngân hàng. Vui lòng quét đúng mã QR Ngân hàng của khách.");
        return;
      }
      
      setCustomerName(data.name);
      setCustomerCCCD(data.id);
      if (data.address) setCustomerAddress(data.address);
      setShowScanner(false);
      setLastError(null);
      
      const notification = document.createElement('div');
      notification.className = 'fixed bottom-4 left-4 bg-ink text-gold-primary px-6 py-3 rounded-sm shadow-2xl z-50 font-black uppercase text-[10px] tracking-widest animate-in fade-in slide-in-from-bottom-4 flex items-center gap-3 border-l-4 border-gold-primary';
      notification.innerHTML = `<span class="bg-gold-primary text-ink rounded-full p-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span> AI NHẬN DIỆN CCCD THÀNH CÔNG`;
      document.body.appendChild(notification);
      setTimeout(() => notification.remove(), 3000);
      return;
    }

    // Case 2: Data is a string from QR scan
    if (typeof data === 'string') {
      // 2.1: Check if it's a Bank QR (VietQR starts with 000201)
      const bankInfo = parseVietQR(data);
      
      if (bankInfo) {
        if (isManual && scannerTarget !== 'bank') {
          alert("Bạn vừa quét Mã Ngân hàng (VietQR) trong khi đang tìm Căn cước (CCCD). Vui lòng quét đúng mã QR mặt sau CCCD.");
          return;
        }

        setCustomerAccountNo(bankInfo.accountNo);
        setDetectedAccountName(bankInfo.accountName || '');
        
        // Find matching bank by BIN (Robust matching)
        const matchingBank = banks.find(b => 
          b.bin === bankInfo.bin || 
          (bankInfo.bin.length > 6 && b.bin === bankInfo.bin.substring(bankInfo.bin.length - 6)) ||
          (b.bin.length > 6 && bankInfo.bin === b.bin.substring(b.bin.length - 6))
        );

        if (matchingBank) {
          setCustomerBankId(matchingBank.id);
        }
        
        setShowScanner(false);
        setLastError(null);
        
        // Notification feedback
        const notification = document.createElement('div');
        notification.className = 'fixed bottom-4 left-4 bg-ink text-gold-primary px-6 py-3 rounded-sm shadow-2xl z-50 font-black uppercase text-[10px] tracking-widest animate-in fade-in slide-in-from-bottom-4 flex items-center gap-3 border-l-4 border-gold-primary';
        const nameStatus = bankInfo.accountName ? `[${bankInfo.accountName}]` : '(KHÔNG CÓ TÊN)';
        notification.innerHTML = `<span class="bg-gold-primary text-ink rounded-full p-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span> QUÉT THÀNH CÔNG: ${bankInfo.accountNo} ${nameStatus}`;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 4000);
        
        console.log("State updated - Account No:", bankInfo.accountNo, "Account Name:", bankInfo.accountName);
        return;
      }

      // 2.2: Check if it's a CCCD QR
      const info = parseCCCD(data);
      if (info) {
        if (isManual && scannerTarget !== 'cccd') {
          alert("Bạn vừa quét Mã QR Căn cước trong khi đang tìm Tài khoản Ngân hàng. Vui lòng quét đúng mã VietQR.");
          return;
        }

        setCustomerName(info.name);
        setCustomerCCCD(info.id);
        if (info.address) setCustomerAddress(info.address);
        setShowScanner(false);
        setLastError(null);
      } else {
        console.warn("Mã QR không đúng định dạng CCCD chuẩn:", data);
        const parts = data.split('|');
        if (parts.length > 2) {
          alert(`Dữ liệu quét được: "${data.substring(0, 30)}..." không khớp định dạng CCCD chuẩn. Vui lòng thử lại với thẻ CCCD gắn chip mới nhất.`);
        } else {
          alert("Không nhận diện được nội dung. Vui lòng đảm bảo bạn đang quét đúng Mã QR CCCD hoặc VietQR Ngân hàng.");
        }
      }
    }
  };

  const handleSubmit = async () => {
    if (submitting) {
      alert("Giao dịch đã được ghi nhận vào hệ thống. Vui lòng không bấm liên tiếp.");
      return;
    }

    if (cart.length === 0) {
      alert("Vui lòng thêm ít nhất một mặt hàng vào danh sách");
      return;
    }

    if (!customerName || !customerCCCD) {
      alert("Vui lòng nhập đầy đủ thông tin khách hàng");
      return;
    }

    setSubmitting(true);
    
    // Distribute payment proportionally with rounding adjustment for last item
    let distributedDiscount = 0;
    let distributedPremium = 0;
    let distributedOtherDeduction = 0;
    let distributedCash = 0;
    let distributedTransfer = 0;

    const itemsCount = cart.length;
    const transactions: Omit<Transaction, 'id'>[] = cart.map((item, index) => {
      const isLast = index === itemsCount - 1;
      const itemSubtotal = item.pricePerUnit * item.quantity;
      const weight = itemSubtotal / cartSubtotal;
      
      // Proportional distribution
      let itemDiscount = type === 'SELL' ? (isLast ? (discount - distributedDiscount) : Math.round(discount * weight)) : 0;
      let itemPremium = type === 'BUY' ? (isLast ? (premium - distributedPremium) : Math.round(premium * weight)) : 0;
      let itemOtherDeduction = isLast ? (otherDeduction - distributedOtherDeduction) : Math.round(otherDeduction * weight);
      let itemCash = isLast ? (cashAmount - distributedCash) : Math.round(cashAmount * weight);
      let itemTransfer = isLast ? (transferAmount - distributedTransfer) : Math.round(transferAmount * weight);

      distributedDiscount += itemDiscount;
      distributedPremium += itemPremium;
      distributedOtherDeduction += itemOtherDeduction;
      distributedCash += itemCash;
      distributedTransfer += itemTransfer;

      const itemTotal = type === 'BUY' ? (itemSubtotal + itemPremium - itemOtherDeduction) : Math.max(0, itemSubtotal - itemDiscount);
      
      return {
        type,
        customer_name: customerName,
        customer_cccd: customerCCCD,
        dia_chi: customerAddress || null,
        customer_bank_id: (type === 'BUY' && customerBankId) ? customerBankId : null,
        customer_account_no: type === 'BUY' ? customerAccountNo : null,
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit: item.product.unit,
        price_per_unit: item.pricePerUnit,
        total_amount: itemTotal,
        chiet_khau: itemDiscount,
        cong_them: itemPremium,
        giam_tru: itemOtherDeduction,
        other_deduction: itemOtherDeduction,
        deduction_note: type === 'BUY' ? deductionNote : null,
        tien_mat: itemCash,
        chuyen_khoan: itemTransfer,
        created_at: new Date().toISOString(),
        created_by: profile?.id && profile.id.length > 20 ? profile.id : null,
      };
    });

    setLastError(null);
    try {
      const { data, error } = await supabase.from('transactions').insert(transactions).select('id');
      if (error) throw error;
      
      if (data && data.length > 0) {
        setLastInsertedId(data[0].id);
      }
      
      // Synchronized Memo Content Logic (Matches visual display and bank requirements)
      const memoSummary = cart.map(item => `${item.product.name} X ${item.quantity}`).join(' ');
      const memoDesc = type === 'SELL' 
        ? `${customerName} ${customerCCCD} CHUYEN TIEN MUA ${memoSummary}`
        : `NGHIA TIN THANH TOAN TIEN MUA ${memoSummary} KH ${customerName} CCCD ${customerCCCD}`;
      const memoClean = removeVietnameseTones(memoDesc)
        .toUpperCase()
        .replace(/ X /g, " x ")
        .replace(/[^a-zA-Z0-9 .,]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 95);

      if (type === 'SELL') {
        // Auto-issue invoice if enabled
        const viettelConfig = await getViettelConfig();
        if (viettelConfig && viettelConfig.viettelEnabled && data && data.length > 0) {
          try {
            // Get the first transaction as the main one for the invoice
            // Note: In a multi-item transaction, we'd ideally bundle them, 
            // but the current structure creates multiple rows.
            // For now, we'll pass the first one or a synthetic one.
            const firstTx = { ...transactions[0], id: data[0].id } as Transaction;
            const result = await createInvoice(viettelConfig, firstTx);
            if (result.success) {
              setInvoiceResult({
                no: result.invoiceNo,
                code: "" // our new service doesn't return reservation code yet, we can add it if needed
              });
              
              // Update database with invoice no
              await supabase.from('transactions').update({
                invoice_no: result.invoiceNo,
                invoice_status: 'ISSUED'
              }).eq('id', data[0].id);
            }
          } catch (invError) {
            console.error("Auto Invoice Error:", invError);
          }
        }

        if (transferAmount > 0) {
          if (config && config.bank_id && config.account_no && config.account_holder) {
            const emvco = generateEMVCoQR(config.bank_id, config.account_no, config.account_holder, transferAmount, memoClean);
            const url = getRawQRUrl(emvco);
            setQrUrl(url);
            setShowQR(true);
          } else {
            alert("Lỗi: Thông tin ngân hàng của cửa hàng chưa đầy đủ để hiển thị mã QR chuyển khoản.");
            setShowSuccess(true);
          }
        } else {
          setShowSuccess(true);
        }
      } else {
        // For BUY transactions
        if (transferAmount > 0 && customerBankId && customerAccountNo) {
          const bank = banks.find(b => b.id === customerBankId);
          if (bank) {
            const emvco = generateEMVCoQR(bank.bin, customerAccountNo, customerName, transferAmount, memoClean);
            const url = getRawQRUrl(emvco);
            setQrUrl(url);
            setShowQR(true);
          } else {
            setShowSuccess(true);
          }
        } else {
          setShowSuccess(true);
        }
      }
    } catch (error: any) {
      setSubmitting(false);
      setLastError(error);
      alert("Đã có lỗi xảy ra khi lưu giao dịch: " + (error.message || "Kiểm tra quyền truy cập database"));
    }
  };

  const handleIssueInvoice = async () => {
    if (!lastInsertedId) return;
    setIssuingInvoice(true);
    try {
      const vConfig = await getViettelConfig();
      if (!vConfig) throw new Error("Chưa cấu hình Viettel");

      // Fetch transaction
      const { data: tx } = await supabase.from('transactions').select('*').eq('id', lastInsertedId).single();
      if (!tx) throw new Error("Không tìm thấy giao dịch");

      const result = await createInvoice(vConfig, tx as Transaction);
      if (result.success) {
        setInvoiceResult({
          no: result.invoiceNo,
          code: ""
        });
        
        await supabase.from('transactions').update({
          invoice_no: result.invoiceNo,
          invoice_status: 'ISSUED'
        }).eq('id', lastInsertedId);

        alert(`Đã phát hành hóa đơn thành công! Số: ${result.invoiceNo}`);
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      alert("Lỗi xuất hóa đơn: " + error.message);
    } finally {
      setIssuingInvoice(false);
    }
  };

  const resetForm = () => {
    setCustomerName('');
    setCustomerCCCD('');
    setCustomerAddress('');
    setCustomerBankId('');
    setCustomerAccountNo('');
    setDetectedAccountName('');
    setCart([]);
    setQuantity(1);
    setQuantityInput('1');
    setDiscount(0);
    setPremium(0);
    setOtherDeduction(0);
    setDeductionNote('');
    setCashAmount(0);
    setTransferAmount(0);
    setSelectedProduct(null);
    setShowSuccess(false);
    setShowQR(false);
    setSubmitting(false);
    setLastInsertedId(null);
    setInvoiceResult(null);
  };

  const { user } = useAuth();
  const currentUserEmail = user?.email;

  const formatNumberWithSeparator = (val: number) => {
    return new Intl.NumberFormat('vi-VN').format(val);
  };

  const parseNumberFromSeparator = (val: string) => {
    if (!val) return 0;
    // Normalizing decimal point: convert comma to dot, then remove thousands separators (common in vi-VN formatting)
    // But since this is for currency fields like Discount/Cash which are usually integers in VND:
    // we should allow flexible input but eventually parse to number
    const normalized = val.replace(/\./g, '').replace(/,/g, '.');
    const num = parseFloat(normalized);
    return isNaN(num) ? 0 : num;
  };

  const handleQuantityChange = (val: string) => {
    // Replace comma with dot for internal numeric storage
    setQuantityInput(val);
    const normalized = val.replace(/,/g, '.');
    const num = parseFloat(normalized);
    if (!isNaN(num)) {
      setQuantity(num);
    } else if (val === '') {
      setQuantity(0);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {lastError && (
        <div className="bg-red-900/90 text-white p-6 rounded-sm text-xs font-mono mb-6 flex justify-between items-start backdrop-blur-sm border-l-4 border-red-500 shadow-xl">
          <div className="overflow-x-auto w-full">
            <p className="font-bold mb-3 text-sm flex items-center gap-2">
              <XCircle size={16} /> CẢNH BÁO LỖI HỆ THỐNG (TRANSACTION ERROR):
            </p>
            <div className="bg-black/30 p-4 rounded mb-4 border border-white/10 max-h-40 overflow-y-auto">
              {lastError.message ? (
                <div className="text-sm font-bold text-red-200 mb-2">{lastError.message}</div>
              ) : null}
              <pre className="whitespace-pre-wrap">{JSON.stringify(lastError, Object.getOwnPropertyNames(lastError), 2)}</pre>
            </div>
            <div className="bg-white/10 p-4 rounded text-red-100">
              <p className="font-bold mb-2 uppercase text-[10px] tracking-widest">Hướng dẫn khắc phục:</p>
              <ul className="list-disc ml-4 space-y-1">
                <li>Bước 1: Kiểm tra kết nối Internet.</li>
                <li>Bước 2: Đảm bảo bảng <strong>transactions</strong> đã được cấu hình Policy trên Supabase.</li>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Transaction Control */}
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="transaction-pane"
      >
        <div className="flex bg-neutral-100 p-1 rounded-sm">
          <button 
            onClick={() => { setType('SELL'); setSelectedProduct(null); }}
            className={`btn-toggle ${type === 'SELL' ? 'active' : ''}`}
          >
            BÁN VÀNG
          </button>
          <button 
            onClick={() => { setType('BUY'); setSelectedProduct(null); }}
            className={`btn-toggle ${type === 'BUY' ? 'active' : ''}`}
          >
            MUA VÀNG
          </button>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex justify-between items-end">
            <h3 className="text-2xl m-0">{type === 'SELL' ? 'Khách mua' : 'Mua của khách'}</h3>
            <div className="flex flex-col items-end gap-2">
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[8px] md:text-[9px] font-extrabold uppercase tracking-widest transition-all duration-300 ${
                scannerStatus === 'active' 
                  ? 'bg-green-50 border-green-200 text-green-700 animate-pulse' 
                  : scannerStatus === 'ready'
                    ? 'bg-blue-50 border-blue-100 text-blue-600'
                    : 'bg-neutral-100 border-neutral-200 text-neutral-400'
              }`} title={scannerStatus === 'offline' ? 'Vui lòng nhấn vào cửa sổ ứng dụng để kích hoạt máy quét' : 'Hệ thống đang lắng nghe dữ liệu từ máy quét Bluetooth/USB'}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  scannerStatus === 'active' ? 'bg-green-500' : scannerStatus === 'ready' ? 'bg-blue-400' : 'bg-neutral-300'
                }`}></span>
                <QrCode size={12} /> 
                {scannerStatus === 'active' ? 'Máy quét: Đang hoạt động' : scannerStatus === 'ready' ? 'Máy quét: Sẵn sàng' : 'Máy quét: Chưa kết nối'}
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <button 
                  onClick={() => { setScannerTarget('cccd'); setScannerMode('ocr'); setShowScanner(true); }}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 text-[9px] font-black uppercase text-gold-dark border border-gold-primary/30 py-2 px-3 hover:bg-gold-primary hover:text-ink transition-all rounded-sm"
                >
                  <Camera size={14} /> Chụp CCCD
                </button>
                <button 
                  onClick={() => { setScannerTarget('cccd'); setScannerMode('qr'); setShowScanner(true); }}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 text-[9px] font-black uppercase text-blue-600 border border-blue-200 py-2 px-3 hover:bg-blue-600 hover:text-white transition-all bg-blue-50/50 rounded-sm"
                  title="Dành cho Căn cước mẫu mới hoặc VNeID"
                >
                  <QrCode size={14} /> QUÉT QRCODE
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="input-field">
              <label>Họ tên khách hàng</label>
              <input 
                type="text" 
                value={customerName} 
                onChange={(e) => setCustomerName(e.target.value)} 
                placeholder="Nguyễn Văn A" 
              />
            </div>
            <div className="input-field">
              <label>Số CCCD</label>
              <input 
                type="text" 
                value={customerCCCD} 
                onChange={(e) => setCustomerCCCD(e.target.value)} 
                placeholder="012345678912" 
              />
            </div>
          </div>

          <div className="input-field">
            <label>Địa chỉ</label>
            <input 
              type="text" 
              value={customerAddress} 
              onChange={(e) => setCustomerAddress(e.target.value)} 
              placeholder="Nơi thường trú" 
            />
          </div>

          {type === 'BUY' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="input-field">
                <label>Ngân hàng nhận (của khách)</label>
                <select 
                  value={customerBankId}
                  onChange={(e) => setCustomerBankId(e.target.value)}
                >
                  <option value="">-- Chọn ngân hàng --</option>
                  {banks.map(bank => (
                    <option key={bank.id} value={bank.id}>{bank.short_name} - {bank.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="input-field">
                <label className="flex justify-between items-center">
                  <span>Số tài khoản khách hàng</span>
                  <button 
                    onClick={() => { setScannerTarget('bank'); setScannerMode('qr'); setShowScanner(true); }}
                    className="text-[8px] font-black uppercase text-blue-600 flex items-center gap-1 hover:underline px-2 py-0.5 bg-blue-50 rounded-full border border-blue-100"
                  >
                    <QrCode size={10} /> Quét mã ngân hàng
                  </button>
                </label>
                <input 
                  type="text" 
                  value={customerAccountNo}
                  onChange={(e) => {
                    setCustomerAccountNo(e.target.value);
                    if (detectedAccountName) setDetectedAccountName('');
                  }}
                  placeholder="Nhập số tài khoản"
                />
                {type === 'BUY' && (customerAccountNo || detectedAccountName) && (
                  <div className="mt-2 p-2 bg-neutral-50/50 rounded border border-dashed border-neutral-200 animate-in fade-in slide-in-from-top-1">
                    <span className="text-[8px] text-neutral-400 font-black uppercase tracking-widest block mb-1">
                      Tên chủ tài khoản (Xác thực từ QR)
                    </span>
                    <p className="text-xs font-bold text-neutral-500 uppercase tracking-tighter">
                      {detectedAccountName || (customerAccountNo ? "Đã nhận số tài khoản - Không tìm thấy tên" : "...")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-paper border border-neutral-100 p-4 rounded-sm">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-4 border-b border-neutral-50 pb-2">Danh sách mặt hàng ({cart.length})</h4>
            <div className="flex flex-col gap-3 max-h-60 overflow-y-auto pr-2">
              {cart.length === 0 ? (
                <div className="text-center py-8 text-neutral-300 italic text-[10px] font-black uppercase tracking-widest">Chưa có sản phẩm nào được thêm</div>
              ) : (
                cart.map(item => (
                  <div key={item.id} className="flex justify-between items-center group bg-neutral-50 p-3 border-l-2 border-gold-primary">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-ink">{item.product.name}</span>
                      <span className="text-[10px] text-neutral-500">{item.quantity} {item.product.unit} x {formatCurrency(item.pricePerUnit)}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-black text-ink">{formatCurrency(item.pricePerUnit * item.quantity)}</span>
                      <button 
                        onClick={() => removeFromCart(item.id)}
                        className="text-neutral-300 hover:text-red-500 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="p-5 border-2 border-gold-primary/20 bg-gold-primary/5 rounded-sm relative">
            <div className="absolute -top-3 left-4 bg-gold-primary text-ink px-3 py-1 font-black text-[9px] uppercase tracking-widest">Thêm sản phẩm mới</div>
            <div className="flex flex-col gap-4">
              <div className="input-field">
                <label>Mặt hàng gold</label>
                <select 
                  className="w-full"
                  value={selectedProduct?.id || ''} 
                  onChange={(e) => {
                    const p = products.find(x => x.id === e.target.value);
                    setSelectedProduct(p || null);
                  }}
                >
                  <option value="">-- Chọn loại vàng --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="input-field">
                  <label>Số lượng ({selectedProduct?.unit || 'đơn vị'})</label>
                  <input 
                    type="text" 
                    inputMode="decimal"
                    value={quantityInput} 
                    onChange={(e) => handleQuantityChange(e.target.value)} 
                    placeholder="0,00"
                  />
                </div>
                <div className="input-field">
                  <label>Đơn giá điều chỉnh (VND/{selectedProduct?.unit || 'đơn vị'})</label>
                  <div className="relative">
                    <input 
                      type="text"
                      inputMode="numeric"
                      value={formatNumberWithSeparator(customPrice)}
                      className="font-mono font-bold text-lg bg-neutral-100 focus:bg-white pr-10"
                      onChange={(e) => setCustomPrice(parseNumberFromSeparator(e.target.value))}
                    />
                    {customPrice > 0 && (
                      <button 
                        onClick={() => setCustomPrice(0)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-red-500"
                        title="Xóa giá"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <button 
                onClick={addToCart}
                className="bg-ink text-paper py-3 font-black uppercase text-[10px] tracking-widest hover:bg-gold-dark transition-all flex items-center justify-center gap-2"
              >
                <UserPlus size={14} /> Thêm vào danh sách
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="input-field">
              <label>{type === 'BUY' ? 'Cộng thêm tiền (VND)' : 'Chiết khấu tổng (VND)'}</label>
              <div className="relative">
                <input 
                  type="text"
                  inputMode="numeric"
                  value={formatNumberWithSeparator(type === 'BUY' ? premium : discount)}
                  className="font-mono font-bold text-neutral-600 pr-10"
                  onChange={(e) => {
                    const val = parseNumberFromSeparator(e.target.value);
                    if (type === 'BUY') setPremium(val);
                    else setDiscount(val);
                  }}
                />
                {(type === 'BUY' ? premium > 0 : discount > 0) && (
                  <button 
                    onClick={() => {
                      if (type === 'BUY') setPremium(0);
                      else setDiscount(0);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-red-500"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
            
            {type === 'BUY' && (
              <div className="input-field animate-in fade-in slide-in-from-top-1">
                <label>Giảm trừ khác (VND)</label>
                <div className="relative">
                  <input 
                    type="text"
                    inputMode="numeric"
                    value={formatNumberWithSeparator(otherDeduction)}
                    className="font-mono font-bold text-red-600 pr-10"
                    onChange={(e) => setOtherDeduction(parseNumberFromSeparator(e.target.value))}
                  />
                  {otherDeduction > 0 && (
                    <button 
                      onClick={() => setOtherDeduction(0)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-red-500"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {type === 'BUY' && (
            <div className="input-field animate-in fade-in slide-in-from-top-1 -mt-2">
              <label>Ghi chú giảm trừ</label>
              <input 
                type="text"
                value={deductionNote}
                onChange={(e) => setDeductionNote(e.target.value)}
                placeholder="Lý do giảm trừ (Vd: bù trừ nợ cũ, phí dịch vụ...)"
                className="italic text-xs bg-neutral-50/50"
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-dashed border-neutral-200">
            <div className="input-field">
              <label className="text-vcb-green font-bold uppercase text-[9px]">Chuyển khoản (VND)</label>
              <input 
                type="text"
                inputMode="numeric"
                value={formatNumberWithSeparator(transferAmount)}
                className="bg-vcb-blue/5 border-vcb-blue/20"
                onChange={(e) => handleTransferChange(parseNumberFromSeparator(e.target.value))}
              />
            </div>
            <div className="input-field">
              <label className="text-orange-600 font-bold uppercase text-[9px]">Tiền mặt (VND)</label>
              <input 
                type="text"
                inputMode="numeric"
                value={formatNumberWithSeparator(cashAmount)}
                className="bg-orange-50 border-orange-200"
                onChange={(e) => handleCashChange(parseNumberFromSeparator(e.target.value))}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 pt-6 border-t border-neutral-100">
          <div className="flex flex-col gap-2 mb-6">
            <div className="flex justify-between items-center text-neutral-400">
              <span className="text-[10px] uppercase font-black">Tạm tính ({cart.length} mặt hàng)</span>
              <span className="text-lg font-bold">{formatCurrency(cartSubtotal)}</span>
            </div>
            {discount > 0 && type === 'SELL' && (
              <div className="flex justify-between items-center italic text-red-400">
                <span className="text-[10px] uppercase font-black">Chiết khấu (-)</span>
                <span className="text-lg font-bold">-{formatCurrency(discount)}</span>
              </div>
            )}
            {premium > 0 && type === 'BUY' && (
              <div className="flex justify-between items-center italic text-blue-500">
                <span className="text-[10px] uppercase font-black">Cộng thêm (+)</span>
                <span className="text-lg font-bold">+{formatCurrency(premium)}</span>
              </div>
            )}
            {type === 'BUY' && otherDeduction > 0 && (
              <div className="flex justify-between items-center text-red-500 italic">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] uppercase font-black">Giảm trừ khác (-)</span>
                  {deductionNote && <span className="text-[8px] text-neutral-400 not-italic uppercase tracking-widest">{deductionNote}</span>}
                </div>
                <span className="text-lg font-bold">-{formatCurrency(otherDeduction)}</span>
              </div>
            )}
            <div className="flex justify-between items-center mt-2 pt-2 border-t border-neutral-50">
              <span className="text-[10px] uppercase font-black text-neutral-400">Cần thanh toán</span>
              <span className="text-4xl font-black text-ink">{formatCurrency(totalAmount)}</span>
            </div>
          </div>

          <button 
            onClick={handleSubmit}
            disabled={submitting}
            className={`vcb-btn w-full flex items-center justify-center gap-3 ${type === "BUY" ? "bg-ink" : ""} ${submitting ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {submitting ? (
              <>
                <Send className="animate-pulse" size={20} /> ĐANG LƯU HỆ THỐNG...
              </>
            ) : type === "SELL" && transferAmount > 0 ? (
              <>
                <QrCode size={20} /> Tạo mã thanh toán QR
              </>
            ) : (
              <>
                <CheckCircle2 size={20} /> Xác nhận & Lưu giao dịch
              </>
            )}
          </button>
        </div>
      </motion.div>

      {/* Side Status / Result Pane */}
      <div className="relative">
        <AnimatePresence mode="wait">
          {showQR ? (
            <motion.div 
              key="qr"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-sm shadow-2xl w-full max-w-sm overflow-hidden border border-neutral-100 flex flex-col"
            >
              <div className="p-6 text-center">
                <h3 className="text-lg font-black uppercase tracking-tighter mb-4 text-ink">
                  {type === 'SELL' ? 'QR THANH TOAN CHO CUA HANG' : 'QR THANH TOÁN CHO KHÁCH'}
                </h3>
                
                <div className="bg-white p-4 border border-neutral-100 rounded-lg shadow-inner mb-4 inline-block w-full">
                  <div className="flex justify-center mb-2">
                    <img src="https://vietqr.net/portal-service/logo-vietqr.png" alt="VietQR" className="h-8" />
                  </div>
                  <div className="bg-white p-2">
                    <img src={qrUrl} alt="VietQR" className="w-56 h-56 mx-auto" referrerPolicy="no-referrer" />
                  </div>
                  <div className="flex justify-center items-center mt-3 gap-3 border-t border-dashed pt-3 border-neutral-200">
                    <img src="https://napas.com.vn/en/images/logo-napas.png" alt="Napas" className="h-4" />
                    <div className="w-[1px] h-4 bg-neutral-300"></div>
                    <span className="font-bold text-xs text-blue-800 uppercase italic">
                      {type === 'SELL' ? (config?.bank_name || 'BANK') : (banks.find(b => b.id === customerBankId)?.short_name || 'BANK')}
                    </span>
                  </div>
                </div>

                <div className="mb-6 space-y-1">
                  <p className="text-sm font-bold text-ink uppercase">
                    {type === 'SELL' ? config?.account_holder : customerName}
                  </p>
                  <p className="text-xs font-mono text-neutral-600">
                    {type === 'SELL' ? config?.account_no : customerAccountNo}
                  </p>
                  <p className="text-lg font-black text-ink mt-2">
                    {formatCurrency(transferAmount)}
                  </p>
                </div>

                <div className="bg-neutral-50 p-4 rounded-sm border border-neutral-100 text-left relative">
                  <p className="text-[9px] font-bold uppercase text-neutral-400 tracking-widest mb-2 leading-none italic">Nội dung chuyển khoản (Không dấu)</p>
                  <div className="font-mono font-bold text-sm text-ink leading-relaxed break-words pr-8">
                    {(() => {
                      const summary = cart.map(item => `${item.product.name} X ${item.quantity}`).join(' ');
                      const descOrig = type === 'SELL' 
                        ? `${customerName} ${customerCCCD} CHUYEN TIEN MUA ${summary}`
                        : `NGHIA TIN THANH TOAN TIEN MUA ${summary} KH ${customerName} CCCD ${customerCCCD}`;
                      const clean = removeVietnameseTones(descOrig)
                        .toUpperCase()
                        .replace(/ X /g, " x ")
                        .replace(/[^a-zA-Z0-9 .,]/g, " ")
                        .replace(/\s+/g, " ")
                        .trim()
                        .substring(0, 95);
                      return clean;
                    })()}
                  </div>
                  <button 
                    onClick={() => {
                      const summary = cart.map(item => `${item.product.name} X ${item.quantity}`).join(' ');
                      const descOrig = type === 'SELL' 
                        ? `${customerName} ${customerCCCD} CHUYEN TIEN MUA ${summary}`
                        : `NGHIA TIN THANH TOAN TIEN MUA ${summary} KH ${customerName} CCCD ${customerCCCD}`;
                      const clean = removeVietnameseTones(descOrig)
                        .toUpperCase()
                        .replace(/ X /g, " x ")
                        .replace(/[^a-zA-Z0-9 .,]/g, " ")
                        .replace(/\s+/g, " ")
                        .trim()
                        .substring(0, 95);
                      navigator.clipboard.writeText(clean);
                      alert("Đã sao chép nội dung!");
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-neutral-200 rounded-full transition-colors"
                  >
                    <CreditCard size={16} className="text-neutral-400" />
                  </button>
                </div>

                {type === 'SELL' && lastInsertedId && (
                  <div className="mt-6 border-t border-dashed pt-6 border-neutral-200">
                    {invoiceResult ? (
                      <div className="bg-blue-50 p-4 rounded border border-blue-100 text-left">
                        <p className="text-[9px] font-black uppercase text-blue-400 mb-1">Đã phát hành hóa đơn</p>
                        <p className="text-xs font-bold text-blue-900">Số HĐ: {invoiceResult.no}</p>
                        <p className="text-[10px] text-blue-700">Mã tra cứu: {invoiceResult.code}</p>
                      </div>
                    ) : (
                      <button 
                        onClick={handleIssueInvoice}
                        disabled={issuingInvoice}
                        className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 px-4 rounded-sm text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all disabled:opacity-50"
                      >
                        {issuingInvoice ? <Loader2 className="animate-spin" size={14} /> : <FileText size={14} />}
                        Xuất Hóa Đơn Điện Tử (Viettel)
                      </button>
                    )}
                  </div>
                )}
              </div>

              <button 
                onClick={resetForm} 
                className="bg-ink text-paper w-full py-4 font-black uppercase text-[10px] tracking-widest hover:bg-gold-primary hover:text-ink transition-all border-t border-neutral-100"
              >
                Xác nhận & Đóng
              </button>
            </motion.div>
          ) : showSuccess ? (
            <motion.div 
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white p-12 rounded-sm shadow-xl flex flex-col items-center text-center border-t-8 border-green-500"
            >
              <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-6">
                <CheckCircle2 size={40} className="text-green-500" />
              </div>
              <h3 className="text-2xl mb-2 italic">Giao dịch thành công</h3>
              <p className="text-xs text-neutral-500 mb-8 font-medium leading-relaxed">
                Hệ thống đã ghi nhận giao dịch của bạn.
                <br />
                <strong>Tiền mặt:</strong> {formatCurrency(cashAmount)}
                <br />
                <strong>Chuyển khoản:</strong> {formatCurrency(transferAmount)}
                {type === 'BUY' && otherDeduction > 0 && (
                  <>
                    <br />
                    <span className="text-red-500"><strong>Giảm trừ khác:</strong> -{formatCurrency(otherDeduction)}</span>
                    {deductionNote && <span className="text-[10px] text-neutral-400 font-normal italic"> ({deductionNote})</span>}
                  </>
                )}
              </p>
              
              {type === 'SELL' && lastInsertedId && (
                <div className="w-full mt-4 border-t border-dashed pt-4 border-neutral-100">
                   {invoiceResult ? (
                      <div className="bg-blue-50 p-4 rounded border border-blue-100 text-left mb-4">
                        <p className="text-[9px] font-black uppercase text-blue-400 mb-1">Đã phát hành hóa đơn</p>
                        <p className="text-xs font-bold text-blue-900">Số HĐ: {invoiceResult.no}</p>
                        <p className="text-[10px] text-blue-700">Mã tra cứu: {invoiceResult.code}</p>
                      </div>
                    ) : (
                      <button 
                        onClick={handleIssueInvoice}
                        disabled={issuingInvoice}
                        className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-4 px-4 rounded-sm text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all disabled:opacity-50 mb-4 shadow-sm"
                      >
                        {issuingInvoice ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
                        Xuất Hóa Đơn Điện Tử
                      </button>
                    )}
                </div>
              )}

              <button 
                onClick={resetForm}
                className="w-full py-4 bg-ink text-white font-black uppercase text-xs tracking-widest hover:bg-gold-primary hover:text-ink transition-all shadow-md"
              >
                Tiếp tục giao dịch
              </button>
            </motion.div>
          ) : (
            <motion.div 
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="hidden lg:flex flex-col items-center justify-center h-full text-neutral-300 gap-4"
            >
              <ArrowLeftRight size={80} strokeWidth={1} />
              <p className="font-black uppercase tracking-widest text-xs">Vui lòng nhập thông tin giao dịch</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showScanner && (
        <QRScanner 
          mode={scannerMode}
          title={scannerTarget === 'bank' ? 'Quét Mã QR Ngân hàng' : undefined}
          onScan={(data) => handleScan(data, true)} 
          onClose={() => setShowScanner(false)} 
        />
      )}
      </div>
    </div>
  );
};

export default Transactions;
