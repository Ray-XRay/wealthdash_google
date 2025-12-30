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

// Pre-populated accounts based on user request
export const INITIAL_ACCOUNTS: Account[] = [
  { id: 'acc_1', name: 'HSBC (汇丰)', type: AccountType.BANK, currency: Currency.HKD, balance: 0 },
  { id: 'acc_2', name: 'BOCHK (中银香港)', type: AccountType.BANK, currency: Currency.HKD, balance: 0 },
  { id: 'acc_3', name: 'Mox Bank', type: AccountType.BANK, currency: Currency.HKD, balance: 0 },
  { id: 'acc_4', name: 'ZA Bank (众安)', type: AccountType.BANK, currency: Currency.HKD, balance: 0 },
  { id: 'acc_5', name: 'Longbridge (长桥证券)', type: AccountType.INVESTMENT, currency: Currency.HKD, balance: 0 },
  { id: 'acc_6', name: 'Bank of China (中国银行)', type: AccountType.BANK, currency: Currency.CNY, balance: 0 },
];