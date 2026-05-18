import axios from 'axios';
import { CCCDInfo } from "../lib/utils";

export interface CCCDAnalysisResult extends CCCDInfo {
  cardType: 'OLD' | 'NEW' | 'ELECTRONIC';
  side: 'FRONT' | 'BACK' | 'ALL';
}

/**
 * Analyzes a Vietnam ID Card (CCCD) image using Gemini via Backend Proxy.
 * This keeps the API Key secure on the server.
 */
export const analyzeCCCDImage = async (base64Image: string): Promise<CCCDAnalysisResult | null> => {
  try {
    const response = await axios.post('/api/ai/analyze-cccd', { base64Image });
    const parsed = response.data;
    
    if (!parsed || !parsed.id || !parsed.name) return null;

    return {
      id: (parsed.id || '').replace(/\s/g, ''),
      name: (parsed.name || '').toUpperCase().trim(),
      dob: parsed.dob || '',
      gender: parsed.gender || '',
      address: (parsed.address || '').trim(),
      cardType: parsed.cardType || 'ELECTRONIC',
      side: parsed.side || 'FRONT'
    };
  } catch (error: any) {
    console.error("Gemini Analysis Error (Frontend):", error);
    // If we have a specific error message from the backend, show it
    if (error.response?.data?.details) {
       console.error("Error Details:", error.response.data.details);
    }
    throw error;
  }
};
