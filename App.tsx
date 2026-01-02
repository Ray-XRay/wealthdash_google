import React, { useState, useEffect, useMemo } from 'react';
import { 
  Wallet, 
  Plus, 
  Trash2, 
  BrainCircuit, 
  ArrowRightLeft,
  X, 
  Edit3, 
  RotateCcw,
  Sparkles,
  ArrowRight,
  CreditCard,
  Upload, 
  FileSpreadsheet,
  Receipt,
  LayoutDashboard,
  Landmark,
  Banknote,
  TrendingUp,
  Coins,
  Globe,
  RefreshCcw,
  Loader2
} from 'lucide-react';
import { Account, AccountType, Currency, INITIAL_ACCOUNTS, Transaction } from './types';
import { analyzePortfolio, analyzeSpending, fetchExchangeRates } from './services/geminiService';
import { AssetChart } from './components/AssetChart';
import { ImportWizard } from './components/ImportWizard';
import { ExpenseTracker } from './components/ExpenseTracker';

const STORAGE_KEY = 'wealthdash_data_user_v14'; 

// Default rates relative to HKD
const DEFAULT_RATES: Record<string, number> = {
  [Currency.HKD]: 1,
  [Currency.CNY]: 1.08,
  [Currency.USD]: 7.82,
  [Currency.JPY]: 0.052,
  [Currency.EUR]: 8.5,
  [Currency.GBP]: 9.9,
  [Currency.AUD]: 5.2,
  [Currency.CAD]: 5.8,
  [Currency.SGD]: 5.8,
};

const App: React.FC = () => {
  // --- STATE ---
  const [activeTab, setActiveTab] = useState<'ASSETS' | 'EXPENSES'>('ASSETS');
  
  // New State: Base Currency for Display (Default HKD)
  const [baseCurrency, setBaseCurrency] = useState<Currency>(Currency.HKD);

  const [accounts, setAccounts] = useState<Account[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.accounts)) {
             return parsed.accounts.map((a: any) => ({
                 id: String(a.id || Date.now()),
                 name: String(a.name || 'Unknown Asset'),
                 type: Object.values(AccountType).includes(a.type) ? a.type : AccountType.BANK,
                 currency: Object.values(Currency).includes(a.currency) ? a.currency : Currency.HKD,
                 balance: typeof a.balance === 'number' ? a.balance : (parseFloat(a.balance) || 0)
             }));
        }
        return INITIAL_ACCOUNTS;
      }
    } catch (e) { console.warn(e); }
    return INITIAL_ACCOUNTS;
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
      try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
              const parsed = JSON.parse(saved);
              return Array.isArray(parsed.transactions) ? parsed.transactions : [];
          }
      } catch (e) {}
      return [];
  });

  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.exchangeRates || DEFAULT_RATES;
      }
    } catch (e) {}
    return DEFAULT_RATES;
  });

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [assetAnalysis, setAssetAnalysis] = useState<string>("");
  const [expenseAnalysis, setExpenseAnalysis] = useState<string>("");
  
  // Interactive States
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [highlightedAssetId, setHighlightedAssetId] = useState<string | null>(null); 
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Quick Add State
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountBalance, setNewAccountBalance] = useState("");
  const [newAccountCurrency, setNewAccountCurrency] = useState<Currency>(Currency.HKD);
  const [newAccountType, setNewAccountType] = useState<AccountType>(AccountType.BANK);

  // --- EFFECTS ---
  useEffect(() => {
    const dataToSave = {
      accounts,
      transactions,
      exchangeRates,
      lastUpdated: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
  }, [accounts, transactions, exchangeRates]);

  useEffect(() => {
    if (Object.keys(exchangeRates).length <= 2) {
       refreshRates();
    }
  }, []);

  const refreshRates = async () => {
     const rates = await fetchExchangeRates();
     if (rates) {
         setExchangeRates(prev => ({ ...prev, ...rates }));
     }
  };

  const toggleBaseCurrency = () => {
      setBaseCurrency(prev => {
        if (prev === Currency.HKD) return Currency.CNY;
        if (prev === Currency.CNY) return Currency.USD;
        return Currency.HKD;
      });
  };

  // --- CALCULATIONS ---
  const totals = useMemo(() => {
    // 1. Calculate raw totals in HKD first
    let totalHKD = 0;
    let hkdCashBucket = 0; 
    let foreignCashBucket = 0; 
    let investmentBucket = 0; 
    let liabilityBucket = 0; 
    
    accounts.forEach(acc => {
      const bal = typeof acc.balance === 'number' ? acc.balance : 0;
      const rateToHKD = exchangeRates[acc.currency] || (acc.currency === Currency.HKD ? 1 : 0);
      const effectiveRate = rateToHKD === 0 ? 1 : rateToHKD;
      const balInHKD = bal * effectiveRate;
      
      const isNegative = bal < 0;

      if (acc.type === AccountType.INVESTMENT) {
        if (bal > 0) investmentBucket += balInHKD;
      } else if (isNegative) {
        liabilityBucket += Math.abs(balInHKD);
      } else {
        // Cash buckets separation logic
        if (acc.currency === Currency.HKD) {
            hkdCashBucket += bal;
        } else {
            foreignCashBucket += balInHKD; 
        }
      }
      totalHKD += balInHKD;
    });

    // 2. Determine conversion rate for display
    // If Base is HKD, factor is 1. If Base is CNY, factor is 1 / Rate(CNY->HKD)
    let displayFactor = 1;
    if (baseCurrency !== Currency.HKD) {
        const baseRateToHKD = exchangeRates[baseCurrency] || 1;
        displayFactor = 1 / baseRateToHKD;
    }

    const netWorth = (hkdCashBucket + foreignCashBucket + investmentBucket - liabilityBucket) * displayFactor;

    let symbol = '$';
    if (baseCurrency === Currency.HKD) symbol = 'HK$';
    else if (baseCurrency === Currency.CNY) symbol = 'CN¥';
    else if (baseCurrency === Currency.USD) symbol = 'US$';

    return { 
        netWorth,
        hkdCash: hkdCashBucket * displayFactor, 
        foreignCash: foreignCashBucket * displayFactor,
        investments: investmentBucket * displayFactor, 
        liabilities: liabilityBucket * displayFactor,
        symbol
    };
  }, [accounts, exchangeRates, baseCurrency]);


  // --- HANDLERS ---
  const triggerAutoAnalysis = async (currentAccounts: Account[], currentTransactions: Transaction[]) => {
      if (currentAccounts.length === 0 && currentTransactions.length === 0) return;
      
      setIsAnalyzing(true);
      
      try {
          // Calculate approximate Net Worth in HKD for analysis context
          let totalHKD = 0;
          currentAccounts.forEach(acc => {
              const rate = exchangeRates[acc.currency] || 1;
              totalHKD += (acc.balance * rate);
          });

          // Run in parallel
          const [assetRes, expenseRes] = await Promise.all([
              currentAccounts.length > 0 ? analyzePortfolio(currentAccounts, totalHKD) : Promise.resolve(""),
              currentTransactions.length > 0 ? analyzeSpending(currentTransactions) : Promise.resolve("")
          ]);

          if (assetRes) setAssetAnalysis(assetRes);
          if (expenseRes) setExpenseAnalysis(expenseRes);
      } catch (e) {
          console.error("Auto analysis failed", e);
      } finally {
          setIsAnalyzing(false);
      }
  };

  const handleDeleteAccount = (id: string) => {
    setAccounts(prev => prev.filter(a => a.id !== id));
    if (selectedAccount?.id === id) setSelectedAccount(null);
  };

  const handleSaveAccountEdit = (updatedAcc: Account) => {
     setAccounts(prev => prev.map(a => a.id === updatedAcc.id ? updatedAcc : a));
     setSelectedAccount(null);
  };

  const handleAddAccount = () => {
    if (!newAccountName || !newAccountBalance) return;
    const newAcc: Account = {
      id: Date.now().toString(),
      name: newAccountName,
      balance: parseFloat(newAccountBalance) || 0,
      currency: newAccountCurrency,
      type: newAccountType
    };
    setAccounts([...accounts, newAcc]);
    setNewAccountName("");
    setNewAccountBalance("");
  };

  const handleResetData = () => {
    if(window.confirm("This will clear all your data. Continue?")) {
        localStorage.removeItem(STORAGE_KEY);
        setAccounts([]);
        setTransactions([]);
        setAssetAnalysis("");
        setExpenseAnalysis("");
        setSelectedAccount(null);
        setHighlightedAssetId(null);
    }
  };

  const handleClearTransactions = () => {
      if(window.confirm("Clear all transaction history?")) {
          setTransactions([]);
          setExpenseAnalysis("");
      }
  }

  // --- IMPORT HANDLER ---
  const handleImportSmart = async (data: { accounts: Partial<Account>[], transactions: Transaction[] }) => {
      let nextAccounts = [...accounts];
      let nextTransactions = [...transactions];

      if (data.accounts && data.accounts.length > 0) {
           data.accounts.forEach(newAccount => {
              if (!newAccount.name) return;
              const existingIndex = nextAccounts.findIndex(a => 
                  a.name.toLowerCase() === newAccount.name?.toLowerCase()
              );
              if (existingIndex >= 0) {
                  nextAccounts[existingIndex] = { ...nextAccounts[existingIndex], balance: newAccount.balance || 0 };
              } else {
                  nextAccounts.push({
                      id: `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                      name: newAccount.name || 'New Account',
                      balance: newAccount.balance || 0,
                      currency: newAccount.currency || Currency.HKD,
                      type: newAccount.type || AccountType.BANK
                  } as Account);
              }
          });
      }

      if (data.transactions && data.transactions.length > 0) {
          nextTransactions = [...data.transactions, ...nextTransactions];
      }
      
      // Update State
      setAccounts(nextAccounts);
      setTransactions(nextTransactions);

      // Auto Switch Tab
      if (data.transactions.length > 0) {
          setActiveTab('EXPENSES');
      } else if (data.accounts.length > 0) {
          setActiveTab('ASSETS');
      }

      // TRIGGER AUTO ANALYSIS
      await triggerAutoAnalysis(nextAccounts, nextTransactions);
  };

  // --- COMPONENT: STAT CARD ---
  const StatCard = ({ title, value, currency, icon: Icon, colorClass, onClick, subtext, activeAction }: any) => (
      <div 
         onClick={onClick}
         className={`relative overflow-hidden rounded-3xl p-5 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-lg group bg-white border border-slate-100 shadow-sm ${activeAction ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
      >
         <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity ${colorClass}`}>
             <Icon size={48} />
         </div>
         <div className="relative z-10">
             <div className="flex items-center gap-2 mb-2">
                 <div className={`p-2 rounded-xl text-white shadow-md ${colorClass.replace('text-', 'bg-')}`}>
                     <Icon size={18} />
                 </div>
                 <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</span>
             </div>
             <div className="text-2xl font-extrabold text-slate-800 tracking-tight">
                 <span className="text-sm text-slate-400 mr-1 font-medium">{currency}</span>
                 {value}
             </div>
             {subtext && <div className="text-[10px] text-slate-400 font-medium mt-1">{subtext}</div>}
         </div>
      </div>
  );

  const AccountEditModal = () => {
    if (!selectedAccount) return null;
    const [name, setName] = useState(selectedAccount.name);
    const [balance, setBalance] = useState(selectedAccount.balance.toString());
    const [type, setType] = useState(selectedAccount.type);
    const [currency, setCurrency] = useState(selectedAccount.currency);
    const handleSave = () => handleSaveAccountEdit({ ...selectedAccount, name, balance: parseFloat(balance) || 0, type, currency });

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setSelectedAccount(null)}></div>
           <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 relative z-10 animate-in fade-in zoom-in-95 slide-in-from-bottom-8 duration-300 ease-out">
              <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Edit3 size={20} className="text-blue-600"/> Edit Asset</h3><button onClick={() => setSelectedAccount(null)} className="text-slate-400 hover:text-slate-600 bg-slate-100 p-1.5 rounded-full"><X size={18} /></button></div>
              <div className="space-y-4">
                  <div><label className="block text-xs font-semibold text-slate-500 mb-1">Name</label><input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full border-slate-300 rounded-lg focus:ring-blue-500 px-3 py-2 text-sm"/></div>
                  <div><label className="block text-xs font-semibold text-slate-500 mb-1">Balance</label><input type="number" value={balance} onChange={e => setBalance(e.target.value)} className="w-full border-slate-300 rounded-lg focus:ring-blue-500 px-3 py-2 text-sm font-mono"/></div>
                  <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-xs font-semibold text-slate-500 mb-1">Currency</label><select value={currency} onChange={e => setCurrency(e.target.value as Currency)} className="w-full border-slate-300 rounded-lg px-2 py-2 text-sm">{Object.values(Currency).map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                      <div><label className="block text-xs font-semibold text-slate-500 mb-1">Type</label><select value={type} onChange={e => setType(e.target.value as AccountType)} className="w-full border-slate-300 rounded-lg px-2 py-2 text-sm"><option value={AccountType.BANK}>Bank</option><option value={AccountType.INVESTMENT}>Invest</option><option value={AccountType.WALLET}>Wallet</option><option value={AccountType.PERSONAL}>Other</option></select></div>
                  </div>
              </div>
              <div className="flex gap-3 mt-8 pt-4 border-t border-slate-100">
                  <button onClick={() => handleDeleteAccount(selectedAccount.id)} className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"><Trash2 size={16} /> Delete</button>
                  <button onClick={handleSave} className="flex-[2] bg-slate-900 text-white hover:bg-slate-800 py-2.5 rounded-lg text-sm font-semibold shadow-lg shadow-slate-200">Save Changes</button>
              </div>
           </div>
        </div>
    );
  };

  const showHKD = totals.hkdCash > 0;
  const showForeign = totals.foreignCash > 0;
  const showInvest = totals.investments > 0;
  const showCredit = totals.liabilities > 0;
  const visibleCardsCount = 1 + (showHKD?1:0) + (showForeign?1:0) + (showInvest?1:0) + (showCredit?1:0);
  const gridColsClass = `grid grid-cols-2 ${visibleCardsCount >= 5 ? 'md:grid-cols-5' : visibleCardsCount === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4 mb-8`;

  // Define Tabs component
  const renderTabs = () => (
      <div className="flex items-center gap-1 bg-white p-1 rounded-2xl border border-slate-200 shadow-sm w-fit mb-2">
          <button 
            onClick={() => setActiveTab('ASSETS')}
            className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'ASSETS' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
          >
            <LayoutDashboard size={16}/> Assets
          </button>
          <button 
            onClick={() => setActiveTab('EXPENSES')}
            className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'EXPENSES' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
          >
            <Receipt size={16}/> Expenses
          </button>
      </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-10 selection:bg-blue-100">
      {selectedAccount && <AccountEditModal />}
      {isImportOpen && (
        <ImportWizard 
          onClose={() => setIsImportOpen(false)} 
          onImportSmart={handleImportSmart}
        />
      )}

      {/* HEADER */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 md:gap-0">
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-lg"><Wallet size={20} /></div>
               <div><h1 className="text-xl font-extrabold tracking-tight text-slate-900">WealthDash</h1><p className="text-xs text-slate-500 font-medium hidden md:block">Personal Asset Tracker</p></div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
             <button 
                onClick={toggleBaseCurrency} 
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg border border-slate-200 text-slate-700 text-xs font-bold hover:bg-white hover:shadow-sm transition-all"
                title="Switch Base Currency"
             >
                <RefreshCcw size={12} />
                <span>Display: {baseCurrency}</span>
             </button>

             <div className="hidden md:flex items-center gap-2 bg-slate-100/80 px-4 py-1.5 rounded-full text-xs font-bold text-slate-600 border border-slate-200" title="Exchange Rates"><Globe size={14} /><span className="font-mono">USD:{exchangeRates['USD']} • JPY:{exchangeRates['JPY']}</span></div>
             <button onClick={() => setIsImportOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 shadow-lg shadow-slate-200"><Upload size={16} /> <span className="hidden md:inline">Import</span></button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8">
            {/* STATS ROW */}
            <div className={gridColsClass}>
                {/* 1. Net Worth (Clickable) */}
                <div 
                   onClick={toggleBaseCurrency}
                   className={`col-span-2 ${visibleCardsCount <= 3 ? 'md:col-span-2' : 'md:col-span-1'} bg-gradient-to-br from-indigo-600 to-violet-600 rounded-3xl p-6 text-white shadow-xl shadow-indigo-200 relative overflow-hidden cursor-pointer group hover:scale-[1.02] active:scale-[0.98] transition-transform`}
                >
                    <div className="absolute top-0 right-0 p-4 opacity-20"><Landmark size={80} /></div>
                    <div className="relative z-10 h-full flex flex-col justify-between">
                        <div>
                           <div className="flex items-center gap-2 mb-2 opacity-90"><Sparkles size={16}/><span className="text-xs font-bold uppercase tracking-wider">Net Worth ({baseCurrency})</span></div>
                           <div className="text-3xl font-extrabold tracking-tight">
                               {totals.symbol}{totals.netWorth.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                           </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-white/20 flex justify-between items-center">
                             <span className="text-xs font-medium opacity-80 flex items-center gap-1"><RefreshCcw size={10} /> Tap to switch</span>
                             <ArrowRight size={16} className="opacity-50 group-hover:translate-x-1 transition-transform"/>
                        </div>
                    </div>
                </div>

                {/* Other Stats */}
                {showHKD && <StatCard title={`HKD Cash`} value={totals.hkdCash.toLocaleString(undefined, { maximumFractionDigits: 0 })} currency={totals.symbol} icon={Banknote} colorClass="text-cyan-500" subtext={`${baseCurrency} Equivalent`} />}
                {showForeign && <StatCard title="Foreign Cash" value={totals.foreignCash.toLocaleString(undefined, { maximumFractionDigits: 0 })} currency={totals.symbol} icon={Coins} colorClass="text-orange-500" subtext={`${baseCurrency} Equivalent`} />}
                {showInvest && <StatCard title="Investments" value={totals.investments.toLocaleString(undefined, { maximumFractionDigits: 0 })} currency={totals.symbol} icon={TrendingUp} colorClass="text-emerald-500" subtext={`${baseCurrency} Equivalent`} />}
                {showCredit && <StatCard title="Credit Cards" value={totals.liabilities.toLocaleString(undefined, { maximumFractionDigits: 0 })} currency={totals.symbol} icon={CreditCard} colorClass="text-rose-500" subtext="Outstanding" />}
            </div>
            
            {/* MAIN LAYOUT GRID (2 Columns: Left=Data (2/3), Right=Context (1/3)) */}
            {activeTab === 'ASSETS' ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* LEFT COLUMN (2/3) */}
                    <div className="lg:col-span-2 space-y-6">
                        
                        {/* TABS (Inside left column) */}
                        {renderTabs()}

                        {/* CHART or EMPTY STATE */}
                        {accounts.length === 0 ? (
                          <div className="h-[420px] bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center justify-center p-8 text-center">
                                <div className="w-20 h-20 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mb-6"><FileSpreadsheet size={40} /></div>
                                <h3 className="text-2xl font-bold text-slate-800 mb-2">Empty Portfolio</h3>
                                <p className="text-slate-500 mb-6">Import data to see your wealth visualization.</p>
                                <button onClick={() => setIsImportOpen(true)} className="px-8 py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center gap-2"><Upload size={18} /> Import Data</button>
                          </div>
                        ) : (
                          <AssetChart 
                                accounts={accounts} 
                                rateCNYtoHKD={exchangeRates['CNY'] || 1.08}
                                rates={exchangeRates} 
                                baseCurrency={baseCurrency}
                                highlightedId={highlightedAssetId}
                                onAccountClick={(id) => { const acc = accounts.find(a => a.id === id); if (acc) setSelectedAccount(acc); }}
                                onHover={(id) => setHighlightedAssetId(id)}
                          />
                        )}
                    </div>

                    {/* RIGHT COLUMN (1/3) - Sticky Sidebar */}
                    <div className="lg:col-span-1">
                        <div className="sticky top-24 space-y-6">
                            
                            {/* AI CARD (Moved to Right for Balance) */}
                            {(assetAnalysis || isAnalyzing) && (
                                <div className="bg-gradient-to-br from-slate-800 to-black rounded-3xl p-6 text-white shadow-xl relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none group-hover:bg-blue-500/30 transition-colors duration-500"></div>
                                    <div className="relative z-10">
                                        <div className="flex items-center gap-2 mb-3 text-blue-300">
                                            <Sparkles size={18} className={isAnalyzing ? "animate-spin" : ""} />
                                            <h3 className="text-xs font-bold uppercase tracking-widest">AI Financial Coach</h3>
                                        </div>
                                        <p className="text-sm leading-relaxed text-slate-200">
                                            {isAnalyzing ? "Analyzing your asset distribution and currency exposure..." : assetAnalysis}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* QUICK ADD */}
                            <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-6 md:p-8">
                                <h3 className="text-xl font-extrabold text-slate-800 mb-6 flex items-center gap-3">
                                    <div className="bg-slate-900 text-white p-2 rounded-xl"><Plus size={20}/></div>
                                    Quick Add
                                </h3>
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Asset Name</label>
                                        <input type="text" value={newAccountName} onChange={e => setNewAccountName(e.target.value)} placeholder="e.g. Cash" className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-medium focus:outline-none focus:border-blue-500 focus:bg-white transition-all"/>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Amount</label>
                                            <input type="number" value={newAccountBalance} onChange={e => setNewAccountBalance(e.target.value)} placeholder="0.00" className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-mono font-medium focus:outline-none focus:border-blue-500 focus:bg-white transition-all"/>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Currency</label>
                                            <select value={newAccountCurrency} onChange={e => setNewAccountCurrency(e.target.value as Currency)} className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-500 cursor-pointer">{Object.values(Currency).map(c => <option key={c} value={c}>{c}</option>)}</select>
                                        </div>
                                    </div>
                                    <button onClick={handleAddAccount} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 text-sm flex items-center justify-center gap-2 active:scale-[0.98] mt-2">
                                        Add Asset
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
              </div>
            ) : (
               <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                   <ExpenseTracker 
                      rateCNYtoHKD={exchangeRates['CNY'] || 1.08} 
                      transactions={transactions} 
                      analysisResult={expenseAnalysis} 
                      onClearData={handleClearTransactions}
                      headerContent={renderTabs()}
                   />
               </div>
            )}
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-8 border-t border-slate-200 flex justify-between items-center text-slate-400 text-xs mt-8">
          <div>© 2024 WealthDash. Secure & Local.</div>
          <button onClick={handleResetData} className="flex items-center gap-1 hover:text-red-500 transition-colors"><RotateCcw size={12} /> Clear Data</button>
      </footer>
    </div>
  );
};

export default App;