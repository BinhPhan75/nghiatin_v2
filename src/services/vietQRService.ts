/**
 * Generates a VietQR URL that can open banking apps
 * Bank ID for Vietcombank: 970436 (VCB)
 */
export function generateVietQR(
  amount: number,
  accountNo: string,
  accountName: string,
  content: string
): string {
  const bankId = "970436"; // Vietcombank
  const encodedContent = encodeURIComponent(content);
  const encodedName = encodeURIComponent(accountName);
  
  // Format based on standard VietQR link
  // https://img.vietqr.io/image/<BANK_ID>-<ACCOUNT_NO>-<TEMPLATE>.png?amount=<AMOUNT>&addInfo=<DESCRIPTION>&accountName=<ACCOUNT_NAME>
  return `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?amount=${amount}&addInfo=${encodedContent}&accountName=${encodedName}`;
}

export function openVietcombankApp(
  amount: number,
  accountNo: string,
  accountName: string,
  content: string
) {
  // Common intent for VCB (this is a simplified deep link approach)
  // For VCB, we usually use the VietQR code which is more reliable across devices
  // However, we can also provide a link that users can click to open the app if supported
  const vcbDeepLink = `vcbapp://transfer?amount=${amount}&account=${accountNo}&content=${content}`;
  
  // Attempt to open deep link
  window.location.href = vcbDeepLink;
}
