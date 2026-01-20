
import { GoogleGenAI, Type } from "@google/genai";

let runtimeApiKey: string | null = null;

/**
 * Cập nhật API Key từ Backend vào bộ nhớ ứng dụng
 */
export const setRuntimeApiKey = (key: string) => {
  runtimeApiKey = key;
};

const getAIClient = () => {
  const apiKey = runtimeApiKey || (typeof process !== 'undefined' ? process.env.API_KEY : null);
  
  if (!apiKey) {
    throw new Error("API KEY CHƯA ĐƯỢC CẤU HÌNH. VUI LÒNG ĐĂNG NHẬP LẠI.");
  }
  
  return new GoogleGenAI({ apiKey });
};

export const analyzeProductImage = async (base64Image: string): Promise<string> => {
  const ai = getAIClient();
  const prompt = `Analyze this wooden product carefully. Identify wood species, grain, and construction style. Focus on technical materials and structural essence. If it's a small playhouse or kids' structure, note its compact scale.`;
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
  const lighting = environment === 'outdoor' ? "Realistic natural outdoor sunlight, authentic daylight shadows, high-end photography" : "Soft realistic indoor ambient light, natural room atmosphere";
  
  let taskPrompt = "";
  if (isInitialRedesign) {
    // CHỈNH SỬA TẠI ĐÂY: Giữ 80% linh hồn, tập trung vào sự nhỏ xinh, không làm to quá.
    taskPrompt = `TASK: REDESIGN this wooden structure. MAINTAIN 80% of the original structural soul and design. If it is a small kids playhouse or garden shed, KEEP IT SMALL, CUTE, AND MINIATURE. DO NOT make it a large house or professional villa. The goal is a refined version of the same small product. SCENE: Professional cinematic shot, ${lighting}.`;
  } else {
    if (type === 'full') {
      taskPrompt = `TASK: Alternative perspective of THIS EXACT small architecture. Maintain its compact scale. SCENE: Professional photography, ${lighting}.`;
    } else if (type === 'people') {
      taskPrompt = `TASK: Lifestyle photo showing real people (children if applicable) interacting with THIS EXACT small wooden structure. Scale must be accurate. SCENE: Human-centric high realism, ${lighting}.`;
    } else {
      taskPrompt = `TASK: Technical detail/Construction view of THIS EXACT wooden design. Show the small-scale carpentry and craftsmanship. ${lighting}.`;
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
