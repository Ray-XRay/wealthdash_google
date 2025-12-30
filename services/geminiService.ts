import { GoogleGenAI } from "@google/genai";
import { Account, Currency } from '../types';

// Initialize Gemini AI
// The API key must be obtained exclusively from the environment variable process.env.API_KEY.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const fetchExchangeRate = async (): Promise<number | null> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: "What is the current exchange rate for 1 CNY to HKD? Return ONLY the numeric value (e.g., 1.08). Do not include text.",
    });
    
    const text = response.text?.trim();
    const rate = parseFloat(text || '');
    return isNaN(rate) ? null : rate;
  } catch (error) {
    console.error("Failed to fetch exchange rate via AI:", error);
    return null;
  }
};

export const analyzePortfolio = async (accounts: Account[], totalHKD: number): Promise<string> => {
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