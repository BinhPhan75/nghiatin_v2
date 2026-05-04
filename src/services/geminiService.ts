import { GoogleGenAI, Type } from "@google/genai";
import { CCCDInfo } from "../lib/utils";

// Initialize AI globally but lazily
let ai: any = null;

const getAI = () => {
  if (ai) return ai;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) console.error("GEMINI_API_KEY missing");
  ai = new GoogleGenAI({ apiKey: apiKey || '' });
  return ai;
};

export interface CCCDAnalysisResult extends CCCDInfo {
  cardType: 'OLD' | 'NEW' | 'ELECTRONIC';
  side: 'FRONT' | 'BACK' | 'ALL';
}

/**
 * Analyzes a Vietnam ID Card (CCCD) image using Gemini.
 * Optimized for front-side scanning without requiring QR code.
 */
export const analyzeCCCDImage = async (base64Image: string): Promise<CCCDAnalysisResult | null> => {
  try {
    const client = getAI();
    
    // Using gemini-3-flash-preview as recommended for complex text tasks (OCR) from images
    // with ThinkingLevel automatically managed or set to LOW for speed.
    const response = await client.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: `You are an expert OCR system for Vietnamese ID Cards (CCCD and older CMND). 
                     Extract the following information from the provided IMAGE of the FRONT side of the card:
                     - id: The 9 or 12 digit number (Số/No.)
                     - name: The full name (Họ và tên) in ALL CAPS.
                     - dob: The date of birth (Ngày sinh) in DD/MM/YYYY format.
                     - address: The place of residence (Nơi thường trú). 
                     - cardType: 'OLD' if 9-digit CMND, 'NEW' if 12-digit without chip, 'ELECTRONIC' if with chip.
                     - side: Should be 'FRONT'.
                     
                     Rules:
                     1. If information is not clearly visible, leave as empty string.
                     2. Return ONLY a valid JSON object matching the requested fields.` },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image.split(',')[1] || base64Image
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["id", "name"],
          properties: {
            id: { type: Type.STRING, description: "9 or 12 digit ID number" },
            name: { type: Type.STRING, description: "Full name in uppercase" },
            dob: { type: Type.STRING, description: "Date of birth DD/MM/YYYY" },
            address: { type: Type.STRING, description: "Permanent residence address" },
            cardType: { type: Type.STRING, enum: ["OLD", "NEW", "ELECTRONIC"] },
            side: { type: Type.STRING, enum: ["FRONT", "BACK", "ALL"] }
          }
        }
      }
    });

    const resultText = response.text;
    if (!resultText) return null;

    try {
      const parsed = JSON.parse(resultText);
      return {
        id: (parsed.id || '').replace(/\s/g, ''),
        name: (parsed.name || '').toUpperCase().trim(),
        dob: parsed.dob || '',
        gender: parsed.gender || '',
        address: (parsed.address || '').trim(),
        cardType: parsed.cardType || 'ELECTRONIC',
        side: parsed.side || 'FRONT'
      };
    } catch (e) {
      console.error("AI returned invalid JSON:", resultText);
      // Fallback: try to extract JSON with regex if it's wrapped in markdown
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
         try {
           const parsed = JSON.parse(jsonMatch[0]);
           return {
             id: (parsed.id || '').replace(/\s/g, ''),
             name: (parsed.name || '').toUpperCase().trim(),
             dob: parsed.dob || '',
             gender: parsed.gender || '',
             address: (parsed.address || '').trim(),
             cardType: parsed.cardType || 'ELECTRONIC',
             side: parsed.side || 'FRONT'
           };
         } catch (innerE) {}
      }
      return null;
    }
  } catch (error: any) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};
