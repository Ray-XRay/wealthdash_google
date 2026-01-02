export enum Currency {
  HKD = 'HKD',
  CNY = 'CNY',
  USD = 'USD',
  JPY = 'JPY',
  EUR = 'EUR',
  GBP = 'GBP',
  AUD = 'AUD',
  CAD = 'CAD',
  SGD = 'SGD'
}

export enum AccountType {
  BANK = 'Bank',
  INVESTMENT = 'Investment',
  WALLET = 'Digital Wallet',
  PERSONAL = 'Personal/Other'
}

export enum ExpenseCategory {
  DINING = 'Dining',
  GROCERIES = 'Groceries',
  TRANSPORT = 'Transport',
  SHOPPING = 'Shopping',
  HOUSING = 'Housing',
  UTILITIES = 'Utilities',
  BILLS = 'Bills',
  ENTERTAINMENT = 'Entertainment',
  HEALTH = 'Health',
  TRANSFER = 'Transfer',
  INCOME = 'Income',
  INVESTMENT = 'Investment',
  OTHER = 'Other'
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  balance: number;
  icon?: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
}

// Pre-populated accounts
export const INITIAL_ACCOUNTS: Account[] = [];
