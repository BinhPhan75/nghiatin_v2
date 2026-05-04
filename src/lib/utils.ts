/**
 * Vietnamese CCCD QR Parser
 * Format: CCCD_NUMBER|OLD_CCCD|FULL_NAME|DOB(DDMMYYYY)|GENDER|ADDRESS|ISSUE_DATE(DDMMYYYY)
 */
export interface CCCDInfo {
  id: string;
  name: string;
  dob: string;
  gender: string;
  address: string;
}

export const parseCCCD = (qrData: string): CCCDInfo | null => {
  if (!qrData) return null;
  try {
    // Basic hygiene: remove potential whitespace and non-printable characters
    const cleanData = qrData.trim().replace(/[\x00-\x1F\x7F-\x9F]/g, "");
    
    // Vietnamese CCCD format usually uses '|' as separator.
    // Standard: NUMBER|OLD_NUMBER|NAME|DOB|GENDER|ADDRESS|ISSUE_DATE
    let parts = cleanData.split('|');
    
    // We need at least the ID and Name. 
    // Usually part 0 is ID, part 2 is Name.
    if (parts.length < 3) {
      console.warn("QR Data format too short:", parts.length);
      return null;
    }

    const cccdId = parts[0]?.trim();
    // In newer cards (Căn cước), if they don't have an old ID, parts[1] might be empty.
    // The format still follows the pipe structure.
    const cccdName = parts[2]?.trim();
    
    if (!cccdId || !cccdName) return null;

    // Check if ID is likely a 12-digit number (standard)
    if (!/^\d{12}$/.test(cccdId)) {
      console.warn("Extracted ID does not look like a 12-digit CCCD:", cccdId);
    }

    return {
      id: cccdId,
      name: cccdName,
      dob: parts[3]?.trim() || '',
      gender: parts[4]?.trim() || '',
      address: parts[5]?.trim() || '',
    };
  } catch (e) {
    console.error("Error parsing CCCD QR", e);
    return null;
  }
};

/**
 * VietQR Image Generator
 */
export const getVietQRUrl = (
  bankId: string, 
  accountNo: string, 
  accountName: string, 
  amount: number, 
  description: string
) => {
  // 970436 is the BIN for Vietcombank if not provided
  const bid = bankId || '970436';
  const template = 'compact2'; 
  const roundedAmount = Math.round(amount);
  const encodedDesc = encodeURIComponent(description);
  const encodedName = encodeURIComponent(accountName);
  
  return `https://img.vietqr.io/image/${bid}-${accountNo}-${template}.png?amount=${roundedAmount}&addInfo=${encodedDesc}&accountName=${encodedName}`;
};

/**
 * Helper to remove Vietnamese tones/accents for bank memo compatibility
 */
export const removeVietnameseTones = (str: string) => {
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
  str = str.replace(/đ/g, "d");
  str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
  str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
  str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
  str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
  str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
  str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
  str = str.replace(/Đ/g, "D");
  // Some system combine marks
  str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, ""); // ̀ ́ ̃ ̉ ̣  
  str = str.replace(/\u02C6|\u0306|\u031B/g, ""); // ˆ ̆ ̛  
  // Remove special characters but keep space, dash, dot and comma for readability
  return str.replace(/[^a-zA-Z0-9 \-\.,]/g, "").toUpperCase();
};

/**
 * CRC16-CCITT (False) implementation for VietQR/EMVCo
 */
const crc16 = (str: string): string => {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
    }
    crc &= 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};

const formatTag = (id: string, value: string): string => {
  // EMVCo lengths MUST be 2 digits (max 99). 
  // Truncate if longer to prevent breaking the overall QR structure.
  const safeValue = value.substring(0, 99);
  const len = safeValue.length.toString().padStart(2, '0');
  return `${id}${len}${safeValue}`;
};

/**
 * Generate standard EMVCo VietQR string (000201...)
 */
export const generateEMVCoQR = (
  bankId: string,
  accountNo: string,
  accountName: string,
  amount: number,
  description: string
) => {
  const bid = bankId?.toString() || '970436';
  const name = removeVietnameseTones(accountName).substring(0, 25).toUpperCase();
  
  // Format memo: Use only A-Z, a-z, 0-9, spaces, dots and commas.
  // Truncate to 95 characters.
  const cleanMemo = removeVietnameseTones(description)
    .replace(/[^a-zA-Z0-9 .,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 95);

  // Merchant Account Info (Tag 38)
  const guid = formatTag('00', 'A000000727'); // Napas GUID
  const beneficiaryInfo = formatTag('00', bid) + formatTag('01', accountNo);
  const merchantAccount = formatTag('38', guid + formatTag('01', beneficiaryInfo) + formatTag('02', 'QRIBFTTA'));

  // Full EMVCo Payload
  const payload = [
    formatTag('00', '01'), // Payload Indicator
    formatTag('01', '11'), // Point of Initiation: 11 (Static) is often more compatible with wallets than 12 (Dynamic)
    merchantAccount,
    formatTag('52', '0000'), // Merchant Category Code
    formatTag('53', '704'), // Currency: VND
    formatTag('54', Math.round(amount).toString()),
    formatTag('58', 'VN'), // Country code
    formatTag('59', name), // Merchant Name / Account Holder
    formatTag('60', 'SAIGON'), // Merchant City
    formatTag('62', formatTag('08', cleanMemo)), // Additional Data Field (Memo)
  ].join('');

  const finalStr = payload + '6304';
  const checksum = crc16(finalStr);
  
  return finalStr + checksum;
};

/**
 * Get QR Image from raw EMVCo string using a standard QR API
 */
export const getRawQRUrl = (emvco: string) => {
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(emvco)}`;
};

/**
 * Bank Deep Link / Universal Link Generator
 * Using direct Napas Universal Link (v2/pay) with EMVCo payload
 * This is the gold standard for opening bank apps with pre-filled data.
 */
export const getVCBDeepLink = (
  bankId: string,
  accountNo: string,
  accountName: string,
  amount: number,
  description: string
) => {
  const emvco = generateEMVCoQR(bankId, accountNo, accountName, amount, description);
  // Using direct Napas redirector for universal link support
  return `https://qr.napas.com.vn/v2/pay?tag=00&data=${encodeURIComponent(emvco)}`;
};

export interface BankInfo {
  bin: string;
  accountNo: string;
  accountName?: string;
}

export const parseVietQR = (qrData: string): BankInfo | null => {
  if (!qrData) return null;
  const data = qrData.trim();
  if (!data.startsWith('000201')) return null;

  try {
    let currentPos = 0;
    let bankBin = '';
    let accountNo = '';
    let accountName = '';

    while (currentPos < data.length) {
      const tagId = data.substr(currentPos, 2);
      const lengthStr = data.substr(currentPos + 2, 2);
      if (!lengthStr || lengthStr.length < 2 || isNaN(parseInt(lengthStr))) break;
      
      const length = parseInt(lengthStr);
      if (currentPos + 4 + length > data.length) break;
      
      const value = data.substr(currentPos + 4, length);
      
      // Tag 59: Merchant Name
      if ((tagId === '59' || tagId === '54') && value && value.length > 3) {
        if (!accountName) accountName = value;
      }
      
      const tagNum = parseInt(tagId);
      // Merchant Account Info
      if (tagNum >= 26 && tagNum <= 51) {
        let subPos = 0;
        while (subPos + 4 <= value.length) {
          const subId = value.substr(subPos, 2);
          const subLenStr = value.substr(subPos + 2, 2);
          const subLen = parseInt(subLenStr);
          if (isNaN(subLen)) break;
          const subVal = value.substr(subPos + 4, subLen);
          
          if (subId === '00' && !bankBin && subVal.length > 5 && subVal.length < 10) {
            bankBin = subVal;
          } else if (subId === '01') {
            if (subVal.length > 10 && (subVal.includes('00') || subVal.includes('01'))) {
               let nPos = 0;
               while (nPos + 4 <= subVal.length) {
                 const nId = subVal.substr(nPos, 2);
                 const nLen = parseInt(subVal.substr(nPos + 2, 2));
                 if (isNaN(nLen)) break;
                 const nVal = subVal.substr(nPos + 4, nLen);
                 if (nId === '00') bankBin = nVal;
                 if (nId === '01' || nId === '02') accountNo = nVal;
                 // Many banks put the account name in Sub-sub-tag 03 or 04 or 05
                 if ((nId === '03' || nId === '04' || nId === '05' || nId === '07' || nId === '08') && !accountName && nVal.length > 3) {
                    // Check if it looks like a name (usually uppercase)
                    accountName = nVal;
                 }
                 nPos += 4 + nLen;
               }
            } else if (!bankBin) {
              bankBin = subVal;
            }
          } else if (subId === '02' && !accountNo) {
            accountNo = subVal;
          } else if ((subId === '03' || subId === '04' || subId === '05') && !accountName && subVal.length > 4) {
            accountName = subVal;
          }
          subPos += 4 + subLen;
        }
      }
      
      // If we haven't found a name yet, look for any uppercase string > 5 chars in other tags
      if (!accountName && value.length > 5 && /^[A-Z\s]+$/.test(value) && tagNum > 50 && tagNum < 65) {
         accountName = value;
      }
      
      // Additional fallback for Name in Tag 62 subtags
      if (tagId === '62' && !accountName) {
        let scPos = 0;
        while (scPos + 4 <= value.length) {
          const scId = value.substr(scPos, 2);
          const scLen = parseInt(value.substr(scPos + 2, 2));
          if (isNaN(scLen)) break;
          const scVal = value.substr(scPos + 4, scLen);
          if ((scId === '08' || scId === '09' || scId === '01') && scVal.length > 4) {
            accountName = scVal;
          }
          scPos += 4 + scLen;
        }
      }
      
      currentPos += 4 + length;
      if (tagId === '63') break;
    }

    if (bankBin && accountNo) {
      const result = { 
        bin: bankBin.replace(/[^0-9]/g, ''), 
        accountNo: accountNo.replace(/[^a-zA-Z0-9]/g, '').trim(),
        accountName: accountName.trim()
      };
      console.log("VietQR Parse Success:", result);
      return result;
    }
  } catch (e) {
    console.error("Error parsing VietQR", e);
  }
  return null;
};

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};
