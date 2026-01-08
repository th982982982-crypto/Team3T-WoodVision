
import { GoogleGenAI, Type } from "@google/genai";

let runtimeApiKey: string | null = null;

/**
 * Cập nhật API Key từ Backend vào bộ nhớ ứng dụng
 */
export const setRuntimeApiKey = (key: string) => {
  runtimeApiKey = key;
};

const getAIClient = () => {
  // Ưu tiên lấy key được set tại runtime (từ Google Sheet), sau đó mới tới biến môi trường
  const apiKey = runtimeApiKey || (typeof process !== 'undefined' ? process.env.API_KEY : null);
  
  if (!apiKey) {
    throw new Error("API KEY CHƯA ĐƯỢC CẤU HÌNH. VUI LÒNG ĐĂNG NHẬP LẠI.");
  }
  
  return new GoogleGenAI({ apiKey });
};

export const analyzeProductImage = async (base64Image: string): Promise<string> => {
  const ai = getAIClient();
  const prompt = `Analyze this wooden product carefully. Identify wood species, grain, and construction style. Focus on technical materials and structural essence.`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [{ inlineData: { data: base64Image.split(',')[1], mimeType: 'image/png' } }, { text: prompt }]
      }
    });
    return response.text || "Premium Wood Project";
  } catch (error) { throw error; }
};

export const generateEtsyMetadata = async (description: string) => {
  const ai = getAIClient();
  const prompt = `Based on: "${description}", create professional Etsy SEO content.
  1. Title: High-converting SEO title.
  2. Description: MUST be in a SINGLE VERTICAL COLUMN format from top to bottom.
     Use these sections with professional icons:
     🌲 MATERIAL DETAILS: (Specific wood types, texture, grain)
     📏 PRODUCT DIMENSIONS: (Estimated size specs)
     🔨 QUALITY & CRAFTSMANSHIP: (Construction methods, durability)
     ✨ UNIQUE DESIGN: (Why this design stands out)
     ✅ ASSEMBLY & CARE: (Setup info and maintenance)
     📦 SHIPPING INFO: (Packaging quality)
     Use emojis and make it visually professional for buyers.
  3. Tags: 13 comma-separated tags.
  4. Materials: Specific wood names.
  Return JSON with keys: title, description, tags, materials.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            tags: { type: Type.STRING },
            materials: { type: Type.STRING }
          },
          required: ["title", "description", "tags", "materials"]
        }
      }
    });
    return JSON.parse(response.text);
  } catch (error) { return null; }
};

export const generateScene = async (
  referenceBase64: string, 
  description: string, 
  type: 'full' | 'people' | 'construction',
  context: string,
  environment: 'indoor' | 'outdoor',
  isInitialRedesign: boolean = false,
  refineNote?: string
): Promise<string> => {
  const ai = getAIClient();
  const lighting = environment === 'outdoor' ? "Realistic natural outdoor sunlight, authentic daylight shadows, crisp textures, high-end photography" : "Soft realistic indoor ambient light, natural room atmosphere, elegant shadows";
  
  let taskPrompt = "";
  if (isInitialRedesign) {
    taskPrompt = `TASK: REDESIGN this wooden product. Keep only 40% of the original structural essence (the soul), but create a COMPLETELY NEW, DISTINCT, and SUPERIOR architecture. It MUST look noticeably different from the original image while maintaining high quality. SCENE: Cinematic architectural shot, ${lighting}.`;
  } else {
    if (type === 'full') {
      taskPrompt = `TASK: Alternative perspective of THIS EXACT architecture from the reference image. DO NOT change any structural detail. SCENE: Professional photography, ${lighting}.`;
    } else if (type === 'people') {
      taskPrompt = `TASK: Lifestyle photo showing real people interacting with THIS EXACT wooden structure. Scale must be accurate. SCENE: Human-centric high realism, ${lighting}.`;
    } else {
      taskPrompt = `TASK: Technical/Construction view of THIS EXACT wooden design. SCENE: Authentic onsite assembly, showing professional joints, internal frames, and builders working on this specific architecture. ${lighting}.`;
    }
  }

  const finalPrompt = `${taskPrompt} Context: ${context}. ${refineNote ? `IMPORTANT ADJUSTMENT: ${refineNote}` : ""}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ inlineData: { data: referenceBase64.split(',')[1], mimeType: 'image/png' } }, { text: finalPrompt }]
      },
      config: { imageConfig: { aspectRatio: "1:1" } }
    });
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("No image data");
  } catch (error) { throw error; }
};
