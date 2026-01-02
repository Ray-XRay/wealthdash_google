import React, { useState, useRef, useEffect } from 'react';
import { read, utils } from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import { Account, AccountType, Currency, Transaction } from '../types';
import { smartParseDocument } from '../services/geminiService';
import { Upload, X, Loader2, AlertCircle, CheckCircle, ArrowRight, FileText, Receipt, Sparkles } from 'lucide-react';

// --- ROBUST PDFJS IMPORT RESOLUTION ---
const getPdfLib = () => {
  const lib = pdfjsLib as any;
  if (lib.getDocument) return lib;
  if (lib.default && lib.default.getDocument) return lib.default;
  return null;
};

const pdfLib = getPdfLib();

interface ImportWizardProps {
  onClose: () => void;
  onImportSmart: (data: { accounts: Partial<Account>[], transactions: Transaction[] }) => void;
}

export const ImportWizard: React.FC<ImportWizardProps> = ({ onClose, onImportSmart }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  
  // State for Smart Preview
  const [foundAccounts, setFoundAccounts] = useState<Partial<Account>[]>([]);
  const [foundTransactions, setFoundTransactions] = useState<Transaction[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Configure Worker on mount
  useEffect(() => {
    if (pdfLib && typeof window !== 'undefined') {
        pdfLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;
    }
  }, []);

  // --- HELPER: CLEAN EXCEL VALUES ---
  const cleanAmount = (val: any): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    const str = String(val).trim();
    if (str === '-' || str === '') return 0;
    const cleaned = str.replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  const guessType = (name: string): AccountType => {
    const n = name.toUpperCase();
    if (/INVEST|STOCK|FUND|SECUR|TRADE|LONGBRIDGE|FUTU|TIGER|IBKR|证券|股票|基金|投资|长桥|富途|老虎/.test(n)) return AccountType.INVESTMENT;
    if (/WALLET|PAY|ALIPAY|WECHAT|OCTOPUS|PAYME|MOX|ZA|LIVI|钱包|支付|微信|支付宝|八达通/.test(n)) return AccountType.WALLET;
    if (/PERSONAL|CASH|LOAN|OTHER|LEND|BORROW|私房|借出|现金|其他|森宇|波仔/.test(n)) return AccountType.PERSONAL;
    return AccountType.BANK;
  };

  const guessCurrency = (context: string): Currency => {
    const s = context.toUpperCase();
    if (/JPY|YEN|円|日元|JP¥/.test(s)) return Currency.JPY;
    if (/USD|US DOLLAR|美元|US\$|美金/.test(s)) return Currency.USD;
    if (/CNY|RMB|CNH|人民币|¥/.test(s)) return Currency.CNY; // ¥ can be ambiguous, usually CNY in this context unless 'JP' is present
    if (/EUR|EURO|欧元|€/.test(s)) return Currency.EUR;
    if (/GBP|POUND|英镑|£/.test(s)) return Currency.GBP;
    if (/AUD|AU DOLLAR|澳元/.test(s)) return Currency.AUD;
    if (/CAD|CA DOLLAR|加元/.test(s)) return Currency.CAD;
    if (/SGD|SG DOLLAR|新币|坡币/.test(s)) return Currency.SGD;
    return Currency.HKD; // Default
  };

  // --- EXCEL PARSING (BULK ASSETS - FALLBACK) ---
  const handleExcelImport = async (buffer: ArrayBuffer) => {
      setStatusMessage("Parsing Excel Asset List...");
      const wb = read(buffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawData = utils.sheet_to_json(ws, { header: 1 }) as any[][];

      if (!rawData || rawData.length < 2) throw new Error("Excel file seems empty.");

      // Parse Accounts logic ...
      const headerRowIdx = rawData.findIndex(row => row.some(c => /NAME|ACCOUNT|BALANCE|AMOUNT|账户|余额/.test(String(c).toUpperCase())));
      const startRow = headerRowIdx === -1 ? 0 : headerRowIdx;
      const findIdx = (keywords: string[]) => rawData[startRow].map(s => String(s).toLowerCase()).findIndex(h => keywords.some(k => h.includes(k)));
      
      let nameIdx = findIdx(['name', 'account', 'item', '账户', '名称']);
      let balanceIdx = findIdx(['balance', 'amount', 'value', '余额']);
      let currencyIdx = findIdx(['currency', 'curr', 'type', '币种']);
      
      if (nameIdx === -1) nameIdx = 0;
      if (balanceIdx === -1) balanceIdx = 1; 

      const parsedAccounts = rawData.slice(startRow + 1).map((row, idx) => {
          if (!row || !row[nameIdx]) return null;
          const name = String(row[nameIdx]).trim();
          const bal = cleanAmount(row[balanceIdx]);
          if (!name || bal <= 0) return null;
          
          let cur = Currency.HKD;
          const curStr = currencyIdx !== -1 ? String(row[currencyIdx]) : '';
          const context = (name + " " + curStr).toUpperCase();
          cur = guessCurrency(context);

          return { id: `gen-${idx}-${Date.now()}`, name, balance: bal, currency: cur, type: guessType(name) };
      }).filter((a): a is Account => a !== null);

      if (parsedAccounts.length === 0) throw new Error("No valid assets found in Excel.");
      
      if (parsedAccounts.length > 0) {
          setFoundAccounts(parsedAccounts);
      }
      setIsProcessing(false);
  };

  // --- PDF PARSING ---
  const extractPdfImages = async (buffer: ArrayBuffer): Promise<string[]> => {
      if (!pdfLib) throw new Error("PDF Library could not be loaded. Please refresh.");
      
      const loadingTask = pdfLib.getDocument({ 
          data: buffer,
          cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
          cMapPacked: true,
      });

      const pdf = await loadingTask.promise;
      const maxPages = Math.min(pdf.numPages, 3); // Scan up to 3 pages for transactions
      const images: string[] = [];

      for (let i = 1; i <= maxPages; i++) {
          setStatusMessage(`Scanning page ${i}/${maxPages}...`);
          const page = await pdf.getPage(i);
          // Scale 2.0 is sufficient for text and keeps payload size manageable
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          if (context) {
              await page.render({ canvasContext: context, viewport } as any).promise;
              // Use JPEG with 0.8 quality to drastically reduce size compared to PNG
              images.push(canvas.toDataURL('image/jpeg', 0.8));
          }
      }
      return images;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setErrorMsg("");
    setFoundAccounts([]);
    setFoundTransactions([]);
    setStatusMessage("Reading file...");

    try {
        const buffer = await file.arrayBuffer();
        
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            const images = await extractPdfImages(buffer);
            setStatusMessage("AI is analyzing document (Balances & Transactions)...");
            
            const result = await smartParseDocument(images);
            
            if (result.accounts.length === 0 && result.transactions.length === 0) {
                throw new Error("AI couldn't find any financial data.");
            }

            setFoundAccounts(result.accounts);
            setFoundTransactions(result.transactions);

        } else {
             // Fallback for Excel
             await handleExcelImport(buffer); 
        }
        setIsProcessing(false);
    } catch (err: any) {
        console.error("Import error details:", err);
        setErrorMsg(err.message || "Failed to process file.");
        setIsProcessing(false);
    }
  };

  const handleConfirm = () => {
    // onImportSmart now expects an array
    onImportSmart({
        accounts: foundAccounts,
        transactions: foundTransactions
    });
    onClose();
  };

  const hasData = foundAccounts.length > 0 || foundTransactions.length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}></div>
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden relative z-10 animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
          
          {/* Header */}
          <div className="p-6 bg-white border-b border-slate-100 flex justify-between items-center">
             <div>
                 <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                    <Sparkles size={20} className="text-blue-500" /> Smart Import
                 </h2>
                 <p className="text-sm text-slate-500">Upload statement, let AI do the rest.</p>
             </div>
             <button onClick={onClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors text-slate-500"><X size={18}/></button>
          </div>

          {/* Body */}
          <div className="p-8 overflow-y-auto">
              
              {hasData ? (
                  <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6">
                      
                      {/* 1. Account Preview */}
                      {foundAccounts.length > 0 && (
                        <div className="space-y-3">
                           <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-full"><CheckCircle size={16} /></div>
                                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Assets Found ({foundAccounts.length})</span>
                           </div>
                           {foundAccounts.map((acc, idx) => (
                                <div key={idx} className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex justify-between items-center relative overflow-hidden">
                                    <div>
                                        <div className="font-bold text-slate-800">{acc.name}</div>
                                        <div className="text-xs text-slate-500">{acc.type}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-lg font-extrabold text-slate-900">
                                            {acc.currency} {acc.balance?.toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                           ))}
                        </div>
                      )}

                      {/* 2. Transactions Preview */}
                      {foundTransactions.length > 0 && (
                          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
                              <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-3">
                                      <div className="p-2 bg-blue-100 text-blue-600 rounded-full"><Receipt size={16} /></div>
                                      <span className="text-xs font-bold text-blue-600 uppercase tracking-wide">Transactions Found</span>
                                  </div>
                                  <span className="bg-white text-blue-600 px-2 py-1 rounded text-xs font-bold shadow-sm">{foundTransactions.length} items</span>
                              </div>
                              
                              <div className="bg-white/60 rounded-xl overflow-hidden max-h-[180px] overflow-y-auto border border-blue-100/50">
                                  {foundTransactions.slice(0, 5).map((t, i) => (
                                      <div key={i} className="flex justify-between items-center p-3 border-b border-blue-100/50 text-sm last:border-0">
                                          <div className="truncate pr-2">
                                              <div className="font-medium text-slate-700 truncate">{t.description}</div>
                                              <div className="text-[10px] text-slate-400">{t.category}</div>
                                          </div>
                                          <div className={`font-mono font-bold text-xs ${t.amount < 0 ? 'text-slate-800' : 'text-green-600'}`}>
                                              {t.amount < 0 ? `-$${Math.abs(t.amount)}` : `+$${t.amount}`}
                                          </div>
                                      </div>
                                  ))}
                                  {foundTransactions.length > 5 && (
                                      <div className="text-center py-2 text-xs text-blue-400 italic">+{foundTransactions.length - 5} more...</div>
                                  )}
                              </div>
                          </div>
                      )}

                      <button onClick={handleConfirm} className="w-full py-4 rounded-xl bg-slate-900 text-white font-bold text-lg shadow-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                          Confirm & Import <ArrowRight size={20} />
                      </button>
                  </div>
              ) : !isProcessing ? (
                  /* UPLOAD STATE */
                  <div className="flex flex-col items-center justify-center min-h-[220px] border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-colors group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4 bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-600 group-hover:scale-110 transition-transform shadow-sm">
                          <Upload size={32} />
                      </div>
                      <h3 className="font-bold text-slate-700 text-lg mb-1">Click to Upload Statement</h3>
                      <p className="text-sm text-slate-400 text-center max-w-xs mb-6 px-4">
                          Supports <strong>PDF</strong> or <strong>Excel</strong>.
                          <br/><span className="text-xs text-slate-300 mt-1 block">AI will detect assets and expenses automatically.</span>
                      </p>
                      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".pdf,.xlsx,.xls" className="hidden" />
                  </div>
              ) : (
                  /* PROCESSING STATE */
                  <div className="flex flex-col items-center justify-center min-h-[240px]">
                      <div className="relative mb-6">
                         <div className="w-16 h-16 border-4 border-slate-100 border-t-blue-500 rounded-full animate-spin"></div>
                         <div className="absolute inset-0 flex items-center justify-center text-blue-500"><Loader2 size={24} className="animate-spin" /></div>
                      </div>
                      <h3 className="font-bold text-slate-800 text-lg animate-pulse">{statusMessage}</h3>
                      <p className="text-slate-400 text-xs mt-2 font-mono">Analyzing with Gemini AI...</p>
                  </div>
              )}

              {errorMsg && (
                  <div className="mt-6 bg-red-50 text-red-600 p-4 rounded-xl flex items-start gap-3 text-sm animate-in shake">
                      <AlertCircle className="shrink-0 mt-0.5" size={16} />
                      <span>{errorMsg}</span>
                  </div>
              )}
          </div>
      </div>
    </div>
  );
};