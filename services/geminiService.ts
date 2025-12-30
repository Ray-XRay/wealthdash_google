import { GoogleGenAI } from "@google/genai";
import { Account, Currency } from '../types';

// Helper to safely get the AI instance. 
// We do not initialize it at the top level to prevent runtime crashes if env vars are missing during module load.
const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("API_KEY is missing. AI features will be disabled.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const fetchExchangeRate = async (): Promise<number | null> => {
  try {
    const ai = getAiClient();
    if (!ai) return null;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: "What is the current exchange rate for 1 CNY to HKD? Return ONLY the numeric value (e.g. 1.08).",
      config: {
        tools: [{ googleSearch: {} }]
      }
    });
    
    const text = response.text?.trim() || '';
    // Extract the first valid floating point number
    const match = text.match(/(\d+\.\d+)/);
    const rate = match ? parseFloat(match[0]) : parseFloat(text);
    
    return isNaN(rate) ? null : rate;
  } catch (error) {
    console.error("Failed to fetch exchange rate via AI:", error);
    return null;
  }
};

export const analyzePortfolio = async (accounts: Account[], totalHKD: number): Promise<string> => {
  const ai = getAiClient();
  if (!ai) return "AI Analysis service is unavailable (API Key missing).";

  const accountsSummary = accounts.map(a => 
    `- ${a.name} (${a.type}): ${a.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${a.currency}`
  ).join('\n');

  const prompt = `
    You are a senior financial advisor. Analyze the following personal asset portfolio.
    
    Total Net Worth (approx in HKD): $${totalHKD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    
    Accounts breakdown:
    ${accountsSummary}
    
    Please provide a brief, professional assessment in Chinese (Simplified). 
    1. Comment on the diversification between Banks, Investments, and Digital Wallets.
    2. Comment on the currency risk split between CNY and HKD.
    3. Give one specific suggestion for optimization.
    
    Keep the tone encouraging but professional. Limit response to 200 words.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "Unable to generate analysis.";
  } catch (error) {
    console.error("Analysis failed:", error);
    return "AI Analysis service is temporarily unavailable.";
  }
};