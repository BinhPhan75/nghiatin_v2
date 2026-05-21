import axios, { AxiosResponse } from 'axios';

/**
 * ============================================================================
 * VIETTEL S-INVOICE INTEGRATION MODULE (TYPESCRIPT / NODE.JS)
 * ============================================================================
 * Vai trò: Senior Backend Developer chuyên trách tích hợp hệ thống.
 * Chức năng: Đóng gói dữ liệu DTO và thực hiện cuộc phát hành hóa đơn điện tử S-Invoice.
 * Thiết kế bảo mật: Xử lý Basic Authentication chuẩn hóa Base64 và transactionUuid ngẫu nhiên chống trùng.
 * ============================================================================
 */

// ============================================================================
// 1. DATA TRANSFER OBJECT SECTIONS (HỆ THỐNG DTO CHUẨN HOÁ THEO PHÂN TÍCH TÀI LIỆU)
// ============================================================================

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
// 2. CORE BACKEND SERVICE CLASS IMPLEMENTATION
// ============================================================================

export class ViettelSInvoiceBackendService {
  private baseUrl: string;

  /**
   * Khởi tạo Service kết nối S-Invoice Viettel
   * @param originUrl URL cơ sở do Viettel cung cấp (Mặc định: 'https://api-vinvoice.viettel.vn')
   */
  constructor(originUrl: string = 'https://api-vinvoice.viettel.vn') {
    this.baseUrl = originUrl.trim().replace(/\/+$/, '');
  }

  /**
   * Thực hiện gọi API đồng bộ để khởi tạo và phát hành hóa đơn điện tử S-Invoice của doanh nghiệp
   * @param username Tài khoản doanh nghiệp cấu hình (MST). Ví dụ: '4000926165'
   * @param password Mật khẩu tài khoản tích hợp API tương ứng
   * @param supplierTaxCode Mã số thuế người bán hàng. Ví dụ: '4000926165'
   * @param invoicePayload Toàn bộ dữ liệu hóa đơn gồm chi tiết mặt hàng và tổng tiền
   */
  public async createInvoice(
    username: string,
    password: string,
    supplierTaxCode: string,
    invoicePayload: Omit<ViettelInvoiceRequestDTO, 'generalInvoiceInfo'> & {
      // Cho phép cấu hình các trường nghiệp vụ linh hoạt của generalInvoiceInfo từ ngoài
      generalInvoiceInfo: Omit<GeneralInvoiceInfoDTO, 'transactionUuid'>;
    }
  ): Promise<ViettelInvoiceResponseDTO> {
    
    // Bước 1: Bảo mật và định danh chống trùng lắp giao dịch (Chỉ thị số 4)
    // Tạo mã UUID ngẫu nhiên v4 cho mỗi lần bấm gửi request hoá đơn
    const randomUuid = this.generateUUIDv4();
    
    const finalPayload: ViettelInvoiceRequestDTO = {
      ...invoicePayload,
      generalInvoiceInfo: {
        ...invoicePayload.generalInvoiceInfo,
        transactionUuid: randomUuid, // Ép buộc ghi nhận transactionUuid phòng ngừa lỗi chồng hoá đơn khi rớt mạng
        invoiceIssuedDate: invoicePayload.generalInvoiceInfo.invoiceIssuedDate || Date.now() // Lấy giờ thực tại nếu chưa truyền dữ liệu
      }
    };

    // Thiết lập đường dẫn API tạo hóa đơn tương ứng MST nhà bán theo tài liệu trang 36
    const endpointUrl = `${this.baseUrl}/InvoiceAPI/InvoiceWS/createInvoice/${supplierTaxCode.trim()}`;

    // Bước 2: Mã hóa token xác thực bằng cơ chế Basic Authentication
    // Chuỗi mẫu: 4000926165:Mật_Khẩu -> Base64
    const loginString = `${username.trim()}:${password}`;
    const base64AuthToken = typeof Buffer !== 'undefined'
      ? Buffer.from(loginString).toString('base64')
      : btoa(unescape(encodeURIComponent(loginString)));

    console.log(`[SeniorBackend] Bắt đầu gọi API S-Invoice Viettel tạo hoá đơn: ${endpointUrl}`);
    console.log(`[SeniorBackend] Sử dụng transactionUuid chống trùng duy nhất: ${randomUuid}`);

    try {
      // Thực thi gửi gói POST đồng bộ lên máy chủ S-Invoice
      const response: AxiosResponse<any> = await axios.post(
        endpointUrl,
        finalPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Basic ${base64AuthToken}` // Truyền Base64 Xác thực Basic Auth
          },
          // Đặt mức thời gian chờ tối thiểu từ 60 - 90 giây để bù đắp xử lý chữ ký điện tử HSM từ Viettel (mục 6.2)
          timeout: 75000,
          validateStatus: () => true // Cho phép đọc sâu các phản hồi trả về mã Http thất bại tự điều chỉnh
        }
      );

      const responseData = response.data;
      console.log(`[SeniorBackend] Hệ thống Viettel phản hồi, Http Status: ${response.status}`);
      console.log(`[SeniorBackend] Chi tiết Data:`, JSON.stringify(responseData));

      // Bước 3: Đọc hiểu và phân tích dữ liệu phản hồi (Response)
      if (response.status >= 200 && response.status < 300) {
        
        // Hệ thống Viettel trả thành công: errorCode rỗng,null,0 và có đầy đủ invoiceNo trong result
        const isSuccess = !responseData.errorCode || 
                          responseData.errorCode === '' || 
                          responseData.errorCode === '0' ||
                          responseData.errorCode === 'SUCCESS';

        if (isSuccess && responseData.result) {
          console.log(`[SeniorBackend] Phát hành S-Invoice thành công! Số hoá đơn: ${responseData.result.invoiceNo}`);
          return {
            errorCode: null,
            description: 'Phát hành hoá đơn điện tử thành công từ Viettel S-Invoice',
            result: responseData.result
          };
        }

        // Trường hợp Viettel phản hồi mã thành công HTTP 200 nhưng cấu trúc dữ liệu bị từ chối nghiệp vụ thuế
        const errCode = responseData.errorCode || 'VIETTEL_BUSINESS_ERROR';
        const errDesc = responseData.description || 'Nghiệp vụ hóa đơn bị Viettel từ chối mà không có lý do hoàn trả.';
        
        this.handleViettelBusinessError(errCode, errDesc);
      }

      // Xử lý khi HTTP Status bên Viettel ngoài luồng 200 (ví dụ 400 Bad Request, 401 Unauthorized, 404 Not Found, 500 Server Error)
      throw new Error(
        `Lỗi HTTP từ cổng dịch vụ Viettel [Mã: ${response.status}]. Chi tiết phản hồi: ${
          typeof responseData === 'object' ? JSON.stringify(responseData) : responseData
        }`
      );

    } catch (e: any) {
      console.error(`[SeniorBackend] Gặp lỗi nghiêm trọng trong quá trình phát hành S-Invoice:`, e.message);
      throw e;
    }
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
   * Hàm tự chế hỗ trợ tự sinh ngẫu nhiên định danh Transaction UUID v4
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
