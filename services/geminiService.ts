import { GoogleGenAI } from "@google/genai";
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
      mimeType: 'image/png',
      data: b64.replace(/^data:image\/\w+;base64,/, '')
    }
  }));

  const prompt = `
    Analyze these statement images carefully. I need you to extract two things:
    1. A list of ALL distinct sub-accounts or asset breakdowns found (Name, Balance, Currency, Account Type).
    2. The List of Transactions (Date, Description, Amount, Category).

    **CRITICAL RULE FOR INTEGRATED ACCOUNTS:**
    - If the statement shows a breakdown like "Deposits/Savings" AND "Investments/Equities", **YOU MUST CREATE SEPARATE ACCOUNTS**.
    
    **Currency Identification:**
    - Look for symbols and codes: HKD ($), CNY/RMB (¥), USD (US$), JPY (JP¥/円), EUR (€), GBP (£), etc.
    - **Important:** '¥' can be CNY or JPY. If the context implies Japan (e.g. 'Yen', 'JPY'), use 'JPY'. If China/RMB, use 'CNY'.
    
    **Account Type Identification:**
    - "Investments", "Equities", "Stocks", "Futu", "Tiger", "Longbridge", "IBKR" -> **'Investment'**
    - "PayMe", "Alipay", "WeChat", "Octopus", "Mox", "ZA Bank" -> **'Digital Wallet'**
    - "Deposits", "Savings", "Current", "HSBC", "BOC", "Hang Seng" -> **'Bank'**
    
    **Transaction Categories:**
    - "Transfer to Futu/Securities", "Stock Buy" -> **'Investment'**
    - "Octopus", "KMB", "MTR", "Taxi", "Uber" -> 'Transport'
    - "Deliveroo", "Foodpanda", "Restaurant" -> 'Dining'
    - "ParknShop", "Wellcome", "Supermarket" -> 'Groceries'
    - "Bills", "HKBN", "Electric" -> 'Utilities'
    
    **Return ONLY a JSON object:**
    {
      "accounts": [
        {
          "name": "Account Name",
          "balance": 12345.67, 
          "currency": "One of ['HKD', 'CNY', 'USD', 'JPY', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD']",
          "type": "One of ['Bank', 'Investment', 'Digital Wallet', 'Personal/Other']"
        }
      ],
      "transactions": [
        {
          "date": "YYYY-MM-DD",
          "description": "Merchant",
          "category": "ExpenseCategory",
          "amount": -100.00
        }
      ]
    }
    
    If no accounts found, set "accounts": [].
  `;

  parts.push({ text: prompt });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts },
      config: { responseMimeType: "application/json" }
    });

    let jsonText = response.text || "{}";
    jsonText = jsonText.replace(/```json\n?|\n?```/g, '').trim();
    const data = JSON.parse(jsonText);
    
    // Process Accounts
    let processedAccounts: Partial<Account>[] = [];
    if (Array.isArray(data.accounts)) {
        processedAccounts = data.accounts.map((acc: any) => ({
            name: acc.name || "Unknown Account",
            balance: typeof acc.balance === 'number' ? acc.balance : parseFloat(acc.balance) || 0,
            currency: (Object.values(Currency).includes(acc.currency) ? acc.currency : Currency.HKD),
            type: (Object.values(AccountType).includes(acc.type) ? acc.type : AccountType.BANK) as AccountType
        })).filter((a: any) => a.balance !== 0);
    } else if (data.account && typeof data.account.balance === 'number') {
        processedAccounts.push({
            name: data.account.name || "Unknown Account",
            balance: data.account.balance,
            currency: (Object.values(Currency).includes(data.account.currency) ? data.account.currency : Currency.HKD),
            type: (Object.values(AccountType).includes(data.account.type) ? data.account.type : AccountType.BANK) as AccountType
        });
    }

    // Process Transactions
    let processedTransactions: Transaction[] = [];
    if (Array.isArray(data.transactions)) {
        processedTransactions = data.transactions.map((t: any, idx: number) => ({
            id: `tx-${Date.now()}-${idx}`,
            date: t.date || new Date().toISOString().split('T')[0],
            description: t.description || "Unknown",
            category: Object.values(ExpenseCategory).includes(t.category) ? t.category : ExpenseCategory.OTHER,
            amount: typeof t.amount === 'number' ? t.amount : parseFloat(t.amount) || 0
        }));
    }

    return { accounts: processedAccounts, transactions: processedTransactions };

  } catch (error) {
    console.error("Smart parsing failed:", error);
    throw new Error("Could not analyze the document. Please try a clearer image.");
  }
};
