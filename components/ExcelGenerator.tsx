import React, { useState, useRef } from 'react';
import { read, utils } from 'xlsx';
import ExcelJS from 'exceljs';
import html2canvas from 'html2canvas';
import { AssetChart } from './AssetChart';
import { Account, AccountType, Currency } from '../types';
import { Upload, Download, X, FileSpreadsheet, Loader2, AlertCircle, RefreshCw, Image } from 'lucide-react';

interface ExcelGeneratorProps {
  rateCNYtoHKD: number;
  onClose: () => void;
  // Updated signature to pass back the found rate
  onUpdateApp?: (accounts: Account[], extractedRate?: number) => void;
}

export const ExcelGenerator: React.FC<ExcelGeneratorProps> = ({ rateCNYtoHKD, onClose, onUpdateApp }) => {
  const [uploadedAccounts, setUploadedAccounts] = useState<Account[]>([]);
  const [extractedRate, setExtractedRate] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [debugInfo, setDebugInfo] = useState<string>("");
  
  const dashboardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (/INVEST|STOCK|FUND|SECUR|TRADE|LONGBRIDGE|FUTU|TIGER|证券|股票|基金|投资|长桥|富途|老虎/.test(n)) return AccountType.INVESTMENT;
    if (/WALLET|PAY|ALIPAY|WECHAT|OCTOPUS|PAYME|MOX|ZA|LIVI|钱包|支付|微信|支付宝|八达通/.test(n)) return AccountType.WALLET;
    if (/PERSONAL|CASH|LOAN|OTHER|LEND|BORROW|私房|借出|现金|其他|森宇|波仔/.test(n)) return AccountType.PERSONAL;
    return AccountType.BANK;
  };

  const parseExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setErrorMsg("");
    setDebugInfo("");
    setExtractedRate(null);
    setIsProcessing(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = read(arrayBuffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawData = utils.sheet_to_json(ws, { header: 1 }) as any[][];

      if (!rawData || rawData.length < 2) {
        throw new Error("文件内容为空或格式不正确");
      }

      let parsedAccounts: Account[] = [];
      let foundRate: number | null = null;
      let usedMethod = "";

      // --- 1. SEARCH FOR EXCHANGE RATE ---
      // Strategy: Look for specific keywords like "Rate", "FX", "HKD/CNH"
      for (let r = 0; r < rawData.length; r++) {
        const row = rawData[r];
        for (let c = 0; c < row.length; c++) {
            const cellStr = String(row[c]).toUpperCase();
            
            // Case A: Found "Rate" header, check value below it
            if ((cellStr === 'RATE' || cellStr === '汇率') && r + 1 < rawData.length) {
                const val = cleanAmount(rawData[r+1][c]);
                if (val > 0) { foundRate = val; break; }
            }
            
            // Case B: Found "HKD/CNH" or similar pair, check value to the right or below
            if (cellStr.includes('HKD/CNH') || cellStr.includes('HKD/CNY')) {
                // Check right
                if (c + 1 < row.length) {
                    const valRight = cleanAmount(row[c+1]);
                    if (valRight > 0) { foundRate = valRight; break; }
                }
                // Check below
                if (r + 1 < rawData.length) {
                    const valBelow = cleanAmount(rawData[r+1][c]);
                    if (valBelow > 0) { foundRate = valBelow; break; }
                }
            }
        }
        if (foundRate) break;
      }

      // Convert Rate Logic:
      // The app uses Rate = How many HKD for 1 CNY (e.g. 1.08)
      // If found rate is < 1.0 (e.g. 0.90), it is likely HKD/CNH (1 HKD = 0.9 CNY). 
      // So we invert it: 1 / 0.90 = 1.11
      if (foundRate) {
        if (foundRate < 1.0) {
            foundRate = 1 / foundRate;
        }
        // If foundRate is > 1.0 (e.g. 1.11), assume it is already CNY->HKD or HKD/CNY pair expressed correctly for our math.
        setExtractedRate(foundRate);
      }

      // --- 2. PARSE ACCOUNTS ---
      const bankAcRowIndex = rawData.findIndex(row => 
        row.some(cell => String(cell).toUpperCase().includes("BANK AC"))
      );

      if (bankAcRowIndex !== -1) {
        usedMethod = "Matrix Template (BANK AC)";
        const headerRow = rawData[bankAcRowIndex].map(c => String(c).toUpperCase().trim());
        
        const colName = headerRow.findIndex(c => c.includes("BANK AC"));
        const colHKD = headerRow.findIndex(c => c === "HKD");
        const colCNH = headerRow.findIndex(c => c === "CNH"); 
        const colCNY = headerRow.findIndex(c => c === "CNY");

        for (let i = bankAcRowIndex + 1; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row || row.length === 0) continue;
          const rawName = row[colName];
          if (!rawName) continue;
          const nameStr = String(rawName).trim();
          if (/Total|Balance|汇总|合计/.test(nameStr)) break; 
          if (nameStr === '-' || nameStr === '') continue;

          const type = guessType(nameStr);

          if (colHKD !== -1) {
            const val = cleanAmount(row[colHKD]);
            if (val > 0) parsedAccounts.push({ id: `mat-${i}-hkd`, name: nameStr, balance: val, currency: Currency.HKD, type });
          }
          if (colCNH !== -1) {
            const val = cleanAmount(row[colCNH]);
            if (val > 0) parsedAccounts.push({ id: `mat-${i}-cnh`, name: `${nameStr} (CNH)`, balance: val, currency: Currency.CNY, type });
          }
          if (colCNY !== -1) {
            const val = cleanAmount(row[colCNY]);
            if (val > 0) parsedAccounts.push({ id: `mat-${i}-cny`, name: colCNH !== -1 && row[colCNH] ? `${nameStr} (CNY)` : nameStr, balance: val, currency: Currency.CNY, type });
          }
        }
      } else {
        usedMethod = "Generic List Mode";
        // Fallback logic for simple lists...
        const headerRowIdx = rawData.findIndex(row => row.some(c => /NAME|ACCOUNT|BALANCE|AMOUNT|账户|余额/.test(String(c).toUpperCase())));
        const startRow = headerRowIdx === -1 ? 0 : headerRowIdx;
        const headerRow = rawData[startRow].map(cell => String(cell).trim().toLowerCase());
        const findIdx = (keywords: string[]) => headerRow.findIndex(h => keywords.some(k => h.includes(k)));
        
        let nameIdx = findIdx(['name', 'account', 'item', '账户', '名称']);
        let balanceIdx = findIdx(['balance', 'amount', 'value', '余额']);
        let currencyIdx = findIdx(['currency', 'curr', 'type', '币种']);
        if (nameIdx === -1) nameIdx = 0;
        if (balanceIdx === -1 && rawData.length > startRow + 1) {
            balanceIdx = rawData[startRow + 1].findIndex((c: any) => typeof cleanAmount(c) === 'number' && cleanAmount(c) > 0);
        }

        parsedAccounts = rawData.slice(startRow + 1).map((row, idx): Account | null => {
            if (!row || !row[nameIdx]) return null;
            const name = String(row[nameIdx]).trim();
            const bal = cleanAmount(row[balanceIdx]);
            if (!name || bal <= 0) return null;
            let cur: Currency = Currency.HKD;
            const curStr = currencyIdx !== -1 ? String(row[currencyIdx]).toUpperCase() : '';
            const context = (name + curStr + String(row[balanceIdx] || '')).toUpperCase();
            if (/CNY|RMB|CNH|人民币|¥/.test(context) && !/HKD|HK|港币/.test(context.replace(/CNY|RMB|人民币|¥/,''))) cur = Currency.CNY;
            return { id: `gen-${idx}`, name, balance: bal, currency: cur, type: guessType(name) };
        }).filter((a): a is Account => a !== null);
      }

      if (parsedAccounts.length === 0) throw new Error("未找到有效数据");
      setUploadedAccounts(parsedAccounts);
      setDebugInfo(`Found ${parsedAccounts.length} assets. ${foundRate ? `Rate found: ${foundRate.toFixed(4)}` : 'No rate found.'}`);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "文件解析失败");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImportToApp = () => {
    if (onUpdateApp && uploadedAccounts.length > 0) {
       // Pass extracted rate if it exists, otherwise undefined (App will keep current rate)
       onUpdateApp(uploadedAccounts, extractedRate || undefined);
    }
  };

  const handleDownloadImage = async () => {
    if (!dashboardRef.current) return;
    setIsProcessing(true);
    try {
       const canvas = await html2canvas(dashboardRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
       const url = canvas.toDataURL('image/png');
       const link = document.createElement('a');
       link.href = url;
       link.download = `WealthDash_Snapshot_${new Date().toISOString().split('T')[0]}.png`;
       link.click();
    } catch (err) {
       console.error(err);
       setErrorMsg("图片保存失败");
    } finally {
       setIsProcessing(false);
    }
  };

  const generateAndDownloadExcel = async () => {
    if (!uploadedAccounts.length) return;
    setIsProcessing(true);
    try {
      if (!dashboardRef.current) throw new Error("Dashboard view not found.");
      const canvas = await html2canvas(dashboardRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imageBase64 = canvas.toDataURL('image/png', 1.0);
      const workbook = new ExcelJS.Workbook();
      const dashboardSheet = workbook.addWorksheet('Visual Dashboard');
      const imageId = workbook.addImage({ base64: imageBase64, extension: 'png' });
      dashboardSheet.addImage(imageId, { tl: { col: 1, row: 1 }, br: { col: 12, row: 40 } });
      const dataSheet = workbook.addWorksheet('Source Data');
      dataSheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Account', key: 'name', width: 30 },
        { header: 'Type', key: 'type', width: 15 },
        { header: 'Currency', key: 'currency', width: 10 },
        { header: 'Balance', key: 'balance', width: 15 },
      ];
      uploadedAccounts.forEach(acc => dataSheet.addRow(acc));
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `WealthDash_Report.xlsx`;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setErrorMsg("Export failed");
    } finally {
      setIsProcessing(false);
    }
  };

  // Use either the passed rate OR the one found in the excel for the preview
  const displayRate = extractedRate || rateCNYtoHKD;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-500" onClick={onClose}></div>
      <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] shadow-2xl overflow-hidden relative z-10 flex flex-col animate-in slide-in-from-bottom-10 duration-500">
        
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-emerald-50 to-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><FileSpreadsheet size={24} /></div>
            <div>
               <h2 className="text-xl font-bold text-slate-800">Excel Import</h2>
               <p className="text-xs text-slate-500">Preview & Sync</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
          {uploadedAccounts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed border-slate-300 rounded-2xl bg-white/50">
              <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-6"><Upload size={32} /></div>
              <h3 className="text-lg font-bold text-slate-700 mb-2">Upload Excel File</h3>
              <p className="text-slate-500 max-w-md text-center mb-8 text-sm">Supported formats: .xlsx, .xls</p>
              <input type="file" ref={fileInputRef} onChange={parseExcel} accept=".xlsx, .xls" className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} disabled={isProcessing} className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-emerald-200 transition-all active:scale-95 flex items-center gap-2">
                {isProcessing ? <Loader2 className="animate-spin" size={20}/> : <Upload size={20}/>} Select File
              </button>
              {errorMsg && <div className="mt-4 flex items-center gap-2 text-red-500 text-sm bg-red-50 px-4 py-2 rounded-lg"><AlertCircle size={16} /> {errorMsg}</div>}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100 sticky top-0 z-20 gap-4 md:gap-0">
                 <div className="flex flex-col gap-1 w-full md:w-auto">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                        <span className="font-semibold text-slate-800">{fileName}</span>
                        <span className="bg-slate-100 px-2 py-0.5 rounded-full text-xs">{uploadedAccounts.length} Assets</span>
                        {extractedRate && <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-bold">Rate: {extractedRate.toFixed(4)}</span>}
                    </div>
                    {debugInfo && <span className="text-[10px] text-emerald-600 font-mono">{debugInfo}</span>}
                 </div>
                 
                 <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end">
                    <button onClick={() => { setUploadedAccounts([]); setFileName(""); }} className="px-3 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors">Clear</button>
                    {onUpdateApp && (
                      <button onClick={handleImportToApp} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-emerald-700 transition-all flex items-center gap-2">
                        <RefreshCw size={16} /> Sync to Dashboard
                      </button>
                    )}
                    <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
                      <button onClick={handleDownloadImage} disabled={isProcessing} className="text-slate-600 px-3 py-1.5 rounded-md text-sm font-semibold hover:bg-white hover:shadow-sm transition-all flex items-center gap-2" title="Save Image"><Image size={16} /></button>
                      <div className="w-[1px] bg-slate-300 my-1"></div>
                      <button onClick={generateAndDownloadExcel} disabled={isProcessing} className="text-slate-600 px-3 py-1.5 rounded-md text-sm font-semibold hover:bg-white hover:shadow-sm transition-all flex items-center gap-2" title="Download Excel"><FileSpreadsheet size={16} /></button>
                    </div>
                 </div>
              </div>

              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200" ref={dashboardRef}>
                 <div className="mb-8 text-center">
                    <h1 className="text-2xl font-bold text-slate-900">Portfolio Analysis Report</h1>
                    <p className="text-slate-500 text-sm mt-1">Generated from {fileName} | Rate used: {displayRate.toFixed(4)}</p>
                 </div>
                 <AssetChart accounts={uploadedAccounts} rateCNYtoHKD={displayRate} enableAnimation={false} />
                 
                 <div className="mt-8 border-t border-slate-100 pt-6">
                    <h3 className="font-bold text-slate-800 mb-4">Source Data</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                          <tr><th className="px-4 py-3 rounded-l-lg">Name</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Currency</th><th className="px-4 py-3 text-right rounded-r-lg">Balance</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {uploadedAccounts.slice(0, 8).map(acc => (
                            <tr key={acc.id} className="hover:bg-slate-50">
                              <td className="px-4 py-3 font-medium text-slate-700">{acc.name}</td>
                              <td className="px-4 py-3 text-slate-500">{acc.type}</td>
                              <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${acc.currency === Currency.HKD ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>{acc.currency}</span></td>
                              <td className="px-4 py-3 text-right font-mono text-slate-700">{acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                 </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};