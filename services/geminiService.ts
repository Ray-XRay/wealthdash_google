import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Account, Currency, AccountType, Transaction, ExpenseCategory } from '../types';

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("API_KEY is missing. AI features will be disabled.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

// Now returns a map of rates relative to HKD (e.g. { CNY: 1.08, USD: 7.82 })
export const fetchExchangeRates = async (): Promise<Record<string, number> | null> => {
  try {
    const ai = getAiClient();
    if (!ai) return null;

    const prompt = `
      Return a JSON object with current exchange rates to HKD (Hong Kong Dollar) for:
      CNY, USD, JPY, EUR, GBP, AUD, CAD, SGD.
      Example format: { "CNY": 1.08, "USD": 7.82, "JPY": 0.052 ... }
      Return ONLY the JSON.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        tools: [{ googleSearch: {} }]
      }
    });
    
    const text = response.text?.trim() || '{}';
    const jsonStr = text.replace(/```json\n?|\n?```/g, '');
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Failed to fetch exchange rates via AI:", error);
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
    2. Comment on the currency exposure (HKD, CNY, USD, JPY, etc.).
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

export const analyzeSpending = async (transactions: Transaction[]): Promise<string> => {
  const ai = getAiClient();
  if (!ai) return "AI Analysis service is unavailable.";

  const spending = transactions.filter(t => t.amount < 0);
  const totalSpent = spending.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  
  // Group by category
  const categories: Record<string, number> = {};
  spending.forEach(t => {
    categories[t.category] = (categories[t.category] || 0) + Math.abs(t.amount);
  });
  
  const sortedCats = Object.entries(categories)
    .sort((a,b) => b[1] - a[1])
    .map(([name, val]) => `${name}: $${val.toFixed(0)}`)
    .join(', ');

  const prompt = `
    You are a personal finance coach. Analyze these monthly expenses.
    
    Total Spent: $${totalSpent.toFixed(0)}
    Breakdown: ${sortedCats}
    
    Top 5 Transactions:
    ${spending.sort((a,b) => a.amount - b.amount).slice(0, 5).map(t => `${t.description}: $${Math.abs(t.amount)}`).join('\n')}

    Provide a short, insightful review in Chinese (Simplified).
    1. Identify the biggest spending area.
    2. Flag any potentially unnecessary spending (e.g. Subscriptions, Dining out).
    3. Give 1 actionable tip to save money next month.
    
    Keep it friendly and concise (under 150 words).
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "Unable to generate spending analysis.";
  } catch (error) {
    return "Analysis failed.";
  }
};

interface SmartParseResult {
  accounts: Partial<Account>[]; 
  transactions: Transaction[];
}

/**
 * Smartly parses a document to extract BOTH Account Balance and Transactions if available.
 */
export const smartParseDocument = async (base64Images: string[]): Promise<SmartParseResult> => {
  const ai = getAiClient();
  if (!ai) throw new Error("AI Client unavailable");

  const parts: any[] = base64Images.map(b64 => ({
    inlineData: {
      mimeType: 'image/jpeg',
      data: b64.replace(/^data:image\/\w+;base64,/, '')
    }
  }));

  const prompt = `
    You are an expert Financial Auditor specializing in Hong Kong banking documents (HSBC, BOCHK, Mox, ZA Bank, Futu, Longbridge). 
    Analyze the provided statement images.
    
    ## TASK 1: Extract Accounts/Assets
    Identify the *current ending balance* of the account.
    - Look for keywords: "Ending Balance", "Closing Balance", "Net Assets", "Portfolio Value", "结余", "总资产", "账户余额", "Account Balance".
    - **IGNORE**: "Total Deposits", "Total Credits", "Available Limit", "Loan Balance", "Balance Brought Forward", "上期结余".
    - If multiple currencies exist (e.g. HKD Savings, USD Savings), list them as separate accounts.

    ## TASK 2: Extract Transactions
    List every single transaction row found.
    - **Logic for Amount**: 
      - If one column: Signs usually indicate direction (- for debit, + for credit).
      - If two columns (Debit/Credit or Withdrawal/Deposit or 支出/存入): 
        - Amount = Deposit - Withdrawal.
        - OR Amount = Credit - Debit.
        - Result: Spending must be NEGATIVE. Income must be POSITIVE.
    - **Ignore rows**: "B/F", "Balance Brought Forward", "Total", "Subtotal", "承上页", "转下页".

    ## Categorization Rules
    - Dining: Restaurant, Foodpanda, Deliveroo, McDonald, Cafe, 餐厅, 餐饮.
    - Transport: Uber, Taxi, KMB, MTR, Bus, Tunnel, Parking, 交通, 车费.
    - Groceries: ParknShop, Wellcome, AEON, Market, Supermarket, 7-Eleven, Circle K, 超市.
    - Investment: Futu, Tiger, Longbridge, Stock, Securities, Subscription, 证券, 股票.
    - Transfer: FPS, Transfer, P2P, 转账.
    
    ## Currency Detection
    - Symbols: '$' is HKD unless context says USD/AUD/CAD.
    - '¥' is CNY (RMB) unless context says JPY.

  `;

  parts.push({ text: prompt });

  const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      accounts: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Account Name e.g. HSBC Savings" },
            balance: { type: Type.NUMBER, description: "Current ending balance" },
            currency: { type: Type.STRING, description: "HKD, CNY, USD, etc." },
            type: { type: Type.STRING, description: "Bank, Investment, Wallet, Other" },
          },
          required: ["name", "balance", "currency", "type"]
        }
      },
      transactions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING, description: "YYYY-MM-DD" },
            description: { type: Type.STRING },
            category: { type: Type.STRING },
            amount: { type: Type.NUMBER, description: "Negative for expense, Positive for income" },
          },
          required: ["date", "description", "amount"]
        }
      }
    },
    required: ["accounts", "transactions"]
  };

  let lastError;
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview', 
          contents: { parts },
          config: { 
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            thinkingConfig: { thinkingBudget: 2048 } 
          }
        });

        const jsonText = response.text || "{}";
        const data = JSON.parse(jsonText);
        
        // Process Accounts
        let processedAccounts: Partial<Account>[] = [];
        if (Array.isArray(data.accounts)) {
            processedAccounts = data.accounts.map((acc: any) => ({
                name: acc.name || "Unknown Account",
                balance: acc.balance || 0,
                currency: (Object.values(Currency).includes(acc.currency) ? acc.currency : Currency.HKD),
                type: (Object.values(AccountType).includes(acc.type) ? acc.type : AccountType.BANK) as AccountType
            })).filter((a: any) => a.balance !== 0);
        }

        // Process Transactions
        let processedTransactions: Transaction[] = [];
        if (Array.isArray(data.transactions)) {
            processedTransactions = data.transactions.map((t: any, idx: number) => ({
                id: `tx-${Date.now()}-${idx}`,
                date: t.date || new Date().toISOString().split('T')[0],
                description: t.description || "Unknown",
                category: Object.values(ExpenseCategory).includes(t.category) ? t.category : ExpenseCategory.OTHER,
                amount: t.amount || 0
            }));
        }

        return { accounts: processedAccounts, transactions: processedTransactions };

      } catch (error: any) {
        lastError = error;
        console.warn(`Attempt ${attempt + 1} failed:`, error);
        
        const isQuotaError = error.status === 429 || error.code === 429 || 
                             error.message?.includes('429') || error.message?.includes('quota') || 
                             error.message?.includes('RESOURCE_EXHAUSTED');
        
        if (isQuotaError && attempt < maxRetries - 1) {
            // Wait 2s, 4s...
            await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, attempt)));
            continue;
        }
        break;
      }
  }

  console.error("Smart parsing failed:", lastError);
  const errorDetails = lastError?.message || lastError?.toString();
  
  if (errorDetails.includes('429') || errorDetails.includes('quota') || errorDetails.includes('RESOURCE_EXHAUSTED')) {
      throw new Error("API Limit Exceeded. Please wait a moment and try again.");
  }

  throw new Error(`${errorDetails}`);
};
