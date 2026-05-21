import axios, { AxiosResponse } from 'axios';

/**
 * ============================================================================
 * VIETTEL S-INVOICE INTEGRATION MODULE (TYPESCRIPT / NODE.JS)
 * ============================================================================
 * Vai trò: Senior Backend Developer chuyên trách tích hợp hệ thống hóa đơn điện tử.
 * Chức năng: Đóng gói dữ liệu DTO và thực hiện cuộc phát hành hóa đơn điện tử S-Invoice.
 * Thiết kế bảo mật: Xử lý Basic Authentication chuẩn hóa Base64 và transactionUuid ngẫu nhiên chống trùng.
 * Khắc phục lỗi: Xóa bỏ hoàn toàn cụm từ /InvoiceAPI để không bị lỗi 404 trên các môi trường thực tế,
 * tích hợp chế độ chuẩn hóa gạch chéo URL cực kỳ an toàn.
 * ============================================================================
 */

// ============================================================================
// 1. DATA TRANSFER OBJECT SECTIONS (HỆ THỐNG DTO CHUẨN HOÁ THEO PHÂN TÍCH TÀI LIỆU)
// ============================================================================

/**
 * Cấu trúc ánh xạ trực tiếp bản ghi từ bảng viettel_config trong Supabase
 */
export interface ViettelConfigDB {
  id?: string;
  username?: string;
  password?: string;
  tax_code?: string;
  app_id?: string;
  api_url?: string;
  is_sandbox?: boolean;
  template_code?: string;
  invoice_series?: string;
  updated_at?: string | Date;
}

/**
 * Thông tin chung của hóa đơn điện tử (General Invoice Information)
 * Ánh xạ trực tiếp từ mục 5.1.1 trong tài liệu kỹ thuật Viettel SInvoice.
 */
export interface GeneralInvoiceInfoDTO {
  /**
   * Loại hóa đơn. Ví dụ: '01GTKT' (Hóa đơn GTGT), '02GTTT' (Hóa đơn bán hàng), hoặc '1' tùy mẫu
   */
  invoiceType: string;

  /**
   * Mẫu số hóa đơn (Pattern). Định dạng chuẩn quy định bởi Bộ Tài chính. 
   * Ví dụ doanh nghiệp: "2/002" hoặc "01GTKT0/001"
   */
  templateCode: string;

  /**
   * Kí hiệu hóa đơn (Series). 
   * Ví dụ doanh nghiệp: "C26MNT" hoặc "AB/18E"
   */
  invoiceSeries: string;

  /**
   * Ngày phát hành hóa đơn ở dạng Timestamp Milliseconds (khoảng thời gian tính bằng mili giây).
   * Ví dụ: 1543842113042
   */
  invoiceIssuedDate?: number;

  /**
   * Loại tiền tệ. Mặc định: "VND"
   */
  currencyCode?: string;

  /**
   * Trạng thái điều chỉnh của hóa đơn. 
   * '1': Hóa đơn gốc (Original)
   * '3': Hóa đơn thay thế
   * '5': Hóa đơn điều chỉnh
   */
  adjustmentType: string;

  /**
   * Trạng thái thanh toán của hóa đơn. 
   * true: Đã thanh toán, false: Chưa thanh toán.
   */
  paymentStatus: boolean;

  /**
   * Quyền của khách hàng tự tra cứu hóa đơn. Mặc định: true
   */
  cusGetInvoiceRight?: boolean;

  /**
   * Định danh duy nhất cho giao dịch (Chống trùng lặp hóa đơn).
   * Yêu cầu bắt buộc: Phải dùng UUID v4 để tránh việc gửi trùng request do timeout mạng.
   */
  transactionUuid: string;

  /**
   * Tài khoản của nhân viên lập hóa đơn (biller). Để trống sẽ lấy user đăng nhập cơ sở.
   */
  userName?: string;
}

/**
 * Thông tin người mua hàng (Buyer Information)
 * Chi tiết cấu hình được quy định tại mục 5.1.3 trong tài liệu.
 */
export interface BuyerInfoDTO {
  /**
   * Tên người mua hàng đại diện hoặc tên khách lẻ
   */
  buyerName: string;

  /**
   * Tên pháp nhân đơn vị công tác của người mua (Tên công ty)
   */
  buyerLegalName?: string;

  /**
   * Mã số thuế người mua
   */
  buyerTaxCode?: string;

  /**
   * Địa chỉ đầy đủ của người mua hàng
   */
  buyerAddressLine: string;

  /**
   * Số điện thoại liên hệ của người mua
   */
  buyerPhoneNumber?: string;

  /**
   * Địa chỉ email nhận hóa đơn điện tử của người mua
   */
  buyerEmail?: string;

  /**
   * Loại giấy tờ nhận dạng cá nhân. Mặc định '1': Số CMND/CCCD
   */
  buyerIdType?: string;

  /**
   * Số CMND/CCCD hoặc Số hộ chiếu
   */
  buyerIdNo?: string;

  /**
   * Mã khách hàng nội bộ
   */
  buyerCode?: string;
}

/**
 * Thông tin doanh nghiệp bán hàng (Seller Information)
 * Chi tiết cấu hình quy định tại mục 5.1.2.
 */
export interface SellerInfoDTO {
  /**
   * Tên hợp pháp của doanh nghiệp bán hàng (Người bán)
   */
  sellerLegalName?: string;

  /**
   * Mã số thuế doanh nghiệp bán hàng. 
   * Ví dụ doanh nghiệp: "4000926165"
   */
  sellerTaxCode: string;

  /**
   * Địa chỉ trụ sở chính của người bán
   */
  sellerAddressLine?: string;

  /**
   * Số điện thoại liên hệ của người bán
   */
  sellerPhoneNumber?: string;

  /**
   * Địa chỉ thư điện tử người bán
   */
  sellerEmail?: string;
}

/**
 * Phương thức thanh toán (Payment DTO Input)
 * Chi tiết quy định tại mục 5.1.5. Một hoá đơn có thể có một hoặc nhiều phương thức.
 */
export interface PaymentDTO {
  /**
   * Hình thức thanh toán: 'TM' - Tiền mặt, 'CK' - Chuyển khoản, 'TM/CK' - Tiền mặt hoặc Chuyển khoản
   */
  paymentMethodName: string;
}

/**
 * Chi tiết dòng hàng hóa, dịch vụ trên hóa đơn (Item Information DTO)
 * Chi tiết các thuộc tính tại mục 5.1.6
 */
export interface ItemInfoDTO {
  /**
   * Số thứ tự của dòng hàng (bắt đầu từ 1)
   */
  lineNumber: number;

  /**
   * Mã sản phẩm phân bổ trong kho
   */
  itemCode?: string;

  /**
   * Tên gọi chi tiết mặt hàng bán (Sản phẩm/Dịch vụ)
   */
  itemName: string;

  /**
   * Đơn vị tính cơ sở. Ví dụ: 'Món', 'Chỉ', 'Lượng', 'Cái'
   */
  unitName: string;

  /**
   * Đơn giá bán chưa gồm thuế của sản phẩm
   */
  unitPrice: number;

  /**
   * Số lượng hàng hoá xuất kho bán ra
   */
  quantity: number;

  /**
   * Tổng giá trị thành tiền trước thuế của dòng hàng (= Số lượng * Đơn giá)
   */
  itemTotalAmountWithoutTax: number;

  /**
   * Thuế suất GTGT. Ví dụ: -2 (Không chịu thuế), -1 (Không kê khai nộp thuế), 0, 5, 8, 10
   */
  taxPercentage: number;

  /**
   * Tiền thuế tương ứng GTGT của mặt hàng (= Tổng trước thuế * Thuế suất %)
   */
  taxAmount: number;

  /**
   * Tổng tiền đã bao gồm thuế suất của dòng mặt hàng
   */
  itemTotalAmountWithTax: number;

  /**
   * Tỷ lệ chiết khấu giảm giá trực tiếp (phần trăm % dòng sản phẩm, nếu có)
   */
  discount?: number;

  /**
   * Tổng số tiền được trừ chiết khấu cho dòng sản phẩm đó
   */
  itemDiscount?: number;

  /**
   * Chỉ định loại dịch vụ dòng: '1': Hàng hoá thông thường, '2': Ghi chú dòng đơn, '3': Chiếu khấu chi tiết
   */
  selection?: number;
}

/**
 * Tóm tắt tổng hợp dòng thuế của hóa đơn (Tax Breakdown Details)
 * Chi tiết tại mục 5.1.7. Mỗi loại thuế suất GTGT xuất hiện trên hóa đơn chỉ kê khai 1 lần duy nhất ở mảng này.
 */
export interface TaxBreakdownDTO {
  /**
   * Thuế suất (%)
   */
  taxPercentage: number;

  /**
   * Tổng doanh thu chịu thuế GTGT tương ứng thuế suất đó
   */
  taxableAmount: number;

  /**
   * Tổng số tiền thuế GTGT thu thêm cho loại thuế suất này
   */
  taxAmount: number;
}

/**
 * Tổng hợp tài chính tổng giá trị thanh toán của hóa đơn (Financial Summary Information)
 * Chi tiết định dạng quy định tại mục 5.1.8
 */
export interface SummarizeInfoDTO {
  /**
   * Tổng thành tiền của tất cả hàng hóa dán nhãn chưa bao gồm thuế GTGT
   */
  sumOfTotalLineAmountWithoutTax: number;

  /**
   * Thành tiền chịu thuế sau khi đã cấn trừ chiết khấu trước thuế
   */
  totalAmountWithoutTax: number;

  /**
   * Tổng tiền thuế GTGT cộng dồn toàn đơn hóa đơn
   */
  totalTaxAmount: number;

  /**
   * Tổng số tiền người mua phải thanh toán tổng cộng dồn (Đã gồm VAT)
   */
  totalAmountWithTax: number;

  /**
   * Bắt buộc: Số tiền bằng chữ hiển thị trực quan dưới chân hoá đơn để khách hàng đối chiếu
   */
  totalAmountWithTaxInWords?: string;

  /**
   * Tổng tiền chiết khấu thương mại gộp chung nếu bán sỉ cả đơn
   */
  discountAmount?: number;
}

/**
 * Mô hình khối Payload truyền vào API createInvoice S-Invoice
 */
export interface ViettelInvoiceRequestDTO {
  generalInvoiceInfo: GeneralInvoiceInfoDTO;
  buyerInfo: BuyerInfoDTO;
  sellerInfo?: SellerInfoDTO;
  payments: PaymentDTO[];
  itemInfo: ItemInfoDTO[];
  summarizeInfo: SummarizeInfoDTO;
  taxBreakdowns: TaxBreakdownDTO[];
}

/**
 * Cấu trúc Response trả về từ hệ thống của Viettel S-Invoice
 * Ánh xạ tại mục 6.2 của tài liệu.
 */
export interface ViettelInvoiceResponseDTO {
  /**
   * Mã lỗi hệ thống. Thành công sẽ trả về rỗng "" hoặc null, hoặc "0" tùy phiên bản API.
   */
  errorCode: string | null;

  /**
   * Mô tả mô phỏng chi tiết mã lỗi nếu lỗi xuất hiện hoặc thông điệp thành công.
   */
  description: string | null;

  /**
   * Đối tượng chứa dữ liệu hóa đơn được số hóa thành công.
   */
  result?: {
    /**
     * Mã số thuế của người bán
     */
    supplierTaxCode: string | number;

    /**
     * Kí hiệu và số hóa đơn đầy đủ được phát hành chính thức. Ví dụ: "C26MNT0000001"
     */
    invoiceNo: string;

    /**
     * Mã định danh ID hóa đơn duy nhất của hệ thống Viettel quản lý.
     */
    transactionID: string | number;

    /**
     * Mã tra cứu tra cứu vị trí hóa đơn gốc trực tuyến của người mua.
     */
    reservationCode: string;
  };
}

// ============================================================================
// 2. CORE BACKEND SERVICE CLASS IMPLEMENTATION (LỚP XỬ LÝ CHÍNH CÓ FALLBACK URL)
// ============================================================================

export class ViettelSInvoiceBackendService {
  private baseUrl: string;

  /**
   * Khởi tạo Service kết nối S-Invoice Viettel
   * @param originUrl URL cơ sở do Viettel cung cấp (Mặc định: 'https://api-vinvoice.viettel.vn')
   */
  constructor(originUrl: string = 'https://api-vinvoice.viettel.vn') {
    this.baseUrl = this.normalizeUrl(originUrl);
  }

  /**
   * Hàm chuẩn hóa Url để loại bỏ hoàn toàn các dấu gạch chéo (/) dư thừa ở cuối chuỗi
   * @param url Chuỗi URL cần chuẩn hóa
   */
  private normalizeUrl(url: string): string {
    if (!url) return '';
    return url.trim().replace(/\/+$/, '');
  }

  /**
   * Phương thức bọc (Wrapper) nhận vào dữ liệu hóa đơn (Omit trường generalInvoiceInfo) và tự động
   * lấy templateCode và invoiceSeries từ bảng cấu hình viettel_config DB để đóng gói đầy đủ payload gửi đi
   */
  public async createInvoiceWithConfigWrapper(
    username: string,
    password: string,
    supplierTaxCode: string,
    invoicePayload: Omit<ViettelInvoiceRequestDTO, 'generalInvoiceInfo'> & {
      generalInvoiceInfo?: Partial<Omit<GeneralInvoiceInfoDTO, 'transactionUuid'>>;
    },
    dbConfig: ViettelConfigDB
  ): Promise<ViettelInvoiceResponseDTO> {
    console.log('[Wrapper] Đang chạy Wrapper tự động gán dữ liệu từ bảng viettel_config...');

    const templateCode = dbConfig.template_code ? dbConfig.template_code.trim() : '';
    const invoiceSeries = dbConfig.invoice_series ? dbConfig.invoice_series.trim() : '';

    if (!templateCode) {
      console.warn('[Wrapper] Cảnh báo: template_code rỗng trong bảng cấu hình viettel_config');
    }
    if (!invoiceSeries) {
      console.warn('[Wrapper] Cảnh báo: invoice_series rỗng trong bảng cấu hình viettel_config');
    }

    const defaultGeneralInfo: GeneralInvoiceInfoDTO = {
      invoiceType: '1',
      templateCode: templateCode,
      invoiceSeries: invoiceSeries,
      adjustmentType: '1',
      paymentStatus: true,
      transactionUuid: '', // Sẽ được tự động phát sinh UUID v4 an toàn trong đại lý chính
      currencyCode: 'VND',
      cusGetInvoiceRight: true
    };

    // Chuẩn bị payload hoàn thiện bao gồm generalInvoiceInfo
    const reassembledPayload: ViettelInvoiceRequestDTO = {
      ...invoicePayload,
      generalInvoiceInfo: {
        ...defaultGeneralInfo,
        ...(invoicePayload.generalInvoiceInfo || {}),
        templateCode: templateCode || (invoicePayload.generalInvoiceInfo?.templateCode || ''),
        invoiceSeries: invoiceSeries || (invoicePayload.generalInvoiceInfo?.invoiceSeries || '')
      } as GeneralInvoiceInfoDTO
    };

    return this.createInvoice(
      username,
      password,
      supplierTaxCode,
      reassembledPayload,
      dbConfig
    );
  }

  /**
   * Thực hiện gọi API trực tiếp để khởi tạo và phát hành hóa đơn điện tử S-Invoice của doanh nghiệp
   * @param username Tài khoản doanh nghiệp cấu hình (MST). Ví dụ: '4000926165'
   * @param password Mật khẩu tài khoản tích hợp API tương ứng
   * @param supplierTaxCode Mã số thuế người bán hàng. Ví dụ: '4000926165'
   * @param invoicePayload Toàn bộ dữ liệu hóa đơn gồm chi tiết mặt hàng và tổng tiền
   * @param dbConfig Đối tượng cấu hình đầy đủ từ bảng viettel_config (Nếu có) để gán động thông tin
   */
  public async createInvoice(
    username: string,
    password: string,
    supplierTaxCode: string,
    invoicePayload: Omit<ViettelInvoiceRequestDTO, 'generalInvoiceInfo'> & {
      // Cho phép cấu hình các trường nghiệp vụ linh hoạt của generalInvoiceInfo từ ngoài
      generalInvoiceInfo: Omit<GeneralInvoiceInfoDTO, 'transactionUuid'>;
    },
    dbConfig?: ViettelConfigDB
  ): Promise<ViettelInvoiceResponseDTO> {
    
    // Bước 1: Bảo mật và định danh chống trùng lắp giao dịch
    // Tạo mã UUID ngẫu nhiên v4 cho mỗi lần bấm gửi request hoá đơn
    const randomUuid = this.generateUUIDv4();

    // Xác định các trường cấu hình kết hợp động từ tham số hoặc từ dbConfig
    let finalUsername = username ? username.trim() : '';
    let finalPassword = password || '';
    let finalTaxCode = supplierTaxCode ? supplierTaxCode.trim() : '';
    let baseApiUrl = this.baseUrl;

    // Chiết xuất cấu hình động từ viettel_config DB nếu được truyền vào
    if (dbConfig) {
      console.log('[SeniorBackend] Đang nạp cấu hình động từ bản ghi viettel_config DB...');
      if (dbConfig.username) {
        finalUsername = dbConfig.username.trim();
        console.log(`[SeniorBackend] Cấu hình động -> username: ${finalUsername}`);
      }
      if (dbConfig.password) {
        finalPassword = dbConfig.password;
      }
      if (dbConfig.tax_code) {
        finalTaxCode = dbConfig.tax_code.trim();
        console.log(`[SeniorBackend] Cấu hình động -> tax_code: ${finalTaxCode}`);
      }
      if (dbConfig.api_url) {
        baseApiUrl = this.normalizeUrl(dbConfig.api_url);
        console.log(`[SeniorBackend] Cấu hình động -> api_url: ${baseApiUrl}`);
      }
    }

    // Gán động templateCode và invoiceSeries từ dbConfig nếu có, nếu không giữ của payload gốc
    const targetTemplateCode = dbConfig?.template_code ? dbConfig.template_code.trim() : invoicePayload.generalInvoiceInfo.templateCode;
    const targetInvoiceSeries = dbConfig?.invoice_series ? dbConfig.invoice_series.trim() : invoicePayload.generalInvoiceInfo.invoiceSeries;

    const finalPayload: ViettelInvoiceRequestDTO = {
      ...invoicePayload,
      generalInvoiceInfo: {
        ...invoicePayload.generalInvoiceInfo,
        templateCode: targetTemplateCode,
        invoiceSeries: targetInvoiceSeries,
        transactionUuid: randomUuid, // Ép buộc ghi nhận transactionUuid phòng ngừa lỗi trùng hoá đơn khi rớt mạng
        invoiceIssuedDate: invoicePayload.generalInvoiceInfo.invoiceIssuedDate || Date.now() // Lấy giờ thực tại nếu chưa truyền dữ liệu
      }
    };

    console.log(`[SeniorBackend] Dữ liệu Invoice gán động thành công: Mẫu hóa đơn = ${targetTemplateCode}, Ký hiệu = ${targetInvoiceSeries}`);

    // Bước 2: Mã hóa token xác thực bằng cơ chế Basic Authentication
    const loginString = `${finalUsername}:${finalPassword}`;
    const base64AuthToken = typeof Buffer !== 'undefined'
      ? Buffer.from(loginString).toString('base64')
      : btoa(unescape(encodeURIComponent(loginString)));

    // Bước 3: Thiết lập danh sách các Endpoint Fallback lập hóa đơn nháp (importInvoice) đảm bảo không chèn cụm từ '/InvoiceAPI' gây lỗi 404
    // Chuẩn vInvoice mới (Thông tư 78) quy định tuyệt đối không được chèn `/InvoiceAPI` ở giữa.
    const endpoints = [
      `${baseApiUrl}/InvoiceWS/importInvoice/${finalTaxCode}`,                    // Endpoint 1: Lập hóa đơn nháp (Thông tư 78) chính thức
      `${baseApiUrl}/services/InvoiceWS/importInvoice/${finalTaxCode}`             // Endpoint 2: Cổng phân hệ nhập hóa đơn nháp hỗ trợ mới nhất
    ];

    console.log(`[SeniorBackend] Danh sách url S-Invoice Viettel (Chỉ tạo Hóa đơn nháp) chuẩn Thông tư 78 sẽ được thử nghiệm tuần tự (Tuyệt đối không sử dụng /InvoiceAPI):`);
    endpoints.forEach((ep, idx) => console.log(` - Endpoint [${idx + 1}]: ${ep}`));

    let lastError: any = null;
    let finalResponse: AxiosResponse<any> | null = null;

    // Vòng lặp tự động thử lại URL (Fallback Loop) nhằm rà quét endpoint thích hợp
    for (let i = 0; i < endpoints.length; i++) {
      const endpointUrl = endpoints[i];
      
      // IN LOG CHÍNH XÁC THEO YÊU CẦU ĐỂ DỄ DÀNG GIÁM SÁT HỆ THỐNG
      console.log("URL gọi thực tế:", endpointUrl);
      console.log(`[SeniorBackend] Gửi kèm UUID chống trùng: ${randomUuid}`);

      try {
        const response: AxiosResponse<any> = await axios.post(
          endpointUrl,
          finalPayload,
          {
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': `Basic ${base64AuthToken}` 
            },
            // Cấu hình thời gian timeout tối thiểu 75000 (75 giây) chờ thiết bị HSM của Viettel phản hồi
            timeout: 75000,
            validateStatus: () => true // Cho phép tự đọc sâu status, tránh axios tự quăng Exception lỗi HTTP
          }
        );

        console.log(`[SeniorBackend] Kết quả phản hồi từ Viettel: HTTP Status = ${response.status}`);

        // Nếu cổng trả về 404 (Not Found), tiếp tục thử nghiệm sang endpoint tiếp theo
        if (response.status === 404) {
          console.warn(`[SeniorBackend] Cổng ${endpointUrl} trả về lỗi 404 rỗng, tự động chuyển sang fallback endpoint tiếp theo...`);
          lastError = new Error(`Lỗi HTTP 404 (Không Tìm Thấy) tại đường dẫn ${endpointUrl}`);
          continue;
        }

        // Nếu nhận phản hồi hợp lệ (bất kể thành công hay bị từ chối nghiệp vụ khác 404), thì ghi nhận phản hồi và ngắt vòng lặp
        finalResponse = response;
        break;

      } catch (e: any) {
        console.error(`[SeniorBackend] Lỗi rớt mạng hoặc kết nối timeout tại ${endpointUrl}:`, e.message);
        lastError = e;
        console.warn(`[SeniorBackend] Đang chuyển sang thử endpoint kế tiếp...`);
      }
    }

    // Nếu sau tất cả các lần thử mà không nhận được phản hồi ổn định nào khác 404
    if (!finalResponse) {
      throw new Error(
        `Tất cả các cổng kết nối Viettel S-Invoice đều trả về 404 hoặc bị thất bại mạng. Lỗi cuối cùng ghi nhận: ${lastError?.message || 'Không có phản hồi'}`
      );
    }

    // Bước 4: Phân loại dữ liệu phản hồi nhận được
    const responseData = finalResponse.data;
    console.log(`[SeniorBackend] Đọc dữ liệu thành công từ cổng được chấp thuận.`);
    console.log(`[SeniorBackend] Chi tiết phản hồi S-Invoice nháp:`, JSON.stringify(responseData));

    if (finalResponse.status >= 200 && finalResponse.status < 300) {
      const isSuccess = !responseData.errorCode || 
                        responseData.errorCode === '' || 
                        responseData.errorCode === '0' ||
                        responseData.errorCode === 'SUCCESS';

      if (isSuccess && responseData.result) {
        const invNo = responseData.result.invoiceNo || `NHÁP-${responseData.result.transactionID || responseData.result.reservationCode || 'OK'}`;
        console.log(`[SeniorBackend] Tạo hóa đơn nháp S-Invoice Viettel THÀNH CÔNG! Định danh hóa đơn nháp: ${invNo}`);
        return {
          errorCode: null,
          description: 'Khởi tạo hoá đơn nháp thành công từ Viettel S-Invoice. Quý khách vui lòng truy cập trang bán hàng Viettel để ký số thủ công.',
          result: {
            ...responseData.result,
            invoiceNo: invNo
          }
        };
      }

      // Trường hợp Viettel phản hồi mã thành công HTTP 200 nhưng cấu trúc dữ liệu bị từ chối nghiệp vụ thuế
      const errCode = responseData.errorCode || 'VIETTEL_BUSINESS_ERROR';
      const errDesc = responseData.description || 'Nghiệp vụ hóa đơn bị Viettel từ chối mà không có lý do hoàn trả.';
      
      this.handleViettelBusinessError(errCode, errDesc);
    }

    // Xử lý khi HTTP Status bên Viettel ngoài luồng 20x (Ví dụ: 400 Bad Request, 401 Unauthorized, 500 Server Error)
    throw new Error(
      `Lỗi nghiệp vụ hệ thống từ cổng dịch vụ Viettel [Mã HTTP: ${finalResponse.status}]. Chi tiết phản hồi: ${
        typeof responseData === 'object' ? JSON.stringify(responseData) : responseData
      }`
    );
  }

  /**
   * Ánh xạ mã lỗi đặc trưng trả về từ hệ thống Viettel S-Invoice để dịch nghĩa tiếng việt chi tiết nhất cho kế toán viên
   */
  private handleViettelBusinessError(errorCode: string, rawDescription: string): void {
    let devFriendlyMessage = '';

    switch (errorCode) {
      case 'TEMPLATE_NOT_FOUND':
        devFriendlyMessage = 'Không tìm thấy mẫu số hóa đơn đã cấu hình. Vui lòng rà soát lại thông số templateCode (ví dụ: "2/002").';
        break;
      case 'TAX_CODE_INVALID':
        devFriendlyMessage = 'Mã số thuế của người bán hoặc người mua không hợp lệ, không tồn tại hoặc sai định dạng chữ số.';
        break;
      case 'SERIES_NOT_FOUND':
        devFriendlyMessage = 'Kí hiệu hóa đơn (invoiceSeries, ví dụ "C26MNT") chưa được đăng ký phát hành hoặc đã dùng hết dải phát hành.';
        break;
      case 'INVALID_DATA':
        devFriendlyMessage = 'Dữ liệu JSON truyền lên bị lỗi cấu trúc dữ liệu dòng mặt hàng, thiếu trường bắt buộc hoặc sai định dạng số tiền.';
        break;
      case 'UUID_DUPLICATE':
        devFriendlyMessage = 'Trùng lặp UUID giao dịch cũ (transactionUuid đã được đăng ký xử lý trước đó). Vui lòng phát sinh giao dịch mới.';
        break;
      case 'AUTH_FAILED':
      case '401':
      case '403':
        devFriendlyMessage = 'Xác thực Basic Authentication thất bại. Tài khoản doanh nghiệp (Username) hoặc mật khẩu không chính xác.';
        break;
      default:
        devFriendlyMessage = `Lỗi hệ thống Viettel trả về: ${rawDescription} (Mã lỗi: ${errorCode})`;
    }

    throw new Error(`[S-Invoice API Error] ${devFriendlyMessage}`);
  }

  /**
   * Kiểm tra kết nối với API Viettel S-Invoice (Sử dụng API lấy mẫu hóa đơn getInvoiceTemplates)
   * Để xác định thông tin đăng nhập và URL cấu hình có đúng hay không.
   */
  public async testConnection(
    username: string,
    password: string,
    supplierTaxCode: string,
    dbConfig?: ViettelConfigDB
  ): Promise<{ success: boolean; message: string; templates?: any }> {
    let finalUsername = username ? username.trim() : '';
    let finalPassword = password || '';
    let finalTaxCode = supplierTaxCode ? supplierTaxCode.trim() : '';
    let baseApiUrl = this.baseUrl;

    if (dbConfig) {
      if (dbConfig.username) finalUsername = dbConfig.username.trim();
      if (dbConfig.password) finalPassword = dbConfig.password;
      if (dbConfig.tax_code) finalTaxCode = dbConfig.tax_code.trim();
      if (dbConfig.api_url) baseApiUrl = this.normalizeUrl(dbConfig.api_url);
    }

    const loginString = `${finalUsername}:${finalPassword}`;
    const base64AuthToken = typeof Buffer !== 'undefined'
      ? Buffer.from(loginString).toString('base64')
      : btoa(unescape(encodeURIComponent(loginString)));

    const endpoints = [
      `${baseApiUrl}/InvoiceWS/getInvoiceTemplates/${finalTaxCode}`,
      `${baseApiUrl}/services/InvoiceWS/getInvoiceTemplates/${finalTaxCode}`
    ];

    console.log(`[SeniorBackend] Kiểm tra kết nối Viettel S-Invoice...`);
    endpoints.forEach((ep) => console.log("URL kiểm tra thực tế:", ep));

    let lastError: any = null;
    for (const endpointUrl of endpoints) {
      try {
        console.log("Thử gọi URL kiểm tra kết nối:", endpointUrl);
        const response = await axios.post(
          endpointUrl,
          {}, // Body rỗng
          {
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': `Basic ${base64AuthToken}`
            },
            timeout: 20000 // Chờ tối đa 20 giây cho việc test kết nối
          }
        );

        console.log(`[SeniorBackend] Kết quả kiểm tra kết nối: HTTP Status = ${response.status}`);

        if (response.status === 404) {
          lastError = new Error(`Lỗi HTTP 404 - Đường dẫn kiểm tra không tồn tại: ${endpointUrl}`);
          continue;
        }

        if (response.status >= 200 && response.status < 300) {
          // Thành công kết nối!
          const data = response.data;
          
          if (data && (Array.isArray(data) || data.errorCode === 'SUCCESS' || !data.errorCode)) {
            return {
              success: true,
              message: 'Kết nối mạng và xác thực tài khoản Viettel S-Invoice THÀNH CÔNG!',
              templates: data
            };
          }

          if (data && data.errorCode) {
            let errorMsg = data.description || `Mã lỗi xác thực từ Viettel: ${data.errorCode}`;
            if (data.errorCode === 'AUTH_FAILED' || data.errorCode === '401' || data.errorCode === 'FORBIDDEN') {
              errorMsg = 'Xác thực thất bại! Sai tên đăng nhập (Mã số thuế) hoặc mật khẩu hóa đơn.';
            }
            return {
              success: false,
              message: `Kết nối thất bại: ${errorMsg}`
            };
          }

          return {
            success: true,
            message: 'Kết nối thành công (nhận phản hồi từ Viettel).',
            templates: data
          };
        }
      } catch (err: any) {
        console.error(`[SeniorBackend] Lỗi khi gọi thử cổng kết nối ${endpointUrl}:`, err.message);
        lastError = err;
      }
    }

    return {
      success: false,
      message: `Không thể kết nối đến máy chủ Viettel S-Invoice SInvoice. Chi tiết lỗi: ${lastError?.message || 'Không có phản hồi'}`
    };
  }

  /**
   * Hàm tự chế hỗ trợ tự sinh ngẫu nhiên định danh Transaction UUID v4 để ngăn ngừa trùng hóa đơn
   */
  private generateUUIDv4(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Thuật toán dự phòng nếu chạy ở môi trường Node.js thiếu thư viện tiền đề crypto
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
