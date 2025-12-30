import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Wallet, 
  Plus, 
  Trash2, 
  BrainCircuit, 
  ArrowRightLeft,
  X,
  Edit3, 
  PieChart as PieChartIcon,
  FileSpreadsheet,
  RotateCcw,
  Sparkles,
  ArrowRight,
  TrendingUp,
  CreditCard
} from 'lucide-react';
import { Account, AccountType, Currency, INITIAL_ACCOUNTS } from './types';
import { fetchExchangeRate, analyzePortfolio } from './services/geminiService';
import { AssetChart } from './components/AssetChart';
import { ExcelGenerator } from './components/ExcelGenerator';

// Initial assumed rate
const DEFAULT_RATE = 1.08; 
// Updated key to v7 to reset data for the user
const STORAGE_KEY = 'wealthdash_data_user_v7';

const App: React.FC = () => {
  // --- STATE ---
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
        return parsed.accounts || INITIAL_ACCOUNTS;
      }
    } catch (e) {
      console.warn("Failed to load data, resetting to defaults", e);
    }
    return INITIAL_ACCOUNTS;
  });

  const [rateCNYtoHKD, setRateCNYtoHKD] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const r = parseFloat(parsed.rate);
        return isNaN(r) ? DEFAULT_RATE : r;
      }
    } catch (e) {}
    return DEFAULT_RATE;
  });

  const [baseCurrency, setBaseCurrency] = useState<Currency>(Currency.HKD);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [isLoadingRate, setIsLoadingRate] = useState(false);
  
  // New Interactive States
  const [activeFocus, setActiveFocus] = useState<'NET' | 'HKD' | 'CNY' | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [highlightedAssetId, setHighlightedAssetId] = useState<string | null>(null); // New state for linking chart & list
  const [isExcelGeneratorOpen, setIsExcelGeneratorOpen] = useState(false);

  // File input ref for import
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Account State for "Quick Add"
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountBalance, setNewAccountBalance] = useState("");
  const [newAccountCurrency, setNewAccountCurrency] = useState<Currency>(Currency.HKD);
  const [newAccountType, setNewAccountType] = useState<AccountType>(AccountType.BANK);

  // --- EFFECTS ---
  useEffect(() => {
    const dataToSave = {
      accounts,
      rate: rateCNYtoHKD,
      lastUpdated: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
  }, [accounts, rateCNYtoHKD]);

  // --- CALCULATIONS ---
  const totals = useMemo(() => {
    let hkdTotal = 0;
    let cnyTotal = 0;
    const safeRate = isNaN(rateCNYtoHKD) || rateCNYtoHKD <= 0 ? 1 : rateCNYtoHKD;

    accounts.forEach(acc => {
      const bal = typeof acc.balance === 'number' ? acc.balance : 0;
      if (acc.currency === Currency.HKD) hkdTotal += bal;
      if (acc.currency === Currency.CNY) cnyTotal += bal;
    });

    const totalInHKD = hkdTotal + (cnyTotal * safeRate);
    const totalInCNY = cnyTotal + (hkdTotal / safeRate);

    return { hkdTotal, cnyTotal, totalInHKD, totalInCNY };
  }, [accounts, rateCNYtoHKD]);

  // Focus Data Logic
  const focusData = useMemo(() => {
    if (!activeFocus) return null;
    let data = { title: '', amount: 0, currencySymbol: '', assets: [] as Account[] };
    const safeRate = isNaN(rateCNYtoHKD) || rateCNYtoHKD <= 0 ? 1 : rateCNYtoHKD;
    
    if (activeFocus === 'NET') {
      data.title = 'Net Worth Breakdown';
      data.amount = baseCurrency === Currency.HKD ? totals.totalInHKD : totals.totalInCNY;
      data.currencySymbol = baseCurrency === Currency.HKD ? '$' : '¥';
      data.assets = [...accounts].sort((a, b) => {
        const valA = a.currency === Currency.CNY ? a.balance * safeRate : a.balance;
        const valB = b.currency === Currency.CNY ? b.balance * safeRate : b.balance;
        return valB - valA;
      });
    } else if (activeFocus === 'HKD') {
      data.title = 'HKD Assets';
      data.amount = totals.hkdTotal;
      data.currencySymbol = '$';
      data.assets = accounts.filter(a => a.currency === Currency.HKD).sort((a, b) => b.balance - a.balance);
    } else if (activeFocus === 'CNY') {
      data.title = 'CNY Assets';
      data.amount = totals.cnyTotal;
      data.currencySymbol = '¥';
      data.assets = accounts.filter(a => a.currency === Currency.CNY).sort((a, b) => b.balance - a.balance);
    }
    return data;
  }, [activeFocus, accounts, totals, baseCurrency, rateCNYtoHKD]);


  // --- HANDLERS ---
  const handleUpdateRate = async () => {
    setIsLoadingRate(true);
    const rate = await fetchExchangeRate();
    if (rate) {
      setRateCNYtoHKD(rate);
    }
    setIsLoadingRate(false);
  };

  const toggleCurrency = (e?: React.MouseEvent) => {
    e?.stopPropagation(); 
    setBaseCurrency(prev => prev === Currency.HKD ? Currency.CNY : Currency.HKD);
  };

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    const result = await analyzePortfolio(accounts, totals.totalInHKD);
    setAiAnalysis(result);
    setIsAnalyzing(false);
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

  const handleImportToApp = (newAccounts: Account[], extractedRate?: number) => {
    setAccounts(newAccounts);
    if (extractedRate) {
        setRateCNYtoHKD(extractedRate);
    }
    setIsExcelGeneratorOpen(false);
  };

  const handleResetData = () => {
    if(window.confirm("This will clear all your data. Continue?")) {
        // Reset local storage
        localStorage.removeItem(STORAGE_KEY);
        // Reset all states to initial defaults
        setAccounts([]);
        setRateCNYtoHKD(DEFAULT_RATE);
        setAiAnalysis("");
        setActiveFocus(null);
        setSelectedAccount(null);
        setHighlightedAssetId(null);
        setNewAccountName("");
        setNewAccountBalance("");
    }
  };

  // --- SUB-COMPONENTS ---
  const FocusModal = () => {
     if (!focusData) return null;
     const safeRate = isNaN(rateCNYtoHKD) || rateCNYtoHKD <= 0 ? 1 : rateCNYtoHKD;
     return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setActiveFocus(null)}></div>
           <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] shadow-2xl overflow-hidden relative z-10 animate-in fade-in zoom-in-95 slide-in-from-bottom-8 duration-300 flex flex-col">
              <div className={`p-8 pb-12 text-white relative ${activeFocus === 'NET' ? 'bg-gradient-to-br from-blue-900 to-slate-900' : activeFocus === 'HKD' ? 'bg-gradient-to-br from-blue-600 to-blue-800' : 'bg-gradient-to-br from-amber-500 to-orange-600'}`}>
                  <button onClick={() => setActiveFocus(null)} className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 p-2 rounded-full backdrop-blur-sm transition-colors"><X size={20} /></button>
                  <div className="flex items-center gap-2 mb-2 text-white/80 font-semibold text-sm tracking-wider uppercase"><PieChartIcon size={16} />{focusData.title}</div>
                  <div className="text-5xl font-bold tracking-tight">{focusData.currencySymbol} {focusData.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 -mt-6 bg-white rounded-t-3xl relative">
                  <div className="space-y-6">
                      {focusData.assets.map(asset => {
                          const val = activeFocus === 'NET' && asset.currency === Currency.CNY && baseCurrency === Currency.HKD 
                            ? asset.balance * safeRate 
                            : (activeFocus === 'NET' && asset.currency === Currency.HKD && baseCurrency === Currency.CNY ? asset.balance / safeRate : asset.balance);
                          const percentage = focusData.amount > 0 ? (val / focusData.amount) * 100 : 0;
                          return (
                              <div key={asset.id} className="group cursor-pointer" onClick={() => { setActiveFocus(null); setSelectedAccount(asset); }}>
                                  <div className="flex justify-between items-end mb-1">
                                      <div className="font-bold text-slate-800 flex items-center gap-2 group-hover:text-blue-600 transition-colors">{asset.name}</div>
                                      <div className="text-sm font-mono font-medium text-slate-600 group-hover:text-blue-600 transition-colors">{focusData.currencySymbol} {val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                  </div>
                                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden"><div className={`h-full rounded-full ${asset.currency === Currency.HKD ? 'bg-blue-500' : 'bg-amber-500'}`} style={{width: `${percentage}%`}}></div></div>
                              </div>
                          );
                      })}
                  </div>
              </div>
           </div>
        </div>
     );
  };

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
                      <div><label className="block text-xs font-semibold text-slate-500 mb-1">Currency</label><select value={currency} onChange={e => setCurrency(e.target.value as Currency)} className="w-full border-slate-300 rounded-lg px-2 py-2 text-sm"><option value={Currency.HKD}>HKD</option><option value={Currency.CNY}>CNY</option></select></div>
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

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-10 selection:bg-blue-100">
      <input type="file" ref={fileInputRef} onChange={() => {}} className="hidden" accept=".json"/>
      {activeFocus && <FocusModal />}
      {selectedAccount && <AccountEditModal />}
      {isExcelGeneratorOpen && <ExcelGenerator rateCNYtoHKD={rateCNYtoHKD} onClose={() => setIsExcelGeneratorOpen(false)} onUpdateApp={handleImportToApp}/>}

      {/* HEADER */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-lg"><Wallet size={20} /></div>
            <div><h1 className="text-xl font-extrabold tracking-tight text-slate-900">WealthDash</h1><p className="text-xs text-slate-500 font-medium hidden md:block">Personal Asset Tracker</p></div>
          </div>
          <div className="flex items-center gap-3">
             <div className="hidden md:flex items-center gap-2 bg-slate-100/80 px-4 py-1.5 rounded-full text-xs font-bold text-slate-600 border border-slate-200"><ArrowRightLeft size={14} /><span className="font-mono">1 CNY = {rateCNYtoHKD.toFixed(3)} HKD</span></div>
             <button onClick={toggleCurrency} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-3 py-2 rounded-lg text-sm font-bold shadow-sm">{baseCurrency}</button>
             <button onClick={() => setIsExcelGeneratorOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-200"><FileSpreadsheet size={16} /> <span className="hidden md:inline">Import</span></button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        
        {/* TOP ROW: AI & TOTALS */}
        {/* Total Wealth Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div onClick={() => setActiveFocus('NET')} className="group cursor-pointer bg-slate-900 rounded-3xl p-8 text-white shadow-2xl shadow-slate-900/20 relative overflow-hidden flex flex-col justify-center min-h-[160px]">
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-4 text-slate-400"><Wallet size={16} /><span className="text-xs font-bold uppercase tracking-wider">Net Worth</span></div>
                <div className="text-4xl font-extrabold mb-2 tracking-tight">{baseCurrency === Currency.HKD ? `$ ${totals.totalInHKD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `¥ ${totals.totalInCNY.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</div>
                <div className="text-slate-500 text-xs font-medium">Click for breakdown</div>
              </div>
          </div>
          <div className="md:col-span-2 flex flex-col gap-6">
             {/* AI Section */}
             <div className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-3xl p-6 text-white shadow-lg shadow-indigo-200 relative overflow-hidden">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 h-full relative z-10">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <BrainCircuit size={20} className="text-indigo-200" />
                            <h3 className="font-bold text-lg">AI Wealth Insights</h3>
                        </div>
                        <p className="text-indigo-100 text-sm leading-relaxed max-w-2xl line-clamp-2 md:line-clamp-none">
                             {aiAnalysis || "Unlock personalized insights about your portfolio diversification and currency risk."}
                        </p>
                    </div>
                    <button onClick={handleRunAnalysis} disabled={isAnalyzing || accounts.length === 0} className="bg-white text-indigo-600 font-bold px-6 py-3 rounded-xl text-sm hover:bg-indigo-50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center gap-2 justify-center">
                        {isAnalyzing ? <><Sparkles className="animate-spin" size={16}/> Analyzing...</> : "Analyze Portfolio"}
                    </button>
                </div>
            </div>
          </div>
        </div>

        {/* MIDDLE ROW: CHART & QUICK ADD (Side-by-Side) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
            
            {/* LEFT: CHART (8/12) */}
            <div className="lg:col-span-8">
                {accounts.length === 0 ? (
                   <div className="bg-white rounded-3xl border-2 border-dashed border-slate-300 p-12 flex flex-col items-center justify-center text-center h-[420px]">
                       <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-6 animate-bounce">
                           <Plus size={32} />
                       </div>
                       <h3 className="text-xl font-bold text-slate-800 mb-2">Welcome to WealthDash</h3>
                       <p className="text-slate-500 mb-6 max-w-md">Start by adding your first asset on the right, or use the tool below to import data.</p>
                       <button onClick={() => setIsExcelGeneratorOpen(true)} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all active:scale-95">
                           <FileSpreadsheet size={18} /> Import Excel File
                       </button>
                   </div>
                ) : (
                   <div className="h-full">
                      <AssetChart 
                        accounts={accounts} 
                        rateCNYtoHKD={rateCNYtoHKD} 
                        highlightedId={highlightedAssetId}
                        onAccountClick={(id) => { const acc = accounts.find(a => a.id === id); if (acc) setSelectedAccount(acc); }} 
                      />
                   </div>
                )}
            </div>

            {/* RIGHT: QUICK ADD (4/12) - Magnified & Aligned */}
            <div className="lg:col-span-4">
                <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-8 h-full flex flex-col justify-center relative overflow-hidden">
                    <h3 className="text-xl font-extrabold text-slate-800 mb-6 flex items-center gap-3">
                        <div className="bg-slate-900 text-white p-2 rounded-xl"><Plus size={24}/></div>
                        Quick Add Asset
                    </h3>
                    <div className="space-y-5">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Asset Name</label>
                            <input type="text" value={newAccountName} onChange={e => setNewAccountName(e.target.value)} placeholder="e.g. HSBC Savings" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-base font-medium focus:outline-none focus:border-blue-500 focus:bg-white transition-all"/>
                        </div>
                        <div className="flex gap-3">
                            <div className="flex-1 space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Balance</label>
                                <input type="number" value={newAccountBalance} onChange={e => setNewAccountBalance(e.target.value)} placeholder="0.00" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-base font-mono font-medium focus:outline-none focus:border-blue-500 focus:bg-white transition-all"/>
                            </div>
                            <div className="w-1/3 space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Curr</label>
                                <select value={newAccountCurrency} onChange={e => setNewAccountCurrency(e.target.value as Currency)} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-base font-bold focus:outline-none focus:border-blue-500 cursor-pointer h-[58px]"><option value={Currency.HKD}>HKD</option><option value={Currency.CNY}>CNY</option></select>
                            </div>
                        </div>
                        <button onClick={handleAddAccount} className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 text-base flex items-center justify-center gap-2 active:scale-[0.98]">
                            Add to Portfolio <ArrowRight size={20} />
                        </button>
                    </div>
                </div>
            </div>
        </div>

        {/* BOTTOM ROW: ASSET LIST (Centered Grid) */}
        <div className="max-w-6xl mx-auto">
             <div className="flex items-center justify-between mb-6 px-2">
                 <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><CreditCard size={24} className="text-slate-400"/> Your Assets</h3>
                 <span className="text-sm font-bold bg-white border border-slate-200 text-slate-600 px-3 py-1 rounded-full shadow-sm">{accounts.length} Accounts</span>
             </div>
             
             {accounts.length === 0 ? (
                 <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 shadow-sm">
                     <p className="text-slate-400">No assets tracked yet.</p>
                 </div>
             ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                     {accounts.map(acc => (
                         <div 
                           key={acc.id} 
                           onClick={() => setSelectedAccount(acc)} 
                           onMouseEnter={() => setHighlightedAssetId(acc.id)}
                           onMouseLeave={() => setHighlightedAssetId(null)}
                           className={`bg-white p-5 rounded-2xl border shadow-sm cursor-pointer transition-all group relative overflow-hidden ${highlightedAssetId === acc.id ? 'border-blue-400 shadow-md scale-[1.02] ring-2 ring-blue-100' : 'border-slate-200 hover:shadow-md hover:border-blue-300'}`}
                         >
                             <div className={`absolute top-0 left-0 w-1 h-full ${acc.currency === Currency.HKD ? 'bg-blue-500' : 'bg-amber-500'}`}></div>
                             <div className="flex justify-between items-start mb-3 pl-2">
                                 <div className="font-bold text-slate-700 text-base line-clamp-1 group-hover:text-blue-700 transition-colors">{acc.name}</div>
                                 <div className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide ${acc.currency === Currency.HKD ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>{acc.currency}</div>
                             </div>
                             <div className="pl-2">
                                 <div className="text-xs text-slate-400 mb-0.5">{acc.type}</div>
                                 <div className="font-mono font-bold text-xl text-slate-800">{acc.balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                             </div>
                         </div>
                     ))}
                 </div>
             )}
        </div>

      </main>

      {/* FOOTER */}
      <footer className="max-w-7xl mx-auto px-6 py-8 border-t border-slate-200 flex justify-between items-center text-slate-400 text-xs mt-8">
          <div>© 2024 WealthDash. Secure & Local.</div>
          <button onClick={handleResetData} className="flex items-center gap-1 hover:text-red-500 transition-colors"><RotateCcw size={12} /> Clear Data</button>
      </footer>
    </div>
  );
};

export default App;