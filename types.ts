export enum Currency {
  CNY = 'CNY',
  HKD = 'HKD'
}

export enum AccountType {
  BANK = 'Bank',
  INVESTMENT = 'Investment',
  WALLET = 'Digital Wallet',
  PERSONAL = 'Personal/Other'
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  balance: number;
  icon?: string;
}

// Start with an empty list so the user sees the "Import" welcome screen
export const INITIAL_ACCOUNTS: Account[] = [];